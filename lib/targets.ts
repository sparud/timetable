/**
 * The devices a range switches, stored as one comma-separated setting.
 *
 * Entries are device ids when the app's settings page wrote them, and names when someone
 * typed them into the device settings page - which has no picker to offer. Resolution
 * tries ids first, exactly as a slot's `_ref` does.
 */

/** A device this app can switch: anything, in any app, that has an `onoff` capability. */
export interface SwitchableDevice {
  id: string;
  name: string;
  zone: string | null;
}

export function parseTargets(value: unknown): string[] {
  if (typeof value !== 'string') return [];

  const refs = new Set<string>();
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed !== '') refs.add(trimmed);
  }

  return [...refs];
}

export function formatTargets(refs: string[]): string {
  return parseTargets(refs.join(',')).join(', ');
}

/** A device id as it appears at the end of a stored reference. */
const TRAILING_ID = /\(\s*([0-9a-fA-F-]{36})\s*\)\s*$/;

/**
 * Splits a stored reference into the parts worth matching on.
 *
 * References are written as `Name (id)`, which reads in the settings page while still
 * surviving a rename, because the id is what resolves. Bare ids and bare names both
 * still parse: the first is what earlier versions stored, the second is what someone
 * types by hand.
 */
export function splitRef(ref: string): { id: string | null; name: string } {
  const match = TRAILING_ID.exec(ref);

  return match
    ? { id: match[1], name: ref.slice(0, match.index).trim() }
    : { id: null, name: ref.trim() };
}

/** How a reference is stored once the app knows which device is meant. */
export function formatRef(device: { id: string; name: string }): string {
  // Commas separate the target list, so a name carrying one cannot go in verbatim.
  return `${device.name.replace(/,/g, ' ')} (${device.id})`;
}

/** Finds the device a stored reference means: by id, else by name, case-insensitively. */
export function matchTarget<T extends { id: string; name: string }>(
  devices: T[],
  ref: string,
): T | undefined {
  const { id, name } = splitRef(ref);
  const needle = name.toLowerCase();

  return (id === null ? undefined : devices.find(device => device.id === id))
    ?? devices.find(device => device.id === name)
    ?? (needle === '' ? undefined : devices.find(device => device.name.toLowerCase() === needle));
}

/**
 * The combined on/off state of a range's targets, as the widget's button shows it.
 *
 * `unknown` means every target is unreachable or has no value yet; it is kept distinct
 * from `off` so the button never claims a lamp is off when nobody knows.
 */
export type TargetState = 'none' | 'unknown' | 'on' | 'off' | 'mixed';

export function aggregateState(values: Array<boolean | null>): TargetState {
  if (values.length === 0) return 'none';

  const known = values.filter((value): value is boolean => typeof value === 'boolean');
  if (known.length === 0) return 'unknown';
  if (known.every(Boolean)) return 'on';
  if (known.every(value => !value)) return 'off';

  return 'mixed';
}

/**
 * The tri-state collapsed to the boolean an `onoff` capability can hold: on when
 * anything is on, so the tile offers to turn it off - the useful half of the truth.
 * `unknown` reads as off rather than claiming a lamp is lit.
 */
export function isAnyOn(state: TargetState): boolean {
  return state === 'on' || state === 'mixed';
}
