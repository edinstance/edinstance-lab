import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className="text-xs leading-none font-semibold tracking-[.1em] text-[#8e8799] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
