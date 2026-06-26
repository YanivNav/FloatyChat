// Shared magic strings, delays, and small helpers used across the widget.

export const RATE_LIMIT_MESSAGE =
  "You're sending messages too fast. Please wait a moment and try again.";
export const GENERIC_ERROR_MESSAGE = 'Sorry, something went wrong. Please try again.';

export const DEFAULT_PRIMARY_COLOR = '#116DFF';

/** Delay before focusing the input after the panel opens (lets the open animation settle). */
export const FOCUS_DELAY_MS = 300;
/** Max height the input textarea grows to before it starts scrolling. */
export const INPUT_MAX_HEIGHT_PX = 120;

/** Origin the widget's API routes are served from (same origin as the bundled script). */
export const apiOrigin = (): string => new URL(import.meta.url).origin;
