import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared page composition; feature components retain data and action ownership. */
export function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return <h1 data-slot="page-title" className={cn("ds-page-title", className)} {...props} />;
}
export function PageHeader({ className, ...props }: ComponentProps<"header">) {
  return <header data-slot="page-header" className={cn("ds-page-header", className)} {...props} />;
}
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel" className={cn("ds-panel", className)} {...props} />;
}
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="toolbar" className={cn("ds-toolbar", className)} {...props} />;
}
export function SectionNav({ className, ...props }: ComponentProps<"nav">) {
  return <nav data-slot="section-nav" className={cn("ds-section-nav", className)} {...props} />;
}
export function TableScroll({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="table-scroll" tabIndex={0} className={cn("ds-table-scroll", className)} {...props} />;
}
export function FormSection({ title, description, children, className, ...props }: Omit<ComponentProps<"fieldset">, "title"> & { title: string; description?: string; children: ReactNode }) {
  return <fieldset className={cn("ds-panel space-y-4", className)} {...props}><legend className="px-2 text-base font-semibold">{title}</legend>{description && <p className="text-sm text-muted-foreground">{description}</p>}{children}</fieldset>;
}
