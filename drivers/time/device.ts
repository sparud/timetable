import { ScheduleDevice, Slot } from '../../lib/ScheduleDevice';
import { Now } from '../../lib/time';

const SLOTS: Slot[] = [{ id: 'time', capability: 'schedule_time' }];

class TimeDevice extends ScheduleDevice {

  override get slots(): Slot[] {
    return SLOTS;
  }

  protected override async onDue(_slot: Slot, now: Now): Promise<void> {
    this.log('Time reached:', now.time);
    await this.homey.flow
      .getDeviceTriggerCard('time_reached')
      .trigger(this, { time: now.time });
  }

}

export = TimeDevice;
