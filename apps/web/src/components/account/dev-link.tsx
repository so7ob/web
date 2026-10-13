/** رابط وضع التطوير (رابط تحقق/استعادة من صندوق الصادر) — لا يظهر في الإنتاج أبدًا */
export function DevLink({ url, hint }: { url: string; hint: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950 p-4" role="status">
      <p className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
        <span className="rounded-full bg-amber-200 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          dev
        </span>
        {hint}
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        className="mt-2 block truncate font-mono text-xs text-brand underline decoration-brand/40 underline-offset-4 hover:text-brand-strong"
      >
        {url}
      </a>
    </div>
  );
}
