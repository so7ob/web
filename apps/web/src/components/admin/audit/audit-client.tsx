"use client";
import type { AuditPreference, AuditSavedView } from "@so7ob/contracts";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ScrollText,
  RefreshCw,
  Search,
  ArrowUpRight,
  ShieldCheck,
  Users,
  Filter,
  Download,
} from "lucide-react";
import {
  can,
  AUDIT_CATALOG,
  auditLabel,
  type AuditFilter,
  type AuditSearchResponse,
  type AuditEventV1,
  type AuditValue,
} from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { getPortalContent } from "@/content/portal";
import { apiErrorMessage } from "../helpers";
import type { Me } from "../types";
import { auditCopy, word, type AuditCopy } from "./copy";
import { auditApi } from "./api";
import { AuditTools } from "./tools";
const control =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
export function auditTime(value: string, locale: string, zone: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "long",
      timeZone: zone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}
export function auditValue(value: AuditValue, t: AuditCopy) {
  return (
    (value.state === "value"
      ? typeof value.value === "boolean"
        ? word(t, value.value ? "booleanTrue" : "booleanFalse")
        : Array.isArray(value.value)
          ? value.value.join("، ")
          : word(t, String(value.value))
      : word(t, value.state === "empty" ? "emptyValue" : value.state)) +
    (value.state === "value" && value.truncated
      ? " · " + word(t, "truncated")
      : "")
  );
}
export function Outcome({ value, t }: { value: string; t: AuditCopy }) {
  return (
    <span
      className={
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium " +
        (value === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : value === "denied" || value === "failure"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-slate-50 text-slate-700")
      }
    >
      {word(t, value)}
    </span>
  );
}
export function AuditClient({ me, locale }: { me: Me; locale: "ar" | "en" }) {
  const t = auditCopy[locale],
    portal = getPortalContent(locale),
    [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("events"),
    [filter, setFilter] = useState<AuditFilter>({}),
    [q, setQ] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [cursor, setCursor] = useState<string | undefined>(),
    [previous, setPrevious] = useState<(string | undefined)[]>([]),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AuditSearchResponse | null>(null),
    [dataKey, setDataKey] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [newEvents, setNewEvents] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("UTC"),
    [density, setDensity] = useState("comfortable"),
    [columns, setColumns] = useState([
      "time",
      "actor",
      "action",
      "resource",
      "outcome",
      "changes",
    ]);
  const [views, setViews] = useState<AuditSavedView[]>([]),
    [viewName, setViewName] = useState("");
  const [event, setEvent] = useState<AuditEventV1 | null>(null),
    [detailError, setDetailError] = useState(""),
    [relation, setRelation] = useState<"resource" | "batch" | "correlation">(
      "resource",
    );
  const [flags, setFlags] = useState<string[]>([]),
    [detailLoading, setDetailLoading] = useState(false),
    [actionBusy, setActionBusy] = useState(false);
  const eventId = params.get("event"),
    queryKey = JSON.stringify({ ...filter, cursor }),
    rows = dataKey === queryKey ? (data?.rows ?? []) : [],
    current = dataKey === queryKey ? data : null;
  const focusOrigin = useRef<HTMLButtonElement | null>(null);
  const fail = useCallback(
    (e: unknown) => apiErrorMessage(e, portal.auth.errors),
    [portal.auth.errors],
  );
  const apply = (next: AuditFilter) => {
    setFilter(next);
    setCursor(undefined);
    setPrevious([]);
    setSelected([]);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter((f) => ({ ...f, q: q || undefined }));
      setCursor(undefined);
      setPrevious([]);
      setSelected([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const payload = JSON.parse(queryKey) as AuditFilter;
    void auditApi<AuditSearchResponse>(
      "/events/search",
      payload,
      "POST",
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setDataKey(queryKey);
        setNewEvents(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(fail(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryKey, refresh, fail]);
  useEffect(() => {
    const controller = new AbortController();
    void auditApi<{
      preferences: AuditPreference;
    }>("/preferences", undefined, "GET", controller.signal)
      .then((r) => {
        setTimezone(r.preferences.timezone);
        setDensity(r.preferences.density);
        setColumns(r.preferences.columns);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setNotice(fail(e));
      });
    void auditApi<{ views: typeof views }>(
      "/views",
      undefined,
      "GET",
      controller.signal,
    )
      .then((r) => setViews(r.views))
      .catch((e) => {
        if (!controller.signal.aborted) setNotice(fail(e));
      });
    if (can(me, "audit.review"))
      void auditApi<{ bookmarks: { eventId: string }[] }>(
        "/bookmarks",
        undefined,
        "GET",
        controller.signal,
      )
        .then((r) => setFlags(r.bookmarks.map((b) => b.eventId)))
        .catch((e) => {
          if (!controller.signal.aborted) setNotice(fail(e));
        });
    return () => controller.abort();
  }, [fail, me]);
  useEffect(() => {
    if (!current || cursor) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void auditApi<{ latestId: string | null; count: number }>(
        "/events/check",
        { ...filter, limit: 1 },
        "POST",
        controller.signal,
      )
        .then((result) => {
          if (
            result.count !== current.stats.events ||
            result.latestId !== (current.rows[0]?.id ?? null)
          )
            setNewEvents(true);
        })
        .catch(() => {
          /* Keep the explicit refresh result; polling never claims health. */
        });
    }, 30000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [current, filter, cursor]);
  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setEvent(null);
    setDetailError("");
    void auditApi<{ event: AuditEventV1 }>(
      "/events/" + encodeURIComponent(eventId),
      undefined,
      "GET",
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setEvent(r.event);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setDetailError(fail(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [eventId, fail]);
  async function perform(work: () => Promise<unknown>) {
    setActionBusy(true);
    setNotice("");
    try {
      await work();
      setNotice(t.done);
    } catch (e) {
      setNotice(fail(e));
    } finally {
      setActionBusy(false);
    }
  }
  async function preferences(zone = timezone, den = density, cols = columns) {
    await auditApi("/preferences", {
      timezone: zone,
      density: den,
      columns: cols,
    });
    setTimezone(zone);
    setDensity(den);
    setColumns(cols);
  }
  const openEvent = (id: string, target?: HTMLButtonElement) => {
    if (target) focusOrigin.current = target;
    setRelation("resource");
    setParams({ event: id });
  };
  const closeEvent = () => setParams({});
  async function report(format = "json", ids?: string[]) {
    await auditApi("/reports", {
      format,
      scope: ids ? "selected" : "all",
      locale,
      timezone,
      filters: ids ? { ids, includeAccess: true } : filter,
    });
    closeEvent();
    setTab("reports");
  }
  if (!can(me, "audit.view")) return <p role="alert">{t.noAccess}</p>;
  return (
    <div
      className="min-w-0 space-y-6 [&_button]:transition-none"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-brand-strong">
            <ScrollText aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-navy">{t.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.lastUpdated}:{" "}
              {current
                ? auditTime(current.measuredAt, locale, timezone)
                : t.unrecorded}{" "}
              · <bdi>{timezone}</bdi>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setRefresh((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {t.refresh}
          </Button>
          {can(me, "audit.export") && (
            <Button onClick={() => setTab("reports")}>
              <Download className="size-4" aria-hidden="true" />
              {t.export}
            </Button>
          )}
        </div>
      </header>
      <nav aria-label={t.title} className="flex flex-wrap gap-2 border-b pb-3">
        {[
          "events",
          ...(can(me, "audit.export") ? ["reports"] : []),
          ...(can(me, "audit.review") ? ["reviews"] : []),
          "alerts",
          ...(can(me, "audit.rules.manage") ? ["rules"] : []),
          ...(can(me, "audit.health.view") || can(me, "audit.policy.manage")
            ? ["health"]
            : []),
        ].map((key) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "ghost"}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {word(t, key)}
          </Button>
        ))}
      </nav>
      {notice && (
        <p
          role="status"
          className="rounded-xl border bg-muted/40 p-3 text-sm [overflow-wrap:anywhere]"
        >
          {notice}
        </p>
      )}
      {tab !== "events" ? (
        <AuditTools
          tab={tab}
          refreshRevision={refresh}
          me={me}
          locale={locale}
          timezone={timezone}
          filter={filter}
          pageIds={rows.map((r) => r.id)}
          selected={selected}
          onEvent={openEvent}
        />
      ) : (
        <>
          <section
            aria-label={t.matched}
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            {[
              [t.matched, current?.stats.events, ScrollText],
              [t.sensitive, current?.stats.sensitive, ShieldCheck],
              [
                t.rejected,
                current
                  ? current.stats.denied + current.stats.failed
                  : undefined,
                ShieldCheck,
              ],
              [t.distinctActors, current?.stats.actors, Users],
            ].map(([label, count, Icon], i) => {
              const MetricIcon = Icon as typeof ScrollText;
              return (
                <div key={i} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{String(label)}</span>
                    <MetricIcon
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-navy">
                    {count === undefined
                      ? "…"
                      : Number(count).toLocaleString(locale)}
                  </p>
                </div>
              );
            })}
          </section>
          <p className="text-xs text-muted-foreground">
            {t.filterHelp}
            {current && current.stats.unknown > 0
              ? ` · ${t.unknown}: ${current.stats.unknown}`
              : ""}
          </p>
          <section
            className="space-y-4 rounded-2xl border bg-white p-4"
            aria-label={t.filters}
          >
            <div className="flex flex-wrap gap-3">
              <label className="min-w-0 flex-1 basis-64">
                <span className="sr-only">{t.search}</span>
                <div className="relative">
                  <Search
                    className="absolute start-3 top-3 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    className="min-h-11 ps-9"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t.search}
                  />
                </div>
              </label>
              <Button
                variant="outline"
                onClick={() => setAdvanced(!advanced)}
                aria-expanded={advanced}
              >
                <Filter className="size-4" aria-hidden="true" />
                {t.filters}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  apply({});
                }}
              >
                {t.reset}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[1, 7, 30].map((days, i) => (
                <Button
                  key={days}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    apply({
                      ...filter,
                      from: new Date(
                        Date.now() - days * 86400000,
                      ).toISOString(),
                      to: undefined,
                    })
                  }
                >
                  {[t.today, t.week, t.month][i]}
                </Button>
              ))}
              <label className="flex min-w-0 items-center gap-2 text-xs">
                {t.views}
                <select
                  className={control}
                  value=""
                  onChange={(e) => {
                    const view = views.find((v) => v.id === e.target.value);
                    if (view) {
                      setQ(view.filters.q ?? "");
                      apply(view.filters);
                    }
                  }}
                >
                  <option value="">{t.all}</option>
                  {views.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {advanced && (
              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-3">
                {(
                  [
                    "from",
                    "to",
                    "actors",
                    "resourceId",
                    "batchId",
                    "correlationId",
                  ] as const
                ).map((key) => (
                  <label key={key} className="space-y-1 text-xs">
                    <span>
                      {word(
                        t,
                        key === "batchId"
                          ? "batch"
                          : key === "correlationId"
                            ? "correlation"
                            : key,
                      )}
                    </span>
                    <Input
                      dir="ltr"
                      type={
                        key === "from" || key === "to"
                          ? "datetime-local"
                          : "text"
                      }
                      step={key === "from" || key === "to" ? 1 : undefined}
                      className="min-h-11"
                      value={
                        key === "actors"
                          ? (filter.actors?.join(",") ?? "")
                          : key === "from" || key === "to"
                            ? (filter[key]?.slice(0, 19) ?? "")
                            : String(filter[key] ?? "")
                      }
                      onChange={(e) =>
                        apply({
                          ...filter,
                          [key]:
                            key === "actors"
                              ? e.target.value
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean)
                              : (key === "from" || key === "to") &&
                                  e.target.value &&
                                  Number.isFinite(
                                    Date.parse(e.target.value + "Z"),
                                  )
                                ? new Date(e.target.value + "Z").toISOString()
                                : e.target.value || undefined,
                        })
                      }
                    />
                  </label>
                ))}
                {(
                  [
                    "resourceType",
                    "action",
                    "category",
                    "outcome",
                    "source",
                  ] as const
                ).map((key) => (
                  <label key={key} className="space-y-1 text-xs">
                    <span>{word(t, key)}</span>
                    <select
                      className={control}
                      value={filter[key] ?? ""}
                      onChange={(e) =>
                        apply({ ...filter, [key]: e.target.value || undefined })
                      }
                    >
                      <option value="">{t.all}</option>
                      {(key === "resourceType"
                        ? [
                            "request",
                            "inquiry",
                            "user",
                            "page",
                            "media",
                            "template",
                            "attachment",
                            "settings",
                            "menu",
                            "audit_report",
                          ]
                        : key === "action"
                          ? Object.keys(AUDIT_CATALOG)
                          : key === "category"
                            ? [
                                ...new Set(
                                  Object.values(AUDIT_CATALOG).map(
                                    (e) => e.category,
                                  ),
                                ),
                              ]
                            : key === "outcome"
                              ? ["success", "denied", "failure", "unknown"]
                              : ["api", "worker", "system", "unknown"]
                      ).map((value) => (
                        <option key={value} value={value}>
                          {key === "action"
                            ? auditLabel(value, locale)
                            : word(
                                t,
                                value === "page" ? "pageResource" : value,
                              )}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filter.hasChanges ?? false}
                    onChange={(e) =>
                      apply({
                        ...filter,
                        hasChanges: e.target.checked ? true : undefined,
                      })
                    }
                  />
                  {t.hasChanges}
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filter.includeAccess ?? false}
                    onChange={(e) =>
                      apply({ ...filter, includeAccess: e.target.checked })
                    }
                  />
                  {t.access}
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {Object.entries(filter)
                .filter(([, v]) => v !== undefined && v !== false && v !== "")
                .map(([key, value]) => (
                  <Button
                    key={key}
                    variant="secondary"
                    size="sm"
                    className="max-w-full whitespace-normal break-words"
                    onClick={() => {
                      const next = { ...filter };
                      delete next[key as keyof AuditFilter];
                      if (key === "q") setQ("");
                      apply(next);
                    }}
                    aria-label={`${t.clear}: ${word(t, key)}`}
                  >
                    <span className="[overflow-wrap:anywhere]">
                      {word(t, key)}:{" "}
                      {Array.isArray(value)
                        ? value.map((item) => word(t, String(item))).join(", ")
                        : key === "q" || key === "from" || key === "to"
                          ? String(value)
                          : word(t, String(value))}{" "}
                      ×
                    </span>
                  </Button>
                ))}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer py-2">
                {t.views} · {t.columns} · {t.timezone}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  {t.viewName}
                  <Input
                    className="min-h-11"
                    value={viewName}
                    maxLength={100}
                    onChange={(e) => setViewName(e.target.value)}
                  />
                </label>
                <Button
                  disabled={!viewName.trim() || actionBusy}
                  variant="outline"
                  onClick={() =>
                    void perform(async () => {
                      await auditApi("/views", {
                        name: viewName,
                        filters: filter,
                      });
                      setViewName("");
                      setViews(
                        (
                          await auditApi<{ views: typeof views }>(
                            "/views",
                            undefined,
                            "GET",
                          )
                        ).views,
                      );
                    })
                  }
                >
                  {t.saveView}
                </Button>
                {views.map((v) => (
                  <div key={v.id} className="flex justify-between gap-2">
                    <span>{v.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void perform(async () => {
                          await auditApi("/views/" + v.id, undefined, "DELETE");
                          setViews((items) =>
                            items.filter((i) => i.id !== v.id),
                          );
                        })
                      }
                    >
                      {t.delete}
                    </Button>
                  </div>
                ))}
                <label>
                  {t.timezone}
                  <select
                    className={control}
                    value={timezone}
                    onChange={(e) =>
                      void perform(() => preferences(e.target.value))
                    }
                  >
                    {[
                      ...new Set([
                        "UTC",
                        "Asia/Aden",
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                        "Europe/London",
                        "America/New_York",
                        timezone,
                      ]),
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.density}
                  <select
                    className={control}
                    value={density}
                    onChange={(e) =>
                      void perform(() => preferences(timezone, e.target.value))
                    }
                  >
                    {["comfortable", "compact"].map((v) => (
                      <option value={v} key={v}>
                        {word(t, v)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-3">
                  {[
                    "time",
                    "actor",
                    "action",
                    "resource",
                    "outcome",
                    "changes",
                    "source",
                    "correlation",
                  ].map((c) => (
                    <label className="flex min-h-11 items-center gap-2" key={c}>
                      <input
                        type="checkbox"
                        checked={columns.includes(c)}
                        disabled={columns.length === 1 && columns.includes(c)}
                        onChange={(e) =>
                          void perform(() =>
                            preferences(
                              timezone,
                              density,
                              e.target.checked
                                ? [...columns, c]
                                : columns.filter((v) => v !== c),
                            ),
                          )
                        }
                      />
                      {word(t, c)}
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </section>
          {newEvents && (
            <Button
              variant="outline"
              onClick={() => {
                setCursor(undefined);
                setPrevious([]);
                setRefresh((n) => n + 1);
              }}
            >
              {t.newEvents}
            </Button>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <p>{error}</p>
              {current && <p className="mt-2 text-sm">{t.stale}</p>}
              <Button
                variant="outline"
                onClick={() => setRefresh((n) => n + 1)}
              >
                {t.retry}
              </Button>
            </div>
          )}
          {loading && !current ? (
            <div
              role="status"
              className="rounded-2xl border bg-white p-12 text-center"
            >
              {t.loading}
            </div>
          ) : !rows.length && !error ? (
            <div className="rounded-2xl border bg-white px-6 py-16 text-center">
              <ScrollText
                aria-hidden="true"
                className="mx-auto mb-4 size-10 text-muted-foreground"
              />
              <h2 className="font-semibold">
                {Object.values(filter).some(Boolean) ? t.noMatch : t.empty}
              </h2>
            </div>
          ) : (
            rows.length > 0 && (
              <div
                className="overflow-hidden rounded-2xl border bg-white"
                aria-busy={loading}
              >
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-start text-sm">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3">
                          <span className="sr-only">{t.select}</span>
                        </th>
                        {columns.map((c) => (
                          <th
                            key={c}
                            scope="col"
                            className="p-3 text-start font-medium"
                          >
                            {word(t, c)}
                          </th>
                        ))}
                        <th className="p-3 text-start">{t.details}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t align-top hover:bg-muted/30"
                        >
                          <td className="p-3">
                            <input
                              aria-label={`${t.select} ${row.id}`}
                              type="checkbox"
                              checked={selected.includes(row.id)}
                              onChange={(e) =>
                                setSelected((v) =>
                                  e.target.checked
                                    ? [...v, row.id]
                                    : v.filter((id) => id !== row.id),
                                )
                              }
                            />
                          </td>
                          {columns.map((c) => (
                            <td
                              key={c}
                              className={
                                (density === "compact" ? "px-3 py-2" : "p-3") +
                                " max-w-64 [overflow-wrap:anywhere]"
                              }
                            >
                              {c === "time" ? (
                                <span className="text-xs">
                                  {auditTime(row.occurredAt, locale, timezone)}
                                </span>
                              ) : c === "actor" ? (
                                <>
                                  <p className="font-medium">
                                    {row.actor.name ??
                                      word(
                                        t,
                                        row.actor.type === "anonymous"
                                          ? "anonymous"
                                          : row.actor.type,
                                      )}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {row.actor.roleKey ?? t.unrecorded}
                                  </p>
                                </>
                              ) : c === "action" ? (
                                <>
                                  <p className="font-medium">
                                    {auditLabel(row.action, locale)}
                                  </p>
                                  {row.historical && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {t.historical}
                                    </p>
                                  )}
                                </>
                              ) : c === "resource" ? (
                                <>
                                  <p className="text-xs text-muted-foreground">
                                    {word(t, row.resource.type)}
                                  </p>
                                  <bdi className="font-mono text-xs">
                                    {row.resource.reference ??
                                      row.resource.id ??
                                      t.unrecorded}
                                  </bdi>
                                </>
                              ) : c === "outcome" ? (
                                <Outcome value={row.outcome} t={t} />
                              ) : c === "changes" ? (
                                <ChangeSummary event={row} t={t} />
                              ) : c === "source" ? (
                                word(t, row.source)
                              ) : (
                                <bdi className="font-mono text-xs">
                                  {row.correlationId ?? t.unrecorded}
                                </bdi>
                              )}
                            </td>
                          ))}
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) =>
                                openEvent(row.id, e.currentTarget)
                              }
                              aria-label={`${t.details} ${row.resource.reference ?? row.id}`}
                            >
                              <ArrowUpRight
                                className="size-4"
                                aria-hidden="true"
                              />
                              {t.details}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y md:hidden">
                  {rows.map((row) => (
                    <article key={row.id} className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex min-h-11 items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            aria-label={`${t.select} ${row.id}`}
                            checked={selected.includes(row.id)}
                            onChange={(e) =>
                              setSelected((v) =>
                                e.target.checked
                                  ? [...v, row.id]
                                  : v.filter((id) => id !== row.id),
                              )
                            }
                          />
                          <time>
                            {auditTime(row.occurredAt, locale, timezone)}
                          </time>
                        </label>
                        <Outcome value={row.outcome} t={t} />
                      </div>
                      <h2 className="font-semibold">
                        {auditLabel(row.action, locale)}
                      </h2>
                      <p className="text-sm">
                        {row.actor.name ?? t.unrecorded} ·{" "}
                        <bdi className="[overflow-wrap:anywhere]">
                          {row.resource.reference ??
                            row.resource.id ??
                            t.unrecorded}
                        </bdi>
                      </p>
                      <ChangeSummary event={row} t={t} />
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={(e) => openEvent(row.id, e.currentTarget)}
                      >
                        {t.details}
                      </Button>
                    </article>
                  ))}
                </div>
              </div>
            )
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              {t.selected}: {selected.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!previous.length || loading}
                onClick={() => {
                  setCursor(previous.at(-1));
                  setPrevious((v) => v.slice(0, -1));
                }}
              >
                {t.previous}
              </Button>
              <Button
                variant="outline"
                disabled={!current?.nextCursor || loading}
                onClick={() => {
                  setPrevious((v) => [...v, cursor]);
                  setCursor(current!.nextCursor!);
                }}
              >
                {t.next}
              </Button>
            </div>
          </div>
        </>
      )}
      <Sheet
        open={!!eventId}
        onOpenChange={(open) => {
          if (!open) closeEvent();
        }}
      >
        <SheetContent
          side={locale === "ar" ? "left" : "right"}
          className="w-full overflow-y-auto sm:max-w-2xl motion-reduce:animate-none"
          dir={locale === "ar" ? "rtl" : "ltr"}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            focusOrigin.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>{t.details}</SheetTitle>
            <SheetDescription>
              {event ? auditLabel(event.action, locale) : t.loading}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-5 pb-8 [overflow-wrap:anywhere]">
            {detailLoading && <p role="status">{t.loading}</p>}
            {detailError && <p role="alert">{detailError}</p>}
            {event && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Outcome value={event.outcome} t={t} />
                  {event.historical && (
                    <span className="text-xs">{t.historical}</span>
                  )}
                </div>
                {event.resourceState === "deleted" && (
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    {t.deletedResource}
                  </p>
                )}
                {event.historical && (
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    {t.historicalHelp}
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    [t.actor, event.actor.name ?? word(t, event.actor.type)],
                    [t.roleKey, event.actor.roleKey ?? t.unrecorded],
                    [
                      t.resource,
                      event.resource.reference ??
                        event.resource.id ??
                        t.unrecorded,
                    ],
                    [t.time, auditTime(event.occurredAt, locale, timezone)],
                    [t.source, word(t, event.source)],
                    [
                      t.reason,
                      event.reasonCode
                        ? word(t, event.reasonCode)
                        : t.unrecorded,
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="mt-1 font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void perform(() =>
                        navigator.clipboard.writeText(event.id),
                      )
                    }
                  >
                    {t.copyId}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void perform(() =>
                        navigator.clipboard.writeText(
                          location.origin +
                            location.pathname +
                            "?event=" +
                            event.id,
                        ),
                      )
                    }
                  >
                    {t.copyLink}
                  </Button>
                  {event.resourceUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={"/" + locale + event.resourceUrl}>
                        {t.resourceLink}
                      </a>
                    </Button>
                  )}
                  {event.diagnosticUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={"/" + locale + event.diagnosticUrl}>
                        {t.diagnosticLink}
                      </a>
                    </Button>
                  )}
                </div>
                <section>
                  <h3 className="mb-3 font-semibold">{t.changes}</h3>
                  {event.changesTruncated && (
                    <p className="text-sm">{word(t, "truncated")}</p>
                  )}
                  {!event.changes.length ? (
                    <p className="text-sm text-muted-foreground">
                      {t.noChanges}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {event.changes.map((change) => (
                        <div
                          className="rounded-xl border p-3"
                          key={change.path}
                        >
                          <p className="mb-2 font-medium">
                            {word(t, change.path)}
                          </p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg bg-muted/60 p-2">
                              <p className="mb-1 text-xs text-muted-foreground">
                                {t.before}
                              </p>
                              <bdi>{auditValue(change.before, t)}</bdi>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-950">
                              <p className="mb-1 text-xs">{t.after}</p>
                              <bdi>{auditValue(change.after, t)}</bdi>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                {!!Object.keys(event.safeFields).length && (
                  <details>
                    <summary className="cursor-pointer py-2 text-sm">
                      {t.allFields}
                    </summary>
                    <dl>
                      {Object.entries(event.safeFields).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between gap-3 border-b py-2 text-sm"
                        >
                          <dt>{word(t, key)}</dt>
                          <dd>{auditValue(value, t)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
                <div className="flex flex-wrap gap-2">
                  {can(me, "audit.review") && (
                    <Button
                      variant="outline"
                      disabled={actionBusy}
                      onClick={() =>
                        void perform(async () => {
                          const enabled = !flags.includes(event.id);
                          await auditApi(
                            "/events/" + event.id + "/bookmark",
                            enabled,
                          );
                          setFlags((v) =>
                            enabled
                              ? [...v, event.id]
                              : v.filter((id) => id !== event.id),
                          );
                        })
                      }
                    >
                      {flags.includes(event.id) ? t.unflag : t.flag}
                    </Button>
                  )}
                  {can(me, "audit.cases.manage") && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelected([event.id]);
                        closeEvent();
                        setTab("reviews");
                      }}
                    >
                      {t.createCase}
                    </Button>
                  )}
                  {can(me, "audit.export") && (
                    <Button
                      variant="outline"
                      disabled={actionBusy}
                      onClick={() =>
                        void perform(() => report("html", [event.id]))
                      }
                    >
                      {t.print}
                    </Button>
                  )}
                </div>
                <section className="space-y-3 border-t pt-4">
                  <label className="text-sm">
                    {t.resourceTimeline}
                    <select
                      className={control}
                      value={relation}
                      onChange={(e) =>
                        setRelation(e.target.value as typeof relation)
                      }
                    >
                      <option value="resource">{t.resourceTimeline}</option>
                      {event.batchId && (
                        <option value="batch">{t.batchTimeline}</option>
                      )}
                      {event.correlationId && (
                        <option value="correlation">
                          {t.correlationTimeline}
                        </option>
                      )}
                    </select>
                  </label>
                  <RelatedTimeline
                    key={event.id + relation}
                    eventId={event.id}
                    kind={relation}
                    locale={locale}
                    timezone={timezone}
                    onEvent={openEvent}
                    fail={fail}
                  />
                </section>
                <details>
                  <summary className="cursor-pointer py-2 text-sm">
                    {t.technical}
                  </summary>
                  <pre
                    dir="ltr"
                    className="max-w-full overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs"
                  >
                    {JSON.stringify(
                      {
                        id: event.id,
                        schemaVersion: event.schemaVersion,
                        recordedAt: event.recordedAt,
                        correlationId: event.correlationId,
                        errorId: event.errorId,
                        batchId: event.batchId,
                        actor: event.actor,
                        context: event.context,
                        ...(event.ipHash ? { ipHash: event.ipHash } : {}),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
function ChangeSummary({ event, t }: { event: AuditEventV1; t: AuditCopy }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {event.changes.length
        ? event.changes.map((change) => (
            <p key={change.path}>
              {word(t, change.path)}: <bdi>{auditValue(change.before, t)}</bdi>{" "}
              → <bdi>{auditValue(change.after, t)}</bdi>
            </p>
          ))
        : event.reasonCode
          ? word(t, event.reasonCode)
          : t.noChanges}
    </div>
  );
}

function RelatedTimeline({
  eventId,
  kind,
  locale,
  timezone,
  onEvent,
  fail,
}: {
  eventId: string;
  kind: string;
  locale: "ar" | "en";
  timezone: string;
  onEvent: (id: string) => void;
  fail: (error: unknown) => string;
}) {
  const [rows, setRows] = useState<AuditEventV1[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [retry, setRetry] = useState(0),
    t = auditCopy[locale];
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void auditApi<AuditSearchResponse>(
      `/events/${eventId}/related?kind=${kind}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows((old) => (cursor ? [...old, ...result.rows] : result.rows));
        setNext(result.nextCursor);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(fail(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [eventId, kind, cursor, fail, retry]);
  return (
    <>
      {rows.map((row) => (
        <button
          key={row.id}
          className="block w-full rounded-lg border p-3 text-start text-sm hover:bg-muted focus-visible:outline"
          onClick={() => onEvent(row.id)}
        >
          <p>{auditLabel(row.action, locale)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {auditTime(row.occurredAt, locale, timezone)} ·{" "}
            {row.actor.name ?? t.unrecorded}
          </p>
        </button>
      ))}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
            {t.retry}
          </Button>
        </div>
      )}
      {next && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setCursor(next)}
        >
          {t.next}
        </Button>
      )}
    </>
  );
}
