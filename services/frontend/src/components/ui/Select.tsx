import { cn } from "../../lib/utils";
import { controlClass } from "./Input";
import type { ComponentProps } from "react";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, className)} {...props} />;
}
