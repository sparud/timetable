'use strict';
/*
 * Sunrise and sunset, and the specs that follow them.
 *
 * The times are checked against published values for real places, because the point of
 * the algorithm is to agree with the sun rather than with itself: a sign error in the
 * equation of time is invisible unless something outside the code says what the answer is.
 */
const assert = require('assert');
const { sunTimes } = require('../.homeybuild/lib/sun.js');
const { aggregateState, formatRef, formatTargets, isAnyOn, matchTarget,
        parseTargets, splitRef } = require('../.homeybuild/lib/targets.js');
const { isRangeActive, isRangeEndDue, isTimeMode, nowInZone, normalizeOffset, previousDate,
        resolveSpec, shiftTime, shouldFire, timeOf } = require('../.homeybuild/lib/time.js');

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };
const AUCKLAND = { latitude: -36.8485, longitude: 174.7633 };
const TZ = 'Europe/Stockholm';
const TICK_MS = 20_000;

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name, '']);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
  }
}

/** Within a minute of the published time is as close as the algorithm claims to be. */
function assertNear(actual, expected, label) {
  assert.ok(actual !== null, `${label}: no event at all, wanted ${expected}`);

  const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const off = Math.abs(minutes(actual) - minutes(expected));
  assert.ok(off <= 1, `${label}: ${actual}, wanted ${expected}`);
}

// --- against the published tables -------------------------------------------
check('Stockholm at the solstices', () => {
  const summer = sunTimes('2026-06-21', STOCKHOLM, TZ);
  assertNear(summer.sunrise, '03:31', 'midsummer sunrise');
  assertNear(summer.sunset, '22:08', 'midsummer sunset');

  const winter = sunTimes('2026-12-21', STOCKHOLM, TZ);
  assertNear(winter.sunrise, '08:43', 'midwinter sunrise');
  assertNear(winter.sunset, '14:48', 'midwinter sunset');
});

check('a timezone twelve hours from UTC still gets its own day', () => {
  // The event falls on a UTC day that has already ended in Auckland, so taking the
  // UTC date at face value would report the wrong day's sunset.
  const day = sunTimes('2026-06-21', AUCKLAND, 'Pacific/Auckland');
  assertNear(day.sunrise, '07:33', 'Auckland sunrise');
  assertNear(day.sunset, '17:11', 'Auckland sunset');
});

check('sun times are local, so they jump with the DST change', () => {
  const before = sunTimes('2026-03-28', STOCKHOLM, TZ);
  const after = sunTimes('2026-03-29', STOCKHOLM, TZ); // clocks go forward at 02:00

  assert.strictEqual(before.sunrise, '05:25');
  assert.strictEqual(after.sunrise, '06:22', 'an hour later by the clock, minutes earlier by the sun');
});

// --- where there is no event -------------------------------------------------
check('the midnight sun has neither', () => {
  assert.deepStrictEqual(sunTimes('2026-06-21', KIRUNA, TZ), { sunrise: null, sunset: null });
});

check('the polar night has neither', () => {
  assert.deepStrictEqual(sunTimes('2026-12-21', KIRUNA, TZ), { sunrise: null, sunset: null });
});

check('an unknown location has neither', () => {
  assert.deepStrictEqual(sunTimes('2026-06-21', null, TZ), { sunrise: null, sunset: null });
  assert.deepStrictEqual(sunTimes('2026-06-21', { latitude: NaN, longitude: 0 }, TZ),
    { sunrise: null, sunset: null });
});

// --- resolving a slot --------------------------------------------------------
const SUN = { sunrise: '05:00', sunset: '21:30' };

check('a fixed time ignores the sun', () => {
  assert.strictEqual(resolveSpec({ mode: 'absolute', time: '07:00', offset: 90 }, SUN), '07:00');
  assert.strictEqual(resolveSpec({ mode: 'absolute', time: null, offset: 0 }, SUN), null);
});

check('an offset moves the event either way', () => {
  assert.strictEqual(resolveSpec({ mode: 'sunset', time: '07:00', offset: -30 }, SUN), '21:00');
  assert.strictEqual(resolveSpec({ mode: 'sunrise', time: null, offset: 45 }, SUN), '05:45');
  assert.strictEqual(resolveSpec({ mode: 'sunrise', time: null, offset: 0 }, SUN), '05:00');
});

check('an offset past midnight wraps onto the same day', () => {
  assert.strictEqual(shiftTime('23:30', 60), '00:30');
  assert.strictEqual(shiftTime('00:20', -30), '23:50');
  assert.strictEqual(timeOf(-1), '23:59');
  assert.strictEqual(timeOf(1440), '00:00');
});

