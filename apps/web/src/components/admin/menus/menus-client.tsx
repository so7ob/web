"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  RotateCcw,
  ListTree,
  Eye,
  PanelTop,
  PanelBottom,
  Link2,
  FileText,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ar as siteAr } from "@/content/ar";
import { en as siteEn } from "@/content/en";
import { getPortalContent } from "@/content/portal";
import type { Locale } from "@/lib/i18n";
import {
  apiGet,
  apiSend,
  ApiError,
  apiErrorMessage,
} from "@/components/admin/helpers";
import { ConflictReview } from "../conflict-review";
import type { Me, MenuItemRow, MenusResponse } from "../types";

type Location = "header" | "footer";
type LinkType = "page" | "url";
interface EditableItem {
  key: string;
  labelAr: string;
  labelEn: string;
  url: string;
  pageSlug: string | null;
  enabled: boolean;
  linkType: LinkType;
}
type Drafts = Record<Location, EditableItem[]>;
const MAX_ITEMS = 12;
const toEditable = (rows: MenuItemRow[]): EditableItem[] =>
  rows.map((row) => ({
    key: row.id,
    labelAr: row.labelAr,
    labelEn: row.labelEn,
    url: row.url ?? "",
    pageSlug: row.pageSlug === null ? null : row.pageSlug || "/",
    enabled: row.enabled,
    linkType: row.pageSlug !== null ? "page" : "url",
  }));
const signature = (items: EditableItem[]) =>
  JSON.stringify(items.map(({ key: _key, ...item }) => item));

