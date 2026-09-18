/** A slot's intent: a fixed time, or an offset from a sun event. Fields may be omitted. */
interface TimeSpec {
  mode?: 'absolute' | 'sunrise' | 'sunset' | 'device';
  time?: string;
  offset?: number;
  /** Which Time device the slot follows, by id or name. */
  ref?: string;
}

/** What the app exposes to its widgets. */
interface ScheduleApp {
  getDeviceState(id: string): unknown;
  setDeviceSpec(id: string, slot: string, changes: TimeSpec): Promise<unknown>;
  listTimeDevices(): unknown;
  getSwitchableDevices(): Promise<unknown>;
  getRangeTargetState(id: string): Promise<string>;
  switchRangeTargets(id: string, value: boolean): Promise<string>;
  setRangeTargets(id: string, refs: string[]): Promise<unknown>;
  getDeviceState(id: string): unknown;
  setDeviceDays(id: string, days: string[]): Promise<unknown>;
  setDeviceEnabled(id: string, enabled: boolean): Promise<unknown>;
}

/** Homey passes the app instance on `homey.app`; that is all these handlers need. */
interface Context<Query = unknown, Body = unknown> {
  homey: { app: unknown };
  query: Query;
  body: Body;
}

const app = (context: Context<any, any>): ScheduleApp => context.homey.app as ScheduleApp;

export = {
  async getState(context: Context<{ id: string }>) {
    return app(context).getDeviceState(context.query.id);
  },

  async getTimeDevices(context: Context) {
    return app(context).listTimeDevices();
  },

  async getSwitchable(context: Context) {
    return app(context).getSwitchableDevices();
  },

  async getTargetState(context: Context<{ id: string }>) {
    return app(context).getRangeTargetState(context.query.id);
  },

  async switchAll(context: Context<unknown, { id: string; value: boolean }>) {
    const { id, value } = context.body;
    return app(context).switchRangeTargets(id, value);
  },

  async setTargets(context: Context<unknown, { id: string; targets: string[] }>) {
    const { id, targets } = context.body;
    await app(context).setRangeTargets(id, targets);

    return app(context).getDeviceState(id);
  },

  async setSpec(context: Context<unknown, { id: string; slot: string; changes: TimeSpec }>) {
    const { id, slot, changes } = context.body;
    return app(context).setDeviceSpec(id, slot, changes);
  },

  async setDays(context: Context<unknown, { id: string; days: string[] }>) {
    const { id, days } = context.body;
    return app(context).setDeviceDays(id, days);
  },

  async setEnabled(context: Context<unknown, { id: string; enabled: boolean }>) {
    const { id, enabled } = context.body;
    return app(context).setDeviceEnabled(id, enabled);
  },
};
