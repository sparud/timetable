import { nowInZone } from './time';

/**
 * Sunrise and sunset, computed on the Homey itself.
 *
 * This is NOAA's solar position algorithm - the one behind their public calculator -
 * which lands within about a minute of the published tables at the latitudes Homey is
 * sold at. Computing it locally rather than calling a web service keeps the scheduler
 * working offline and adds no dependency; the whole thing is a few dozen flops, so the
 * 20s tick can afford to ask again every time.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Local `HH:MM` of each event, or null where the sun does not cross the horizon. */
export interface SunTimes {
  sunrise: string | null;
  sunset: string | null;
}

export type SunEvent = 'sunrise' | 'sunset';

export const NO_SUN_TIMES: SunTimes = { sunrise: null, sunset: null };

/** Centre of the sun at rise and set: half a degree of disc plus refraction. */
const HORIZON = -0.833;

const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

const sin = (degrees: number) => Math.sin(degrees * RAD);
const cos = (degrees: number) => Math.cos(degrees * RAD);
const tan = (degrees: number) => Math.tan(degrees * RAD);

/**
 * The sun's position for the instant `julianCentury`, as the two quantities an event
 * time needs: how far solar noon sits from clock noon, and how long before it the sun
 * reaches the horizon.
 */
function hourAngleAndNoon(julianCentury: number, latitude: number) {
  const t = julianCentury;

  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const centre = sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t)
    + sin(3 * meanAnomaly) * 0.000289;

  const apparentLongitude = meanLongitude + centre
    - 0.00569 - 0.00478 * sin(125.04 - 1934.136 * t);

  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * cos(125.04 - 1934.136 * t);

  const declination = Math.asin(sin(obliquity) * sin(apparentLongitude)) / RAD;

  // The equation of time, in minutes: true solar time minus mean solar time.
  const y = tan(obliquity / 2) ** 2;
  const equationOfTime = 4 / RAD * (
    y * sin(2 * meanLongitude)
    - 2 * eccentricity * sin(meanAnomaly)
    + 4 * eccentricity * y * sin(meanAnomaly) * cos(2 * meanLongitude)
    - 0.5 * y * y * sin(4 * meanLongitude)
    - 1.25 * eccentricity * eccentricity * sin(2 * meanAnomaly)
  );

  const cosHourAngle = cos(90 - HORIZON) / (cos(latitude) * cos(declination))
    - tan(latitude) * tan(declination);

  return {
    equationOfTime,
    // Out of range means the sun stays up all day or never rises: no event to time.
    hourAngle: Math.abs(cosHourAngle) > 1 ? null : Math.acos(cosHourAngle) / RAD,
  };
}

/** The instant of `event` for the UTC day `dayUtc`, in milliseconds, or null. */
function eventInstant(dayUtc: number, event: SunEvent, { latitude, longitude }: Coordinates): number | null {
  const julianDay = dayUtc / DAY_MS + 2440587.5;
  // Evaluate the sun's position at local solar noon, where the event times hinge on it.
  const julianCentury = (julianDay + 0.5 - longitude / 360 - 2451545) / 36525;

  const { equationOfTime, hourAngle } = hourAngleAndNoon(julianCentury, latitude);
  if (hourAngle === null) return null;

  const noonMinutes = 720 - 4 * longitude - equationOfTime;
  const minutes = event === 'sunrise' ? noonMinutes - 4 * hourAngle : noonMinutes + 4 * hourAngle;

  return dayUtc + minutes * 60_000;
}

/**
 * The local `HH:MM` at which `event` happens on the local date `date`, or null if it
 * does not happen that day.
 *
 * The event is computed for the UTC day of the same number and then checked against the
 * local calendar, because far enough east or west the two disagree - Auckland's sunset
 * belongs to a UTC day that has already ended. Where they disagree the neighbouring day
 * holds the event, so at most three candidates are ever tried.
 */
function localEventTime(date: string, event: SunEvent, coordinates: Coordinates, timeZone: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const dayUtc = Date.UTC(year, month - 1, day);

  for (const shift of [0, -1, 1]) {
    const instant = eventInstant(dayUtc + shift * DAY_MS, event, coordinates);
    if (instant === null) continue;

    const local = nowInZone(timeZone, new Date(instant));
    if (local.date === date) return local.time;
  }

  return null;
}

/** Both events for one local date. `null` coordinates mean the location is unknown. */
export function sunTimes(date: string, coordinates: Coordinates | null, timeZone: string): SunTimes {
  if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
    return NO_SUN_TIMES;
  }

  return {
    sunrise: localEventTime(date, 'sunrise', coordinates, timeZone),
    sunset: localEventTime(date, 'sunset', coordinates, timeZone),
  };
}
