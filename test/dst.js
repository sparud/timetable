'use strict';
/*
 * Drives the *compiled* scheduler helpers across real DST transitions.
 *
 * The app ticks every 20s and compares local wall-clock time, so this replays the
 * same tick sequence over a simulated clock and counts how often a slot would fire.
 */
const assert = require('assert');
const { nowInZone, shouldFire, isWithin, normalizeTime,
        isDayEnabled, isRangeActive, isRangeEndDue, previousWeekday } = require('../.homeybuild/lib/time.js');

const TZ = 'Europe/Stockholm';
const TICK_MS = 20_000;

/** Replay ticks from `fromUtc` to `toUtc`, returning the local times a slot fired at. */
function replay(target, fromUtc, toUtc, tz = TZ) {
  const fires = [];
  let lastKey;

  for (let t = Date.parse(fromUtc); t <= Date.parse(toUtc); t += TICK_MS) {
    const now = nowInZone(tz, new Date(t));
    if (!shouldFire(target, lastKey, now)) continue;

    lastKey = now.key;
    fires.push({ local: now.time, key: now.key, utc: new Date(t).toISOString() });
  }
  return fires;
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name, '']);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
  }
}

// --- the assumption everything rests on -------------------------------------
check('runtime has a real timezone database (not UTC fallback)', () => {
  // 2027-06-01 12:00 UTC is 14:00 in Stockholm (CEST, +02:00)
  const summer = nowInZone(TZ, new Date('2027-06-01T12:00:00Z'));
  assert.strictEqual(summer.time, '14:00', `got ${summer.time}`);
  // 2027-01-01 12:00 UTC is 13:00 (CET, +01:00) - proves the offset actually shifts
  const winter = nowInZone(TZ, new Date('2027-01-01T12:00:00Z'));
  assert.strictEqual(winter.time, '13:00', `got ${winter.time}`);
});

check('midnight renders as 00:00, never 24:00', () => {
  const t = nowInZone(TZ, new Date('2027-06-01T22:00:00Z')); // 00:00 local
  assert.strictEqual(t.time, '00:00');
  assert.strictEqual(t.key, '2027-06-02T00:00');
});

// --- spring forward: 2027-03-28, 02:00 -> 03:00 ------------------------------
check('spring forward: a 02:30 schedule does not fire (that minute never exists)', () => {
  const fires = replay('02:30', '2027-03-27T22:00:00Z', '2027-03-28T04:00:00Z');
  assert.strictEqual(fires.length, 0, `fired ${fires.length}x: ${JSON.stringify(fires)}`);
});

check('spring forward: 01:30 (before) fires exactly once', () => {
  const fires = replay('01:30', '2027-03-27T22:00:00Z', '2027-03-28T04:00:00Z');
  assert.strictEqual(fires.length, 1, `fired ${fires.length}x`);
});

check('spring forward: 03:30 (after) fires exactly once', () => {
  const fires = replay('03:30', '2027-03-27T22:00:00Z', '2027-03-28T04:00:00Z');
  assert.strictEqual(fires.length, 1, `fired ${fires.length}x`);
});

// --- fall back: 2027-10-31, 03:00 -> 02:00 (02:00-02:59 happens twice) -------
check('fall back: a 02:30 schedule fires ONCE despite the hour repeating', () => {
  const fires = replay('02:30', '2027-10-30T22:00:00Z', '2027-10-31T04:00:00Z');
  assert.strictEqual(fires.length, 1, `fired ${fires.length}x: ${JSON.stringify(fires)}`);
  assert.strictEqual(fires[0].key, '2027-10-31T02:30');
});

check('fall back: the repeated hour really is traversed twice', () => {
  // sanity check on the fixture itself - both 00:30Z and 01:30Z are 02:30 local
  assert.strictEqual(nowInZone(TZ, new Date('2027-10-31T00:30:00Z')).time, '02:30');
  assert.strictEqual(nowInZone(TZ, new Date('2027-10-31T01:30:00Z')).time, '02:30');
});

