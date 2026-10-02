/** Browsers normalize backslashes as URL authority separators. Never redirect off-origin. */
export function safeInternalPath(value?: string): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || (value.includes('\\') || [...value].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127))) return null;
  const base='https://internal.invalid';
  try { return new URL(value,base).origin===base ? value : null; } catch { return null; }
}
