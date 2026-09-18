import type { SunEvent, SunTimes } from './sun';

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const MINUTES_PER_DAY = 24 * 60;

/** How far a time may be offset from a sun event, either way. */
export const OFFSET_LIMIT = 12 * 60;

/** A point in time, as the scheduler sees it. */
export interface Now {
  /** Local calendar date, `YYYY-MM-DD` — which day's sunrise and sunset apply. */
  date: string;
  /** Local wall-clock time, `HH:MM`. */
  time: string;
  /** `YYYY-MM-DDTHH:MM` — unique per minute, so an event fires at most once. */
  key: string;
  /** Local day of week, 0 = Sunday. */
  weekday: number;
}

/**
 * How a slot's time is decided: a fixed clock time, one of the sun's events, or another
 * device's time. Only a range may follow a device, and only a Time device - which makes
 * a Time device always a leaf, so no reference can ever form a cycle.
 */
export type TimeMode = 'absolute' | SunEvent | 'device';

export const ALL_MODES: readonly TimeMode[] = ['absolute', 'sunrise', 'sunset', 'device'];

/** A slot's stored intent, before the day it applies to is known. */
export interface TimeSpec {
  mode: TimeMode;
  /** The fixed time, used when the mode is `absolute`. */
  time: string | null;
  /** Minutes to add to the sun event or the followed device; negative is before it. */
  offset: number;
  /** Which device is followed: its id, or its name. Only used when the mode is `device`. */
  ref: string | null;
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

/** The inverse of `minutesOf`, wrapping so that any offset lands on a real clock time. */
export function timeOf(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function isTimeMode(value: unknown): value is TimeMode {
  return ALL_MODES.includes(value as TimeMode);
}

/** Whole minutes within the allowed range; anything else reads as no offset. */
export function normalizeOffset(value: unknown): number {
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minutes)) return 0;

  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(minutes)));
}

/**
 * Moves a time by `offset` minutes, wrapping at midnight.
 *
 * Wrapping keeps the result a wall-clock time on the day being scheduled, which is what
 * the tick compares against. So `sunset + 3h` where the sun sets at 23:00 fires at 02:00
 * - early that same morning, judged against that morning's weekday, not the following
 * night. Offsets that large are unusual; offsets that stay within the day are exact.
 */
export function shiftTime(time: string, offset: number): string | null {
  const minutes = minutesOf(time);

  return minutes === null ? null : timeOf(minutes + offset);
}

/**
 * The clock time a slot means on a day whose sun times are `sun`.
 *
 * `referenced` is the time the followed device comes to on that same day, which only the
 * device layer can look up; passing it in keeps every mode resolving through one function.
 */
export function resolveSpec(spec: TimeSpec, sun: SunTimes, referenced: string | null = null): string | null {
  if (spec.mode === 'absolute') return isTime(spec.time) ? spec.time : null;

  // A missing sun event and a missing device are the same answer: nothing is due today.
  const base = spec.mode === 'device' ? referenced : sun[spec.mode];

  return base === null ? null : shiftTime(base, spec.offset);
}

/**
 * Reads the wall clock in Homey's timezone. Comparing local time each tick is what
 * makes the scheduler survive DST changes, restarts and clock corrections: there is
 * no precomputed timer to invalidate.
 */
export function nowInZone(timeZone: string, instant: Date = new Date()): Now {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23', // 'h24' would render midnight as 24:00
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  const time = `${get('hour')}:${get('minute')}`;

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const date = `${year}-${month}-${day}`;

  // Derived from the local date parts, so it is the local weekday and not the
  // runtime's — and not locale-dependent the way Intl's `weekday` would be.
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();

  return { date, time, key: `${date}T${time}`, weekday };
}

/** The local date before `date`, as `YYYY-MM-DD`. */
export function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));

  return previous.toISOString().slice(0, 10);
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
  dayEnabled = true,
): boolean {
  return dayEnabled && target !== null && target === now.time && lastFiredKey !== now.key;
}

/** Setting ids for the weekday checkboxes, indexed by `Now.weekday`. */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function previousWeekday(weekday: number): number {
  return (weekday + 6) % 7;
}

/** No days ticked means every day, so a device with the feature unused behaves as before. */
export function isDayEnabled(days: string[], weekday: number): boolean {
  return days.length === 0 || days.includes(WEEKDAYS[weekday]);
}

/**
 * Whether a range is running right now.
 *
 * The weekdays select the day the range *starts*, so `22:00-06:00 on Mondays` means
 * "the night beginning on Monday" and stays active into Tuesday morning. Judging each
 * end separately would instead close the range on the wrong day, or never.
 */
export function isRangeActive(start: string, end: string, days: string[], now: Now): boolean {
  const from = minutesOf(start);
  const to = minutesOf(end);
  const at = minutesOf(now.time);
  if (from === null || to === null || at === null || from === to) return false;

  const wraps = from > to;
  const inWindow = wraps ? at >= from || at < to : at >= from && at < to;
  if (!inWindow) return false;

  const startedOn = wraps && at < to ? previousWeekday(now.weekday) : now.weekday;
  return isDayEnabled(days, startedOn);
}

/** Whether the end of a range is due now, judged by the day its occurrence began. */
export function isRangeEndDue(start: string, end: string, days: string[], now: Now): boolean {
  if (now.time !== end) return false;

  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null || from === to) return false;

  const startedOn = from > to ? previousWeekday(now.weekday) : now.weekday;
  return isDayEnabled(days, startedOn);
}