// --- ordinary behaviour ------------------------------------------------------
check('a normal day fires exactly once', () => {
  const fires = replay('19:25', '2027-06-14T00:00:00Z', '2027-06-15T00:00:00Z');
  assert.strictEqual(fires.length, 1, `fired ${fires.length}x`);
  assert.strictEqual(fires[0].local, '19:25');
});

check('consecutive days fire once each', () => {
  const fires = replay('19:25', '2027-06-14T00:00:00Z', '2027-06-17T00:00:00Z');
  assert.strictEqual(fires.length, 3, `fired ${fires.length}x`);
});

check('three ticks inside the same minute fire once', () => {
  const fires = replay('19:25', '2027-06-14T17:24:50Z', '2027-06-14T17:25:50Z');
  assert.strictEqual(fires.length, 1, `fired ${fires.length}x`);
});

check('a restart mid-minute would re-fire without the seeded guard', () => {
  // documents why onInit seeds `fired`: a fresh guard inside the target minute fires
  const now = nowInZone(TZ, new Date('2027-06-14T17:25:30Z'));
  assert.strictEqual(shouldFire('19:25', undefined, now), true);
  assert.strictEqual(shouldFire('19:25', now.key, now), false);
});

// --- ranges ------------------------------------------------------------------
check('range wrapping midnight is active on both sides', () => {
  assert.strictEqual(isWithin('22:00', '06:00', '23:30'), true);
  assert.strictEqual(isWithin('22:00', '06:00', '01:00'), true);
  assert.strictEqual(isWithin('22:00', '06:00', '12:00'), false);
});

check('range boundaries: start inclusive, end exclusive', () => {
  assert.strictEqual(isWithin('19:00', '23:00', '19:00'), true);
  assert.strictEqual(isWithin('19:00', '23:00', '23:00'), false);
});

check('start == end is never active', () => {
  assert.strictEqual(isWithin('19:00', '19:00', '19:00'), false);
  assert.strictEqual(isWithin('19:00', '19:00', '03:00'), false);
});

check('range spanning the fall-back night stays active throughout', () => {
  // 22:00 -> 06:00 across 2027-10-31; check a point in the repeated hour
  const inRepeat = nowInZone(TZ, new Date('2027-10-31T01:30:00Z')).time;
  assert.strictEqual(isWithin('22:00', '06:00', inRepeat), true, `at ${inRepeat}`);
});

// --- input normalisation -----------------------------------------------------
check('normalizeTime accepts loose tag input, rejects nonsense', () => {
  assert.strictEqual(normalizeTime('7:05'), '07:05');
  assert.strictEqual(normalizeTime(' 23:59 '), '23:59');
  assert.strictEqual(normalizeTime('24:00'), null);
  assert.strictEqual(normalizeTime('7:5'), null);
  assert.strictEqual(normalizeTime('banana'), null);
  assert.strictEqual(normalizeTime(undefined), null);
});

// --- weekday repetition ------------------------------------------------------
const DAYNAMES = ['sun','mon','tue','wed','thu','fri','sat'];
/** A `Now` for a given local date and time, with the weekday derived the same way. */
const at = (date, time) => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { time, key: `${date}T${time}`, weekday };
};

check('weekday is the LOCAL day, derived from local date parts', () => {
  // 2027-06-14 is a Monday; 23:30 UTC is already Tuesday 01:30 in Stockholm
  assert.strictEqual(nowInZone(TZ, new Date('2027-06-14T10:00:00Z')).weekday, 1, 'Monday');
  const late = nowInZone(TZ, new Date('2027-06-14T23:30:00Z'));
  assert.strictEqual(late.time, '01:30');
  assert.strictEqual(late.weekday, 2, 'rolled over to Tuesday locally');
});

check('no days ticked means every day', () => {
  for (let d = 0; d < 7; d++) assert.strictEqual(isDayEnabled([], d), true);
});

