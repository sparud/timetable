import Homey from 'homey';
import { Now, isTime, normalizeTime, shouldFire } from './time';

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
    await this.syncCapabilities();

    // Seed the guard so restarting mid-minute cannot re-fire an event that already
    // happened - switching the lights twice is worse than missing a restart edge.
    const now = this.scheduleNow();
    for (const slot of this.slots) {
      if (this.getTime(slot.id) === now.time) this.fired[slot.id] = now.key;
    }
  }

  protected scheduleNow(): Now {
    return (this.homey.app as unknown as { now(): Now }).now();
  }

  getTime(slotId: string): string | null {
    const value = this.getSetting(slotId);
    return isTime(value) ? value : null;
  }

  /** Single funnel for time changes, whichever way they arrive. */
  async setTime(slotId: string, value: string): Promise<void> {
    const time = normalizeTime(value);
    if (time === null) throw new Error('invalid_time');
    if (!this.slots.some(slot => slot.id === slotId)) throw new Error('unknown_slot');
    if (this.getTime(slotId) === time) return;

    await this.setSettings({ [slotId]: time });
    await this.syncCapabilities();
    this.onTimesChanged();
    this.publishState();
  }

  /** Tell open widgets the times moved, whoever moved them. */
  publishState(): void {
    this.homey.api.realtime('schedule', this.toWidgetState());
  }

  async syncCapabilities(): Promise<void> {
    for (const slot of this.slots) {
      await this.setCapabilityValue(slot.capability, this.getTime(slot.id) ?? '--:--')
        .catch(this.error);
    }
  }

  async onTick(now: Now): Promise<void> {
    for (const slot of this.slots) {
      if (!shouldFire(this.getTime(slot.id), this.fired[slot.id], now)) continue;

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
    if (!changedKeys.some(key => this.slots.some(slot => slot.id === key))) return;

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

  /** Everything the widget needs to render this device. */
  toWidgetState(): { id: string; name: string; times: Record<string, string | null> } {
    const times: Record<string, string | null> = {};
    for (const slot of this.slots) times[slot.id] = this.getTime(slot.id);

    return { id: this.getData().id, name: this.getName(), times };
  }

}
