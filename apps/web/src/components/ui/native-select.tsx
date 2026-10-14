import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
/** Native keyboard, touch and form semantics with the same geometry as Input. */
export function NativeSelect({className,...props}: ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn("ds-control disabled:cursor-not-allowed disabled:opacity-50",className)} {...props}/>;
}
