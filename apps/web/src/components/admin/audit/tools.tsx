import { useEffect, useState, useCallback } from "react";
import { can, type AuditFilter } from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPortalContent } from "@/content/portal";
import { apiErrorMessage } from "../helpers";
import type { Me } from "../types";
import { auditCopy, word } from "./copy";
import { auditApi, AUDIT_API } from "./api";
import { auditTime, Outcome } from "./audit-client";
interface Report {
  id: string;
  status: string;
  format: string;
  eventCount: number | null;
  resourceCount: number | null;
  createdAt: string;
  expiresAt: string | null;
  errorCode: string | null;
  checksum: string | null;
}
interface ReviewCase {
  id: string;
  title: string;
  ownerId: string;
  state: string;
  held: boolean;
  revision: number;
  eventCount: number;
  closureReason: string | null;
}
interface Rule {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  thresholdValue: number;
  windowSeconds: number;
  cooldownSeconds: number;
  severity: string;
  rationale: string;
  scope: string;
  revision: number;
}
interface Alert {
  id: string;
  name: string;
  ruleId: string;
  severity: string;
  reason: string;
  createdAt: string;
}
interface Health {
  status: string;
  probes: {
    component: string;
    status: string;
    checkedAt: string;
    failures: number;
  }[];
  queues: { status: string; count: number; oldestSeconds: number }[];
  lastBusinessEventAt: string | null;
}
interface CaseDetail {
  case: ReviewCase;
  events: { eventId: string }[];
  history: {
    id: string;
    actorName: string;
    kind: string;
    body: string;
    createdAt: string;
  }[];
}
interface ToolData {
  reports?: Report[];
  cases?: ReviewCase[];
  rules?: Rule[];
  alerts?: Alert[];
  health?: Health;
  policy?: { retentionDays: number | null; revision: number };
  users?: { id: string; name: string }[];
  bookmarks?: { eventId: string }[];
}
const control =
  "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const card = "space-y-4 rounded-2xl border bg-white p-5";
