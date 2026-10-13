import {
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import type { Locale } from "@/lib/i18n";
import { apiSend } from "../helpers";
export const wfControl = "ds-control disabled:opacity-60";
export const wfCard = "ds-panel space-y-4";
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
    <label className="ds-field">
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
