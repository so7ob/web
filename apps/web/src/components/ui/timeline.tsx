import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Logical-direction adaptation of AdminLTE's timeline. Records stay feature-owned. */
export function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return <ol data-slot="timeline" className={cn("ds-timeline", className)} {...props} />;
}
export function TimelineItem({ children, active = false, className, ...props }: ComponentProps<"li"> & { active?: boolean; children: ReactNode }) {
  return <li data-slot="timeline-item" className={cn("ds-timeline-item", className)} {...props}>
    <span className={cn("ds-timeline-marker", active && "bg-primary text-primary-foreground")} aria-hidden="true">•</span>
    <div className="ds-timeline-event">{children}</div>
  </li>;
}
