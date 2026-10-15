// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageSwitcher } from './language-switcher';
import { en } from '@/content/en';
import { ar } from '@/content/ar';

afterEach(cleanup);
for (const locale of ['ar', 'en'] as const) {
  const other = locale === 'ar' ? 'en' : 'ar';
  const common = (locale === 'ar' ? ar : en).common;
  function show(path: string) {
    render(<MemoryRouter initialEntries={[path]}><LanguageSwitcher locale={locale} common={common} /></MemoryRouter>);
    return screen.getByRole('link', { name: common.switchLanguage });
  }
  for (const scope of ['request', 'inquiry']) {
    it(`${locale}: preserves only the canonical ${scope} card`, () => {
      const link = show(`/${locale}/track?card=${scope}:synthetic-id&debug=untrusted#section`);
      const target = new URL(link.getAttribute('href')!, 'https://synthetic.invalid');
      expect(target.pathname).toBe(`/${other}/track`);
      expect([...target.searchParams]).toEqual([['card', scope + ':synthetic-id']]);
      expect(target.hash).toBe('');
    });
  }
  it(`${locale}: prevents language navigation while token exchange owns the context`, () => {
    // Deliberately not a capability. Never put a real token in assertion output.
    const link = show(`/${locale}/track?t=synthetic-placeholder&card=request:untrusted`);
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('tabindex', '-1');
  });
  for (const [label, query] of [['scope', 'card=other:id'], ['empty', 'card=request:'], ['length', 'card=inquiry:' + 'x'.repeat(65)], ['duplicate', 'card=request:one&card=inquiry:two']]) {
    it(`${locale}: drops malformed or ambiguous context ${label}`, () => {
      expect(show(`/${locale}/track?${query}`)).toHaveAttribute('href', `/${other}/track`);
    });
  }
  it(`${locale}: retains existing pathname-only behavior outside tracking`, () => {
    expect(show(`/${locale}/contact?card=request:id&type=quote`)).toHaveAttribute('href', `/${other}/contact`);
  });
}
