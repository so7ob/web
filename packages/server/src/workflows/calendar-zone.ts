import type { DataSource, QueryRunner } from 'typeorm';

/** Public metadata only; the caller supplies the pinned calendar version ID. */
export async function calendarTimezoneFor(db: DataSource | QueryRunner, calendarId: string | null): Promise<string | null> {
  if (!calendarId) return null;
  const [calendar] = await db.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(definition,'$.timezone')) timezone FROM WorkCalendar WHERE id=?", [calendarId]);
  return typeof calendar?.timezone === 'string' ? calendar.timezone : null;
}
