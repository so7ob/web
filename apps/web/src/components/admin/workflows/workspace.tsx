import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeading, Toolbar } from "@/components/ui/workspace";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  can,
  legacyWorkflow,
  REQUEST_STATUSES,
  conditionFields,
  workflowTriggers,
  workflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowStage,
  type WorkflowTransition,
  type BusinessCalendar,
  type WorkflowScope,
} from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorFeedback } from "@/components/errors/error-feedback";
import { ApiError, asApiError } from "@/lib/errors/transport";
import { getPortalContent } from "@/content/portal";
import type { Locale } from "@/lib/i18n";
import type { Me } from "../types";
import { apiGet } from "../helpers";
import { WorkflowGraph } from "./graph";
import { useWorkflowLeaveGuard } from "./use-workflow-leave-guard";
import { Field, wfControl, wfCard, words, workflowPost } from "./shared";
interface Team {
  id: string;
  nameAr: string;
  nameEn: string;
  members: string[];
  active: boolean;
  revision: number;
}
interface Flow {
  id: string;
  scope: WorkflowScope;
  draft: WorkflowDefinition;
  revision: number;
}
interface Version {
  id: string;
  workflowId: string;
  definition: WorkflowDefinition;
  legacy: boolean;
}
interface Overview {
  ok: boolean;
  workflows: Flow[];
  versions: Version[];
  teams: Team[];
  calendars: Array<{ id: string; definition: BusinessCalendar }>;
  staff: Array<{ id: string; name: string }>;
  bindings: Array<{ scope: string; selector: string; versionId: string }>;
}
const emptyCalendar = (): BusinessCalendar => ({
  timezone: "Asia/Aden",
  week: Array.from({ length: 7 }, () => []),
  exceptions: [],
});
const uid = () => crypto.randomUUID().replaceAll("-", "");
export function WorkflowWorkspace({ locale, me }: { locale: Locale; me: Me }) {
  const t = words(locale),
    portal = getPortalContent(locale);
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("flows");
  const mutex = useRef(false);
  const readSequence = useRef(0), writeSequence = useRef(0);
  const confirmedWrites = useRef(new Map<string, { flow: Flow; sequence: number }>());
  const [active, setActive] = useState<Flow | null>(null),
    [definition, commitDefinition] = useState<WorkflowDefinition>(() =>
      legacyWorkflow("requests"),
    ),
    [stageId, setStageId] = useState("new"),
    [transitionId, setTransitionId] = useState(""),
    [selector, setSelector] = useState("*"),
    [validation, setValidation] = useState<string[]>([]),
    [simulation, setSimulation] = useState<WorkflowTransition[]>([]),
    [trigger, setTrigger] =
      useState<(typeof workflowTriggers)[number]>("staff_reply"),
    [fields, setFields] = useState<Record<string, string>>({});
  const definitionRef = useRef(definition);
  const setDefinition = useCallback((value: WorkflowDefinition | ((previous: WorkflowDefinition) => WorkflowDefinition)) => {
    const next = typeof value === 'function' ? value(definitionRef.current) : value;
    definitionRef.current = next; commitDefinition(next);
  }, []);
  const [baseline, commitBaseline] = useState<WorkflowDefinition>(() => legacyWorkflow('requests'));
  const baselineRef = useRef(baseline);
  const setBaseline = (value: WorkflowDefinition) => { baselineRef.current = value; commitBaseline(value); };
  const savingDraftRef = useRef(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const dirty = definitionKey(definition) !== definitionKey(baseline);
  const [team, setTeam] = useState<Partial<Team>>({
                    nameAr: "",
                    nameEn: "",
                    members: [],
                    active: true,
                  }),
    [calendar, setCalendar] = useState<BusinessCalendar>(emptyCalendar);
  const [transferQuery, setTransferQuery] = useState(""),
    [transferPage, setTransferPage] = useState(1),
    [transferTotal, setTransferTotal] = useState(0);
  const [transferScope, setTransferScope] = useState<WorkflowScope>("requests"),
    [records, setRecords] = useState<
      Array<{ id: string; refCode: string; stageId: string }>
    >([]),
    [ids, setIds] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<{
      previewId: string;
      rows: Array<{
        recordId: string;
        from: string;
        to: string;
        visibility: string;
        targetStatus: string;
        responseDueAt: string | null;
        stageDueAt: string | null;
        route: { teamId: string | null; assigneeId: string | null };
      }>;
    } | null>(null);
  const loadTransfer = async (page = 1) => {
    const r = await apiGet<{ records: typeof records; total: number }>(
      `/api/admin/workflows/transfer/records?scope=${transferScope}&q=${encodeURIComponent(transferQuery)}&page=${page}`,
    );
    setRecords(r.records);
    setTransferTotal(r.total);
    setTransferPage(page);
    setIds([]);
    setPreview(null);
  };
  const load = useCallback(async () => {
    const read = ++readSequence.current, startedAt = writeSequence.current;
    const next = await apiGet<Overview>("/api/admin/workflows");
    // A response started before our save must not replace its confirmed draft.
    const flows = new Map(next.workflows.map(flow => [flow.id, flow]));
    for (const saved of confirmedWrites.current.values()) if (saved.sequence > startedAt) flows.set(saved.flow.id, saved.flow);
    const merged = { ...next, workflows: [...flows.values()] };
    if (read === readSequence.current) setData(merged);
    return merged;
  }, []);
  useEffect(() => {
    void load().catch(setError);
  }, [load]);
  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (mutex.current || asApiError(error).uncertain) return;
    mutex.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const value = await work();
      setNotice(t("تمت العملية", "Operation completed"));
      return value;
    } catch (e) {
      setError(e);
    } finally {
      mutex.current = false;
      setBusy(false);
    }
  };
  const choose = (flow: Flow) => {
    setActive(flow);
    setDefinition(structuredClone(flow.draft));
    setBaseline(structuredClone(flow.draft));
    setStageId(flow.draft.initialStage);
    setTransitionId("");
    setValidation([]);
    setSimulation([]);
  };
  const save = async () => {
    const submitted = structuredClone(definitionRef.current);
    savingDraftRef.current = true; setSavingDraft(true);
    try {
      const result = await workflowPost<{ id: string; revision: number }>("drafts", {
        ...(active ? { id: active.id, revision: active.revision } : {}),
        definition: submitted,
      });
      if (typeof result.id !== 'string' || !result.id || !Number.isInteger(result.revision) || result.revision < 0) throw new ApiError(200, 'invalid_response', null, undefined, true);
      const confirmed = workflowDefinitionSchema.parse(submitted);
      const saved: Flow = { id: result.id, revision: result.revision, scope: confirmed.scope, draft: confirmed };
      confirmedWrites.current.set(saved.id, { flow: saved, sequence: ++writeSequence.current });
      setActive(saved); setBaseline(confirmed);
      if (definitionKey(definitionRef.current) === definitionKey(submitted)) setDefinition(structuredClone(confirmed));
      setData(previous => previous ? { ...previous, workflows: previous.workflows.some(flow => flow.id === saved.id) ? previous.workflows.map(flow => flow.id === saved.id ? saved : flow) : [...previous.workflows, saved] } : previous);
      return { saved, unchanged: definitionKey(definitionRef.current) === definitionKey(confirmed) };
    } finally { savingDraftRef.current = false; setSavingDraft(false); }
  };
  const reset = (scope: WorkflowScope) => {
    const blank = legacyWorkflow(scope);
    setActive(null); setDefinition(blank); setBaseline(structuredClone(blank));
    setStageId(blank.initialStage); setTransitionId(''); setValidation([]); setSimulation([]);
  };
  const guard = useWorkflowLeaveGuard({
    dirty, saving: savingDraft, busy, error, locale,
    shouldBlock: () => savingDraftRef.current || definitionKey(definitionRef.current) !== definitionKey(baselineRef.current),
    canSave: can(me, 'workflows.manage') && !asApiError(error).uncertain,
    save: () => run(async () => (await save()).unchanged),
    discard: () => setDefinition(structuredClone(baseline)),
  });
  const stage = definition.stages.find((s) => s.id === stageId),
    transition = definition.transitions.find((s) => s.id === transitionId);
  const updateStage = (patch: Partial<WorkflowStage>) =>
    setDefinition((d) => ({
      ...d,
      stages: d.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
    }));
  const updateTransition = (patch: Partial<WorkflowTransition>) =>
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.map((s) =>
        s.id === transitionId ? { ...s, ...patch } : s,
      ),
    }));
  const label = (item: { nameAr: string; nameEn: string }) =>
    locale === "ar" ? item.nameAr : item.nameEn;
  const statusLabels =
    definition.scope === "requests"
      ? portal.admin.requests.statuses
      : portal.admin.inquiries.statuses;
  const statuses = REQUEST_STATUSES.filter(
    (s) =>
      definition.scope === "requests" ||
      !["in_progress", "cancelled"].includes(s),
  );
  const routingLabels = {
    keep: t("إبقاء المسؤول", "Keep assignee"),
    team_queue: t("طابور الفريق", "Team queue"),
    person: t("شخص محدد", "Specific person"),
    round_robin: t("توزيع بالتناوب", "Round robin"),
  };
  const triggerLabels = {
    manual: t("إجراء يدوي", "Manual action"),
    client_reply: t("رد العميل", "Client reply"),
    staff_reply: t("رد الموظف", "Staff reply"),
    response_due: t("تأخر الرد", "Response deadline"),
    stage_due: t("مهلة المرحلة", "Stage deadline"),
  };
  const fieldLabels = {
    serviceType: portal.admin.requests.filterService,
    requestType: portal.admin.requests.requestType,
    category: portal.admin.inquiries.category,
    priority: portal.admin.requests.priority,
    status: portal.admin.requests.filterStatus,
    assigneeId: portal.admin.requests.filterAssignee,
    teamId: t("الفريق", "Team"),
  };
  const selectStages = (value: string, onChange: (v: string) => void) => (
    <NativeSelect
      className={wfControl}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {definition.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {label(s)}
                      </option>
                    ))}
    </NativeSelect>
  );
  if (!data)
    return (
      <div className={wfCard}>
        <PageHeading title={t("مسارات العمل", "Workflows")} />
        {error ? (
          <ErrorFeedback error={error} locale={locale} onRefresh={load} />
        ) : (
          <p role="status">{t("جارٍ التحميل…", "Loading…")}</p>
        )}
      </div>
    );
  return (
    <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-5">
      <PageHeading
        title={t("مسارات العمل", "Workflows")}
        description={t(
            "اضبط مراحل المعاملة والإحالة والظهور والمهل. النشر يطبق على المعاملات الجديدة.",
            "Configure stages, routing, visibility and deadlines. Publishing applies to new conversations.",
          )}
      />
      <TabsList
        className="w-full justify-start"
        aria-label={t(
          "أقسام إدارة المسارات",
          "Workflow administration sections",
        )}
      >
        {[
          ["flows", t("المسارات", "Workflows")],
          ["teams", t("فرق العمل", "Teams")],
          ["calendar", t("ساعات العمل", "Business hours")],
          ["transfer", t("نقل المعاملات", "Transfer conversations")],
        ].map(([key, name]) => (
          <TabsTrigger value={key}
            key={key}
          >
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={tab} className="space-y-6">
        {error ? (
        <ErrorFeedback
          error={error}
          locale={locale}
          focusOnError={!guard.pending}
          onRefresh={async () => {
            await load();
            setError(null);
          }}
        />
      ) : null}
      {guard.dialog}
      <p role="status" className="text-sm font-medium">{dirty ? t('تعديلات مسار غير محفوظة', 'Unsaved workflow changes') : t('لا توجد تعديلات مسار غير محفوظة', 'No unsaved workflow changes')}</p>
        <p role="status" className="text-sm">
        {busy ? t("جارٍ الحفظ…", "Saving…") : notice}
      </p>
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          {tab === "flows" ? (
            <>
              <section className={wfCard}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title={t("المسار", "Workflow")}>
                  <NativeSelect
                    className={wfControl}
                    value={active?.id ?? ""}
                    onChange={(e) => {
                      const f = data.workflows.find(
                        (f) => f.id === e.target.value,
                      );
                      guard.request(() => { if (f) choose(f); else reset(definition.scope); });
                    }}
                  >
                    <option value="">{t("مسار جديد", "New workflow")}</option>
                    {data.workflows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {label(f.draft)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field title={t("نوع المعاملة", "Conversation type")}>
                  <NativeSelect
                    className={wfControl}
                    value={definition.scope}
                    disabled={!!active}
                    onChange={(e) => {
                      const scope = e.target.value as WorkflowScope;
                      guard.request(() => reset(scope));
                    }}
                  >
                    <option value="requests">
                      {portal.admin.requests.title}
                    </option>
                    <option value="inquiries">
                      {portal.admin.inquiries.title}
                    </option>
                  </NativeSelect>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!can(me, "workflows.manage")}
                  onClick={() => {
                    setActive(null);
                    setBaseline(legacyWorkflow(definition.scope));
                    setDefinition({
                      ...structuredClone(definition),
                      nameAr: definition.nameAr + " — نسخة",
                      nameEn: definition.nameEn + " — Copy",
                    });
                  }}
                >
                  {t("نسخ كمسار جديد", "Copy as new workflow")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    guard.request(() => reset(definition.scope));
                  }}
                >
                  {t("مسار جديد", "New workflow")}
                </Button>
              </div>
            </section>
              <section className={wfCard}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title={t("اسم المسار بالعربية", "Workflow Arabic name")}>
                  <Input
                    value={definition.nameAr}
                    onChange={(e) =>
                      setDefinition({ ...definition, nameAr: e.target.value })
                    }
                  />
                </Field>
                <Field
                  title={t("اسم المسار بالإنجليزية", "Workflow English name")}
                >
                  <Input
                    value={definition.nameEn}
                    onChange={(e) =>
                      setDefinition({ ...definition, nameEn: e.target.value })
                    }
                  />
                </Field>
                <Field title={t("مرحلة البداية", "Initial stage")}>
                  {selectStages(definition.initialStage, (value) =>
                    setDefinition({ ...definition, initialStage: value }),
                  )}
                </Field>
                <Field
                  title={t("إصدار تقويم الدوام", "Business calendar version")}
                >
                  <NativeSelect
                    className={wfControl}
                    value={definition.calendarVersionId ?? ""}
                    onChange={(e) =>
                      setDefinition({
                        ...definition,
                        calendarVersionId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">
                      {t(
                        "يجب إعداد تقويم قبل النشر",
                        "Configure a calendar before publishing",
                      )}
                    </option>
                    {data.calendars.map((c, i) => (
                      <option key={c.id} value={c.id}>
                        {c.definition.timezone} · {data.calendars.length - i}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <WorkflowGraph
                definition={definition}
                onChange={setDefinition}
                locale={locale}
                selected={stageId}
                onSelect={setStageId}
              />
            </section>
              <section className={wfCard}>
                <h2 className="text-lg font-semibold">
                {t("المراحل", "Stages")}
              </h2>
                <div className="flex flex-wrap gap-2">
                {definition.stages.map((s) => (
                  <Button
                    key={s.id}
                    variant={stageId === s.id ? "default" : "outline"}
                    onClick={() => setStageId(s.id)}
                  >
                    {label(s)}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  onClick={() => {
                    const id = uid();
                    setDefinition({
                      ...definition,
                      stages: [
                        ...definition.stages,
                        {
                          ...definition.stages[0],
                          id,
                          nameAr: "مرحلة جديدة",
                          nameEn: "New stage",
                          status: "in_review",
                          x: 60,
                          y: definition.stages.length * 130,
                        },
                      ],
                    });
                    setStageId(id);
                  }}
                >
                  {t("إضافة مرحلة", "Add stage")}
                </Button>
              </div>
                {stage ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                      title={t("اسم المرحلة بالعربية", "Stage Arabic name")}
                    >
                      <Input
                        value={stage.nameAr}
                        onChange={(e) =>
                          updateStage({ nameAr: e.target.value })
                        }
                      />
                    </Field>
                      <Field
                        title={t(
                          "اسم المرحلة بالإنجليزية",
                          "Stage English name",
                        )}
                      >
                        <Input
                        value={stage.nameEn}
                        onChange={(e) =>
                          updateStage({ nameEn: e.target.value })
                        }
                      />
                      </Field>
                      <Field title={t("الحالة التشغيلية", "Operational status")}>
                      <NativeSelect
                        className={wfControl}
                        value={stage.status}
                        onChange={(e) =>
                          updateStage({
                            status: e.target.value as WorkflowStage["status"],
                          })
                        }
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                      <Field
                      title={t("ظهور المعاملة", "Conversation visibility")}
                    >
                      <NativeSelect
                        className={wfControl}
                        value={stage.visibility}
                        onChange={(e) =>
                          updateStage({
                            visibility: e.target
                              .value as WorkflowStage["visibility"],
                          })
                        }
                      >
                        <option value="authorized">
                          {t(
                            "جميع الموظفين المصرح لهم",
                            "All authorized staff",
                          )}
                        </option>
                        <option value="assigned">
                          {t(
                            "الفريق والمسؤول والمشرفون",
                            "Team, assignee and supervisors",
                          )}
                        </option>
                      </NativeSelect>
                    </Field>
                      <Field
                      title={t(
                        "الإحالة عند دخول المرحلة",
                        "Routing on stage entry",
                      )}
                    >
                      <NativeSelect
                        className={wfControl}
                        value={stage.routing.mode}
                        onChange={(e) =>
                          updateStage({
                            routing: {
                              ...stage.routing,
                              mode: e.target
                                .value as WorkflowStage["routing"]["mode"],
                            },
                          })
                        }
                      >
                        {Object.entries(routingLabels).map(([key, name]) => (
                          <option key={key} value={key}>
                            {name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                      <Field title={t("الفريق", "Team")}>
                      <NativeSelect
                        className={wfControl}
                        value={stage.routing.teamId ?? ""}
                        onChange={(e) =>
                          updateStage({
                            routing: {
                              ...stage.routing,
                              teamId: e.target.value || null,
                            },
                          })
                        }
                      >
                        <option value="">{t("دون فريق", "No team")}</option>
                        {data.teams
                          .filter((t) => t.active)
                          .map((team) => (
                            <option key={team.id} value={team.id}>
                              {label(team)}
                            </option>
                          ))}
                      </NativeSelect>
                    </Field>
                      {stage.routing.mode === "person" ? (
                      <Field title={t("الموظف المسؤول", "Assignee")}>
                        <NativeSelect
                          className={wfControl}
                          value={stage.routing.userId ?? ""}
                          onChange={(e) =>
                            updateStage({
                              routing: {
                                ...stage.routing,
                                userId: e.target.value || null,
                              },
                            })
                          }
                        >
                          <option value="">
                            {t("اختر موظفًا", "Choose staff")}
                          </option>
                          {data.staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    ) : null}
                      <Field
                      title={t(
                        "مهلة الرد بالساعات — فارغ لسياسة الموقع",
                        "Response hours — empty inherits site policy",
                      )}
                    >
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={stage.responseHours ?? ""}
                        onChange={(e) =>
                          updateStage({
                            responseHours: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </Field>
                      <Field
                      title={t(
                        "مهلة المرحلة بالساعات — فارغ لتعطيلها",
                        "Stage hours — empty disables timer",
                      )}
                    >
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={stage.stageHours ?? ""}
                        onChange={(e) =>
                          updateStage({
                            stageHours: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </Field>
                      {(["x", "y"] as const).map((axis) => (
                      <Field
                        key={axis}
                        title={t(
                          axis === "x" ? "موضع أفقي" : "موضع عمودي",
                          axis === "x"
                            ? "Horizontal position"
                            : "Vertical position",
                        )}
                      >
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          value={stage[axis]}
                          onChange={(e) =>
                            updateStage({ [axis]: Number(e.target.value) })
                          }
                        />
                      </Field>
                    ))}
                    </div>
                    <Button
                    variant="outline"
                    disabled={
                      definition.stages.length === 1 ||
                      definition.initialStage === stage.id
                    }
                    onClick={() => {
                      setDefinition({
                        ...definition,
                        stages: definition.stages.filter(
                          (s) => s.id !== stage.id,
                        ),
                        transitions: definition.transitions.filter(
                          (tr) => tr.from !== stage.id && tr.to !== stage.id,
                        ),
                      });
                      setStageId(definition.initialStage);
                    }}
                  >
                      {t(
                        "حذف المرحلة وروابطها",
                        "Remove stage and connections",
                      )}
                    </Button>
                  </>
                ) : null}
              </section>
              <section className={wfCard}>
                <h2 className="text-lg font-semibold">
                {t("الانتقالات والقواعد", "Transitions and rules")}
              </h2>
                <Field
                title={t(
                  "القاعدة — حسب أولوية التنفيذ",
                  "Rule — in execution order",
                )}
              >
                  <NativeSelect
                  className={wfControl}
                  value={transitionId}
                  onChange={(e) => setTransitionId(e.target.value)}
                >
                    <option value="">
                    {t("اختر انتقالًا", "Choose a transition")}
                  </option>
                    {definition.transitions.map((tr, i) => (
                      <option key={tr.id} value={tr.id}>
                        {i + 1}. {label(tr)} ·{" "}
                        {label(
                          definition.stages.find((s) => s.id === tr.from)!,
                        )}{" "}
                        →{" "}
                        {label(definition.stages.find((s) => s.id === tr.to)!)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Button
                variant="outline"
                onClick={() => {
                  const id = uid();
                  setDefinition({
                    ...definition,
                    transitions: [
                      ...definition.transitions,
                      {
                        id,
                        from: stageId,
                        to: definition.initialStage,
                        nameAr: "انتقال جديد",
                        nameEn: "New transition",
                        trigger: "manual",
                        action: "transition",
                        reasonRequired: false,
                        actors: ["staff"],
                        match: "all",
                        conditions: [],
                      },
                    ],
                  });
                  setTransitionId(id);
                }}
              >
                {t("إضافة انتقال", "Add transition")}
              </Button>
                {transition ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                      title={t("اسم الإجراء بالعربية", "Action Arabic name")}
                    >
                      <Input
                        value={transition.nameAr}
                        onChange={(e) =>
                          updateTransition({ nameAr: e.target.value })
                        }
                      />
                    </Field>
                      <Field
                      title={t(
                        "اسم الإجراء بالإنجليزية",
                        "Action English name",
                      )}
                    >
                      <Input
                        value={transition.nameEn}
                        onChange={(e) =>
                          updateTransition({ nameEn: e.target.value })
                        }
                      />
                    </Field>
                      <Field title={t("من مرحلة", "From stage")}>
                      {selectStages(transition.from, (v) =>
                        updateTransition({ from: v }),
                      )}
                    </Field>
                      <Field title={t("إلى مرحلة", "To stage")}>
                      {selectStages(transition.to, (v) =>
                        updateTransition({ to: v }),
                      )}
                    </Field>
                      <Field title={t("المحفز", "Trigger")}>
                      <NativeSelect
                        className={wfControl}
                        value={transition.trigger}
                        onChange={(e) =>
                          updateTransition({
                            trigger: e.target
                              .value as WorkflowTransition["trigger"],
                            reasonRequired: false,
                            action: "transition",
                          })
                        }
                      >
                        {workflowTriggers.map((k) => (
                          <option key={k} value={k}>
                            {triggerLabels[k]}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                      <Field title={t("الإجراء", "Action")}>
                        <NativeSelect
                        className={wfControl}
                        value={transition.action}
                        onChange={(e) =>
                          updateTransition({
                            action: e.target
                              .value as WorkflowTransition["action"],
                          })
                        }
                      >
                          <option value="transition">
                          {t("انتقال وإحالة", "Transition and route")}
                        </option>
                          {["response_due", "stage_due"].includes(
                          transition.trigger,
                        ) ? (
                            <option value="notify">
                              {t(
                                "تنبيه داخلي فقط",
                                "Internal notification only",
                              )}
                            </option>
                          ) : null}
                        </NativeSelect>
                      </Field>
                      <Field
                      title={t(
                        "المخول بالتنفيذ اليدوي",
                        "Who can perform this action",
                      )}
                    >
                      <NativeSelect
                        className={wfControl}
                        value={transition.actors[0]}
                        onChange={(e) =>
                          updateTransition({
                            actors: [
                              e.target
                                .value as WorkflowTransition["actors"][number],
                            ],
                          })
                        }
                      >
                        <option value="staff">
                          {t(
                            "صاحب صلاحية تغيير الحالة",
                            "Staff with status permission",
                          )}
                        </option>
                        <option value="assignee">
                          {t("المسؤول الحالي", "Current assignee")}
                        </option>
                        <option value="team">
                          {t("أعضاء الفريق الحالي", "Current team members")}
                        </option>
                      </NativeSelect>
                    </Field>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={transition.reasonRequired}
                          disabled={transition.trigger !== "manual"}
                          onChange={(e) =>
                            updateTransition({
                              reasonRequired: e.target.checked,
                            })
                          }
                        />
                        {t("سبب إلزامي", "Reason required")}
                      </label>
                    </div>
                    <Field title={t("مطابقة الشروط", "Condition matching")}>
                    <NativeSelect
                      className={wfControl}
                      value={transition.match}
                      onChange={(e) =>
                        updateTransition({
                          match: e.target.value as "all" | "any",
                        })
                      }
                    >
                      <option value="all">
                        {t("كل الشروط", "All conditions")}
                      </option>
                      <option value="any">
                        {t("أي شرط", "Any condition")}
                      </option>
                    </NativeSelect>
                  </Field>
                    {transition.conditions.map((c, i) => (
                      <div
                      key={i}
                      className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-4"
                    >
                        <Field title={t("الحقل", "Field")}>
                        <NativeSelect
                          className={wfControl}
                          value={c.field}
                          onChange={(e) =>
                            updateTransition({
                              conditions: transition.conditions.map((v, j) =>
                                i === j
                                  ? {
                                      ...v,
                                      field: e.target.value as typeof c.field,
                                    }
                                  : v,
                              ),
                            })
                          }
                        >
                          {conditionFields
                            .filter((f) =>
                              definition.scope === "requests"
                                ? f !== "category"
                                : ![
                                    "serviceType",
                                    "requestType",
                                    "priority",
                                  ].includes(f),
                            )
                            .map((f) => (
                              <option key={f} value={f}>
                                {fieldLabels[f]}
                              </option>
                            ))}
                        </NativeSelect>
                      </Field>
                        <Field title={t("المقارنة", "Comparison")}>
                          <NativeSelect
                            className={wfControl}
                            value={c.op}
                            onChange={(e) =>
                              updateTransition({
                                conditions: transition.conditions.map((v, j) =>
                                  i === j
                                    ? {
                                        ...v,
                                        op: e.target.value as typeof c.op,
                                      }
                                    : v,
                                ),
                              })
                            }
                          >
                            {[
                            ["eq", t("يساوي", "Equals")],
                            ["ne", t("لا يساوي", "Not equal")],
                            ["in", t("ضمن قائمة", "In list")],
                            ["not_in", t("خارج قائمة", "Not in list")],
                            ["empty", t("فارغ", "Empty")],
                            ["not_empty", t("غير فارغ", "Not empty")],
                          ].map(([v, n]) => (
                            <option key={v} value={v}>
                              {n}
                            </option>
                          ))}
                          </NativeSelect>
                        </Field>
                        <Field
                        title={t(
                          "القيمة — افصل القائمة بفاصلة",
                          "Value — comma-separated list",
                        )}
                      >
                        <Input
                          value={c.value}
                          disabled={["empty", "not_empty"].includes(c.op)}
                          onChange={(e) =>
                            updateTransition({
                              conditions: transition.conditions.map((v, j) =>
                                i === j ? { ...v, value: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </Field>
                        <Button
                        variant="outline"
                        onClick={() =>
                          updateTransition({
                            conditions: transition.conditions.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        {t("حذف الشرط", "Remove condition")}
                      </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateTransition({
                          conditions: [
                            ...transition.conditions,
                            { field: "status", op: "eq", value: "" },
                          ],
                        })
                      }
                    >
                      {t("إضافة شرط", "Add condition")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={definition.transitions[0].id === transition.id}
                      onClick={() => {
                        const list = [...definition.transitions],
                          i = list.findIndex((v) => v.id === transition.id);
                        [list[i - 1], list[i]] = [list[i], list[i - 1]];
                        setDefinition({ ...definition, transitions: list });
                      }}
                    >
                      {t("رفع الأولوية", "Move earlier")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDefinition({
                          ...definition,
                          transitions: definition.transitions.filter(
                            (v) => v.id !== transition.id,
                          ),
                        });
                        setTransitionId("");
                      }}
                    >
                      {t("حذف الانتقال", "Remove transition")}
                    </Button>
                  </div>
                  </>
                ) : null}
              </section>
              <section className={wfCard}>
                <h2 className="text-lg font-semibold">
                {t(
                  "التحقق والمحاكاة والنشر",
                  "Validation, simulation and publishing",
                )}
              </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                <Field title={t("مرحلة المحاكاة", "Simulation stage")}>
                  {selectStages(stageId, setStageId)}
                </Field>
                <Field title={t("حدث المحاكاة", "Simulation event")}>
                  <NativeSelect
                    className={wfControl}
                    value={trigger}
                    onChange={(e) =>
                      setTrigger(e.target.value as typeof trigger)
                    }
                  >
                    {workflowTriggers.map((k) => (
                      <option key={k} value={k}>
                        {triggerLabels[k]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                {conditionFields.map((f) => (
                  <Field key={f} title={fieldLabels[f]}>
                    <Input
                      value={fields[f] ?? ""}
                      onChange={(e) =>
                        setFields({ ...fields, [f]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      const r = await workflowPost<{ errors: string[] }>(
                        "validate",
                        definition,
                      );
                      setValidation(r.errors);
                    })
                  }
                >
                  {t("التحقق من المسار", "Validate workflow")}
                </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        const r = await workflowPost<{
                        transitions: WorkflowTransition[];
                        errors: string[];
                      }>("simulate", {
                          definition,
                          stageId,
                          trigger,
                          fields,
                        });
                        setSimulation(r.transitions);
                        setValidation(r.errors);
                      })
                    }
                  >
                    {t("محاكاة", "Simulate")}
                  </Button>
                  <Button
                  disabled={!can(me, "workflows.manage")}
                  onClick={() => void run(save)}
                >
                  {t("حفظ المسودة", "Save draft")}
                </Button>
                </div>
                <Validation errors={validation} locale={locale} />
                {simulation.map((tr) => (
                <p key={tr.id} className="rounded-xl bg-accent p-3">
                  {label(tr)} →{" "}
                  {label(definition.stages.find((s) => s.id === tr.to)!)}
                </p>
              ))}
                <Field
                title={t(
                  "تطبيق المسار على المعاملات الجديدة",
                  "Apply workflow to new conversations",
                )}
              >
                <NativeSelect
                  className={wfControl}
                  value={selector}
                  onChange={(e) => setSelector(e.target.value)}
                >
                  <option value="*">
                    {t("الافتراضي لهذا النوع", "Default for this type")}
                  </option>
                  {Object.entries(
                    definition.scope === "requests"
                      ? portal.admin.requests.services
                      : portal.admin.inquiries.categories,
                  ).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
                <Button
                disabled={
                  !can(me, "workflows.publish") ||
                  (!can(me, "workflows.manage") && !active)
                }
                onClick={() =>
                  void run(async () => {
                    const saved = can(me, "workflows.manage")
                      ? (await save()).saved
                      : active!;
                    await workflowPost("publish", {
                      id: saved.id,
                      revision: saved.revision,
                      selector,
                    });
                    await load();
                  })
                }
              >
                {t(
                  "نشر إصدار للمعاملات الجديدة",
                  "Publish version for new conversations",
                )}
              </Button>
                <p className="text-sm text-muted-foreground">
                {t(
                  "تظل المعاملات الجارية على إصدارها. النقل متاح من القسم المخصص بعد المعاينة.",
                  "Existing conversations stay on their pinned versions. Transfer them separately after previewing.",
                )}
              </p>
              </section>
            </>
          ) : null}
          {tab === "teams" ? (
            <section className={wfCard}>
              <h2 className="text-lg font-semibold">{t("فرق العمل", "Teams")}</h2>
              <div className="flex flex-wrap gap-2">
                {data.teams.map((v) => (
                <Button
                  key={v.id}
                  variant="outline"
                  onClick={() => setTeam(structuredClone(v))}
                >
                  {label(v)}
                </Button>
              ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setTeam({
                    nameAr: "",
                    nameEn: "",
                    members: [],
                    active: true,
                  })
                  }
                >
                  {t("فريق جديد", "New team")}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
              <Field title={t("اسم الفريق بالعربية", "Team Arabic name")}>
                <Input
                  value={team.nameAr ?? ""}
                  onChange={(e) => setTeam({ ...team, nameAr: e.target.value })}
                />
              </Field>
              <Field title={t("اسم الفريق بالإنجليزية", "Team English name")}>
                <Input
                  value={team.nameEn ?? ""}
                  onChange={(e) => setTeam({ ...team, nameEn: e.target.value })}
                />
              </Field>
            </div>
              <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 font-medium">
                {t("الأعضاء", "Members")}
              </legend>
              {data.staff.map((person) => (
                <label
                  key={person.id}
                  className="flex min-h-11 items-center gap-3 rounded-xl border p-3"
                >
                  <input
                    type="checkbox"
                    checked={team.members?.includes(person.id) ?? false}
                    onChange={(e) =>
                      setTeam({
                        ...team,
                        members: e.target.checked
                          ? [...(team.members ?? []), person.id]
                          : (team.members ?? []).filter(
                              (id) => id !== person.id,
                            ),
                      })
                    }
                  />
                  {person.name}
                </label>
              ))}
            </fieldset>
              <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={team.active ?? true}
                onChange={(e) => setTeam({ ...team, active: e.target.checked })}
              />
              {t("فريق نشط", "Active team")}
            </label>
              <Button
              disabled={!can(me, "teams.manage")}
              onClick={() =>
                void run(async () => {
                  await workflowPost("teams", team);
                  await load();
                  setTeam({
                    nameAr: "",
                    nameEn: "",
                    members: [],
                    active: true,
                  });
                })
              }
            >
              {t("حفظ الفريق", "Save team")}
            </Button>
            </section>
          ) : null}
          {tab === "calendar" ? (
            <section className={wfCard}>
              <h2 className="text-lg font-semibold">
              {t("تقويم ساعات العمل", "Business calendar")}
            </h2>
              <p className="text-sm">
              {t(
                "كل حفظ ينشئ إصدارًا جديدًا؛ لا يغير مهل المسارات المنشورة.",
                "Each save creates a new version and preserves published workflow deadlines.",
              )}
            </p>
              <Field title={t("المنطقة الزمنية", "Time zone")}>
              <Input
                value={calendar.timezone}
                onChange={(e) =>
                  setCalendar({ ...calendar, timezone: e.target.value })
                }
              />
            </Field>
              <Button
              variant="outline"
              disabled={!data.calendars.length}
              onClick={() =>
                setCalendar(structuredClone(data.calendars[0].definition))
              }
            >
              {t("نسخ آخر تقويم للتعديل", "Copy latest calendar to edit")}
            </Button>
              {calendar.week.map((intervals, day) => (
                <Intervals
                  key={day}
                  locale={locale}
                  title={new Intl.DateTimeFormat(locale, {
                  weekday: "long",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2026, 0, 4 + day)))}
                  intervals={intervals}
                  onChange={(v) =>
                    setCalendar({
                      ...calendar,
                      week: calendar.week.map((old, i) =>
                        i === day ? v : old,
                      ),
                    })
                  }
                />
              ))}
              <h3 className="font-semibold">
              {t("العطلات والاستثناءات", "Holidays and exceptions")}
            </h3>
              {calendar.exceptions.map((ex, i) => (
                <div key={i} className="space-y-3 rounded-xl border p-3">
                  <Field title={t("التاريخ", "Date")}>
                  <Input
                    type="date"
                    value={ex.date}
                    onChange={(e) =>
                      setCalendar({
                        ...calendar,
                        exceptions: calendar.exceptions.map((old, j) =>
                          j === i ? { ...old, date: e.target.value } : old,
                        ),
                      })
                    }
                  />
                </Field>
                  <Intervals
                  locale={locale}
                  title={t(
                    "فترات الدوام — بدون فترات تعني عطلة",
                    "Working intervals — no intervals means closed",
                  )}
                  intervals={ex.intervals}
                  onChange={(intervals) =>
                    setCalendar({
                      ...calendar,
                      exceptions: calendar.exceptions.map((old, j) =>
                        j === i ? { ...old, intervals } : old,
                      ),
                    })
                  }
                />
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCalendar({
                        ...calendar,
                        exceptions: calendar.exceptions.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                  >
                    {t("حذف الاستثناء", "Remove exception")}
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setCalendar({
                    ...calendar,
                    exceptions: [
                      ...calendar.exceptions,
                      { date: "", intervals: [] },
                    ],
                  })
                }
              >
                {t("إضافة عطلة أو استثناء", "Add holiday or exception")}
              </Button>
              <Button
                disabled={!can(me, "workflows.manage")}
                onClick={() =>
                  void run(async () => {
                    await workflowPost("calendars", calendar);
                    await load();
                  })
                }
              >
                {t("حفظ إصدار التقويم", "Save calendar version")}
              </Button>
            </div>
            </section>
          ) : null}
          {tab === "transfer" ? (
          <section className={wfCard}>
            <h2 className="text-lg font-semibold">
              {t("نقل المعاملات الحالية", "Transfer existing conversations")}
            </h2>
            <Field title={t("نوع المعاملة", "Conversation type")}>
              <NativeSelect
                className={wfControl}
                value={transferScope}
                onChange={(e) => {
                  setTransferScope(e.target.value as WorkflowScope);
                  setIds([]);
                  setRecords([]);
                  setPreview(null);
                }}
              >
                <option value="requests">{portal.admin.requests.title}</option>
                <option value="inquiries">
                  {portal.admin.inquiries.title}
                </option>
              </NativeSelect>
            </Field>
            <Field title={t("البحث عن معاملة", "Find conversation")}>
              <Input
                value={transferQuery}
                onChange={(e) => setTransferQuery(e.target.value)}
              />
            </Field>
            <Button
              variant="outline"
              onClick={() => void run(() => loadTransfer())}
            >
              {t("تحميل المعاملات", "Load conversations")}
            </Button>
            <Toolbar className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={transferPage <= 1}
                onClick={() => void run(() => loadTransfer(transferPage - 1))}
              >
                {t("السابق", "Previous")}
              </Button>
              <span>
                {transferPage} / {Math.max(1, Math.ceil(transferTotal / 50))}
              </span>
              <Button
                variant="outline"
                disabled={transferPage * 50 >= transferTotal}
                onClick={() => void run(() => loadTransfer(transferPage + 1))}
              >
                {t("التالي", "Next")}
              </Button>
            </Toolbar>
            <fieldset className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
              <legend>
                {t("اختر حتى 50 معاملة", "Select up to 50 conversations")}
              </legend>
              {records.map((row) => (
                <label
                  key={row.id}
                  className="flex min-h-11 items-center gap-2 rounded-lg border p-3"
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(row.id)}
                    onChange={(e) => {
                      setIds(
                        e.target.checked
                          ? [...ids, row.id]
                          : ids.filter((id) => id !== row.id),
                      );
                      setPreview(null);
                    }}
                  />
                  {row.refCode}
                </label>
              ))}
            </fieldset>
            <Field title={t("الإصدار الهدف", "Target version")}>
              <NativeSelect
                className={wfControl}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">
                  {t("اختر إصدارًا منشورًا", "Choose a published version")}
                </option>
                {data.versions
                  .filter(
                    (v) => !v.legacy && v.definition.scope === transferScope,
                  )
                  .map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {label(v.definition)} · {i + 1}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            {[
              ...new Set(
                records.filter((r) => ids.includes(r.id)).map((r) => r.stageId),
              ),
            ].map((source) => (
              <Field
                key={source}
                title={t("ربط المرحلة", "Map stage") + " " + source}
              >
                <NativeSelect
                  className={wfControl}
                  value={mapping[source] ?? ""}
                  onChange={(e) => {
                    setMapping({ ...mapping, [source]: e.target.value });
                    setPreview(null);
                  }}
                >
                  <option value="">
                    {t("اختر المرحلة الجديدة", "Choose new stage")}
                  </option>
                  {data.versions
                    .find((v) => v.id === target)
                    ?.definition.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {label(s)}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            ))}
            <Button
              disabled={
                !can(me, "workflows.transfer") ||
                !ids.length ||
                ids.length > 50 ||
                !target
              }
              onClick={() =>
                void run(async () =>
                  setPreview(
                    await workflowPost("transfer/preview", {
                      scope: transferScope,
                      ids,
                      versionId: target,
                      mapping,
                    }),
                  ),
                )
              }
            >
              {t("معاينة النقل", "Preview transfer")}
            </Button>
            {preview ? (
              <div className="space-y-3 rounded-xl border bg-accent/30 p-4">
                {preview.rows.map((row) => (
                  <p key={row.recordId} className="break-words text-sm">
                    {records.find((r) => r.id === row.recordId)?.refCode} ·{" "}
                    {row.from} →{" "}
                    {
                      data.versions
                        .find((v) => v.id === target)
                        ?.definition.stages.find((s) => s.id === row.to)?.[
                        locale === "ar" ? "nameAr" : "nameEn"
                      ]
                    }{" "}
                    ·{" "}
                    {data.teams.find((t) => t.id === row.route.teamId)?.[
                      locale === "ar" ? "nameAr" : "nameEn"
                    ] ?? t("دون فريق", "No team")}{" "}
                    ·{" "}
                    {data.staff.find((s) => s.id === row.route.assigneeId)
                      ?.name ?? t("غير معين", "Unassigned")}{" "}
                    ·{" "}
                    {row.visibility === "assigned"
                      ? t("ظهور مقيد", "Restricted visibility")
                      : t("جميع المصرح لهم", "All authorized staff")}
                    <span className="block">
                      {t("الحالة الجديدة: ", "New status: ")}
                      {
                        (transferScope === "requests"
                          ? portal.admin.requests.statuses
                          : portal.admin.inquiries.statuses)[row.targetStatus]
                      }
                    </span>
                    <span className="block">
                      {t("موعد الرد: ", "Response due: ")}
                      {row.responseDueAt
                        ? new Date(row.responseDueAt).toLocaleString(locale)
                        : t("لا توجد مهلة", "No deadline")}
                    </span>
                    <span className="block">
                      {t("مهلة المرحلة التقديرية: ", "Estimated stage due: ")}
                      {row.stageDueAt
                        ? new Date(row.stageDueAt).toLocaleString(locale)
                        : t("لا توجد مهلة", "No deadline")}
                    </span>
                  </p>
                ))}
                <Button
                  disabled={!can(me, "workflows.transfer")}
                  onClick={() =>
                    void run(async () => {
                      await workflowPost("transfer/confirm", {
                        previewId: preview.previewId,
                      });
                      setPreview(null);
                      setIds([]);
                      await load();
                    })
                  }
                >
                  {t("تأكيد النقل المعاين", "Confirm previewed transfer")}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
        </fieldset>
      </TabsContent>
    </Tabs>
  );
}
function Intervals({
  title,
  intervals,
  onChange,
  locale,
}: {
  title: string;
  intervals: BusinessCalendar["week"][number];
  onChange: (v: BusinessCalendar["week"][number]) => void;
  locale: Locale;
}) {
  const t = words(locale);
  return (
    <fieldset className="space-y-3 rounded-xl border p-3">
      <legend className="px-2 text-sm font-medium">{title}</legend>
      {intervals.map((v, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-3">
          <Field title={t("من", "From")}>
            <Input
              type="time"
              value={v.start}
              onChange={(e) =>
                onChange(
                  intervals.map((old, j) =>
                    j === i ? { ...old, start: e.target.value } : old,
                  ),
                )
              }
            />
          </Field>
          <Field title={t("إلى", "To")}>
            <Input
              type="time"
              value={v.end}
              onChange={(e) =>
                onChange(
                  intervals.map((old, j) =>
                    j === i ? { ...old, end: e.target.value } : old,
                  ),
                )
              }
            />
          </Field>
          <Button
            variant="outline"
            onClick={() => onChange(intervals.filter((_, j) => j !== i))}
          >
            {t("حذف الفترة", "Remove interval")}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          onChange([...intervals, { start: "08:00", end: "16:00" }])
        }
      >
        {t("إضافة فترة دوام", "Add working interval")}
      </Button>
    </fieldset>
  );
}
function Validation({ errors, locale }: { errors: string[]; locale: Locale }) {
  const t = words(locale);
  const labels: Record<string, string> = {
    duplicate_id: t(
      "توجد معرفات مراحل أو انتقالات مكررة.",
      "Stage or transition IDs are duplicated.",
    ),
    initial_stage: t("حدد مرحلة بداية صحيحة.", "Select a valid initial stage."),
    unreachable_stage: t(
      "توجد مراحل لا يصل إليها المسار.",
      "Some stages cannot be reached.",
    ),
    missing_terminal_path: t(
      "يجب أن تصل كل مرحلة إلى مرحلة إغلاق.",
      "Every stage needs a path to a terminal stage.",
    ),
    routing_team: t("حدد فريق الإحالة.", "Choose a routing team."),
    routing_person: t("حدد الموظف المسؤول.", "Choose an assignee."),
    restricted_requires_destination: t(
      "المرحلة المقيدة تحتاج وجهة إحالة محددة.",
      "Restricted stages require a routing destination.",
    ),
    transition_stage: t(
      "أحد الانتقالات يشير إلى مرحلة غير موجودة.",
      "A transition references a missing stage.",
    ),
    automatic_reason: t(
      "الانتقال الآلي لا يمكن أن يطلب سببًا من المستخدم.",
      "Automatic transitions cannot require a user-entered reason.",
    ),
    inquiry_status: t(
      "اختر حالة تشغيلية مناسبة للاستفسارات.",
      "Choose an operational inquiry status.",
    ),
    notification_trigger: t(
      "التنبيه فقط متاح لمحفزات المهلة.",
      "Notification-only actions require a deadline trigger.",
    ),
  };
  return errors.length ? (
    <ul
      role="alert"
      className="list-inside list-disc rounded-xl bg-warning-soft p-4 text-sm text-warning-foreground"
    >
      {errors.map((e) => (
        <li key={e}>
          {labels[e] ??
            t("راجع إعدادات المسار.", "Review the workflow configuration.")}
        </li>
      ))}
    </ul>
  ) : null;
}

/** Stable structural comparison: object property order is not an edit; array order is. */
function definitionKey(definition: WorkflowDefinition): string {
  return JSON.stringify(definition, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}
