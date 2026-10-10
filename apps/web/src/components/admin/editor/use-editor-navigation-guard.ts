import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

export type EditorSaveStatus = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict';
type Destination = { href: string } | null;

/** Keep browser and in-app navigation protection separate from document/save orchestration. */
export function useEditorNavigationGuard({saveStatus, saveStatusRef, leaveWarning, navGuardRef, setNavGuard}: {
  saveStatus: EditorSaveStatus;
  saveStatusRef: RefObject<EditorSaveStatus>;
  leaveWarning: string;
  navGuardRef: RefObject<Destination>;
  setNavGuard: Dispatch<SetStateAction<Destination>>;
}) {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (['dirty', 'saving', 'error', 'conflict'].includes(saveStatus)) {
        event.preventDefault();
        event.returnValue = leaveWarning;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus, leaveWarning]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!['dirty', 'saving', 'conflict'].includes(saveStatusRef.current)) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || anchor.target === '_blank' || href.startsWith('http')) return;
      event.preventDefault();
      event.stopPropagation();
      navGuardRef.current = {href};
      setNavGuard({href});
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [saveStatusRef, navGuardRef, setNavGuard]);
}
