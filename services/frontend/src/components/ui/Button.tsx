import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg border font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "border-[#8b5cf6] bg-[#8b5cf6] text-white hover:border-[#a66df2] hover:bg-[#a66df2]",
        outline:
          "border-[#494153] bg-[#211d2a] text-[#ece7f2] hover:border-[#6b5b7c] hover:bg-[#2a2434]",
        destructive:
          "border-[#9f404a] bg-transparent text-[#ff8d96] hover:bg-[#9f404a] hover:text-white",
        ghost:
          "border-transparent bg-transparent text-[#aaa2b5] hover:bg-white/5 hover:text-white",
      },
      size: {
        default: "min-h-[42px] px-4 text-sm",
        sm: "min-h-[30px] px-2.5 text-[.72rem]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
