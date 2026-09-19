import Homey from 'homey';
import { ScheduleDevice } from './lib/ScheduleDevice';
import { Coordinates, SunEvent, SunTimes, sunTimes } from './lib/sun';
import {
  SwitchableDevice, TargetState, aggregateState, formatRef, formatTargets, matchTarget,
  parseTargets, splitRef,
} from './lib/targets';
import { DeviceItem, TargetWatcher } from './lib/TargetWatcher';
import { Now, TimeSpec, nowInZone } from './lib/time';

/**
 * `require('homey-api')` pulls in every Athom cloud API and parses each one's specification:
 * measured at 8.4 MB of heap for classes this app never touches. `HomeyAPI` on its own costs
 * 0.2 MB and lazily requires only the version `createAppAPI` resolves to.
 */
const HomeyAPI = require('homey-api/lib/HomeyAPI/HomeyAPI.js') as {
  createAppAPI(opts: { homey: unknown }): Promise<any>;
};

/** How long the fetched device list is trusted. It only feeds the picker and name lookups. */
const DEVICES_TTL = 5 * 60_000;

/** How often watched values are re-read from the Homey, in case a subscription went quiet. */
const RESYNC_MS = 15 * 60_000;

/** What the Web API returns per device, of which this app uses very little. */
interface RawDevice {
  id: string;
  name: string;
  zone?: string;
  capabilities?: string[];
  capabilitiesObj?: { onoff?: { value?: unknown } };
}

/**
 * Several ticks per minute: each is idempotent (devices remember the minute they last
 * fired for), so extra ticks cost nothing but a late one cannot miss a whole minute.
 */
const TICK_MS = 20_000;

const DRIVERS = ['time', 'range'] as const;

class TimetableApp extends Homey.App {

  private ticker?: NodeJS.Timeout;
  private resyncer?: NodeJS.Timeout;

  override async onInit(): Promise<void> {
    for (const driverId of DRIVERS) {
      this.homey.dashboards
        .getWidget(`${driverId}-picker`)
        .registerSettingAutocompleteListener('device', query =>
          this.autocompleteDevices(driverId, query));
    }

    // Flows can move the times too - handy for weekend hours, or a time from a tag.
    for (const [card, slot] of [['set_time', 'time'], ['set_start', 'start'], ['set_end', 'end']]) {
      this.homey.flow
        .getActionCard(card)
        .registerRunListener(async (args: { device: ScheduleDevice; time: string }) =>
          args.device.setTime(slot, args.time));
    }

    // The same slots, pointed at the sun instead of the clock.
    for (const [card, slot] of [['set_time_sun', 'time'], ['set_start_sun', 'start'], ['set_end_sun', 'end']]) {
      this.homey.flow
        .getActionCard(card)
        .registerRunListener(async (args: { device: ScheduleDevice; event: SunEvent; offset: number }) =>
          args.device.setSpec(slot, { mode: args.event, offset: args.offset }));
    }

    // ...or at another device, which only a range may do.
    for (const [card, slot] of [['set_start_device', 'start'], ['set_end_device', 'end']]) {
      this.homey.flow
        .getActionCard(card)
        .registerRunListener(async (args: { device: ScheduleDevice; source: { getData(): { id: string } }; offset: number }) =>
          args.device.setSpec(slot, { mode: 'device', ref: args.source.getData().id, offset: args.offset }));
    }

    // Pausing is no longer the tile's on/off, so it needs cards of its own. One pair
    // serves both drivers, which is why they are app-level rather than per-driver.
    for (const [card, value] of [['pause', false], ['resume', true]] as const) {
      this.homey.flow
        .getActionCard(card)
        .registerRunListener(async (args: { device: ScheduleDevice }) =>
          args.device.setEnabled(value));
    }

    this.homey.flow
      .getConditionCard('schedule_running')
      .registerRunListener(async (args: { device: ScheduleDevice }) => args.device.enabled);

    this.homey.flow
      .getConditionCard('range_is_active')
      .registerRunListener(async (args: { device: ScheduleDevice }) =>
        (args.device as unknown as { isActive(now: Now): boolean }).isActive(this.now()));

    // Moving the Homey moves sunrise with it, and the cached times are then wrong.
    this.homey.geolocation.on('location', () => this.sun.clear());

    this.ticker = this.homey.setInterval(() => {
      this.onTick().catch(err => this.error('Tick failed:', err));
    }, TICK_MS);

    this.resyncer = this.homey.setInterval(() => {
      this.targetWatcher().resync().catch(err => this.error('Target resync failed:', err));
    }, RESYNC_MS);

    this.log('Timetable has been initialized');
  }