check('ticked days gate correctly', () => {
  assert.strictEqual(isDayEnabled(['mon'], 1), true);
  assert.strictEqual(isDayEnabled(['mon'], 2), false);
  assert.strictEqual(isDayEnabled(['sat','sun'], 0), true);
  assert.strictEqual(isDayEnabled(['sat','sun'], 3), false);
});

check('previousWeekday wraps Sunday back to Saturday', () => {
  assert.strictEqual(previousWeekday(0), 6);
  assert.strictEqual(previousWeekday(1), 0);
});

// The table from the design discussion: 22:00-06:00, Mondays only.
// 2027-06-14 is a Monday, 06-15 Tuesday, 06-16 Wednesday.
const S = '22:00', E = '06:00', D = ['mon'];
const expected = [
  // date          time     active  startDue  endDue
  ['2027-06-14', '21:59', false, false, false],
  ['2027-06-14', '22:00', true,  true,  false],
  ['2027-06-14', '23:30', true,  false, false],
  ['2027-06-15', '03:00', true,  false, false],   // Tuesday, still Monday's night
  ['2027-06-15', '05:59', true,  false, false],
  ['2027-06-15', '06:00', false, false, true],    // closes on Tuesday morning
  ['2027-06-15', '22:00', false, false, false],   // Tuesday night does not open
  ['2027-06-16', '03:00', false, false, false],
  ['2027-06-16', '06:00', false, false, false],   // no spurious end
  ['2027-06-14', '06:00', false, false, false],   // Monday morning: nothing opened it
];

check('midnight-spanning range with weekdays matches the design table', () => {
  for (const [date, time, active, startDue, endDue] of expected) {
    const now = at(date, time);
    const day = DAYNAMES[now.weekday];
    assert.strictEqual(isRangeActive(S, E, D, now), active, `active ${day} ${time}`);
    assert.strictEqual(isDayEnabled(D, now.weekday) && time === S, startDue, `start ${day} ${time}`);
    assert.strictEqual(isRangeEndDue(S, E, D, now), endDue, `end ${day} ${time}`);
  }
});

check('the naive reading (weekday per event) would leave the range open', () => {
  // documents the bug this design avoids: on Tuesday 06:00 a per-event weekday check
  // sees "not Monday" and never closes the range
  const tueMorning = at('2027-06-15', '06:00');
  assert.strictEqual(isDayEnabled(D, tueMorning.weekday), false, 'Tuesday is not enabled');
  assert.strictEqual(isRangeEndDue(S, E, D, tueMorning), true, 'but the end is still due');
});

check('same-day range is unaffected by the start-day rule', () => {
  const s = '08:00', e = '17:00';
  assert.strictEqual(isRangeActive(s, e, D, at('2027-06-14', '12:00')), true);
  assert.strictEqual(isRangeEndDue(s, e, D, at('2027-06-14', '17:00')), true);
  assert.strictEqual(isRangeActive(s, e, D, at('2027-06-15', '12:00')), false);
  assert.strictEqual(isRangeEndDue(s, e, D, at('2027-06-15', '17:00')), false);
});

check('weekend range crossing into Monday still closes', () => {
  const days = ['sun'];
  assert.strictEqual(isRangeActive(S, E, days, at('2027-06-13', '23:00')), true, 'Sunday night');
  assert.strictEqual(isRangeActive(S, E, days, at('2027-06-14', '02:00')), true, 'into Monday');
  assert.strictEqual(isRangeEndDue(S, E, days, at('2027-06-14', '06:00')), true, 'closes Monday');
});

check('every-day range behaves as before weekdays existed', () => {
  for (const [date, time, active] of expected) {
    const now = at(date, time);
    assert.strictEqual(isRangeActive(S, E, [], now), isWithin(S, E, time), `${date} ${time}`);
  }
});

check('shouldFire respects the day gate', () => {
  const now = at('2027-06-15', '22:00');
  assert.strictEqual(shouldFire('22:00', undefined, now, true), true);
  assert.strictEqual(shouldFire('22:00', undefined, now, false), false);
});

for (const [status, name, detail] of results) {
  console.log(`${status === 'PASS' ? ' ok ' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`);
}
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