check('a day without the event resolves to nothing, not to midnight', () => {
  const polar = { sunrise: null, sunset: null };
  assert.strictEqual(resolveSpec({ mode: 'sunset', time: '07:00', offset: -30 }, polar), null);
  assert.strictEqual(resolveSpec({ mode: 'sunrise', time: '07:00', offset: 0 }, polar), null);
});

check('offsets are whole minutes within half a day', () => {
  assert.strictEqual(normalizeOffset(-30), -30);
  assert.strictEqual(normalizeOffset('45'), 45);
  assert.strictEqual(normalizeOffset(12.6), 13);
  assert.strictEqual(normalizeOffset(5000), 720);
  assert.strictEqual(normalizeOffset(-5000), -720);
  assert.strictEqual(normalizeOffset('nonsense'), 0);
  assert.strictEqual(normalizeOffset(undefined), 0);
});

check('previousDate steps over month, year and DST boundaries', () => {
  assert.strictEqual(previousDate('2026-03-01'), '2026-02-28');
  assert.strictEqual(previousDate('2028-03-01'), '2028-02-29');
  assert.strictEqual(previousDate('2026-01-01'), '2025-12-31');
  assert.strictEqual(previousDate('2026-03-29'), '2026-03-28');
});

// --- following another device ------------------------------------------------
check('a followed device supplies the time, offset and all', () => {
  const spec = { mode: 'device', time: '07:00', offset: 15, ref: 'Wake up' };
  assert.strictEqual(resolveSpec(spec, SUN, '06:30'), '06:45');
  assert.strictEqual(resolveSpec({ ...spec, offset: -15 }, SUN, '06:30'), '06:15');
  assert.strictEqual(resolveSpec({ ...spec, offset: 0 }, SUN, '06:30'), '06:30');
});

check('a reference that resolves to nothing fires nothing', () => {
  // A deleted device, a name that matches none, or one whose own sun event is absent.
  const spec = { mode: 'device', time: '07:00', offset: 15, ref: 'Gone' };
  assert.strictEqual(resolveSpec(spec, SUN, null), null);
});

check('a followed device is independent of the sun', () => {
  const polar = { sunrise: null, sunset: null };
  const spec = { mode: 'device', time: null, offset: 0, ref: 'Wake up' };
  assert.strictEqual(resolveSpec(spec, polar, '06:30'), '06:30');
});

check('device is a mode, and nothing else is', () => {
  assert.strictEqual(isTimeMode('device'), true);
  assert.strictEqual(isTimeMode('Device'), false);
  assert.strictEqual(isTimeMode('flow'), false);
  assert.strictEqual(isTimeMode(undefined), false);
});

check('a range following a device still closes on the day it opened', () => {
  // Both ends resolved from devices: 22:30 to 06:30, Mondays only.
  const start = resolveSpec({ mode: 'device', time: null, offset: 30, ref: 'Bedtime' }, SUN, '22:00');
  const end = resolveSpec({ mode: 'device', time: null, offset: -30, ref: 'Wake up' }, SUN, '07:00');
  assert.strictEqual(start, '22:30');
  assert.strictEqual(end, '06:30');

  const days = ['mon'];
  const at = (date, time) => nowInZone(TZ, new Date(`${date}T${time}:00+02:00`));
  assert.strictEqual(isRangeActive(start, end, days, at('2026-09-21', '23:00')), true, 'Monday night');
  assert.strictEqual(isRangeActive(start, end, days, at('2026-09-22', '02:00')), true, 'into Tuesday');
  assert.strictEqual(isRangeEndDue(start, end, days, at('2026-09-22', '06:30')), true, 'closes Tuesday');
  assert.strictEqual(isRangeActive(start, end, days, at('2026-09-22', '23:00')), false, 'not Tuesday night');
});

// --- the devices a range switches --------------------------------------------
check('targets parse from one comma-separated setting', () => {
  assert.deepStrictEqual(parseTargets('Lamp, Porch light'), ['Lamp', 'Porch light']);
  assert.deepStrictEqual(parseTargets('  Lamp ,, , Porch  '), ['Lamp', 'Porch']);
  assert.deepStrictEqual(parseTargets('Lamp, Lamp'), ['Lamp'], 'no duplicates');
  assert.deepStrictEqual(parseTargets(''), []);
  assert.deepStrictEqual(parseTargets(undefined), []);
});

check('targets round-trip through the setting unchanged', () => {
  const refs = ['abc-123', 'Porch light'];
  assert.deepStrictEqual(parseTargets(formatTargets(refs)), refs);
});

check('a reference is stored readably and still matched by id', () => {
  const device = { id: 'abc-123', name: 'Porch light' };
  assert.strictEqual(formatRef(device), 'Porch light (abc-123)');
  assert.deepStrictEqual(splitRef('Porch light (11111111-2222-3333-4444-555555555555)'),
    { id: '11111111-2222-3333-4444-555555555555', name: 'Porch light' });
  assert.deepStrictEqual(splitRef('  Wake up  '), { id: null, name: 'Wake up' });
  // A name carrying a comma would split the target list in two.
  assert.strictEqual(formatRef({ id: 'x', name: 'Lamp, kitchen' }), 'Lamp  kitchen (x)');
});