  override async onUninit(): Promise<void> {
    if (this.ticker) this.homey.clearInterval(this.ticker);
    if (this.resyncer) this.homey.clearInterval(this.resyncer);
    // Orphaned subscriptions are exactly the resource cost this was meant to remove.
    this.watcher?.destroy();
  }

  /** The wall clock, in Homey's own timezone. */
  now(): Now {
    return nowInZone(this.homey.clock.getTimezone());
  }

  /**
   * Sunrise and sunset for a local date, computed once and kept.
   *
   * Every device asks on every tick, and a range asks about yesterday as well, so the
   * few days in play are cached; the map is small enough to clear wholesale.
   */
  private readonly sun = new Map<string, SunTimes>();

  sunTimes(date: string): SunTimes {
    const cached = this.sun.get(date);
    if (cached) return cached;

    const times = sunTimes(date, this.coordinates(), this.homey.clock.getTimezone());
    // Once a day, and the only outward sign that the location is readable at all.
    this.log(`Sun on ${date}: rises ${times.sunrise ?? 'not at all'}, sets ${times.sunset ?? 'not at all'}`);

    if (this.sun.size > 4) this.sun.clear();
    this.sun.set(date, times);

    return times;
  }

  /**
   * The time a followed device comes to on `date`.
   *
   * `ref` is an id or a name: the widget and the Flow card store the id, which survives a
   * rename, while a reference typed into device settings is a name, because that page has
   * no device picker to offer.
   */
  timeOfDevice(ref: string, date: string): string | null {
    const device = this.findTimeDevice(ref);

    return device ? device.resolve('time', date) : null;
  }

  private findTimeDevice(ref: string): ScheduleDevice | undefined {
    const devices = this.listTimeDevices();
    const match = matchTarget(devices, ref);

    return match ? devices.find(device => device.id === match.id)?.device : undefined;
  }

  /** Every Time device, for the widget's picker and for resolving references. */
  listTimeDevices() {
    return (this.homey.drivers.getDriver('time').getDevices() as unknown as ScheduleDevice[])
      .map(device => ({ id: device.getData().id, name: device.getName(), device }));
  }

  /**
   * Rewrites a device's stored references into `Name (id)`.
   *
   * The id alone is what the widget and the Flow cards know, and an id alone is what the
   * settings page then showed - four UUIDs in a text field tell you nothing. Resolving
   * them once, here, is the only place that knows both halves.
   */
  async describeReferences(device: ScheduleDevice): Promise<void> {
    const patch: Record<string, string> = {};

    for (const slot of device.slots) {
      // Described whatever the mode, so the field still reads if the mode changes later.
      const spec = device.spec(slot.id);
      if (spec.ref === null) continue;

      const found = matchTarget(this.listTimeDevices(), spec.ref);
      if (found && formatRef(found) !== spec.ref) patch[`${slot.id}_ref`] = formatRef(found);
    }

    const refs = parseTargets(device.getSetting('targets'));
    // References that already carry an id need no lookup, which is the case after the
    // first run - so a restart costs no device fetch at all.
    if (refs.some(ref => splitRef(ref).id === null || splitRef(ref).name === '')) {
      const devices = await this.switchableDevices().catch(() => [] as SwitchableDevice[]);
      const described = refs.map(ref => {
        const found = matchTarget(devices, ref);
        return found ? formatRef(found) : ref;
      });
      if (formatTargets(described) !== formatTargets(refs)) patch.targets = formatTargets(described);
    }

    if (Object.keys(patch).length > 0) await device.setSettings(patch).catch(this.error);
  }

  /**
   * A Time device just moved, so the ranges following it are now showing a stale time.
   * Only ranges can follow, and only Time devices can be followed, so this stops here.
   */
  refreshDependents(source: ScheduleDevice): void {
    if (source.driver.id !== 'time') return;

    const id = source.getData().id;

    for (const device of this.rangeDevices()) {
      // Through the same resolver as everything else: comparing the stored string by
      // hand is what broke this when references gained their readable `Name (id)` form.
      const follows = device.slots.some(slot => {
        const spec = device.spec(slot.id);
        return spec.mode === 'device'
          && spec.ref !== null
          && this.findTimeDevice(spec.ref)?.getData().id === id;
      });

      if (follows) device.refreshFromDependency();
    }
  }

  // ---- switching other devices ----

  private devices_?: { at: number; list: SwitchableDevice[] };
  private api_?: Promise<any>;