export function AuditTools({
  tab,
  refreshRevision,
  me,
  locale,
  timezone,
  filter,
  pageIds,
  selected,
  onEvent,
}: {
  tab: string;
  refreshRevision: number;
  me: Me;
  locale: "ar" | "en";
  timezone: string;
  filter: AuditFilter;
  pageIds: string[];
  selected: string[];
  onEvent: (id: string) => void;
}) {
  const t = auditCopy[locale],
    portal = getPortalContent(locale),
    [data, setData] = useState<ToolData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [caseId, setCaseId] = useState(""),
    [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null),
    [reportScope, setReportScope] = useState("all"),
    [reportFormat, setReportFormat] = useState("json"),
    [simulation, setSimulation] = useState<{
      id: string;
      count: number;
    } | null>(null),
    [impact, setImpact] = useState<{
      candidates: number;
      held: number;
      configured: boolean;
    } | null>(null),
    [alertEvents, setAlertEvents] = useState<{
      id: string;
      events: string[];
    } | null>(null);
  const fail = useCallback(
    (e: unknown) => apiErrorMessage(e, portal.auth.errors),
    [portal.auth.errors],
  );
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    setMessage("");
    async function load() {
      let next: ToolData = {};
      if (tab === "reports")
        next = await auditApi("/reports", undefined, "GET", controller.signal);
      if (tab === "reviews") {
        next = await auditApi("/cases", undefined, "GET", controller.signal);
        const flags = await auditApi<{ bookmarks: { eventId: string }[] }>(
          "/bookmarks",
          undefined,
          "GET",
          controller.signal,
        );
        next.bookmarks = flags.bookmarks;
        if (can(me, "audit.cases.manage"))
          next.users = (
            await auditApi<{ users: { id: string; name: string }[] }>(
              "/assignees",
              undefined,
              "GET",
              controller.signal,
            )
          ).users;
      }
      if (tab === "rules")
        next = await auditApi("/rules", undefined, "GET", controller.signal);
      if (tab === "alerts")
        next = await auditApi("/alerts", undefined, "GET", controller.signal);
      if (tab === "health") {
        if (can(me, "audit.health.view"))
          next.health = await auditApi(
            "/health",
            undefined,
            "GET",
            controller.signal,
          );
        if (can(me, "audit.policy.manage"))
          next.policy = (
            await auditApi<{ policy: ToolData["policy"] }>(
              "/policy",
              undefined,
              "GET",
              controller.signal,
            )
          ).policy;
      }
      if (!controller.signal.aborted) setData(next);
    }
    void load().catch((e) => {
      if (!controller.signal.aborted) setError(fail(e));
    });
    return () => controller.abort();
  }, [tab, refresh, refreshRevision, fail, me]);
  useEffect(() => {
    if (
      tab !== "reports" ||
      !data?.reports?.some((r) => ["queued", "running"].includes(r.status))
    )
      return;
    const controller = new AbortController(),
      timer = setInterval(() => {
        void auditApi<{ reports: Report[] }>(
          "/reports",
          undefined,
          "GET",
          controller.signal,
        )
          .then((r) => setData((d) => ({ ...d, reports: r.reports })))
          .catch((e) => {
            if (!controller.signal.aborted) setError(fail(e));
          });
      }, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [tab, data?.reports, fail]);
  useEffect(() => {
    if (!caseId) {
      setCaseDetail(null);
      return;
    }
    const controller = new AbortController();
    void auditApi<CaseDetail>(
      "/cases/" + caseId,
      undefined,
      "GET",
      controller.signal,
    )
      .then(setCaseDetail)
      .catch((e) => {
        if (!controller.signal.aborted) setError(fail(e));
      });
    return () => controller.abort();
  }, [caseId, refresh, fail]);
  async function action(fn: () => Promise<unknown>, reload = true) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(t.done);
      if (reload) setRefresh((v) => v + 1);
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }
  const ruleName = (kind: string) =>
    word(
      t,
      kind === "export"
        ? "largeExport"
        : kind === "health"
          ? "writerHealth"
          : kind,
    );
  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>
            {t.retry}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!data && !error && <p role="status">{t.loading}</p>}
      {tab === "reports" && (
        <>
          <form
            className={card}
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const ids = reportScope === "page" ? pageIds : selected;
                await auditApi("/reports", {
                  format: reportFormat,
                  scope: reportScope,
                  locale,
                  timezone,
                  filters:
                    reportScope === "all"
                      ? filter
                      : { ...filter, ids, includeAccess: true },
                });
              });
            }}
          >
            <h2 className="text-lg font-semibold">{t.export}</h2>
            <p className="text-sm text-muted-foreground">{t.reportHelp}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm">
                {t.scope}
                <select
                  className={control}
                  value={reportScope}
                  onChange={(e) => setReportScope(e.target.value)}
                >
                  <option value="all">{t.allResults}</option>
                  <option value="page">
                    {t.page} ({pageIds.length})
                  </option>
                  <option value="selected">
                    {t.selectedScope} ({selected.length})
                  </option>
                </select>
              </label>
              <label className="text-sm">
                {t.format}
                <select
                  className={control}
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="html">{t.print} / PDF</option>
                </select>
              </label>
              <Button
                className="self-end"
                disabled={
                  busy ||
                  (reportScope === "page" && !pageIds.length) ||
                  (reportScope === "selected" && !selected.length)
                }
              >
                {t.export}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.selectionHelp} · <bdi>{timezone}</bdi>
            </p>
          </form>
          <div className="space-y-3">
            {data?.reports?.map((report) => (
              <article key={report.id} className={card}>
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs [overflow-wrap:anywhere]">
                      {report.id}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {auditTime(report.createdAt, locale, timezone)}
                    </p>
                  </div>
                  <Outcome value={report.status} t={t} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt>{t.count}</dt>
                    <dd>{report.eventCount ?? t.unrecorded}</dd>
                  </div>
                  <div>
                    <dt>{t.resources}</dt>
                    <dd>{report.resourceCount ?? t.unrecorded}</dd>
                  </div>
                  {report.expiresAt && (
                    <div className="col-span-2">
                      <dt>{t.expires}</dt>
                      <dd>{auditTime(report.expiresAt, locale, timezone)}</dd>
                    </div>
                  )}
                </dl>
                {report.errorCode && (
                  <p className="text-sm text-destructive">
                    {t.failureHelp} <bdi>{report.errorCode}</bdi>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {report.status === "completed" && (
                    <>
                      <Button asChild variant="outline">
                        <a href={`${AUDIT_API}/reports/${report.id}/download`}>
                          {report.format === "html" ? t.print : t.download} ·{" "}
                          {report.format.toUpperCase()}
                        </a>
                      </Button>
                      <Button asChild variant="ghost">
                        <a
                          href={`${AUDIT_API}/reports/${report.id}/download?manifest=1`}
                        >
                          {t.manifest}
                        </a>
                      </Button>
                    </>
                  )}
                  {["queued", "running"].includes(report.status) && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          auditApi(`/reports/${report.id}/cancel`, {}),
                        )
                      }
                    >
                      {t.cancel}
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {data?.reports?.length === 0 && (
              <p className="p-6 text-center text-muted-foreground">{t.empty}</p>
            )}
          </div>
        </>
      )}
      {tab === "reviews" && (
        <>
          {!!data?.bookmarks?.length && (
            <section className={card}>
              <h2 className="font-semibold">{t.flag}</h2>
              <div className="flex flex-wrap gap-2">
                {data.bookmarks.map((b) => (
                  <Button
                    variant="outline"
                    className="max-w-full [overflow-wrap:anywhere]"
                    key={b.eventId}
                    onClick={() => onEvent(b.eventId)}
                  >
                    <bdi className="truncate font-mono text-xs">
                      {b.eventId}
                    </bdi>
                  </Button>
                ))}
              </div>
            </section>
          )}
          {can(me, "audit.cases.manage") && (
            <form
              className={card}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  values = new FormData(form);
                void action(async () => {
                  const result = await auditApi<{ id: string }>("/cases", {
                    title: values.get("title"),
                    ownerId: values.get("ownerId"),
                    eventIds: selected,
                  });
                  setCaseId(result.id);
                  form.reset();
                });
              }}
            >
              <h2 className="font-semibold">{t.createCase}</h2>
              <p className="text-sm text-muted-foreground">
                {t.selected}: {selected.length}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  {t.caseTitle}
                  <Input
                    className="mt-1 min-h-11"
                    name="title"
                    required
                    maxLength={160}
                  />
                </label>
                <label className="text-sm">
                  {t.caseOwner}
                  <select
                    name="ownerId"
                    className={control}
                    defaultValue={me.id}
                  >
                    {data?.users?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button disabled={busy || !selected.length}>
                {t.createCase}
              </Button>
            </form>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={card}>
              <h2 className="font-semibold">{t.reviews}</h2>
              {data?.cases?.map((item) => (
                <button
                  className="block w-full rounded-xl border p-3 text-start hover:bg-muted focus-visible:outline"
                  key={item.id}
                  onClick={() => setCaseId(item.id)}
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {word(t, item.state)} · {t.count}: {item.eventCount}{" "}
                    {item.held ? " · " + t.held : ""}
                  </p>
                </button>
              ))}
              {data?.cases?.length === 0 && (
                <p className="text-sm text-muted-foreground">{t.empty}</p>
              )}
            </section>
            {caseDetail && (
              <section className={card}>
                <h2 className="font-semibold">{caseDetail.case.title}</h2>
                <p className="text-xs text-muted-foreground">{t.holdHelp}</p>
                <div className="flex flex-wrap gap-2">
                  {caseDetail.events.map((e) => (
                    <Button
                      key={e.eventId}
                      variant="outline"
                      size="sm"
                      onClick={() => onEvent(e.eventId)}
                    >
                      <bdi className="max-w-44 truncate font-mono text-xs">
                        {e.eventId}
                      </bdi>
                    </Button>
                  ))}
                </div>
                {can(me, "audit.cases.manage") && (
                  <form
                    className="space-y-3"
                    key={caseDetail.case.revision}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const values = new FormData(e.currentTarget);
                      void action(() =>
                        auditApi(
                          "/cases/" + caseId,
                          {
                            revision: caseDetail.case.revision,
                            state: values.get("state"),
                            ...(values.get("closureReason")
                              ? { closureReason: values.get("closureReason") }
                              : {}),
                          },
                          "PATCH",
                        ),
                      );
                    }}
                  >
                    <label className="block text-sm">
                      {t.caseState}
                      <select
                        name="state"
                        defaultValue={caseDetail.case.state}
                        className={control}
                      >
                        {["new", "reviewing", "closed"].map((s) => (
                          <option key={s} value={s}>
                            {word(t, s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      {t.closureReason}
                      <textarea
                        className={control}
                        name="closureReason"
                        maxLength={2000}
                        defaultValue={caseDetail.case.closureReason ?? ""}
                      />
                    </label>
                    <Button disabled={busy}>{t.save}</Button>
                    {selected.length > 0 && (
                      <Button
                        variant="outline"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            auditApi(
                              "/cases/" + caseId,
                              {
                                revision: caseDetail.case.revision,
                                eventIds: selected,
                              },
                              "PATCH",
                            ),
                          )
                        }
                      >
                        {t.addEvents}
                      </Button>
                    )}
                  </form>
                )}
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      values = new FormData(form);
                    void action(async () => {
                      await auditApi(
                        "/cases/" + caseId,
                        {
                          revision: caseDetail.case.revision,
                          note: values.get("note"),
                        },
                        "PATCH",
                      );
                      form.reset();
                    });
                  }}
                >
                  <label className="block text-sm">
                    {t.note}
                    <textarea
                      name="note"
                      className={control}
                      required
                      maxLength={2000}
                    />
                  </label>
                  <Button variant="outline" disabled={busy}>
                    {t.addNote}
                  </Button>
                </form>
                {can(me, "audit.policy.manage") && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!caseDetail.case.held}
                      disabled={busy}
                      onChange={(e) =>
                        void action(() =>
                          auditApi(
                            "/cases/" + caseId,
                            {
                              revision: caseDetail.case.revision,
                              held: e.target.checked,
                            },
                            "PATCH",
                          ),
                        )
                      }
                    />
                    {t.held}
                  </label>
                )}
                <h3 className="font-medium">{t.reviewHistory}</h3>
                {caseDetail.history.map((h) => (
                  <div className="border-s-2 ps-3 text-sm" key={h.id}>
                    <p className="font-medium">{h.actorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {auditTime(h.createdAt, locale, timezone)}
                    </p>
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {h.body}
                    </p>
                  </div>
                ))}
              </section>
            )}
          </div>
        </>
      )}
      {tab === "rules" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {data?.rules?.map((rule) => (
            <form
              key={`${rule.id}-${rule.revision}`}
              className={card}
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void action(() =>
                  auditApi(
                    "/rules/" + rule.id,
                    {
                      revision: rule.revision,
                      enabled: values.get("enabled") === "on",
                      thresholdValue: Number(
                        values.get("threshold") ?? rule.thresholdValue,
                      ),
                      windowSeconds: Number(
                        values.get("window") ?? rule.windowSeconds,
                      ),
                      cooldownSeconds: Number(values.get("cooldown")),
                      severity: values.get("severity"),
                      rationale: values.get("rationale"),
                      scope: values.get("scope"),
                    },
                    "PATCH",
                  ),
                );
              }}
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-semibold">{ruleName(rule.kind)}</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={!!rule.enabled}
                  />
                  {t.enabled}
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["threshold", t.threshold, rule.thresholdValue, 1],
                  ["window", t.window, rule.windowSeconds, 60],
                  ["cooldown", t.cooldown, rule.cooldownSeconds, 0],
                ]
                  .filter(
                    ([name]) =>
                      name === "cooldown" ||
                      (name === "threshold" && rule.kind !== "privilege") ||
                      (name === "window" && rule.kind === "security"),
                  )
                  .map(([name, label, value, min]) => (
                    <label key={name} className="text-xs">
                      {label}
                      <Input
                        className="mt-1 min-h-11"
                        name={String(name)}
                        type="number"
                        min={Number(min)}
                        max={name === "threshold" ? 100000 : 86400}
                        defaultValue={value}
                        required
                      />
                    </label>
                  ))}
                <label className="text-xs">
                  {t.severity}
                  <select
                    className={control}
                    name="severity"
                    defaultValue={rule.severity}
                  >
                    {["low", "medium", "high"].map((s) => (
                      <option key={s} value={s}>
                        {word(t, s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  {t.scope}
                  <select
                    className={control}
                    name="scope"
                    defaultValue={rule.scope}
                  >
                    {[
                      "all",
                      "security",
                      "identity",
                      "requests",
                      "inquiries",
                      "content",
                      "audit",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {word(t, s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                {t.rationale}
                <textarea
                  name="rationale"
                  className={control}
                  maxLength={500}
                  required
                  defaultValue={rule.rationale}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy}>{t.save}</Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result = await auditApi<{ matches: unknown[] }>(
                        "/rules/" + rule.id + "/simulate",
                        {
                          from: new Date(Date.now() - 86400000).toISOString(),
                          to: new Date().toISOString(),
                        },
                      );
                      setSimulation({
                        id: rule.id,
                        count: result.matches.length,
                      });
                    }, false)
                  }
                >
                  {t.simulate}
                </Button>
              </div>
              {simulation?.id === rule.id && (
                <p role="status" className="text-sm">
                  {t.matches}: {simulation.count}
                </p>
              )}
            </form>
          ))}
        </div>
      )}
      {tab === "alerts" && (
        <>
          {data?.alerts?.map((alert) => (
            <article key={alert.id} className={card}>
              <div className="flex justify-between gap-3">
                <h2 className="font-semibold">
                  {ruleName(
                    alert.ruleId === "export"
                      ? "export"
                      : alert.ruleId === "health"
                        ? "health"
                        : alert.ruleId,
                  )}
                </h2>
                <Outcome value={alert.severity} t={t} />
              </div>
              <p className="text-sm">{alert.reason}</p>
              <p className="text-xs text-muted-foreground">
                {auditTime(alert.createdAt, locale, timezone)}
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  void action(async () => {
                    const result = await auditApi<{
                      events: { eventId: string }[];
                    }>("/alerts/" + alert.id + "/events", undefined, "GET");
                    setAlertEvents({
                      id: alert.id,
                      events: result.events.map((e) => e.eventId),
                    });
                  }, false)
                }
              >
                {t.details}
              </Button>
              {alertEvents?.id === alert.id && (
                <div className="flex flex-wrap gap-2">
                  {alertEvents.events.map((id) => (
                    <Button
                      variant="ghost"
                      key={id}
                      onClick={() => onEvent(id)}
                    >
                      <bdi className="max-w-48 truncate font-mono text-xs">
                        {id}
                      </bdi>
                    </Button>
                  ))}
                </div>
              )}
            </article>
          ))}
          {data?.alerts?.length === 0 && (
            <p className="p-10 text-center text-muted-foreground">{t.empty}</p>
          )}
        </>
      )}
      {tab === "health" && (
        <>
          {data?.health && (
            <section className={card}>
              <div className="flex flex-wrap justify-between gap-3">
                <h2 className="font-semibold">{t.writerHealth}</h2>
                <Outcome value={data.health.status} t={t} />
              </div>
              <p className="text-sm text-muted-foreground">{t.probeHelp}</p>
              <p className="text-sm">
                {t.lastBusiness}:{" "}
                {data.health.lastBusinessEventAt
                  ? auditTime(data.health.lastBusinessEventAt, locale, timezone)
                  : t.unrecorded}
              </p>
              {data.health.probes.map((probe) => (
                <div
                  key={probe.component}
                  className="rounded-xl border p-3 text-sm"
                >
                  <p>
                    <bdi>{probe.component}</bdi> · {word(t, probe.status)}
                  </p>
                  <p className="mt-1">
                    {t.lastProbe}:{" "}
                    {auditTime(probe.checkedAt, locale, timezone)}
                  </p>
                  <p>
                    {t.failed}: {probe.failures}
                  </p>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {data.health.queues.map((q) => (
                  <div key={q.status} className="rounded-xl bg-muted p-3">
                    <p className="text-xs">{word(t, q.status)}</p>
                    <p className="text-xl tabular-nums">{q.count}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {data?.policy && (
            <form
              className={card}
              key={data.policy.revision}
              onSubmit={(e) => {
                e.preventDefault();
                const value = new FormData(e.currentTarget).get("days");
                void action(() =>
                  auditApi(
                    "/policy",
                    {
                      revision: data.policy!.revision,
                      retentionDays: value ? Number(value) : null,
                    },
                    "PATCH",
                  ),
                );
              }}
            >
              <h2 className="font-semibold">{t.retention}</h2>
              <p className="text-sm">
                {data.policy.retentionDays === null
                  ? t.unconfigured
                  : `${data.policy.retentionDays} · ${t.retentionDays}`}
              </p>
              <p className="text-sm text-muted-foreground">{t.retentionHelp}</p>
              <label className="block text-sm">
                {t.retentionDays}
                <Input
                  className="mt-1 min-h-11"
                  name="days"
                  type="number"
                  min={1}
                  max={36500}
                  defaultValue={data.policy.retentionDays ?? ""}
                />
              </label>
              <div className="flex gap-2">
                <Button disabled={busy}>{t.save}</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      async () =>
                        setImpact(await auditApi("/policy/dry-run", {})),
                      false,
                    )
                  }
                >
                  {t.dryRun}
                </Button>
              </div>
              {impact && (
                <p role="status" className="text-sm">
                  {impact.configured
                    ? `${t.candidates}: ${impact.candidates} · ${t.protected}: ${impact.held}`
                    : t.unconfigured}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </div>
  );
}
