import type { Locale } from '@/lib/i18n';

interface Publication {
  id: string;
  definition: { nameAr: string; nameEn: string };
  createdAt?: string | null;
}
function publicationText(version: Publication, locale: Locale) {
  const date = version.createdAt ? new Date(version.createdAt) : null;
  return {
    prefix: locale === 'ar' ? 'إصدار' : 'Version',
    name: version.definition[locale === 'ar' ? 'nameAr' : 'nameEn'],
    published: locale === 'ar' ? 'نُشر' : 'Published',
    date: date && Number.isFinite(date.valueOf()) ? date.toISOString().replace('T', ' ').replace('Z', ' UTC') : null,
    missing: locale === 'ar' ? 'تاريخ النشر غير متاح' : 'Publication date unavailable',
  };
}
/** Identity comes only from the immutable publication, never its list position. */
export function workflowVersionLabel(version: Publication, locale: Locale): string {
  const text = publicationText(version, locale);
  // Full IDs distinguish even identical names/timestamps or colliding abbreviations.
  return `${text.prefix} ${version.id} · ${text.name} · ${text.date ? text.published + ' ' + text.date : text.missing}`;
}

/** Preserve the same logical label while isolating technical values in RTL. */
export function WorkflowVersionIdentity({ version, locale, id }: { version: Publication; locale: Locale; id?: string }) {
  const text = publicationText(version, locale);
  return <span id={id}>{text.prefix}{' '}<bdi dir="ltr">{version.id}</bdi>{' · '}{text.name}{' · '}{text.date ? <>{text.published}{' '}<bdi dir="ltr">{text.date}</bdi></> : text.missing}</span>;
}
