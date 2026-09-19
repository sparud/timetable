import Homey from 'homey';
import { SunTimes } from './sun';
import {
  Now, TimeMode, TimeSpec, WEEKDAYS, isDayEnabled, isTime, isTimeMode, normalizeOffset,
  normalizeTime, resolveSpec, shouldFire,
} from './time';

/** One editable time on a device: a settings key paired with the capability that shows it. */
export interface Slot {
  id: string;
  capability: string;
}

/**
 * Shared behaviour for devices that hold one or more times and fire Flow triggers
 * when the clock reaches them. The app drives `onTick`; devices decide what to do.
 */
export abstract class ScheduleDevice extends Homey.Device {

  /** Minute key each slot last fired for, so a slow or repeated tick cannot double-fire. */
  private fired: Record<string, string> = {};

  abstract get slots(): Slot[];

  /** Fire whatever is due at `now`. Called once per tick by the app. */
  protected abstract onDue(slot: Slot, now: Now): Promise<void>;

  override async onInit(): Promise<void> {
    await this.migrateEnabled();

    this.registerCapabilityListener('schedule_enabled', async () => {
      // Deferred so the new value is readable, as with onSettings.
      this.homey.setTimeout(() => {
        this.onTimesChanged();
        this.publishState();
      }, 0);
    });

    await this.syncCapabilities();

    // Seed the guard so restarting mid-minute cannot re-fire an event that already
    // happened - switching the lights twice is worse than missing a restart edge.
    const now = this.scheduleNow();
    for (const slot of this.slots) {
      if (this.getTime(slot.id) === now.time) this.fired[slot.id] = now.key;
    }
  }

  /**
   * `onoff` used to mean "the schedule is running". It now means "the devices this range
   * switches", which is what anyone expects from a device that owns lights - so the old
   * value moves across to `schedule_enabled` once, for devices paired before the change.
   */
  private async migrateEnabled(): Promise<void> {
    if (!this.hasCapability('schedule_enabled')) {
      await this.addCapability('schedule_enabled').catch(this.error);
      // Whatever onoff held was the pause flag, and it is the only record of it.
      const legacy = this.hasCapability('onoff') ? this.getCapabilityValue('onoff') : null;
      await this.setCapabilityValue('schedule_enabled', legacy !== false).catch(this.error);
    }

    if (typeof this.getCapabilityValue('schedule_enabled') !== 'boolean') {
      await this.setCapabilityValue('schedule_enabled', true).catch(this.error);
    }
  }

  protected scheduleNow(): Now {
    return this.scheduleApp.now();
  }

  protected get scheduleApp() {
    return this.homey.app as unknown as {
      now(): Now;
      sunTimes(date: string): SunTimes;
      timeOfDevice(ref: string, date: string): string | null;
      refreshDependents(device: ScheduleDevice): void;
      switchTargets(refs: string[], value: boolean): Promise<void>;
      targetStateOf(refs: string[]): Promise<string>;
      describeReferences(device: ScheduleDevice): Promise<void>;
    };
  }

  /**
   * Which modes this device's slots accept. Following another device is a range's
   * privilege: a Time device stays a leaf, so a reference cannot close a loop.
   */
  get supportedModes(): TimeMode[] {
    return ['absolute', 'sunrise', 'sunset'];
  }

  /**
   * What a slot is set to, before a date is applied. The three settings are one value:
   * the mode chooses between the fixed time and an offset from a sun event.
   */
  spec(slotId: string): TimeSpec {
    const mode = this.getSetting(`${slotId}_mode`);
    const time = this.getSetting(slotId);

    const ref = this.getSetting(`${slotId}_ref`);

    return {
      mode: isTimeMode(mode) && this.supportedModes.includes(mode) ? mode : 'absolute',
      time: isTime(time) ? time : null,
      offset: normalizeOffset(this.getSetting(`${slotId}_offset`)),
      ref: typeof ref === 'string' && ref.trim() !== '' ? ref.trim() : null,
    };
  }

  /** The clock time a slot means on the local date `date`. */
  resolve(slotId: string, date: string): string | null {
    const spec = this.spec(slotId);
    const referenced = spec.mode === 'device' && spec.ref !== null
      ? this.scheduleApp.timeOfDevice(spec.ref, date)
      : null;

    return resolveSpec(spec, this.scheduleApp.sunTimes(date), referenced);
  }

  /** The clock time a slot means today - or on whichever day `now` names. */
  getTime(slotId: string, now: Now = this.scheduleNow()): string | null {
    return this.resolve(slotId, now.date);
  }

  /**
   * Single funnel for time changes, whichever way they arrive. Only the fields present
   * in `changes` are written, so switching to sunset keeps the fixed time to come back
   * to, and typing a fixed time keeps the offset.
   */
  async setSpec(slotId: string, changes: Partial<TimeSpec>): Promise<void> {
    if (!this.slots.some(slot => slot.id === slotId)) throw new Error('unknown_slot');

    const current = this.spec(slotId);
    const patch: Record<string, string | number> = {};

    if (changes.time !== undefined) {
      const time = normalizeTime(changes.time);
      if (time === null) throw new Error('invalid_time');
      if (time !== current.time) patch[slotId] = time;
    }

    if (changes.mode !== undefined) {
      if (!isTimeMode(changes.mode) || !this.supportedModes.includes(changes.mode)) {
        throw new Error('invalid_mode');
      }
      if (changes.mode !== current.mode) patch[`${slotId}_mode`] = changes.mode;
    }

    if (changes.ref !== undefined) {
      const ref = typeof changes.ref === 'string' ? changes.ref.trim() : '';
      if (ref !== (current.ref ?? '')) patch[`${slotId}_ref`] = ref;
    }

    if (changes.offset !== undefined) {
      const offset = normalizeOffset(changes.offset);
      if (offset !== current.offset) patch[`${slotId}_offset`] = offset;
    }

    if (Object.keys(patch).length === 0) return;

    await this.setSettings(patch);
    await this.syncCapabilities();
    this.onTimesChanged();
    this.publishState();
  }

