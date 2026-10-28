// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppearanceSample } from './appearance-preview';
import userEvent from '@testing-library/user-event';
afterEach(cleanup);
describe('appearance sample uses shared, local administration primitives', () => {
  for (const locale of ['ar', 'en'] as const) it(`preserves accessible semantics and local actions in ${locale}`, async () => {
    const user = userEvent.setup();
    const { container } = render(<AppearanceSample locale={locale} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).not.toHaveAttribute('readonly');
    expect(inputs[1]).toHaveAccessibleName(locale === 'ar' ? 'حقل غير صالح' : 'Invalid field');
    expect(inputs[1]).toHaveAccessibleDescription(locale === 'ar' ? 'هذا الحقل مطلوب' : 'This field is required');
    expect(screen.getByRole('table')).toHaveAttribute('data-slot', 'table');
    expect(container.querySelector('[data-slot="panel-header"]')).toBeTruthy();
    expect(screen.getByRole('button', {name: locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…'})).toBeDisabled();
    expect(container.querySelector('form')).toBeNull();
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAttribute('type', 'button');
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'Synthetic preview');
    await user.click(screen.getByRole('button', { name: locale === 'ar' ? 'حفظ' : 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent(locale === 'ar' ? 'داخل المعاينة' : 'inside the preview');
    await user.click(screen.getByRole('button', { name: locale === 'ar' ? 'إلغاء' : 'Cancel' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(inputs[0]).toHaveValue(locale === 'ar' ? 'تطوير الموقع' : 'Website development');
  });
});
