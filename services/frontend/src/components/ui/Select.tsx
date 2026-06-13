import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";
import { controlClass } from "./Input";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, className)} {...props} />;
}
