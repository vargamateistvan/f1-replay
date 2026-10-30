// Shared button styles. Use `buttonClass()` on anything that should look like a
// button (including router `<Link>`s); use `<Button>` for plain buttons.

/** `quiet`: low-emphasis bordered action for dense feeds and toolbars. */
export type ButtonVariant = "primary" | "secondary" | "quiet";
/**
 * `md`: dialog and page actions. `sm`: inline row actions (feeds, toolbars).
 * `block`: equal-width actions in a grid (fills its cell).
 */
export type ButtonSize = "md" | "sm" | "block";

/** Keyboard focus ring for custom controls that drop the default outline. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1red focus-visible:ring-offset-2 focus-visible:ring-offset-track";

const BASE = `inline-flex shrink-0 items-center justify-center gap-1.5 font-bold uppercase tracking-caps transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-f1red text-white hover:bg-f1red-hover",
  secondary:
    "border border-panel text-fg hover:border-f1red hover:text-f1red",
  quiet: "border border-panel text-muted hover:border-muted hover:text-fg",
};

const SIZE: Record<ButtonSize, string> = {
  md: "px-4 py-2 text-caption",
  sm: "h-6 px-2 text-tiny",
  block: "h-9 w-full px-2 text-caption",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}${className ? ` ${className}` : ""}`;
}
