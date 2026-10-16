"use client"

import { usePortalContainer } from "./portal-container"
import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipFrame = React.createContext<string | null>(null)

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  open: suppliedOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const owner = usePortalContainer()?.ownerDocument
  const framed = !!owner && typeof document !== "undefined" && owner !== document
  const id = React.useId()
  const [localOpen, setLocalOpen] = React.useState(defaultOpen ?? false)
  const open = suppliedOpen ?? localOpen
  const change = React.useCallback((value: boolean) => {
    if (suppliedOpen === undefined) setLocalOpen(value)
    onOpenChange?.(value)
  }, [suppliedOpen, onOpenChange])
  React.useEffect(() => {
    if (!framed || !owner || !open) return
    // Radix's hover-grace listener uses the module's document. Preview portals
    // live in another document: retain hoverable content and close using that
    // document's pointer events, without changing ordinary tooltips or refs.
    let inTransit = false
    const nodes = () => [owner.querySelector<HTMLElement>(`[data-tooltip-trigger="${id}"]`), owner.querySelector<HTMLElement>(`[data-tooltip-content="${id}"]`)] as const
    const inside = (target: EventTarget | null) => !!target && "nodeType" in target && nodes().some(node => node?.contains(target as Node))
    const out = (event: PointerEvent) => { if (inside(event.target) && !inside(event.relatedTarget)) inTransit = true }
    const move = (event: PointerEvent) => {
      if (inside(event.target)) { inTransit = false; return }
      if (!inTransit) return
      const [trigger, content] = nodes()
      if (!trigger || !content) { change(false); return }
      const a = trigger.getBoundingClientRect(), b = content.getBoundingClientRect()
      // A small bridge permits moving from the trigger onto its tooltip.
      if (event.clientX < Math.min(a.left, b.left) - 5 || event.clientX > Math.max(a.right, b.right) + 5 || event.clientY < Math.min(a.top, b.top) - 5 || event.clientY > Math.max(a.bottom, b.bottom) + 5) change(false)
    }
    const leave = () => { if (inTransit) change(false) }
    owner.addEventListener("pointerout", out)
    owner.addEventListener("pointermove", move)
    owner.documentElement.addEventListener("pointerleave", leave)
    return () => {
      owner.removeEventListener("pointerout", out)
      owner.removeEventListener("pointermove", move)
      owner.documentElement.removeEventListener("pointerleave", leave)
    }
  }, [framed, owner, open, id, change])
  return (
    <TooltipProvider>
      <TooltipFrame.Provider value={framed ? id : null}>
        <TooltipPrimitive.Root data-slot="tooltip" defaultOpen={defaultOpen} open={framed ? open : suppliedOpen} onOpenChange={framed ? change : onOpenChange} {...props} />
      </TooltipFrame.Provider>
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" data-tooltip-trigger={React.useContext(TooltipFrame) ?? undefined} {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal container={usePortalContainer()}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-tooltip-content={React.useContext(TooltipFrame) ?? undefined}
        sideOffset={sideOffset}
        className={cn(
          "bg-tooltip text-tooltip-foreground animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-50 w-fit max-w-[200px] origin-(--radix-tooltip-content-transform-origin) rounded-lg px-2 py-1 text-sm text-center",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow width={12.8} height={6.4} className="fill-tooltip" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
