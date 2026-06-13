import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

const controlClass =
  "min-h-[42px] border border-[#9c927f] bg-[#fffdf7] px-3 font-mono text-base font-black text-[#17211b] disabled:cursor-not-allowed disabled:opacity-55";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export { controlClass };
