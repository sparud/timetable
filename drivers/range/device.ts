import { ScheduleDevice, Slot } from '../../lib/ScheduleDevice';
import { Now, isDayEnabled, isRangeActive, isRangeEndDue } from '../../lib/time';

const SLOTS: Slot[] = [
  { id: 'start', capability: 'schedule_start' },
  { id: 'end', capability: 'schedule_end' },
];

class RangeDevice extends ScheduleDevice {

  override get slots(): Slot[] {
    return SLOTS;
  }

  /**
   * The start is judged on today; the end belongs to the occurrence that opened it,
   * which for a range crossing midnight began yesterday.
   */
  protected override isSlotDue(slot: Slot, now: Now): boolean {
    if (slot.id === 'start') return isDayEnabled(this.days, now.weekday);

    const start = this.getTime('start');
    const end = this.getTime('end');
    return start !== null && end !== null && isRangeEndDue(start, end, this.days, now);
  }

  protected override async onDue(slot: Slot, now: Now): Promise<void> {
    const card = slot.id === 'start' ? 'range_started' : 'range_ended';

    this.log(`Range ${slot.id}:`, now.time);
    await this.homey.flow.getDeviceTriggerCard(card).trigger(this, { time: now.time });
  }

  override async onTick(now: Now): Promise<void> {
    await super.onTick(now);
    await this.refreshActive(now);
  }

  /** True while the clock sits inside a range that began on an enabled weekday. */
  isActive(now: Now): boolean {
    const start = this.getTime('start');
    const end = this.getTime('end');
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

}

export = RangeDevice;