  /** Sets a slot to a fixed clock time, whatever it followed before. */
  async setTime(slotId: string, value: string): Promise<void> {
    await this.setSpec(slotId, { mode: 'absolute', time: value });
  }

  /** Tell open widgets the times moved, whoever moved them. */
  publishState(): void {
    this.homey.api.realtime('schedule', this.toWidgetState());
    // Anything following this device has just changed too, and should not have to wait
    // for the next tick to notice.
    this.scheduleApp.refreshDependents(this);
  }

  /**
   * Tells open widgets what the switched devices are now doing.
   *
   * A widget only receives realtime events for devices *this app owns*, and the switched
   * devices belong to other apps - so when the schedule switches them, nothing would
   * reach the widget and its button would sit wrong until its next poll. We know the
   * answer at the moment we act, so we say it.
   */
  publishTargetState(state: string): void {
    this.homey.api.realtime('targets', { id: this.getData().id, state });
  }

  /** Recompute because something this device follows moved. */
  refreshFromDependency(): void {
    this.syncCapabilities()
      .then(() => {
        this.onTimesChanged();
        this.homey.api.realtime('schedule', this.toWidgetState());
      })
      .catch(this.error);
  }

  /** Pauses or resumes the schedule, keeping its times and days. */
  async setEnabled(value: boolean): Promise<void> {
    if (this.enabled === value) return;

    await this.setCapabilityValue('schedule_enabled', value);
    // setCapabilityValue does not invoke our own capability listener.
    this.onTimesChanged();
    this.publishState();
  }

  /**
   * Replaces the repeat days. At least one must remain: "no days" would mean never,
   * which is not a state the settings can express - there, empty means every day.
   */
  async setDays(days: string[]): Promise<void> {
    const wanted = WEEKDAYS.filter(day => days.includes(day));
    if (wanted.length === 0) throw new Error('no_days');

    const patch: Record<string, boolean> = {};
    for (const day of WEEKDAYS) patch[day] = wanted.includes(day);

    await this.setSettings(patch);
    this.onTimesChanged();
    this.publishState();
  }

  async syncCapabilities(now: Now = this.scheduleNow()): Promise<void> {
    for (const slot of this.slots) {
      const value = this.getTime(slot.id, now) ?? '--:--';
      if (this.getCapabilityValue(slot.capability) === value) continue;

      await this.setCapabilityValue(slot.capability, value).catch(this.error);
    }
  }

  /** A paused schedule keeps its times and days, it just stops acting on them. */
  get enabled(): boolean {
    return this.getCapabilityValue('schedule_enabled') !== false;
  }

  async onTick(now: Now): Promise<void> {
    // A sun-following slot means a different time every day, so the mirrored capability
    // has to be refreshed as the date turns - and while paused, so the tile stays honest.
    await this.syncCapabilities(now);
    if (!this.enabled) return;

    for (const slot of this.slots) {
      const target = this.getTime(slot.id, now);
      if (!shouldFire(target, this.fired[slot.id], now, this.isSlotDue(slot, now))) {
        continue;
      }

      this.fired[slot.id] = now.key;
      await this.onDue(slot, now).catch(this.error);
    }
  }

  // Settings edited in Homey's own device UI land here; the widget path calls setTime.
  override async onSettings({ changedKeys }: {
    oldSettings: Record<string, unknown>;
    newSettings: Record<string, unknown>;
    changedKeys: string[];
  }): Promise<void> {
    const relevant = changedKeys.some(key =>
      this.slots.some(slot => key === slot.id || key.startsWith(`${slot.id}_`))
      || (WEEKDAYS as readonly string[]).includes(key));
    if (!relevant) return;

    // setSettings() has not resolved yet, so defer until the new values are readable.
    this.homey.setTimeout(() => {
      this.syncCapabilities()
        .then(() => this.publishState())
        .catch(this.error);
      this.onTimesChanged();
    }, 0);
  }

  /** Hook for subclasses that derive state from the times. */
  protected onTimesChanged(): void {}

  /** The weekdays ticked on this device; empty means every day. */
  get days(): string[] {
    return WEEKDAYS.filter(day => this.getSetting(day) === true);
  }

  /**
   * Whether this slot's weekday condition holds. The base device asks about today;
   * a range's end belongs to the day its occurrence began, so it overrides this.
   */
  protected isSlotDue(_slot: Slot, now: Now): boolean {
    return isDayEnabled(this.days, now.weekday);
  }

  /** Everything the widget needs to render this device. */
  toWidgetState(): {
    id: string;
    name: string;
    times: Record<string, string | null>;
    specs: Record<string, TimeSpec>;
    days: string[];
    enabled: boolean;
  } {
    const now = this.scheduleNow();
    const times: Record<string, string | null> = {};
    const specs: Record<string, TimeSpec> = {};

    for (const slot of this.slots) {
      // `times` is what the slot comes to today; `specs` is what the user set.
      times[slot.id] = this.getTime(slot.id, now);
      specs[slot.id] = this.spec(slot.id);
    }

    return {
      id: this.getData().id,
      name: this.getName(),
      times,
      specs,
      days: this.days,
      enabled: this.enabled,
    };
  }

}
