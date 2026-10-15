import { Toolbar } from "@/components/ui/workspace";
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { WorkflowDefinition, WorkflowStage } from "@so7ob/contracts";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { getPortalContent } from "@/content/portal";
import { words } from "./shared";
function Node({
  stage,
  locale,
  selected,
  onSelect,
}: {
  stage: WorkflowStage;
  locale: Locale;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: stage.id,
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        position: "absolute",
        left: stage.x,
        top: stage.y,
        width: 210,
        minHeight: 76,
        transform: transform
          ? `translate(${transform.x}px,${transform.y}px)`
          : undefined,
      }}
      className={`rounded-2xl border-2 bg-card p-3 text-start text-sm shadow-sm focus-visible:outline-4 focus-visible:outline-brand ${selected ? "border-brand" : "border-border"}`}
    >
      <strong className="block break-words">
        {locale === "ar" ? stage.nameAr : stage.nameEn}
      </strong>
      <span className="block text-xs text-muted-foreground">
        {getPortalContent(locale).admin.requests.statuses[stage.status]}
      </span>
    </button>
  );
}
export function WorkflowGraph({
  definition,
  onChange,
  locale,
  selected,
  onSelect,
}: {
  definition: WorkflowDefinition;
  onChange: (d: WorkflowDefinition) => void;
  locale: Locale;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const t = words(locale),
    [zoom, setZoom] = useState(1),
    [connecting, setConnecting] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const width = Math.max(850, ...definition.stages.map((s) => s.x + 250)),
    height = Math.max(420, ...definition.stages.map((s) => s.y + 140));
  const end = (e: DragEndEvent) =>
    onChange({
      ...definition,
      stages: definition.stages.map((s) =>
        s.id === e.active.id
          ? {
              ...s,
              x: Math.max(0, Math.min(10000, s.x + e.delta.x / zoom)),
              y: Math.max(0, Math.min(10000, s.y + e.delta.y / zoom)),
            }
          : s,
      ),
    });
  const selectNode = (id: string) => {
    if (connecting) {
      const transition = {
        id: crypto.randomUUID().replaceAll("-", ""),
        from: connecting,
        to: id,
        nameAr: "انتقال",
        nameEn: "Move",
        trigger: "manual" as const,
        action: "transition" as const,
        reasonRequired: false,
        actors: ["staff" as const],
        match: "all" as const,
        conditions: [],
      };
      onChange({
        ...definition,
        transitions: [...definition.transitions, transition],
      });
      setConnecting(null);
    }
    onSelect(id);
  };
  return (
    <section
      className="min-w-0 space-y-3"
      aria-label={t("مخطط المسار", "Workflow diagram")}
    >
      <Toolbar className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
          aria-label={t("تصغير المخطط", "Zoom out")}
        >
          −
        </Button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button
          variant="outline"
          onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
          aria-label={t("تكبير المخطط", "Zoom in")}
        >
          +
        </Button>
        <Button
          variant={connecting ? "default" : "outline"}
          disabled={!selected}
          aria-pressed={!!connecting}
          onClick={() => setConnecting(connecting ? null : selected)}
        >
          {connecting
            ? t("إلغاء الربط", "Cancel connection")
            : t("ربط المرحلة المختارة", "Connect selected stage")}
        </Button>
        {connecting ? (
          <p role="status" className="text-sm">
            {t(
              "اختر مرحلة الوجهة من المخطط.",
              "Choose the destination stage in the diagram.",
            )}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t(
            "يمكن تعديل جميع المراحل والروابط من النماذج أسفل المخطط.",
            "All stages and connections are also editable in the forms below.",
          )}
        </p>
      </Toolbar>
      <div
        className="overflow-auto rounded-xl border bg-muted/30"
        style={{ maxHeight: 500 }}
        tabIndex={0}
        role="region"
        aria-label={t("مساحة المخطط القابلة للتمرير", "Scrollable diagram")}
        dir="ltr"
      >
        <div style={{ width: width * zoom, height: height * zoom }}>
          <DndContext
            sensors={sensors}
            onDragEnd={end}
            accessibility={{
              screenReaderInstructions: {
                draggable: t(
                  "اضغط المسافة لبدء تحريك المرحلة، ثم الأسهم، ثم المسافة للتثبيت أو Escape للإلغاء.",
                  "Press Space to move a stage, arrow keys to position, then Space to drop or Escape to cancel.",
                ),
              },
            }}
          >
            <div
              style={{
                position: "relative",
                width,
                height,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <svg
                width={width}
                height={height}
                className="absolute inset-0"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="workflow-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8" fill="currentColor" />
                  </marker>
                </defs>
                {definition.transitions.map((tr, i) => {
                  const a = definition.stages.find((s) => s.id === tr.from),
                    b = definition.stages.find((s) => s.id === tr.to);
                  return a && b ? (
                    <path
                      key={tr.id}
                      d={`M${a.x + 105},${a.y + 76} C${a.x + 105},${a.y + 130 + (i % 3) * 12} ${b.x + 105},${b.y - 50} ${b.x + 105},${b.y}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      markerEnd="url(#workflow-arrow)"
                      className={
                        tr.from === selected
                          ? "text-brand-strong"
                          : "text-border"
                      }
                    />
                  ) : null;
                })}
              </svg>
              {definition.stages.map((stage) => (
                <Node
                  key={stage.id}
                  stage={stage}
                  locale={locale}
                  selected={stage.id === selected}
                  onSelect={() => selectNode(stage.id)}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </section>
  );
}