  /**
   * The app's own Web API session.
   *
   * `this.homey.api` cannot be used for this: with `homey:manager:api` declared its
   * `get`/`put` reach the right endpoints but carry no session (`Missing Session`).
   * `createAppAPI` mints the session that the app's scopes hang off.
   */
  private webApi(): Promise<any> {
    // A rejected promise must not be kept: createAppAPI can fail while the Homey is still
    // coming up, and caching that failure would leave the app without an API until restart.
    this.api_ ??= HomeyAPI.createAppAPI({ homey: this.homey })
      .catch((err: unknown) => {
        this.api_ = undefined;
        throw err;
      });

    return this.api_;
  }

  /**
   * Every device with an `onoff` capability, whichever app owns it.
   *
   * Cached, because a range asks for it each time it opens or closes and the answer only
   * changes when devices are added, removed or renamed.
   */
  /**
   * Every `onoff`-capable device, for the picker and for resolving names.
   *
   * Only the three fields a picker needs are kept. Holding the full records meant 85
   * devices' worth of capability objects staying live for the lifetime of the app, to
   * render a list of checkboxes.
   */
  async switchableDevices(refresh = false): Promise<SwitchableDevice[]> {
    const maxAge = refresh ? 0 : DEVICES_TTL;
    if (this.devices_ && Date.now() - this.devices_.at <= maxAge) return this.devices_.list;

    const api = await this.webApi();
    const response = await api.devices.getDevices({ $updateCache: false }) as Record<string, RawDevice>;
    const list = Object.values(response ?? {})
      .filter(device => (device.capabilities ?? []).includes('onoff'))
      .map(device => ({ id: device.id, name: device.name, zone: device.zone ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.devices_ = { at: Date.now(), list };

    return list;
  }

  // ---- watching what the targets are doing ----

  private watcher?: TargetWatcher;

  private targetWatcher(): TargetWatcher {
    this.watcher ??= new TargetWatcher({
      device: async (id: string, fresh: boolean) => {
        const api = await this.webApi();
        return api.devices.getDevice(fresh ? { id, $cache: false } : { id }) as Promise<DeviceItem>;
      },
      onChange: id => this.onTargetChanged(id),
      error: (...args: unknown[]) => this.error(...args),
    });

    return this.watcher;
  }

  /** The id a stored reference points at, without a round trip where possible. */
  private refToId(ref: string): string | null {
    const { id } = splitRef(ref);
    if (id !== null) return id;

    // A bare name, typed into device settings, still needs the list to resolve.
    return this.devices_ ? matchTarget(this.devices_.list, ref)?.id ?? null : null;
  }

  private rangeDevices(): ScheduleDevice[] {
    return this.homey.drivers.getDriver('range').getDevices() as unknown as ScheduleDevice[];
  }

  private targetIdsOf(device: ScheduleDevice): string[] {
    return parseTargets(device.getSetting('targets'))
      .map(ref => this.refToId(ref))
      .filter((id): id is string => id !== null);
  }

  /** Subscribes to exactly the devices the ranges switch, and nothing else. */
  async syncWatchedTargets(): Promise<void> {
    const ids = new Set(this.rangeDevices().flatMap(device => this.targetIdsOf(device)));

    await this.targetWatcher().sync([...ids])
      .catch(err => this.error('Could not watch the switched devices:', err));
  }

  /** A watched device moved, so every range showing it is now out of date. */
  private onTargetChanged(id: string): void {
    for (const device of this.rangeDevices()) {
      if (this.targetIdsOf(device).includes(id)) {
        (device as unknown as { refreshFromTargets(): void }).refreshFromTargets();
      }
    }
  }

  /** The combined state of some targets, read from the subscriptions rather than fetched. */
  async targetStateOf(refs: string[]): Promise<TargetState> {
    if (refs.length === 0) return 'none';

    const watcher = this.targetWatcher();

    return aggregateState(refs.map(ref => {
      const id = this.refToId(ref);
      return id === null ? null : watcher.value(id);
    }));
  }

  /** Zone names, for the settings page - a bare device list is ambiguous in a big house. */
  async zoneNames(): Promise<Record<string, string>> {
    const api = await this.webApi();
    const zones = await api.zones.getZones() as Record<string, { name: string }>;

    return Object.fromEntries(Object.entries(zones ?? {}).map(([id, zone]) => [id, zone.name]));
  }

  /**
   * Switches every target, and keeps going when one fails: an unreachable lamp must not
   * stop the rest of the range from happening.
   */
  async switchTargets(refs: string[], value: boolean): Promise<void> {
    if (refs.length === 0) return;

    const devices = await this.switchableDevices().catch(err => {
      this.error('Could not list devices to switch:', err);
      return [] as SwitchableDevice[];
    });

    const api = await this.webApi();

    for (const ref of refs) {
      const device = matchTarget(devices, ref);
      if (!device) {
        this.error(`No switchable device matches "${ref}"`);
        continue;
      }

      await api.devices
        .setCapabilityValue({ deviceId: device.id, capabilityId: 'onoff', value })
        .then(() => this.log(`Switched ${device.name} ${value ? 'on' : 'off'}`))
        .catch((err: unknown) => this.error(`Could not switch ${device.name}:`, err));
    }
  }

  // ---- app settings page ----

  /** The ranges, with the devices each one switches, for the settings page. */
  async getRangeTargets() {
    const ranges = this.homey.drivers.getDriver('range').getDevices() as unknown as ScheduleDevice[];

    return ranges.map(device => ({
      id: device.getData().id,
      name: device.getName(),
      targets: parseTargets(device.getSetting('targets')),
    }));
  }

  async getSwitchableDevices() {
    const [devices, zones] = await Promise.all([this.switchableDevices(true), this.zoneNames()]);

    return devices.map(device => ({
      ...device,
      zoneName: device.zone ? zones[device.zone] ?? null : null,
    }));
  }

  /** The state of one range's targets, and switching them all from the widget. */
  async getRangeTargetState(id: string): Promise<TargetState> {
    return this.targetStateOf(parseTargets(this.findDevice(id).getSetting('targets')));
  }

  async switchRangeTargets(id: string, value: boolean): Promise<TargetState> {
    const device = this.findDevice(id);
    const refs = parseTargets(device.getSetting('targets'));
    await this.switchTargets(refs, value);

    // Report the state that was asked for rather than re-reading: a device that has not
    // reported back yet would otherwise make the button flick back for a moment.
    const state: TargetState = refs.length === 0 ? 'none' : (value ? 'on' : 'off');
    // Any other open widget on the same range is now wrong too.
    device.publishTargetState(state);

    return state;
  }

  async setRangeTargets(id: string, refs: string[]) {
    const device = this.findDevice(id);
    const devices = await this.switchableDevices().catch(() => [] as SwitchableDevice[]);
    const described = refs.map(ref => {
      const found = matchTarget(devices, ref);
      return found ? formatRef(found) : ref;
    });

    await device.setSettings({ targets: formatTargets(described) });
    await this.syncWatchedTargets();

    return parseTargets(device.getSetting('targets'));
  }

  /** Homey's own position, or null when it has none and sun events cannot be placed. */
  private coordinates(): Coordinates | null {
    try {
      const latitude = this.homey.geolocation.getLatitude();
      const longitude = this.homey.geolocation.getLongitude();

      return { latitude, longitude };
    } catch (err) {
      this.error('No location, so sunrise and sunset are unknown:', err);
      return null;
    }
  }

  private async onTick(): Promise<void> {
    const now = this.now();
    for (const device of this.devices()) {
      await device.onTick(now).catch(err => this.error('Device tick failed:', err));
    }
  }

  private devices(): ScheduleDevice[] {
    return DRIVERS.flatMap(driverId =>
      this.homey.drivers.getDriver(driverId).getDevices() as unknown as ScheduleDevice[]);
  }

  private findDevice(id: string): ScheduleDevice {
    const device = this.devices().find(candidate => candidate.getData().id === id);
    if (!device) throw new Error('unknown_device');

    return device;
  }

  async autocompleteDevices(driverId: string, query: string) {
    const needle = String(query || '').toLowerCase();

    return (this.homey.drivers.getDriver(driverId).getDevices() as unknown as ScheduleDevice[])
      .filter(device => device.getName().toLowerCase().includes(needle))
      .map(device => {
        const state = device.toWidgetState();
        return {
          id: state.id,
          name: state.name,
          description: Object.values(state.times).map(time => time ?? '--:--').join(' – '),
        };
      });
  }

  // ---- widget API ----

  getDeviceState(id: string) {
    return this.findDevice(id).toWidgetState();
  }

  async setDeviceEnabled(id: string, enabled: boolean) {
    const device = this.findDevice(id);
    await device.setEnabled(enabled);

    return device.toWidgetState();
  }

  async setDeviceDays(id: string, days: string[]) {
    const device = this.findDevice(id);
    await device.setDays(days);

    return device.toWidgetState();
  }

  async setDeviceSpec(id: string, slot: string, changes: Partial<TimeSpec>) {
    const device = this.findDevice(id);

    // The widget sends a bare id; store it with the name so the settings page reads.
    if (typeof changes.ref === 'string') {
      const found = matchTarget(this.listTimeDevices(), changes.ref);
      if (found) changes = { ...changes, ref: formatRef(found) };
    }

    await device.setSpec(slot, changes);

    return device.toWidgetState();
  }

}

export = TimetableApp;
