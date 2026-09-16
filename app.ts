import Homey from 'homey';
import { ScheduleDevice } from './lib/ScheduleDevice';
import { Now, isTime, nowInZone } from './lib/time';

/**
 * Several ticks per minute: each is idempotent (devices remember the minute they last
 * fired for), so extra ticks cost nothing but a late one cannot miss a whole minute.
 */
const TICK_MS = 20_000;

const DRIVERS = ['time', 'range'] as const;

class JsGadgetsApp extends Homey.App {

  private ticker?: NodeJS.Timeout;

  override async onInit(): Promise<void> {
    for (const driverId of DRIVERS) {
      this.homey.dashboards
        .getWidget(`${driverId}-picker`)
        .registerSettingAutocompleteListener('device', query =>
          this.autocompleteDevices(driverId, query));
    }

    // Flows can move the times too - handy for "start at [sunset]" or weekend hours.
    for (const [card, slot] of [['set_time', 'time'], ['set_start', 'start'], ['set_end', 'end']]) {
      this.homey.flow
        .getActionCard(card)
        .registerRunListener(async (args: { device: ScheduleDevice; time: string }) =>
          args.device.setTime(slot, args.time));
    }

    this.homey.flow
      .getConditionCard('range_is_active')
      .registerRunListener(async (args: { device: ScheduleDevice }) =>
        (args.device as unknown as { isActive(now: Now): boolean }).isActive(this.now()));

    this.ticker = this.homey.setInterval(() => {
      this.onTick().catch(err => this.error('Tick failed:', err));
    }, TICK_MS);

    this.log('JS Gadgets has been initialized');
  }

  override async onUninit(): Promise<void> {
    if (this.ticker) this.homey.clearTimeout(this.ticker);
  }

  /** The wall clock, in Homey's own timezone. */
  now(): Now {
    return nowInZone(this.homey.clock.getTimezone());
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

  async setDeviceTime(id: string, slot: string, value: string) {
    if (!isTime(value)) throw new Error('invalid_time');

    const device = this.findDevice(id);
    await device.setTime(slot, value);

    return device.toWidgetState();
  }

}

export = JsGadgetsApp;
