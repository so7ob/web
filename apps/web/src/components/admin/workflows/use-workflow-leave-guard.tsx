import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ErrorFeedback } from '@/components/errors/error-feedback';
import type { Locale } from '@/lib/i18n';

type Intent = { action: () => void; route: boolean; confirmedAtStart: number };
export function useWorkflowLeaveGuard({ dirty, saving, busy, canSave, error, save, discard, locale, shouldBlock, confirmation }: {
  dirty: boolean; saving: boolean; busy: boolean; canSave: boolean; error: unknown;
  save: () => Promise<boolean | undefined>; discard: () => void; locale: Locale; shouldBlock: () => boolean; confirmation: () => number;
}) {
  const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
  const enabled = dirty || saving;
  const current = useRef({ shouldBlock, discard, confirmation }); current.current = { shouldBlock, discard, confirmation };
  const intent = useRef<Intent | null>(null);
  const [pending, setPending] = useState(false), [newer, setNewer] = useState(false);
  const bypass = useRef(false);
  const navigate = useNavigate(), location = useLocation();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !bypass.current && (current.current.shouldBlock() || intent.current !== null) && currentLocation.pathname !== nextLocation.pathname);
  const request = useCallback((action: () => void, route = false) => {
    if (intent.current) return;
    if (!current.current.shouldBlock()) { action(); return; }
    intent.current = { action, route, confirmedAtStart: current.current.confirmation() }; setPending(true); setNewer(false);
  }, []);
  const cancel = () => {
    intent.current = null; setPending(false); setNewer(false);
    if (blocker.state === 'blocked') blocker.reset();
  };
  const finish = (drop: boolean) => {
    const next = intent.current; if (!next) return;
    intent.current = null; setPending(false); setNewer(false);
    if (drop) current.current.discard();
    if (!next.route && blocker.state === 'blocked') blocker.reset();
    bypass.current = true;
    next.action();
    queueMicrotask(() => { bypass.current = false; });
  };
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (intent.current?.route) intent.current.action = () => blocker.proceed();
      else request(() => blocker.proceed(), true);
    }
  }, [blocker, request]);
  useEffect(() => {
    if (pending && !enabled && !busy && !error && intent.current && current.current.confirmation() > intent.current.confirmedAtStart) finish(false);
  });
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.shouldBlock() || intent.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = (event: MouseEvent) => {
      if ((!current.current.shouldBlock() && !intent.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/(ar|en)(\/|$)/.test(url.pathname) || url.pathname === location.pathname) return;
      event.preventDefault(); event.stopPropagation();
      request(() => { void navigate(url.pathname + url.search + url.hash); });
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [enabled, location.pathname, navigate, request]);
  const dialog = <AlertDialog open={pending} onOpenChange={open => { if (!open) cancel(); }}>
    <AlertDialogContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <AlertDialogHeader>
        <AlertDialogTitle>{dirty ? t('تعديلات مسار غير محفوظة', 'Unsaved workflow changes') : t('حفظ المسار غير مؤكد', 'Workflow save is not confirmed')}</AlertDialogTitle>
        <AlertDialogDescription>{t('احفظ المسودة ثم تابع، أو تجاهل التعديلات صراحة، أو ابق في المحرر. حفظ المسودة لا ينشر المسار.', 'Save the draft and continue, explicitly discard changes, or stay in the editor. Saving a draft does not publish it.')}</AlertDialogDescription>
      </AlertDialogHeader>
      {error ? <ErrorFeedback error={error} locale={locale} /> : null}
      {newer ? <p role="status">{t('بقيت تعديلات أحدث غير محفوظة. راجعها قبل المتابعة.', 'Newer changes remain unsaved. Review them before continuing.')}</p> : null}
      <AlertDialogFooter className="flex-wrap gap-2">
        <AlertDialogCancel className="min-h-11">{t('البقاء', 'Stay')}</AlertDialogCancel>
        <Button size="lg" variant="destructive" disabled={busy} onClick={() => finish(true)}>{t('تجاهل التعديلات والمتابعة', 'Discard changes and continue')}</Button>
        <Button size="lg" disabled={busy || !canSave} onClick={async () => {
          const target = intent.current;
          const result = await save();
          if (intent.current !== target) return;
          if (result === true) finish(false);
          else if (result === false) setNewer(true);
        }}>{busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المسودة والمتابعة', 'Save draft and continue')}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
  return { request, dialog, pending };
}
