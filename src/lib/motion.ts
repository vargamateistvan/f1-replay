import * as animejs from "animejs";

export const MOTION = {
  duration: {
    fast: 180,
    medium: 340,
    slow: 420,
    panel: 520,
    route: 420,
  },
  stagger: {
    row: 22,
    chip: 14,
    bar: 16,
  },
  translate: {
    enter: 18,
    row: 16,
  },
  scale: {
    badge: 0.88,
  },
  easing: {
    strong: "out(4)",
    soft: "out(2)",
  },
} as const;

type MotionParams = Parameters<typeof animejs.animate>[1];
type MotionTargets = Parameters<typeof animejs.animate>[0];

function mergeMotion(
  defaults: MotionParams,
  overrides: Partial<MotionParams> = {},
): MotionParams {
  return { ...defaults, ...overrides } as MotionParams;
}

export function prefersReducedMotion() {
  return (
    typeof window === "undefined" ||
    !("matchMedia" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function motionEnabled() {
  return !prefersReducedMotion();
}

export function animateMotion(
  targets: MotionTargets | null | undefined,
  params: MotionParams,
) {
  if (!motionEnabled()) return null;
  if (targets === null || targets === undefined) return null;
  return animejs.animate(targets, params);
}

export function fadeUpMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0, 1],
      translateY: [MOTION.translate.enter, 0],
      duration: MOTION.duration.route,
      ease: MOTION.easing.strong,
    },
    overrides,
  );
}

export function staggerFadeUpMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0, 1],
      translateY: [MOTION.translate.row, 0],
      duration: MOTION.duration.panel,
      delay: animejs.stagger(MOTION.stagger.row),
      ease: MOTION.easing.strong,
    },
    overrides,
  );
}

export function pulseMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0.45, 1],
      scale: [MOTION.scale.badge, 1],
      duration: MOTION.duration.fast,
      ease: MOTION.easing.soft,
    },
    overrides,
  );
}

export function pressMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      scale: [1, 0.96, 1],
      duration: MOTION.duration.medium,
      ease: MOTION.easing.strong,
    },
    overrides,
  );
}

export function barRevealMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0, 1],
      scaleX: [0.96, 1],
      duration: MOTION.duration.medium,
      delay: animejs.stagger(MOTION.stagger.bar),
      ease: MOTION.easing.strong,
    },
    overrides,
  );
}

export function routeEnterMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0, 1],
      translateY: [MOTION.translate.enter, 0],
      duration: MOTION.duration.route,
      ease: MOTION.easing.strong,
    },
    overrides,
  );
}

export function modalBackdropMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0, 1],
      duration: MOTION.duration.medium,
      ease: MOTION.easing.soft,
    },
    overrides,
  );
}

export function modalPanelMotion(overrides: Partial<MotionParams> = {}) {
  return mergeMotion(
    {
      opacity: [0, 1],
      translateY: [MOTION.translate.enter + 4, 0],
      scale: [0.96, 1],
      duration: MOTION.duration.panel,
      ease: MOTION.easing.strong,
    },
    overrides,
  );
}

export const stagger = animejs.stagger;
