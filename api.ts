/**
 * The app's own API, used by the settings page.
 *
 * Widgets have their own `api.ts` per widget; this one is for `/settings/index.html`,
 * which needs the list of ranges and the list of switchable devices to pair them up.
 */

interface TargetsApp {
  getRangeTargets(): Promise<unknown>;
  getSwitchableDevices(): Promise<unknown>;
  setRangeTargets(id: string, refs: string[]): Promise<unknown>;
}

interface Context<Body = unknown> {
  homey: { app: unknown };
  body: Body;
}

const app = (context: Context<any>): TargetsApp => context.homey.app as TargetsApp;

export = {
  async getRanges(context: Context) {
    return app(context).getRangeTargets();
  },

  async getDevices(context: Context) {
    return app(context).getSwitchableDevices();
  },

  async setTargets(context: Context<{ id: string; targets: string[] }>) {
    const { id, targets } = context.body;
    return app(context).setRangeTargets(id, targets);
  },
};
