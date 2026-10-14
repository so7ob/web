"use client";

/**
 * سياقات العرض المشتركة بين العارض والمحرر:
 *
 * - RenderModeContext: لوضع العرض الحالي.
 *   live — الموقع العام (كل التفاعلات حقيقية)،
 *   edit — لوحة الرسم (الغلاف الشفاف يمنع التفاعل)،
 *   test — اختبار تفاعل صريح: الروابط والنماذج تعمل لكن الإرسال محاكى
 *   ولا يصل أي طلب حقيقي إلى الخادم.
 *
 * - NestedBlockContext: الكتلة تُرسم داخل حاوية (section/container/row/column)
 *   فيُلغى غلافها الذاتي (Section/BlockContainer) — مسؤولية التباعد للحاوية
 *   وحدها فلا تتضاعف الحشوة ولا يتكرر عرض المحتوى الأقصى.
 */
import { createContext, useContext } from "react";
import type { DeviceKey } from "@so7ob/contracts";

/** Explicit editor/preview selection; public rendering follows the real viewport. */
export const PreviewDeviceContext = createContext<DeviceKey | undefined>(undefined);

export type RenderMode = "live" | "edit" | "test";

export const RenderModeContext = createContext<RenderMode>("live");

export function useRenderMode(): RenderMode {
  return useContext(RenderModeContext);
}

export const NestedBlockContext = createContext(false);

export function useIsNestedBlock(): boolean {
  return useContext(NestedBlockContext);
}
