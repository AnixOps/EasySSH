import { motion } from "motion/react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { duration, ease, enter, leave } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A modal on a dimmed, blurred backdrop, rendered into <body> so frosted
 *  ancestors cannot clip it. Place it inside <AnimatePresence> so it also
 *  animates out. Passing `onSubmit` makes the panel a form. */
export function Overlay({
  children,
  label,
  labelledBy,
  onDismiss,
  onSubmit,
  placement = "center",
  className,
}: {
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  onDismiss: () => void;
  onSubmit?: () => void;
  placement?: "center" | "top";
  className?: string;
}) {
  const panel = {
    role: "dialog",
    "aria-modal": true,
    "aria-label": label,
    "aria-labelledby": labelledBy,
    className: cn("w-full rounded-lg bg-bg-elevated shadow-3", className),
    initial: { opacity: 0, scale: 0.96, y: placement === "top" ? -6 : 8 },
    animate: { opacity: 1, scale: 1, y: 0, transition: enter },
    exit: { opacity: 0, scale: 0.98, y: placement === "top" ? -4 : 4, transition: leave },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      }
    },
  } as const;

  return createPortal(
    <motion.div
      className={cn(
        "fixed inset-0 z-modal flex justify-center bg-(--shadow-color) p-6 backdrop-blur-sm",
        placement === "top" ? "items-start pt-[12vh]" : "items-center",
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: duration.overlay, ease: ease.standard } }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: ease.exit } }}
      onMouseDown={(event) => event.target === event.currentTarget && onDismiss()}
    >
      {onSubmit ? (
        <motion.form
          {...panel}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </motion.form>
      ) : (
        <motion.div {...panel}>{children}</motion.div>
      )}
    </motion.div>,
    document.body,
  );
}
