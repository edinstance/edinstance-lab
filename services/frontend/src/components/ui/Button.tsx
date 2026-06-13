import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center border font-mono font-extrabold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "border-[#17211b] bg-[#17211b] text-[#fffdf7] hover:bg-[#315c52]",
        outline:
          "border-[#9c927f] bg-[#fffdf7e0] text-[#17211b] hover:border-[#17211b] hover:bg-[#17211b] hover:text-[#fffdf7]",
        destructive:
          "border-[#d65236] bg-transparent text-[#d65236] hover:bg-[#d65236] hover:text-white",
        ghost: "border-transparent bg-transparent text-[#17211b] hover:bg-[#17211b0f]",
      },
      size: {
        default: "min-h-[42px] px-3 text-[.72rem] uppercase",
        sm: "min-h-[30px] px-2.5 text-[.72rem]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
