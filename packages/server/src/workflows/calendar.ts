import type { BusinessCalendar } from "@so7ob/contracts";
const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, f);
  }
  return Object.fromEntries(
    f.formatToParts(date).map((p) => [p.type, p.value]),
  );
}
function localStamp(date: Date, zone: string) {
  const p = parts(date, zone);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
function boundary(day: string, time: string, zone: string) {
  const target =
    Date.parse(day + "T00:00:00Z") +
    (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60000;
  let guess = target;
  for (let n = 0; n < 5; n++) {
    const next = guess + target - localStamp(new Date(guess), zone);
    if (next === guess) return guess;
    guess = next;
  }
  // A missing wall-clock minute at a DST jump resolves to the first valid later minute.
  let best = Infinity;
  for (let t = guess - 3 * 3600000; t <= guess + 3 * 3600000; t += 60000) {
    const local = localStamp(new Date(t), zone);
    if (local >= target && local < best) {
      best = local;
      guess = t;
    }
  }
  return guess;
}
/** UTC instants; calendar days and holidays are interpreted in the pinned IANA zone. */
export function businessDeadline(
  anchor: Date,
  hours: number,
  calendar: BusinessCalendar,
): Date {
  if (
    !Number.isFinite(anchor.valueOf()) ||
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 720
  )
    throw new Error("invalid_duration");
  const p = parts(anchor, calendar.timezone);
  let day = Date.parse(`${p.year}-${p.month}-${p.day}T00:00:00Z`),
    remaining = hours * 3600000;
  const exceptions = new Map(
    calendar.exceptions.map((e) => [e.date, e.intervals]),
  );
  for (let n = 0; n < 3660; n++, day += 86400000) {
    const date = new Date(day),
      iso = date.toISOString().slice(0, 10),
      intervals = exceptions.get(iso) ?? calendar.week[date.getUTCDay()];
    for (const i of intervals) {
      const start = Math.max(
          anchor.valueOf(),
          boundary(iso, i.start, calendar.timezone),
        ),
        end = boundary(iso, i.end, calendar.timezone);
      if (end <= start) continue;
      if (remaining <= end - start) return new Date(start + remaining);
      remaining -= end - start;
    }
  }
  throw new Error("calendar_horizon");
}
