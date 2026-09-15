import { ScheduleDevice, Slot } from '../../lib/ScheduleDevice';
import { Now, isWithin } from '../../lib/time';

const SLOTS: Slot[] = [
  { id: 'start', capability: 'schedule_start' },
  { id: 'end', capability: 'schedule_end' },
];

class RangeDevice extends ScheduleDevice {

  override get slots(): Slot[] {
    return SLOTS;
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

  /** True while the clock sits inside the range; drives the capability and the condition card. */
  isActive(now: Now): boolean {
    const start = this.getTime('start');
    const end = this.getTime('end');
    return start !== null && end !== null && isWithin(start, end, now.time);
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
