/**
 * Theme helpers: validate the host's primary color and derive the CSS custom
 * properties the widget reads. Only validated values are written into styles.
 */
import type { CSSProperties } from 'react';

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'gray', 'grey', 'orange', 'purple', 'pink', 'brown', 'navy', 'teal',
  'olive', 'maroon', 'aqua', 'lime', 'silver', 'fuchsia', 'transparent',
]);

/**
 * Returns the color when it is a hex, rgb[a], hsl[a] or common named color,
 * otherwise null. Rejects anything that could inject further CSS.
 */
export function validateCSSColor(color: string | undefined | null): string | null {
  if (!color || typeof color !== 'string') return null;
  const value = color.trim();
  if (value.length > 100) return null;

  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value)) return value;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(value)) return value;
  if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(value)) return value;
  if (NAMED_COLORS.has(value.toLowerCase())) return value;

  console.warn('[RadChat] Ignoring invalid primaryColor:', value);
  return null;
}

/**
 * CSS variables for a primary color, scoped to one widget. Hover, dark and
 * light shades are mixed from the base color so a single option themes the
 * buttons, user bubbles and header gradient.
 */
export function themeVariables(primaryColor: string | undefined): CSSProperties {
  const color = validateCSSColor(primaryColor);
  if (!color) return {};
  return {
    '--radchat-primary-color': color,
    '--radchat-primary-color-hover': `color-mix(in srgb, ${color} 85%, black)`,
    '--radchat-primary-color-dark': `color-mix(in srgb, ${color} 75%, black)`,
    '--radchat-primary-color-light': `color-mix(in srgb, ${color} 12%, white)`,
  } as CSSProperties;
}
