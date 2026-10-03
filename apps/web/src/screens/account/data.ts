import { useRouteLoaderData } from "react-router-dom";
import type { PublicView } from "@so7ob/contracts";
import { getPortalContent } from "@/content/portal";
export function useAccountView() {
  const data = useRouteLoaderData<PublicView>("root");
  if (!data || data.kind !== "account") throw new Error("Invalid account view");
  return { ...data, portal: getPortalContent(data.locale) };
}
