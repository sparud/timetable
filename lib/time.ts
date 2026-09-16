export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A point in time, as the scheduler sees it. */
export interface Now {
  /** Local wall-clock time, `HH:MM`. */
  time: string;
  /** `YYYY-MM-DDTHH:MM` — unique per minute, so an event fires at most once. */
  key: string;
}

/**
 * Accepts what a Flow tag might carry - `7:30` as well as `07:30` - and returns the
 * canonical `HH:MM`, or null if it is not a time at all.
 */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function minutesOf(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Reads the wall clock in Homey's timezone. Comparing local time each tick is what
 * makes the scheduler survive DST changes, restarts and clock corrections: there is
 * no precomputed timer to invalidate.
 */
export function nowInZone(timeZone: string, date: Date = new Date()): Now {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23', // 'h24' would render midnight as 24:00
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  const time = `${get('hour')}:${get('minute')}`;

  return { time, key: `${get('year')}-${get('month')}-${get('day')}T${time}` };
}

/** Whether `time` falls in [start, end). Ranges may wrap past midnight. */
export function isWithin(start: string, end: string, time: string): boolean {
  const from = minutesOf(start);
  const to = minutesOf(end);
  const at = minutesOf(time);
  if (from === null || to === null || at === null) return false;
  if (from === to) return false;

  return from < to
    ? at >= from && at < to
    : at >= from || at < to;
}

/**
 * Whether a slot due at `target` should fire on this tick.
 *
 * `lastFiredKey` is the minute key the slot last fired for. Because the key is local
 * date + local time, the repeated hour at the autumn DST change collapses onto one key,
 * so a schedule inside it fires once rather than twice. The hour skipped in spring
 * simply never matches, so it does not fire at all that day.
 */
export function shouldFire(
  target: string | null,
  lastFiredKey: string | undefined,
  now: Now,
): boolean {
  return target !== null && target === now.time && lastFiredKey !== now.key;
}