check('a renamed device is still found through its stored id', () => {
  const stored = 'Old name (11111111-2222-3333-4444-555555555555)';
  const devices = [{ id: '11111111-2222-3333-4444-555555555555', name: 'New name' }];
  assert.strictEqual(matchTarget(devices, stored).name, 'New name');
});

check('references written by earlier versions still resolve', () => {
  const devices = [{ id: 'abc-123', name: 'Porch light' }];
  assert.strictEqual(matchTarget(devices, 'abc-123')?.id, 'abc-123', 'a bare id');
  assert.strictEqual(matchTarget(devices, 'Porch light')?.id, 'abc-123', 'a bare name');
});

check('a target matches by id first, then by name', () => {
  const devices = [
    { id: 'abc-123', name: 'Porch light' },
    { id: 'def-456', name: 'porch LIGHT' },
  ];
  assert.strictEqual(matchTarget(devices, 'abc-123').id, 'abc-123', 'id wins');
  assert.strictEqual(matchTarget(devices, 'Porch light').id, 'abc-123', 'name, first match');
  assert.strictEqual(matchTarget(devices, 'PORCH LIGHT').id, 'abc-123', 'case-insensitive');
  assert.strictEqual(matchTarget(devices, 'Gone'), undefined);
});

check('the combined state of the switched devices', () => {
  assert.strictEqual(aggregateState([]), 'none');
  assert.strictEqual(aggregateState([true, true]), 'on');
  assert.strictEqual(aggregateState([false, false]), 'off');
  assert.strictEqual(aggregateState([true, false]), 'mixed');
  assert.strictEqual(aggregateState([null, null]), 'unknown', 'all unreachable');
  assert.strictEqual(aggregateState([true, null]), 'on', 'an unreachable one does not muddy it');
  assert.strictEqual(aggregateState([false, null]), 'off');
});

check('the tile shows on whenever anything is on', () => {
  assert.strictEqual(isAnyOn('on'), true);
  assert.strictEqual(isAnyOn('mixed'), true, 'so a tap offers to turn everything off');
  assert.strictEqual(isAnyOn('off'), false);
  assert.strictEqual(isAnyOn('unknown'), false, 'never claim a lamp is lit');
  assert.strictEqual(isAnyOn('none'), false);
});

// --- the whole scheduler, on a sun-following slot ----------------------------
/** Replay real ticks over `days`, resolving the slot afresh each tick as the app does. */
function replaySpec(spec, coordinates, fromUtc, toUtc) {
  const fires = [];
  let lastKey;

  for (let t = Date.parse(fromUtc); t <= Date.parse(toUtc); t += TICK_MS) {
    const now = nowInZone(TZ, new Date(t));
    const target = resolveSpec(spec, sunTimes(now.date, coordinates, TZ));
    if (!shouldFire(target, lastKey, now)) continue;

    lastKey = now.key;
    fires.push(`${now.date} ${now.time}`);
  }
  return fires;
}

check('a sunset slot fires once a day, at a time that moves with the sun', () => {
  const spec = { mode: 'sunset', time: null, offset: -30 };
  const fires = replaySpec(spec, STOCKHOLM, '2026-09-18T00:00:00Z', '2026-09-20T22:00:00Z');

  assert.strictEqual(fires.length, 3, `fired ${fires.length}x: ${JSON.stringify(fires)}`);
  assert.deepStrictEqual(fires.map(f => f.slice(0, 10)), ['2026-09-18', '2026-09-19', '2026-09-20']);

  // Sunset retreats a few minutes a day at this time of year; the slot must follow.
  const times = fires.map(f => f.slice(11));
  assert.ok(times[0] > times[1] && times[1] > times[2], `not retreating: ${times}`);
});

check('the midnight sun simply does not fire', () => {
  const spec = { mode: 'sunset', time: null, offset: 0 };
  const fires = replaySpec(spec, KIRUNA, '2026-06-20T00:00:00Z', '2026-06-22T00:00:00Z');

  assert.deepStrictEqual(fires, []);
});

check('a sunrise slot fires exactly once across the spring-forward night', () => {
  const spec = { mode: 'sunrise', time: null, offset: 0 };
  const fires = replaySpec(spec, STOCKHOLM, '2026-03-28T22:00:00Z', '2026-03-29T10:00:00Z');

  assert.deepStrictEqual(fires, ['2026-03-29 06:22']);
});

for (const [status, name, detail] of results) {
  console.log(`${status === 'PASS' ? ' ok ' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`);
}
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
