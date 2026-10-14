import { NativeSelect } from "@/components/ui/native-select";
import { ListWorkspace, PageHeading, Toolbar } from "@/components/ui/workspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "@/routing/link";
import {
  can,
  type WorkflowScope,
  type WorkflowPublicStage,
} from "@so7ob/contracts";
import {
  Archive,
  ArchiveRestore,
  BookMarked,
  Download,
  Eye,
  MoreHorizontal,
  UserPlus,
  MessageSquare,
  Search,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ErrorFeedback } from "@/components/errors/error-feedback";
import { asApiError } from "@/lib/errors/transport";
import { getPortalContent } from "@/content/portal";
import type { Locale } from "@/lib/i18n";
import { StatusBadge, PriorityBadge } from "../badges";
import { AdminPagination } from "../pagination";
import { SavedRepliesDialog } from "../requests/saved-replies-dialog";
import {
  apiGet,
  apiSend,
  buildQuery,
  fmtRelative,
  fmtDateTime,
} from "../helpers";
import { downloadCsv } from "../download-csv";
import { useDebounced } from "../use-debounced";
import type { Me, RequestRow, InquiryRow, StaffOption } from "../types";
import { Field, wfControl, wfCard, words } from "./shared";
interface Filters {
  q: string;
  status: string;
  priority: string;
  service: string;
  category: string;
  assignee: string;
  team: string;
  stage: string;
  version: string;
  archived: boolean;
  overdue: boolean;
}
interface Row extends Omit<Partial<RequestRow & InquiryRow>, "id"> {
  id: string;
  workflowStage?: WorkflowPublicStage;
  workflowRevision?: number;
  teamId?: string | null;
}
interface Options {
  staff: StaffOption[];
  teams: Array<{ id: string; nameAr: string; nameEn: string }>;
  stages: Array<WorkflowPublicStage & { id: string; versionId: string }>;
}
interface Preset {
  id: string;
  name: string;
  filters: Filters;
}
const defaults: Filters = {
  q: "",
  status: "all",
  priority: "all",
  service: "all",
  category: "all",
  assignee: "all",
  team: "all",
  stage: "all",
  version: "all",
  archived: false,
  overdue: false,
};
export function ConversationList({
  scope,
  locale,
  me,
  initialStatus,
  initialOverdue,
}: {
  scope: WorkflowScope;
  locale: Locale;
  me: Me;
  initialStatus?: string;
  initialOverdue?: boolean;
}) {
  const t = words(locale),
    content = getPortalContent(locale),
    tr = content.admin.requests,
    ti = content.admin.inquiries,
    labels = scope === "requests" ? tr : ti,
    request = scope === "requests";
  const [filters, setFilters] = useState<Filters>({
      ...defaults,
      status: initialStatus ?? "all",
      overdue: !!initialOverdue,
    }),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [options, setOptions] = useState<Options>({
      staff: [],
      teams: [],
      stages: [],
    }),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [revision, setRevision] = useState(0),
    [repliesOpen, setRepliesOpen] = useState(false),
    [presetOpen, setPresetOpen] = useState(false),
    [presetName, setPresetName] = useState(""),
    [presets, setPresets] = useState<Preset[]>([]),
    [assignRow, setAssignRow] = useState<Row | null>(null),
    [notice, setNotice] = useState("");
  const mutex = useRef(false),
    q = useDebounced(filters.q),
    key = request ? `so7ob-req-presets:${me.id}` : `so7ob-inq-presets:${me.id}`;
  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
    setSelected([]);
  };
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
      setPresets(
        Array.isArray(raw)
          ? raw
              .filter(
                (v) =>
                  v &&
                  typeof v.id === "string" &&
                  typeof v.name === "string" &&
                  v.filters &&
                  typeof v.filters.status === "string",
              )
              .slice(-8)
              .map((v) => ({ ...v, filters: { ...defaults, ...v.filters } }))
          : [],
      );
    } catch {
      setPresets([]);
    }
  }, [key]);
  const query = buildQuery(
    Object.fromEntries(
      Object.entries({ ...filters, q, page }).map(([k, v]) => [
        k,
        v === "all" ? "" : v,
      ]),
    ),
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [result, opts] = await Promise.all([
          apiGet<{ requests?: Row[]; inquiries?: Row[]; total: number }>(
            `/api/admin/${scope}${query}`,
            signal,
          ),
          apiGet<Options>(
            "/api/admin/workflows/options?scope=" + scope,
            signal,
          ),
        ]);
        if (signal?.aborted) return;
        setRows((request ? result.requests : result.inquiries) ?? []);
        setTotal(result.total);
        setOptions(opts);
        setSelected([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [scope, query, request],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(e);
    });
    return () => controller.abort();
  }, [refresh, revision]);
  const mutate = async (
    url: string,
    method: "PATCH" | "POST",
    body: unknown,
  ) => {
    if (mutex.current || asApiError(error).uncertain) return false;
    mutex.current = true;
    setBusy(true);
    setError(null);
    try {
      await apiSend(url, method, body);
      await refresh();
      setNotice(t("تم حفظ التغيير", "Change saved"));
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      mutex.current = false;
      setBusy(false);
    }
  };
  const assign = async (row: Row, id: string | null) =>
    mutate(`/api/admin/${scope}/${row.id}`, "PATCH", {
      assigneeId: id,
      ...(row.workflowRevision !== undefined
        ? { expectedRevision: row.workflowRevision }
        : {}),
    });
  const mayArchive = can(
      me,
      request ? "requests.archive" : "inquiries.archive",
    ),
    mayAssign = can(me, request ? "requests.assign" : "inquiries.assign"),
    mayExport = can(me, request ? "requests.export" : "inquiries.export"),
    mayReplies = can(me, "requests.reply") || can(me, "inquiries.reply");
  const statuses = request ? tr.statuses : ti.statuses;
  const select = (
    name: string,
    value: string,
    onChange: (v: string) => void,
    choices: Array<[string, string]>,
  ) => (
    <Field title={name}>
      <NativeSelect
        className={wfControl}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
  const all = (
    name: string,
    entries: Record<string, string>,
  ): Array<[string, string]> => [
    ["all", tr.filterAll + " — " + name],
    ...Object.entries(entries),
  ];
  const status = (row: Row) => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge
        status={row.status ?? "new"}
        label={
          row.workflowStage?.[locale === "ar" ? "nameAr" : "nameEn"] ??
          statuses[row.status ?? "new"]
        }
      />
      {row.responseOverdue ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-2 py-1 text-xs text-warning-foreground">
          <Timer aria-hidden="true" className="size-3" />
          {tr.overdueReply}
        </span>
      ) : null}
    </div>
  );
  const actions = (row: Row) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-11"
          aria-label={t("إجراءات", "Actions") + " " + row.refCode}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/admin/${scope}/${row.id}`}>
            <Eye className="size-4" />
            {tr.viewDetails}
          </Link>
        </DropdownMenuItem>
        {mayAssign ? (
          <>
            <DropdownMenuItem
              disabled={busy || row.assigneeId === me.id}
              onSelect={() => void assign(row, me.id)}
            >
              <UserPlus className="size-4" />
              {tr.assignToMe}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => setAssignRow(row)}
            >
              {tr.assign}
            </DropdownMenuItem>
          </>
        ) : null}
        {mayArchive ? (
          <DropdownMenuItem
            disabled={busy}
            onSelect={() =>
              void mutate(`/api/admin/${scope}/${row.id}`, "PATCH", {
                action: filters.archived ? "restore" : "archive",
              })
            }
          >
            {filters.archived ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            {filters.archived ? tr.restore : tr.archive}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const check = (row: Row) => (
    <Checkbox
      checked={selected.includes(row.id)}
      onCheckedChange={(checked) =>
        setSelected((old) =>
          checked ? [...old, row.id] : old.filter((id) => id !== row.id),
        )
      }
      aria-label={t("تحديد", "Select") + " " + row.refCode}
    />
  );
  return (
    <div className="space-y-5">
      <PageHeading
        title={labels.title}
        description={labels.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
          {mayReplies ? (
            <Button variant="outline" onClick={() => setRepliesOpen(true)}>
              <BookMarked className="size-4" aria-hidden="true" />
              {content.admin.savedReplies.manage}
            </Button>
          ) : null}
          {mayExport ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (mutex.current) return;
                mutex.current = true;
                setBusy(true);
                try {
                  await downloadCsv(
                    `/api/admin/${scope}/export${query}`,
                    `so7ob-${scope}.csv`,
                  );
                  toast.success(labels.exportOk);
                } catch (e) {
                  toast.error(labels.exportFailed);
                  setError(e);
                } finally {
                  setBusy(false);
                  mutex.current = false;
                }
              }}
            >
              <Download className="size-4" aria-hidden="true" />
              {labels.export}
            </Button>
          ) : null}
        </div>
        }
      />
      <SavedRepliesDialog
        locale={locale}
        open={repliesOpen}
        onOpenChange={setRepliesOpen}
      />
      <ListWorkspace>
        <section
          className="ds-list-filters space-y-4"
          aria-label={t("البحث والتصفية", "Search and filters")}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field title={t("البحث", "Search")}>
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-3 size-4"
                aria-hidden="true"
              />
              <Input
                className="min-h-11 ps-9"
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder={tr.searchPlaceholder}
              />
            </div>
          </Field>
          {select(
            tr.filterStatus,
            filters.status,
            (v) => update({ status: v }),
            [
              ...all(tr.filterStatus, statuses),
              ...(!request
                ? [
                    ["open", content.admin.dashboard.openInquiries] as [
                      string,
                      string,
                    ],
                  ]
                : []),
            ],
          )}
          {request ? (
            <>
              {select(
                tr.filterPriority,
                filters.priority,
                (v) => update({ priority: v }),
                all(tr.filterPriority, tr.priorities),
              )}
              {select(
                tr.filterService,
                filters.service,
                (v) => update({ service: v }),
                all(tr.filterService, tr.services),
              )}
            </>
          ) : (
            select(
              ti.category,
              filters.category,
              (v) => update({ category: v }),
              all(ti.category, ti.categories),
            )
          )}
          {select(
            tr.filterAssignee,
            filters.assignee,
            (v) => update({ assignee: v }),
            [
              ["all", tr.filterAll],
              ["none", tr.unassigned],
              ...options.staff.map((s) => [s.id, s.name] as [string, string]),
            ],
          )}
          {select(
            t("الفريق", "Team"),
            filters.team,
            (v) => update({ team: v }),
            [
              ["all", tr.filterAll],
              ...options.teams.map(
                (s) =>
                  [s.id, s[locale === "ar" ? "nameAr" : "nameEn"]] as [
                    string,
                    string,
                  ],
              ),
            ],
          )}
          {select(
            t("المرحلة", "Stage"),
            filters.stage === "all"
              ? "all"
              : filters.version + ":" + filters.stage,
            (v) => {
              const [version, stage] = v.split(":");
              update(
                v === "all"
                  ? { version: "all", stage: "all" }
                  : { version, stage },
              );
            },
            [
              ["all", tr.filterAll],
              ...options.stages.map(
                (s) =>
                  [
                    s.versionId + ":" + s.id,
                    s[locale === "ar" ? "nameAr" : "nameEn"],
                  ] as [string, string],
              ),
            ],
          )}
        </div>
          <Toolbar className="ds-list-filters flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={filters.archived}
              onChange={(e) => update({ archived: e.target.checked })}
            />
            {tr.archived}
          </label>
            <Button
            variant={filters.overdue ? "default" : "outline"}
            aria-pressed={filters.overdue}
            onClick={() => update({ overdue: !filters.overdue })}
          >
            <Timer className="size-4" aria-hidden="true" />
            {tr.filterOverdue}
          </Button>
            <Button variant="outline" onClick={() => setPresetOpen(true)}>
            {tr.presetSave}
          </Button>
            <Button variant="ghost" onClick={() => update(defaults)}>
            {t("مسح التصفية", "Clear filters")}
          </Button>
          </Toolbar>
          {presets.length ? (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center rounded-xl border">
                <Button
                  variant="ghost"
                  onClick={() => update(p.filters)}
                  aria-label={tr.presetApply + " " + p.name}
                >
                  {p.name}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={tr.presetDelete + " " + p.name}
                  onClick={() => {
                    try {
                      const next = presets.filter((v) => v.id !== p.id);
                      localStorage.setItem(key, JSON.stringify(next));
                      setPresets(next);
                    } catch (e) {
                      setError(e);
                    }
                  }}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        </section>
        {error ? (
        <ErrorFeedback
          error={error}
          locale={locale}
          onRefresh={async () => {
            await refresh();
            setError(null);
          }}
        />
      ) : null}
        <p role="status" className="px-4 text-sm empty:hidden">
          {loading ? t("جارٍ التحميل…", "Loading…") : notice}
        </p>
        {mayArchive && selected.length ? (
        <Toolbar className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent p-3">
          <strong>
            {selected.length} {tr.selected}
          </strong>
          <Button
            disabled={busy}
            onClick={() =>
              void mutate(`/api/admin/${scope}/bulk`, "POST", {
                ids: selected,
                action: filters.archived ? "restore" : "archive",
              })
            }
          >
            {filters.archived ? tr.restore : tr.bulkArchive}
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            {content.admin.users.cancel}
          </Button>
        </Toolbar>
      ) : null}
        {!loading && !rows.length ? (
        <section className={wfCard}>
          <p>{labels.empty}</p>
          <Button variant="outline" onClick={() => update(defaults)}>
            {t("مسح التصفية", "Clear filters")}
          </Button>
        </section>
      ) : null}
        <div className={rows.length ? "hidden min-w-0 md:block" : "hidden"}>
          <Table className="min-w-[64rem] table-fixed [&_td]:whitespace-normal [&_td]:break-words [&_td]:[overflow-wrap:anywhere]">
            <TableHeader>
            <TableRow>
              {mayArchive ? (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t("تحديد كل الصفحة", "Select current page")}
                    checked={rows.length > 0 && selected.length === rows.length}
                    onCheckedChange={(v) =>
                      setSelected(v ? rows.map((r) => r.id) : [])
                    }
                  />
                </TableHead>
              ) : null}
              <TableHead className="w-[14%]">
                {content.account.requests.refCode}
              </TableHead>
              <TableHead className="w-[22%]">
                {request ? tr.client : ti.subject}
              </TableHead>
              <TableHead>{request ? tr.filterService : ti.category}</TableHead>
              <TableHead className="w-[16%]">{tr.filterStatus}</TableHead>
              {request ? <TableHead>{tr.priority}</TableHead> : null}
              <TableHead>{tr.filterAssignee}</TableHead>
              <TableHead>{tr.lastActivity}</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">{t("الإجراءات", "Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {mayArchive ? <TableCell>{check(row)}</TableCell> : null}
                  <TableCell>
                  <Link
                    className="inline-flex min-h-11 min-w-0 max-w-full items-center font-mono text-sm font-semibold underline-offset-4 hover:underline"
                    href={`/${locale}/admin/${scope}/${row.id}`}
                  >
                    <bdi className="min-w-0 break-all">{row.refCode}</bdi>
                  </Link>
                </TableCell>
                  <TableCell>
                  <p
                    className="line-clamp-2 font-medium"
                    title={request ? row.name : row.subject}
                  >
                    {request ? row.name : row.subject}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {request ? <bdi>{row.email}</bdi> : row.name}
                  </p>
                </TableCell>
                  <TableCell>
                  {request
                    ? (tr.services[row.serviceType ?? ""] ?? tr.none)
                    : ti.categories[row.category ?? ""]}
                </TableCell>
                  <TableCell>
                  {status(row)}
                  {row.responseDueAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDateTime(row.responseDueAt, locale)}
                    </p>
                  ) : null}
                </TableCell>
                  {request ? (
                  <TableCell>
                    <PriorityBadge
                      priority={row.priority ?? "normal"}
                      label={tr.priorities[row.priority ?? "normal"]}
                    />
                  </TableCell>
                ) : null}
                  <TableCell>
                    {row.assigneeName ?? tr.unassigned}
                    {row.teamId ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {
                          options.teams.find(
                            (team) => team.id === row.teamId,
                          )?.[locale === "ar" ? "nameAr" : "nameEn"]
                        }
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                  <p>{fmtRelative(row.lastActivityAt ?? "", locale)}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="size-3" aria-hidden="true" />
                    {row.messageCount} {tr.messages}
                  </span>
                </TableCell>
                  <TableCell>{actions(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {mayArchive && rows.length ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox
              aria-label={t("تحديد كل الصفحة", "Select current page")}
              checked={selected.length === rows.length}
              onCheckedChange={(v) =>
                setSelected(v ? rows.map((r) => r.id) : [])
              }
            />
            {t("تحديد كل الصفحة", "Select current page")}
          </label>
        ) : null}
          {rows.map((row) => (
          <article key={row.id} className={wfCard}>
            <div className="flex items-center justify-between gap-2">
              {mayArchive ? check(row) : null}
              <Link
                className="inline-flex min-h-11 min-w-0 max-w-full items-center font-mono font-semibold"
                href={`/${locale}/admin/${scope}/${row.id}`}
              >
                <bdi className="min-w-0 break-all">{row.refCode}</bdi>
              </Link>
              {actions(row)}
            </div>
            <p className="break-words text-base font-semibold">
              {request ? row.name : row.subject}
            </p>
            <p className="break-words text-sm text-muted-foreground">
              <bdi>{row.email}</bdi>
            </p>
            {status(row)}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>{tr.filterAssignee}</dt>
              <dd>{row.assigneeName ?? tr.unassigned}</dd>
              <dt>{request ? tr.filterService : ti.category}</dt>
              <dd>
                {request
                  ? (tr.services[row.serviceType ?? ""] ?? tr.none)
                  : ti.categories[row.category ?? ""]}
              </dd>
              {row.teamId ? (
                <>
                  <dt>{t("الفريق", "Team")}</dt>
                  <dd>
                    {options.teams.find((team) => team.id === row.teamId)?.[
                      locale === "ar" ? "nameAr" : "nameEn"
                    ] ?? tr.none}
                  </dd>
                </>
              ) : null}
              {row.responseDueAt ? (
                <>
                  <dt>{t("موعد الرد", "Response due")}</dt>
                  <dd>{fmtDateTime(row.responseDueAt, locale)}</dd>
                </>
              ) : null}
              <dt>{tr.lastActivity}</dt>
              <dd>{fmtRelative(row.lastActivityAt ?? "", locale)}</dd>
              {request ? (
                <>
                  <dt>{tr.priority}</dt>
                  <dd>{tr.priorities[row.priority ?? "normal"]}</dd>
                </>
              ) : null}
            </dl>
            <Link
              className="inline-flex min-h-11 items-center text-brand-strong underline"
              href={`/${locale}/admin/${scope}/${row.id}`}
            >
              {tr.viewDetails}
            </Link>
          </article>
        ))}
        </div>
        <AdminPagination
        page={page}
        total={total}
        pageSize={20}
        locale={locale}
        onPage={setPage}
      />
      </ListWorkspace>
      <Dialog open={presetOpen} onOpenChange={setPresetOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{tr.presetSave}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const next = [
                  ...presets,
                  { id: crypto.randomUUID(), name: presetName.trim(), filters },
                ].slice(-8);
                localStorage.setItem(key, JSON.stringify(next));
                setPresets(next);
                setPresetOpen(false);
                setPresetName("");
              } catch (e) {
                      setError(e);
                    }
            }}
          >
            <Field title={tr.presetName}>
              <Input
                maxLength={30}
                required
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </Field>
            <Button
              className="mt-4"
              disabled={!presetName.trim()}
              type="submit"
            >
              {tr.presetSave}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!assignRow}
        onOpenChange={(open) => {
          if (!open) setAssignRow(null);
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{tr.assign}</DialogTitle>
          </DialogHeader>
          {assignRow
            ? select(
                tr.filterAssignee,
                assignRow.assigneeId ?? "none",
                (v) => {
                  void assign(assignRow, v === "none" ? null : v).then((ok) => {
                    if (ok) setAssignRow(null);
                  });
                },
                [
                  ["none", tr.unassigned],
                  ...options.staff.map(
                    (s) => [s.id, s.name] as [string, string],
                  ),
                ],
              )
            : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
