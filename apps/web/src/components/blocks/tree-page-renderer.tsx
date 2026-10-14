"use client";

/**
 * عارض شجرة المحتوى — يرسم مغلف v1 (أبناء الجذر) مع دعم الحاويات المتداخلة:
 * section (قسم بعرض الموقع) → container (صندوق عام) → row (شبكة أعمدة) →
 * column (كومة رأسية) → كتل ورقية.
 *
 * الأنماط المدركة للأجهزة تأتي من nodeStyleClasses (قاعدة + تجاوزات
 * mobile/tablet/desktop بأصناف md:/lg:) فتتطابق المعاينة مع العرض الفعلي.
 *
 * أوضاع العرض (RenderModeContext):
 * - live: الموقع العام، تفاعل حقيقي.
 * - edit: لوحة الرسم — الغلاف الشفاف يمنع التفاعل.
 * - test: اختبار تفاعل صريح — النماذج تُحاكى بلا طلبات حقيقية.
 *
 * الكتلة الورقية داخل حاوية تُرسم عاريًا عبر NestedBlockContext — الحاوية
 * تملك التباعد والخلفية فلا تتضاعف الحشوة.
 */
import { useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type { ContentNode, ContainerType, NodeStyle, DeviceKey } from "@so7ob/contracts";
import { isContainerType } from "@so7ob/contracts";
import { nodeStyleClasses, nodeAlignClasses } from "@so7ob/contracts";
import { NestedBlockContext, PreviewDeviceContext, RenderModeContext, type RenderMode } from "./nested-context";
import { InlineEditNodeContext, InlineEditSessionContext } from "./inline-edit-context";

import { LeafContent as ExistingLeafContent } from "./page-renderer";
import type { Block } from "@so7ob/contracts";
interface PageRendererProps {
  nodes: ContentNode[];
  locale: Locale;
  mode?: RenderMode;
  nested?: boolean;
}

export function TreePageRenderer({ nodes, locale, mode = "live", nested = false }: PageRendererProps) {
  return (
    <RenderModeContext.Provider value={mode}>
      {nodes.map((node) => (
        <NodeView key={node.id} node={node} locale={locale} nested={nested} />
      ))}
    </RenderModeContext.Provider>
  );
}

// ─── أدوات مشتركة ───

function visibilityClasses(visibility: ContentNode["visibility"], device?: DeviceKey): string {
  if (device) return visibility?.[device] === false ? "hidden" : "";
  return [
    visibility?.mobile === false ? "max-md:hidden" : "",
    visibility?.tablet === false ? "md:max-lg:hidden" : "",
    visibility?.desktop === false ? "lg:hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── عرض العقدة (حاوية أو ورقية) ───

function NodeView({ node, locale, nested }: { node: ContentNode; locale: Locale; nested: boolean }) {
  const device = useContext(PreviewDeviceContext);
  const visClass = visibilityClasses(node.visibility, device);
  const id = node.anchorId || undefined;

  if (isContainerType(node.type)) {
    return (
      <ContainerView node={node} id={id} visClass={visClass} locale={locale} />
    );
  }

  const content = <BlockContent node={node} locale={locale} />;

  // Persisted v1 slots and legacy root styles share the central token maps.
  const legacy = node.style as NodeStyle & { background?: string; paddingY?: string } | undefined;
  const style = legacy && (legacy.background || legacy.paddingY)
    ? { base: { background: legacy.background, paddingY: legacy.paddingY } } as NodeStyle
    : node.style;
  const classes = nodeStyleClasses(style, device);
  if (!classes && !visClass && !id) {
    return <NestedBlockContext.Provider value={nested}>{content}</NestedBlockContext.Provider>;
  }
  return (
    <section id={id} className={[classes, visClass].filter(Boolean).join(" ") || undefined}>
      <NestedBlockContext.Provider value={nested || Boolean(classes)}>
        {nested ? content : <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{content}</div>}
      </NestedBlockContext.Provider>
    </section>
  );
}

// ─── عرض الحاويات ───

const ROW_GRID_DESKTOP: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

const ROW_GRID_TABLET: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

const COLUMN_SPAN: Record<string, string> = {
  "1": "lg:col-span-1",
  "2": "lg:col-span-2",
  "3": "lg:col-span-3",
  "4": "lg:col-span-4",
};

const GAP_CLASS: Record<string, string> = {
  xs: "gap-2",
  sm: "gap-4",
  md: "gap-6",
  lg: "gap-10",
};

function asStringProp(props: unknown, key: string, fallback: string): string {
  if (typeof props !== "object" || props === null) return fallback;
  const v = (props as Record<string, unknown>)[key];
  return typeof v === "string" ? v : fallback;
}

function ContainerView({ node, id, visClass, locale }: { node: ContentNode; id?: string; visClass: string; locale: Locale }) {
  const type = node.type as ContainerType;
  const device = useContext(PreviewDeviceContext);
  const styleClasses = nodeStyleClasses(node.style, device);
  const children = (node.children ?? []).map((child) => (
    <NodeView key={child.id} node={child} locale={locale} nested={true} />
  ));

  if (type === "section") {
    return (
      <section id={id} className={`${styleClasses} ${visClass}`.trim() || undefined}>
        {/* عرض موقع داخلي مطابق لأغلفة الكتل — الحاوية تملك الخلفية والتباعد */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
      </section>
    );
  }

  if (type === "row") {
    const count = (node.children ?? []).length;
    const declared = typeof (node.props as Record<string, unknown> | undefined)?.columns === "number"
      ? ((node.props as Record<string, unknown>).columns as number)
      : null;
    const desktopCount = Math.min(6, Math.max(1, declared ?? count));
    const tabletCount = Math.min(4, Math.max(1, Math.ceil(desktopCount / 2)));
    const gap = GAP_CLASS[asStringProp(node.props, "gap", "md")] ?? "gap-6";
    return (
      <div
        id={id}
        className={`grid ${device ? (device === "desktop" ? ROW_GRID_DESKTOP[desktopCount].replace("lg:", "") : device === "tablet" ? ROW_GRID_TABLET[tabletCount].replace("md:", "") : "grid-cols-1") : `grid-cols-1 ${ROW_GRID_TABLET[tabletCount]} ${ROW_GRID_DESKTOP[desktopCount]}`} ${gap} ${styleClasses} ${visClass}`.trim()}
      >
        {children}
      </div>
    );
  }

  if (type === "column") {
    const gap = GAP_CLASS[asStringProp(node.props, "gap", "md")] ?? "gap-6";
    const responsiveSpan = COLUMN_SPAN[asStringProp(node.props, "span", "auto")] ?? "";
    const span = device ? device === "desktop" ? responsiveSpan.replace("lg:", "") : "" : responsiveSpan;
    const align = nodeAlignClasses(node.style, device);
    return (
      <div
        id={id}
        className={`flex flex-col ${gap} ${align} ${span} ${styleClasses} ${visClass}`.trim()}
      >
        {children}
      </div>
    );
  }

  // container — صندوق عام بلا عرض أقصى ذاتي
  return (
    <div id={id} className={`${styleClasses} ${visClass}`.trim() || undefined}>
      {children}
    </div>
  );
}

// ─── عرض الكتل الورقية ───

function BlockContent({ node, locale }: { node: ContentNode; locale: Locale }) {
  const props = (node.props ?? {}) as Record<string, unknown>;
  // نطاق التحرير المباشر — قيمة غير null فقط حين تكون هذه العقدة في جلسة تحرير
  const session = useContext(InlineEditSessionContext);
  const nodeEdit = useMemo(
    () =>
      session && session.nodeId === node.id
        ? { onChange: session.onChange, onEnd: session.onEnd }
        : null,
    [session, node.id]
  );
  const body = renderLeaf(node.type, props, locale);
  return <InlineEditNodeContext.Provider value={nodeEdit}>{body}</InlineEditNodeContext.Provider>;
}

function renderLeaf(type: string, props: Record<string, unknown>, locale: Locale): ReactNode {
 return <ExistingLeafContent block={{ id: "editor-leaf", type: type as Block["type"], props }} locale={locale} />;
}
