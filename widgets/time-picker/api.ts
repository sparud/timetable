/** What the app exposes to its widgets. */
interface ScheduleApp {
  getDeviceState(id: string): unknown;
  setDeviceTime(id: string, slot: string, value: string): Promise<unknown>;
}

/** Homey passes the app instance on `homey.app`; that is all these handlers need. */
interface Context<Query = unknown, Body = unknown> {
  homey: { app: unknown };
  query: Query;
  body: Body;
}

const app = (context: Context<never, never> | Context<any, any>): ScheduleApp =>
  context.homey.app as ScheduleApp;

export = {
  async getState(context: Context<{ id: string }>) {
    return app(context).getDeviceState(context.query.id);
  },

  async setTime(context: Context<unknown, { id: string; slot: string; value: string }>) {
    const { id, slot, value } = context.body;
    return app(context).setDeviceTime(id, slot, value);
  },
};
