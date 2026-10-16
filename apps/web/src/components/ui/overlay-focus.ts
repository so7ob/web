import { useRef } from "react";

/** Controlled overlays also restore focus when opened without a Radix Trigger. */
export function useOverlayFocus({ onOpenAutoFocus, onCloseAutoFocus }: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return {
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
