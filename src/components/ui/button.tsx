import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-[color,background-color,box-shadow,transform] duration-micro ease-standard active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        primary: "bg-accent-fill text-on-accent hover:bg-accent-fill-hover",
        secondary: "bg-fill-1 text-label-1 hover:bg-fill-2",
        ghost: "text-label-2 hover:bg-fill-1 hover:text-label-1",
        destructive: "bg-danger-fill text-on-danger hover:bg-danger-fill-hover",
      },
      size: {
        md: "h-9 px-4 text-callout",
        sm: "h-7 px-3 text-caption",
        icon: "size-9",
        "icon-sm": "size-7 rounded-xs",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
