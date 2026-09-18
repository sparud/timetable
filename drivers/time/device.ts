import { ScheduleDevice, Slot } from '../../lib/ScheduleDevice';
import { Now } from '../../lib/time';

const SLOTS: Slot[] = [{ id: 'time', capability: 'schedule_time' }];

class TimeDevice extends ScheduleDevice {

  override get slots(): Slot[] {
    return SLOTS;
  }

  /**
   * A Time device switches nothing, so it has no `onoff` to mean anything - pausing
   * moved to `schedule_enabled`. Devices paired before that shed the old capability.
   */
  override async onInit(): Promise<void> {
    await super.onInit();

    if (this.hasCapability('onoff')) await this.removeCapability('onoff').catch(this.error);
  }

  protected override async onDue(_slot: Slot, now: Now): Promise<void> {
    this.log('Time reached:', now.time);
    await this.homey.flow
      .getDeviceTriggerCard('time_reached')
      .trigger(this, { time: now.time });
  }

}

export = TimeDevice;
