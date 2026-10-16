import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
/** Shared AdminLTE navigation treatment; the caller owns link/action semantics. */
export function AdminNavigationItem({ active, className, ...props }: ComponentProps<typeof Slot> & {active?: boolean}) {
  return <Slot aria-current={active ? 'page' : undefined} className={cn(
    'admin-nav-link relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-(--duration-fast)',
    active ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', className,
  )} {...props} />;
}