export function MenusClient({ me, locale }: { me: Me; locale: Locale }) {
  const t = getPortalContent(locale),
    tm = t.admin.menus;
  const [location, setLocation] = useState<Location>("header");
  const [drafts, setDrafts] = useState<Drafts>({ header: [], footer: [] });
  const [saved, setSaved] = useState<Record<Location, string>>({
    header: "[]",
    footer: "[]",
  });
  const [pages, setPages] = useState<MenusResponse["pages"]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<
    Partial<Record<Location, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState<
    Partial<Record<Location, boolean>>
  >({});
  const [revisions, setRevisions] = useState<Record<string, string>>({});
  const [conflictDraft, setConflictDraft] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const busy = useRef(false);
  const items = drafts[location];
  const dirty = {
    header: signature(drafts.header) !== saved.header,
    footer: signature(drafts.footer) !== saved.footer,
  };
  const anyDirty = dirty.header || dirty.footer;

  // A selected-location refresh must never replace the other location's draft or revision.
  const load = useCallback(
    async (target?: Location) => {
      if (!target) setLoading(true);
      else setRefreshing(true);
      setReadError(null);
      try {
        const res = await apiGet<MenusResponse>("/api/admin/menus");
        const next = {
          header: toEditable(res.header),
          footer: toEditable(res.footer),
        };
        setDrafts((prev) =>
          target ? { ...prev, [target]: next[target] } : next,
        );
        setSaved((prev) =>
          target
            ? { ...prev, [target]: signature(next[target]) }
            : {
                header: signature(next.header),
                footer: signature(next.footer),
              },
        );
        setRevisions((prev) =>
          target
            ? {
                ...prev,
                ["menu:" + target]: res.revisions["menu:" + target] ?? "0",
              }
            : res.revisions,
        );
        setExpanded((prev) => ({
          ...prev,
          ...Object.fromEntries(
            (target ? [target] : (["header", "footer"] as const)).flatMap(
              (key) =>
                next[key as Location]
                  .slice(0, 1)
                  .map((item) => [item.key, true]),
            ),
          ),
        }));
        setPages(res.pages);
        if (target) {
          setWriteError((prev) => ({ ...prev, [target]: undefined }));
          setRefreshNeeded((prev) => ({ ...prev, [target]: false }));
        }
        setLoaded(true);
        return true;
      } catch (err) {
        setReadError(apiErrorMessage(err, t.auth.errors));
        return false;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t.auth.errors],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const setItems = (update: (prev: EditableItem[]) => EditableItem[]) => {
    setDrafts((prev) => ({ ...prev, [location]: update(prev[location]) }));
    setWriteError((prev) => ({ ...prev, [location]: undefined }));
  };
  const updateItem = (key: string, patch: Partial<EditableItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
    setValidation((prev) => ({ ...prev, [key]: "" }));
  };
  const itemLabel = (item: EditableItem, lang: Locale = locale) =>
    (lang === "ar"
      ? item.labelAr.trim() || item.labelEn.trim()
      : item.labelEn.trim() || item.labelAr.trim()) || tm.newItem;
  const destination = (item: EditableItem) =>
    item.linkType === "page"
      ? item.pageSlug === "/"
        ? "/" + previewLocale
        : item.pageSlug
          ? `/${previewLocale}/${item.pageSlug}`
          : tm.pagesPlaceholder
      : item.url || tm.customUrl;
  const move = (key: string, direction: number) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.key === key),
        target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setAnnouncement(
      `${tm.moved}: ${itemLabel(items.find((item) => item.key === key)!)} (${items.findIndex((item) => item.key === key) + direction + 1})`,
    );
  };
  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    const key = crypto.randomUUID();
    setItems((prev) => [
      ...prev,
      {
        key,
        labelAr: "",
        labelEn: "",
        url: "",
        pageSlug: null,
        enabled: true,
        linkType: "page",
      },
    ]);
    setExpanded((prev) => ({ ...prev, [key]: true }));
    requestAnimationFrame(() =>
      document.getElementById(`label-ar-${items.length}`)?.focus(),
    );
  };
  const save = async () => {
    if (busy.current || refreshing || !loaded || refreshNeeded[location])
      return;
    const errors: Record<string, string> = {};
    for (const item of items) {
      if (!item.labelAr.trim() && !item.labelEn.trim())
        errors[item.key] = tm.labelRequired;
      else if (item.linkType === "page" && !item.pageSlug)
        errors[item.key] = tm.pagesPlaceholder;
      else if (
        item.linkType === "url" &&
        !/^(\/|https?:\/\/)/.test(item.url.trim())
      )
        errors[item.key] = tm.urlInvalid;
    }
    setValidation(errors);
    if (!items.length || Object.keys(errors).length) {
      if (!items.length)
        setWriteError((prev) => ({ ...prev, [location]: tm.emptyHint }));
      setExpanded((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.keys(errors).map((key) => [key, true])),
      }));
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('[data-menu-error="true"]')
          ?.focus(),
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setWriteError((prev) => ({ ...prev, [location]: undefined }));
    try {
      await apiSend("/api/v1/admin/menus/checked", "PUT", {
        baseRevision: revisions["menu:" + location] ?? "0",
        location,
        items: items.map((item) => ({
          labelAr: item.labelAr.trim(),
          labelEn: item.labelEn.trim(),
          url: item.linkType === "url" ? item.url.trim() : undefined,
          pageSlug: item.linkType === "page" ? item.pageSlug : undefined,
          enabled: item.enabled,
        })),
      });
      toast.success(tm.saved);
      if (!(await load(location)))
        setRefreshNeeded((prev) => ({ ...prev, [location]: true }));
    } catch (err) {
      setWriteError((prev) => ({
        ...prev,
        [location]: apiErrorMessage(err, t.auth.errors),
      }));
      if (err instanceof ApiError && err.code === "conflict")
        setConflictDraft({
          location,
          items,
          otherDraft: drafts[location === "header" ? "footer" : "header"],
        });
      if (err instanceof ApiError && err.uncertain)
        setRefreshNeeded((prev) => ({ ...prev, [location]: true }));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  if (loading)
    return (
      <section aria-label={tm.loading} aria-busy="true" className="space-y-5">
        <p role="status" className="sr-only">
          {tm.loading}
        </p>
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </section>
    );

  return (
    <div className="space-y-6">
      <ConflictReview
        locale={locale}
        storageKey={"so7ob-menus-conflict:" + me.id}
        captured={conflictDraft}
        remoteUrl="/api/admin/menus"
        onReload={async () => {
          await load(location);
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-primary/10 p-3 text-primary">
            <ListTree aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-navy">{tm.title}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {tm.subtitle}
            </p>
          </div>
        </div>
        <Button
          onClick={() => void save()}
          disabled={
            saving ||
            refreshing ||
            !loaded ||
            !dirty[location] ||
            !!refreshNeeded[location]
          }
          className="min-h-11 rounded-full"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {saving ? tm.saving : tm.save}
        </Button>
      </header>
      {readError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-destructive">{readError}</p>
          {!loaded && (
            <Button variant="outline" onClick={() => void load()}>
              <RotateCcw className="size-4" aria-hidden="true" />
              {tm.retry}
            </Button>
          )}
        </div>
      )}
      {loaded && (
        <Tabs
          value={location}
          onValueChange={(value) => {
            setLocation(value as Location);
            setAnnouncement("");
          }}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="space-y-5"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/40 p-2 sm:max-w-xl">
            {(["header", "footer"] as const).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                disabled={saving || refreshing}
                className="min-h-14 min-w-0 flex-wrap gap-2 rounded-xl px-3 py-3 text-sm data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm"
              >
                {key === "header" ? (
                  <PanelTop
                    className="hidden size-4 shrink-0 sm:block"
                    aria-hidden="true"
                  />
                ) : (
                  <PanelBottom
                    className="hidden size-4 shrink-0 sm:block"
                    aria-hidden="true"
                  />
                )}
                <span>{tm[key]}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">
                  {drafts[key].length}
                </span>
                {dirty[key] && (
                  <span
                    className="size-2 rounded-full bg-primary"
                    role="img"
                    aria-label={tm.unsaved}
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={location} className="space-y-4">
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2 font-medium text-navy">
                {dirty[location] ? (
                  <span className="size-2 rounded-full bg-primary" />
                ) : (
                  <Check className="size-4" aria-hidden="true" />
                )}
                {dirty[location] ? tm.unsaved : tm.upToDate}
              </span>
              <span className="text-muted-foreground">{tm.saveHint}</span>
            </div>
            {writeError[location] && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {writeError[location]}
              </p>
            )}
            {refreshNeeded[location] && (
              <div
                role="alert"
                className="space-y-3 rounded-xl border border-border bg-muted p-4"
              >
                <p className="text-sm">{tm.refreshNeeded}</p>
                <Button variant="outline" onClick={() => setReviewOpen(true)}>
                  {tm.reviewSaved}
                </Button>
              </div>
            )}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <section
                aria-labelledby="menu-items-title"
                className="min-w-0 rounded-2xl border border-border bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
                  <div>
                    <h2
                      id="menu-items-title"
                      tabIndex={-1}
                      className="font-semibold text-navy"
                    >
                      {tm.itemsTitle}{" "}
                      <span className="ms-2 text-sm font-normal text-muted-foreground">
                        {items.length} / {MAX_ITEMS}
                      </span>
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tm.itemsHint}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={add}
                    disabled={saving || refreshing || items.length >= MAX_ITEMS}
                    className="min-h-11 rounded-full"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {tm.add}
                  </Button>
                </div>
                <fieldset
                  disabled={saving || refreshing}
                  className="min-w-0 p-3 sm:p-4"
                >
                  <legend className="sr-only">{tm[location]}</legend>
                  {!items.length ? (
                    <div className="px-3 py-12 text-center">
                      <ListTree
                        className="mx-auto mb-3 size-9 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <h3 className="font-medium text-navy">{tm.emptyTitle}</h3>
                      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                        {tm.emptyHint}
                      </p>
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {items.map((item, index) => (
                        <li
                          key={item.key}
                          data-menu-item
                          className={`min-w-0 overflow-hidden rounded-xl border ${validation[item.key] ? "border-destructive" : "border-border"}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 bg-muted/20 p-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-sm tabular-nums text-muted-foreground">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              aria-expanded={!!expanded[item.key]}
                              aria-controls={`details-${item.key}`}
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [item.key]: !prev[item.key],
                                }))
                              }
                              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`${tm.editItem}: ${itemLabel(item)}`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block break-words font-medium text-navy">
                                  {itemLabel(item)}
                                </span>
                                <span
                                  className="mt-0.5 block truncate text-xs text-muted-foreground"
                                  dir="ltr"
                                >
                                  {destination(item)}
                                </span>
                              </span>
                              <ChevronDown
                                className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded[item.key] ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs ${item.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                            >
                              {item.enabled ? tm.visible : tm.hidden}
                            </span>
                            <div className="flex w-full justify-end gap-1 border-t border-border/60 pt-2 sm:w-auto sm:border-0 sm:pt-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-11"
                                disabled={index === 0}
                                onClick={() => move(item.key, -1)}
                                aria-label={`${t.admin.editor.moveUp}: ${itemLabel(item)}`}
                              >
                                <ChevronUp
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-11"
                                disabled={index === items.length - 1}
                                onClick={() => move(item.key, 1)}
                                aria-label={`${t.admin.editor.moveDown}: ${itemLabel(item)}`}
                              >
                                <ChevronDown
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-11 text-destructive hover:text-destructive"
                                onClick={() => setRemoveKey(item.key)}
                                aria-label={`${tm.remove}: ${itemLabel(item)}`}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                          <div
                            id={`details-${item.key}`}
                            hidden={!expanded[item.key]}
                            className="space-y-4 border-t border-border p-4"
                          >
                            {validation[item.key] && (
                              <p
                                tabIndex={-1}
                                data-menu-error="true"
                                id={`error-${item.key}`}
                                role="alert"
                                className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive focus-visible:outline focus-visible:outline-destructive"
                              >
                                {validation[item.key]}
                              </p>
                            )}
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`label-ar-${index}`}>
                                  {tm.labelAr}
                                </Label>
                                <Input
                                  id={`label-ar-${index}`}
                                  value={item.labelAr}
                                  onChange={(event) =>
                                    updateItem(item.key, {
                                      labelAr: event.target.value,
                                    })
                                  }
                                  maxLength={120}
                                  dir="rtl"
                                  className="min-h-11"
                                  aria-describedby={
                                    validation[item.key]
                                      ? `error-${item.key}`
                                      : `label-hint-${item.key}`
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`label-en-${index}`}>
                                  {tm.labelEn}
                                </Label>
                                <Input
                                  id={`label-en-${index}`}
                                  value={item.labelEn}
                                  onChange={(event) =>
                                    updateItem(item.key, {
                                      labelEn: event.target.value,
                                    })
                                  }
                                  maxLength={120}
                                  dir="ltr"
                                  className="min-h-11"
                                  aria-describedby={
                                    validation[item.key]
                                      ? `error-${item.key}`
                                      : `label-hint-${item.key}`
                                  }
                                />
                              </div>
                            </div>
                            <p
                              id={`label-hint-${item.key}`}
                              className="text-xs leading-5 text-muted-foreground"
                            >
                              {tm.labelHint}
                            </p>
                            <div className="space-y-2">
                              <Label id={`link-type-${item.key}`}>
                                {tm.linkType}
                              </Label>
                              <RadioGroup
                                aria-labelledby={`link-type-${item.key}`}
                                value={item.linkType}
                                onValueChange={(value) =>
                                  updateItem(item.key, {
                                    linkType: value as LinkType,
                                  })
                                }
                                dir={locale === "ar" ? "rtl" : "ltr"}
                                className="flex flex-wrap gap-3"
                              >
                                {(["page", "url"] as const).map((type) => (
                                  <label
                                    key={type}
                                    htmlFor={`link-${type}-${index}`}
                                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${item.linkType === type ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                                  >
                                    <RadioGroupItem
                                      value={type}
                                      id={`link-${type}-${index}`}
                                    />
                                    {type === "page" ? (
                                      <FileText
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Link2
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                    {type === "page"
                                      ? tm.pageLink
                                      : tm.customUrl}
                                  </label>
                                ))}
                              </RadioGroup>
                            </div>
                            {item.linkType === "page" ? (
                              <div className="space-y-2">
                                <Label htmlFor={`page-slug-${index}`}>
                                  {tm.pageLink}
                                </Label>
                                <Select
                                  value={item.pageSlug ?? ""}
                                  onValueChange={(value) =>
                                    updateItem(item.key, { pageSlug: value })
                                  }
                                >
                                  <SelectTrigger
                                    id={`page-slug-${index}`}
                                    className="min-h-11 w-full"
                                  >
                                    <SelectValue
                                      placeholder={tm.pagesPlaceholder}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {pages.map((page) => (
                                      <SelectItem
                                        key={page.slug || "/"}
                                        value={page.slug || "/"}
                                      >
                                        {locale === "en"
                                          ? page.titleEn
                                          : page.titleAr}{" "}
                                        ({page.slug || "/"})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Label htmlFor={`url-${index}`}>
                                  {tm.customUrl}
                                </Label>
                                <Input
                                  id={`url-${index}`}
                                  value={item.url}
                                  onChange={(event) =>
                                    updateItem(item.key, {
                                      url: event.target.value,
                                    })
                                  }
                                  maxLength={200}
                                  dir="ltr"
                                  className="min-h-11"
                                  placeholder={`/${locale}/services`}
                                  aria-describedby={`url-hint-${item.key}`}
                                />
                                <p
                                  id={`url-hint-${item.key}`}
                                  className="text-xs leading-5 text-muted-foreground"
                                >
                                  {tm.urlHint}
                                </p>
                              </div>
                            )}
                            <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3">
                              <Label
                                htmlFor={`enabled-${index}`}
                                className="cursor-pointer"
                              >
                                {tm.enabled}
                              </Label>
                              <Switch
                                id={`enabled-${index}`}
                                checked={item.enabled}
                                onCheckedChange={(enabled) =>
                                  updateItem(item.key, { enabled })
                                }
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    {tm.limitHint}
                  </p>
                </fieldset>
              </section>
              <aside
                aria-labelledby="menu-preview-title"
                className="min-w-0 rounded-2xl border border-border bg-white p-5 xl:sticky xl:top-6"
              >
                <h2
                  id="menu-preview-title"
                  className="flex items-center gap-2 font-semibold text-navy"
                >
                  <Eye className="size-4 text-primary" aria-hidden="true" />
                  {tm.preview}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {tm.previewHint}
                </p>
                <div
                  role="group"
                  aria-label={tm.previewLanguage}
                  className="my-4 flex gap-2"
                >
                  {(["ar", "en"] as const).map((lang) => (
                    <Button
                      key={lang}
                      variant={previewLocale === lang ? "default" : "outline"}
                      className="min-h-11 flex-1"
                      aria-pressed={previewLocale === lang}
                      onClick={() => setPreviewLocale(lang)}
                    >
                      {lang === "ar" ? "العربية" : "English"}
                    </Button>
                  ))}
                </div>
                <div
                  dir={previewLocale === "ar" ? "rtl" : "ltr"}
                  lang={previewLocale}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                  data-menu-preview
                >
                  <div className="mb-4 flex items-center gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
                    {location === "header" ? (
                      <PanelTop className="size-4" aria-hidden="true" />
                    ) : (
                      <PanelBottom className="size-4" aria-hidden="true" />
                    )}
                    {tm[location]} ·{" "}
                    {items.filter((item) => item.enabled).length} /{" "}
                    {items.length}
                  </div>
                  {items.some((item) => item.enabled) ? (
                    <ul
                      className={
                        location === "header"
                          ? "flex flex-wrap gap-2"
                          : "space-y-3"
                      }
                    >
                      {items
                        .filter((item) => item.enabled)
                        .map((item) => (
                          <li
                            key={item.key}
                            title={destination(item)}
                            className="max-w-full break-words rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
                          >
                            {(previewLocale === "ar"
                              ? item.labelAr
                              : item.labelEn
                            ).trim() || tm.missingLabel}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <>
                      <p className="mb-3 text-sm leading-6 text-muted-foreground">
                        {tm.fallbackHint}
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {(
                          [
                            "about",
                            "services",
                            "works",
                            "process",
                            "faq",
                            "contact",
                          ] as const
                        ).map((key) => (
                          <li
                            key={key}
                            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
                          >
                            {
                              (previewLocale === "ar" ? siteAr : siteEn).nav[
                                key
                              ]
                            }
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </aside>
            </div>
          </TabsContent>
        </Tabs>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <AlertDialog
        open={removeKey !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveKey(null);
        }}
      >
        <AlertDialogContent dir={locale === "ar" ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{tm.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeKey &&
                itemLabel(items.find((item) => item.key === removeKey)!)}{" "}
              — {tm.removeHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tm.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setItems((prev) =>
                  prev.filter((item) => item.key !== removeKey),
                );
                requestAnimationFrame(() =>
                  document.getElementById("menu-items-title")?.focus(),
                );
              }}
            >
              {tm.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent dir={locale === "ar" ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{tm.reloadTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tm.reloadHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            aria-label={tm.unsaved}
            readOnly
            value={JSON.stringify(items, null, 2)}
            rows={5}
            className="w-full rounded border p-2 text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{tm.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void load(location)}>
              {tm.reviewSaved}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
