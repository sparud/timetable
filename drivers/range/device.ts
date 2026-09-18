import { ScheduleDevice, Slot } from '../../lib/ScheduleDevice';
import { TargetState, isAnyOn, parseTargets } from '../../lib/targets';
import {
  Now, TimeMode, isDayEnabled, isRangeActive, isRangeEndDue, minutesOf, previousDate,
} from '../../lib/time';

const SLOTS: Slot[] = [
  { id: 'start', capability: 'schedule_start' },
  { id: 'end', capability: 'schedule_end' },
];

/** How often the tile's on/off is re-read from the devices it mirrors. */
const MIRROR_MS = 60_000;

class RangeDevice extends ScheduleDevice {

  override get slots(): Slot[] {
    return SLOTS;
  }

  private mirroredAt = 0;

  /**
   * `onoff` on a range is the devices it switches, not the schedule - so the tile
   * toggles the lights, which is what a device that owns lights should do. Pausing
   * lives on `schedule_enabled`.
   */
  override async onInit(): Promise<void> {
    await super.onInit();

    this.registerCapabilityListener('onoff', async (value: boolean) => this.switchTargets(value));
    this.refreshTargetMirror(true).catch(this.error);
  }

  /** A range may also follow a Time device, so several ranges can share one time. */
  override get supportedModes(): TimeMode[] {
    return [...super.supportedModes, 'device'];
  }

  /**
   * The start and end bounding the occurrence in play right now.
   *
   * Once a start follows the sun the two ends no longer come from the same day: at 03:00
   * inside a sunset-to-sunrise range, the occurrence opened at *yesterday's* sunset, and
   * resolving the start against today would place it a few minutes off.
   */
  private window(now: Now): { start: string | null; end: string | null } {
    const start = this.getTime('start', now);
    const end = this.getTime('end', now);
    if (start === null || end === null) return { start, end };

    const from = minutesOf(start);
    const to = minutesOf(end);
    const at = minutesOf(now.time);
    if (from === null || to === null || at === null) return { start, end };

    const inTail = from > to && at < to;
    return { start: inTail ? this.resolve('start', previousDate(now.date)) ?? start : start, end };
  }

  /**
   * The start is judged on today; the end belongs to the occurrence that opened it,
   * which for a range crossing midnight began yesterday.
   */
  protected override isSlotDue(slot: Slot, now: Now): boolean {
    if (slot.id === 'start') return isDayEnabled(this.days, now.weekday);

    const { start, end } = this.window(now);
    return start !== null && end !== null && isRangeEndDue(start, end, this.days, now);
  }

  protected override async onDue(slot: Slot, now: Now): Promise<void> {
    const opening = slot.id === 'start';
    const card = opening ? 'range_started' : 'range_ended';

    this.log(`Range ${slot.id}:`, now.time);
    await this.homey.flow.getDeviceTriggerCard(card).trigger(this, { time: now.time });
    await this.switchTargets(opening);
  }

  /**
   * Switches the devices wired to this range: on at the start, off at the end, and
   * whenever a Flow card or the widget's button asks.
   *
   * Edge-triggered on purpose: the range acts when it opens and closes, and never
   * afterwards, so turning a lamp off by hand in the middle of a range stays off rather
   * than being corrected on the next tick.
   */
  async switchTargets(value: boolean): Promise<void> {
    const refs = parseTargets(this.getSetting('targets'));
    if (refs.length === 0) {
      // Nothing to switch, so the tile must not sit there claiming otherwise.
      await this.setMirror(false);
      return;
    }

    await this.scheduleApp.switchTargets(refs, value).catch(this.error);
    this.publishTargetState(value ? 'on' : 'off');

    // We just decided the answer, so do not make the next mirror read discover it.
    this.mirroredAt = Date.now();
    await this.setMirror(value);
  }

  override async onTick(now: Now): Promise<void> {
    await super.onTick(now);
    await this.refreshActive(now);
    await this.refreshTargetMirror();
  }

  /**
   * Keeps the tile in step with devices this app does not own and gets no events for.
   * Throttled: every tick would mean an API round trip three times a minute, forever.
   */
  private async refreshTargetMirror(force = false): Promise<void> {
    if (!force && Date.now() - this.mirroredAt < MIRROR_MS) return;
    this.mirroredAt = Date.now();

    const refs = parseTargets(this.getSetting('targets'));
    const state = refs.length === 0
      ? 'off'
      : await this.scheduleApp.targetStateOf(refs) as TargetState;

    await this.setMirror(isAnyOn(state));
  }

  /** Writes the tile value without going back through the capability listener. */
  private async setMirror(value: boolean): Promise<void> {
    if (this.getCapabilityValue('onoff') === value) return;

    await this.setCapabilityValue('onoff', value).catch(this.error);
  }

  /** True while the clock sits inside a range that began on an enabled weekday. */
  isActive(now: Now): boolean {
    if (!this.enabled) return false;

    const { start, end } = this.window(now);
    return start !== null && end !== null && isRangeActive(start, end, this.days, now);
  }

  private async refreshActive(now: Now): Promise<void> {
    const active = this.isActive(now);
    if (this.getCapabilityValue('schedule_active') === active) return;

    await this.setCapabilityValue('schedule_active', active).catch(this.error);
  }

  protected override onTimesChanged(): void {
    this.refreshActive(this.scheduleNow()).catch(this.error);
  }

  /** The widget also edits which devices this range switches, so it needs them. */
  override toWidgetState() {
    return { ...super.toWidgetState(), targets: parseTargets(this.getSetting('targets')) };
  }

}

export = RangeDevice;
