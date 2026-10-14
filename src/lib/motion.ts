import type { Transition } from "motion/react";

/* Motion presets from the AnixOps Design motion tokens (guidelines/motion.md):
   120 ms micro, 200 ms toggle, 280 ms overlay, 240 ms page; standard,
   emphasized and exit easing. Only opacity and transform are animated, and
   MotionConfig reducedMotion="user" drops transforms when the system asks. */

export const ease = {
  standard: [0.25, 0.1, 0.25, 1],
  emphasized: [0.2, 0.8, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const duration = { micro: 0.12, toggle: 0.2, overlay: 0.28, page: 0.24 } as const;

/** Selection highlights sliding between items; settles in about 250 ms. */
export const slide: Transition = { type: "spring", stiffness: 520, damping: 44, mass: 0.9 };

/** Items making room for one another (layout animations). */
export const reflow: Transition = { type: "spring", stiffness: 420, damping: 40 };

export const enter: Transition = { duration: duration.overlay, ease: ease.emphasized };
export const leave: Transition = { duration: 0.16, ease: ease.exit };
export const toggle: Transition = { duration: duration.toggle, ease: ease.standard };

/** Small things appearing in place: rows, notices, list items. */
export const appear = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: toggle },
  exit: { opacity: 0, transition: { duration: duration.micro, ease: ease.exit } },
};
