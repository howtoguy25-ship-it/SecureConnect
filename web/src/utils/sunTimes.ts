// Real sunrise/sunset calculation for a given location and date -- the standard "sunrise
// equation" (the same public-domain solar geometry behind most sunrise/sunset calculators),
// not a fixed clock time. It genuinely shifts with latitude/longitude and the seasons the
// same way real sunset does. Uses the conventional -0.833° horizon correction (atmospheric
// refraction + the sun's apparent radius) that official sunrise tables use. Accuracy is
// good to within a couple of minutes for this app's purpose (deciding whether to offer
// night map mode), not survey-grade. Returns null above/below the polar circles on days
// the sun doesn't rise or set at all.
export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function fromJulianDay(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

export function calculateSunTimes(lat: number, lng: number, date: Date = new Date()): SunTimes | null {
  const rad = Math.PI / 180;
  const julianDate = toJulianDay(date);
  const n = Math.floor(julianDate - 2451545.0 + 0.0008);
  const meanSolarNoon = n - lng / 360;
  const solarMeanAnomalyDeg = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
  const equationOfCenter =
    1.9148 * Math.sin(rad * solarMeanAnomalyDeg) +
    0.02 * Math.sin(2 * rad * solarMeanAnomalyDeg) +
    0.0003 * Math.sin(3 * rad * solarMeanAnomalyDeg);
  const eclipticLongitudeDeg = (solarMeanAnomalyDeg + equationOfCenter + 180 + 102.9372) % 360;
  const solarTransit =
    2451545.0 +
    meanSolarNoon +
    0.0053 * Math.sin(rad * solarMeanAnomalyDeg) -
    0.0069 * Math.sin(2 * rad * eclipticLongitudeDeg);
  const sinDeclination = Math.sin(rad * eclipticLongitudeDeg) * Math.sin(rad * 23.4397);
  const cosDeclination = Math.sqrt(1 - sinDeclination * sinDeclination);
  const cosHourAngle =
    (Math.sin(rad * -0.833) - Math.sin(rad * lat) * sinDeclination) / (Math.cos(rad * lat) * cosDeclination);

  if (cosHourAngle > 1 || cosHourAngle < -1) return null; // polar day/night — no sunset today

  const hourAngleDeg = Math.acos(cosHourAngle) / rad;
  const sunsetJulian = solarTransit + hourAngleDeg / 360;
  const sunriseJulian = solarTransit - hourAngleDeg / 360;

  return { sunrise: fromJulianDay(sunriseJulian), sunset: fromJulianDay(sunsetJulian) };
}

export function isNightAt(lat: number, lng: number, when: Date = new Date()): boolean {
  const times = calculateSunTimes(lat, lng, when);
  if (!times) return false;
  return when < times.sunrise || when > times.sunset;
}
