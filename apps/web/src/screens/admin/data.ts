import { useRouteLoaderData } from "react-router-dom";
import type { PublicView } from "@so7ob/contracts";
export function useAdmin() {
  const data = useRouteLoaderData<PublicView>("root");
  if (!data || data.kind !== "admin")
    throw new Error("Invalid administrative view");
  return data;
}
