import { cn } from "../../lib/utils";
import type { ComponentProps } from "react";

const controlClass =
  "min-h-[44px] rounded-lg border border-[#45404f] bg-[#100e17] px-3 font-mono text-sm text-[#f0ebf5] outline-none transition placeholder:text-[#625b6d] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 disabled:cursor-not-allowed disabled:opacity-55";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export { controlClass };
