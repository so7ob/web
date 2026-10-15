import type { Locale } from '@/lib/i18n';

/** Explicit calendar time, with deterministic UTC for older/legacy metadata. */
export function WorkflowDeadline({ value, locale, timeZone }: {
  value: string;
  locale: Locale;
  timeZone?: string | null;
}) {
  const date = new Date(value);
  let zone = timeZone || 'UTC';
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
    calendar: 'gregory', numberingSystem: 'latn',
  };
  let formatted: string;
  try { formatted = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(date); }
  catch { zone = 'UTC'; formatted = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(date); }
  const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(date).find(part => part.type === 'timeZoneName')!.value.replace('GMT', 'UTC');
  return <time dateTime={value} className="inline-block max-w-full align-top">
    <span className="block">{formatted}</span>
    <bdi dir="ltr" className="block break-words text-xs">{zone === 'UTC' ? 'UTC' : `${zone} · ${offset}`}</bdi>
  </time>;
}
