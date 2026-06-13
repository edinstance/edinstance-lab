import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

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
      <span className="font-mono text-[.72rem] font-black uppercase leading-none">
        {label}
      </span>
      {children}
    </label>
  );
}
