/** A slot's intent: a fixed time, or an offset from a sun event. Fields may be omitted. */
interface TimeSpec {
  mode?: 'absolute' | 'sunrise' | 'sunset';
  time?: string;
  offset?: number;
}

/** What the app exposes to its widgets. */
interface ScheduleApp {
  getDeviceState(id: string): unknown;
  setDeviceSpec(id: string, slot: string, changes: TimeSpec): Promise<unknown>;
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
