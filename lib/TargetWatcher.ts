/**
 * Watches the on/off state of the devices that ranges switch.
 *
 * Homey sends this app no events for devices it does not own, so the state behind a
 * range's tile used to be polled. It is subscribed to instead: one capability instance
 * per device, shared by every range that targets it, created only for devices a user
 * actually picked. Subscribing to the whole house to render one button would be the
 * cost this exists to avoid.
 */

export interface CapabilityInstance {
  destroy(): void;
}

/** The parts of a homey-api device item this needs; the rest is not our business. */
export interface DeviceItem {
  capabilitiesObj?: { onoff?: { value?: unknown } };
  makeCapabilityInstance(
    capabilityId: string,
    listener: (value: unknown) => void,
  ): CapabilityInstance;
}

export interface WatcherOptions {
  /**
   * One device, by id. Deliberately not the whole list: fetching all of them to subscribe
   * to a handful parses a payload the size of the house, and that peak is what grows the
   * process. `fresh` bypasses any cache.
   */
  device(id: string, fresh: boolean): Promise<DeviceItem | null>;
  onChange(id: string, value: boolean | null): void;
  error(...args: unknown[]): void;
}

/** Which subscriptions to open and close to match a wanted set. Pure, so it is testable. */
export function diffKeys(current: Iterable<string>, wanted: Iterable<string>): {
  add: string[];
  remove: string[];
} {
  const have = new Set(current);
  const want = new Set(wanted);

  return {
    add: [...want].filter(id => !have.has(id)),
    remove: [...have].filter(id => !want.has(id)),
  };
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export class TargetWatcher {

  private readonly watched = new Map<string, { instance: CapabilityInstance; value: boolean | null }>();

  constructor(private readonly options: WatcherOptions) {}

  /** The last known value, or null for a device that is unwatched or has not reported. */
  value(id: string): boolean | null {
    return this.watched.get(id)?.value ?? null;
  }

  /** Opens and closes subscriptions so that exactly `ids` are watched. */
  async sync(ids: string[]): Promise<void> {
    const { add, remove } = diffKeys(this.watched.keys(), ids);

    for (const id of remove) {
      this.watched.get(id)?.instance.destroy();
      this.watched.delete(id);
    }

    for (const id of add) {
      const device = await this.options.device(id, false).catch(err => {
        this.options.error(`Could not watch ${id}:`, err);
        return null;
      });
      if (!device) continue;

      // The seed matters: a subscription reports changes, not the state it starts in.
      const instance = device.makeCapabilityInstance('onoff', value => this.update(id, value));
      this.watched.set(id, { instance, value: asBoolean(device.capabilitiesObj?.onoff?.value) });
    }
  }

  /**
   * Re-reads every watched value, bypassing the cache.
   *
   * Insurance against a subscription that stops delivering without disconnecting, which
   * would otherwise leave the tile confidently wrong until something else changed.
   */
  async resync(): Promise<void> {
    if (this.watched.size === 0) return;

    for (const [id, entry] of this.watched) {
      const device = await this.options.device(id, true).catch(() => null);
      const value = asBoolean(device?.capabilitiesObj?.onoff?.value);
      if (value !== entry.value) {
        entry.value = value;
        this.options.onChange(id, value);
      }
    }
  }

  private update(id: string, value: unknown): void {
    const entry = this.watched.get(id);
    if (!entry) return;

    const next = asBoolean(value);
    if (entry.value === next) return;

    entry.value = next;
    this.options.onChange(id, next);
  }

  /** Closes every subscription. The app must call this when it stops. */
  destroy(): void {
    for (const entry of this.watched.values()) entry.instance.destroy();
    this.watched.clear();
  }

}
