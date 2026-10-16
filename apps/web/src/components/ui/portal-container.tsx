import { createContext, useContext, type ReactNode } from "react";

/** One document owns a surface and all its floating controls (including previews). */
const PortalContainer = createContext<HTMLElement | undefined>(undefined);
export const usePortalContainer = () => useContext(PortalContainer);
export function PortalContainerProvider({ container, children }: { container: HTMLElement; children: ReactNode }) {
  return <PortalContainer.Provider value={container}>{children}</PortalContainer.Provider>;
}
