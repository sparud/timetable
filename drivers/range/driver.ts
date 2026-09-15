import Homey from 'homey';
import { randomUUID } from 'crypto';

class RangeDriver extends Homey.Driver {

  override async onInit(): Promise<void> {
    this.log('Range driver initialized');
  }

  // Nothing to discover - each pairing run offers one fresh device to name.
  override async onPairListDevices(): Promise<Array<{ name: string; data: { id: string } }>> {
    return [{
      name: this.homey.__('driver.range.defaultName'),
      data: { id: randomUUID() },
    }];
  }

}

export = RangeDriver;
