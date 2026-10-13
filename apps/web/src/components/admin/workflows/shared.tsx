import {
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import type { Locale } from "@/lib/i18n";
import { apiSend } from "../helpers";
export const wfControl =
  "min-h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60";
export const wfCard =
  "min-w-0 space-y-4 rounded-2xl border border-border bg-white p-4 sm:p-5";
export const words = (locale: Locale) => (ar: string, en: string) =>
  locale === "ar" ? ar : en;
export function Field({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-2 text-sm font-medium">
      <span>{title}</span>
      {isValidElement(children) && children.type !== "div"
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            "aria-label": title,
          })
        : children}
    </label>
  );
}
export const workflowPost = <T,>(path: string, payload: unknown) =>
  apiSend<T>("/api/admin/workflows/" + path, "POST", { payload });
