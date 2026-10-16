import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared page composition; feature components retain data and action ownership. */
export function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-title"
      className={cn("ds-page-title", className)}
      {...props}
    />
  );
}
export function PageHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn("ds-page-header", className)}
      {...props}
    />
  );
}
/** Fixed heading slots prevent actions, descriptions and titles drifting apart. */
export function PageHeading({
  title,
  description,
  actions,
  back,
  metadata,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  metadata?: ReactNode;
}) {
  return (
    <PageHeader>
      <div className="ds-page-heading">
        {back && <div className="ds-page-back">{back}</div>}
        <div className="min-w-0">
          <PageTitle>{title}</PageTitle>
          {description && (
            <div className="ds-page-description">{description}</div>
          )}
          {metadata && <div className="ds-page-metadata">{metadata}</div>}
        </div>
      </div>
      {actions && <div className="ds-page-actions">{actions}</div>}
    </PageHeader>
  );
}
/** One surface owns list filters, results and pagination. */
export function ListWorkspace({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="list-workspace"
      className={cn("ds-list-workspace", className)}
      {...props}
    />
  );
}
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="panel" className={cn("ds-panel", className)} {...props} />
  );
}
/** AdminLTE info-box composition. The caller keeps the real value and link. */
export function InfoBoxContent({ icon, label, value, hint, tone }: {
  icon: ReactNode; label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: string;
}) {
  return <><span className={cn("ds-info-icon", tone)} aria-hidden="true">{icon}</span>
    <span className="ds-info-content"><span className="ds-info-label">{label}</span>
      <strong className="ds-info-value">{value}</strong>
      {hint && <span className="ds-info-hint">{hint}</span>}
    </span></>;
}
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn("ds-toolbar", className)}
      {...props}
    />
  );
}
export function SectionNav({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      data-slot="section-nav"
      className={cn("ds-section-nav", className)}
      {...props}
    />
  );
}
export function TableScroll({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="table-scroll"
      tabIndex={0}
      className={cn("ds-table-scroll", className)}
      {...props}
    />
  );
}
export function FormSection({
  title,
  description,
  children,
  className,
  ...props
}: Omit<ComponentProps<"fieldset">, "title"> & {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn("ds-panel space-y-4", className)} {...props}>
      <legend className="px-2 text-base font-semibold">{title}</legend>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </fieldset>
  );
}

/** AdminLTE card header/body/footer composition; actions remain feature-owned. */
export function PanelHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel-header" className={cn("ds-panel-header", className)} {...props} />;
}
export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel-body" className={cn("ds-panel-body", className)} {...props} />;
}
export function PanelFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel-footer" className={cn("ds-panel-footer", className)} {...props} />;
}
