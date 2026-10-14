import { useRef } from "react";

/** Controlled overlays also restore focus when opened without a Radix Trigger. */
export function useOverlayFocus({ onOpenAutoFocus, onCloseAutoFocus }: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (!event.defaultPrevented && opener.current?.isConnected) {
        opener.current.focus({ preventScroll: true });
        if (document.activeElement === opener.current) event.preventDefault();
      }
    },
  };
}
