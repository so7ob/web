import { useRef, type KeyboardEventHandler } from "react";

/** Controlled overlays also restore focus when opened without a Radix Trigger. */
export function useOverlayFocus({ onOpenAutoFocus, onCloseAutoFocus, onKeyDown }: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
      onKeyDown?.(event);
      const scope = event.currentTarget, owner = scope.ownerDocument;
      // Radix FocusScope's global-document edge check cannot see focus inside
      // an iframe portal. Handle only those Tab edges here; ordinary dialogs
      // retain Radix's handler and caller-prevented events remain untouched.
      if (event.defaultPrevented || owner === document || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const choices = Array.from(scope.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'))
        .filter(node => node.tabIndex >= 0 && !node.matches(':disabled,[hidden],input[type="hidden"]') && !node.closest('[inert]') && node.getClientRects().length > 0 && owner.defaultView?.getComputedStyle(node).visibility !== 'hidden');
      const first = choices[0], last = choices.at(-1), active = owner.activeElement;
      if (!first || (event.shiftKey ? active === first || active === scope : active === last || active === scope)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      }
    },
    onOpenAutoFocus(event: Event) {
      const owner = (event.target as HTMLElement | null)?.ownerDocument ?? document;
      const active = owner.activeElement;
      opener.current = active && active !== owner.body && "focus" in active ? active as HTMLElement : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (!event.defaultPrevented && opener.current?.isConnected) {
        opener.current.focus({ preventScroll: true });
        if (opener.current.ownerDocument.activeElement === opener.current) event.preventDefault();
      }
    },
  };
}
