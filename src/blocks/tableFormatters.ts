/**
 * Number formatting for TableBlock cells.
 *
 * The backend decides the format of each column (`column_formats`); this
 * module only applies it. Locale and currency come from the widget options
 * (default `en-US` / `USD`).
 */
import type { ColumnFormat } from '../types';

export interface FormatSettings {
  locale?: string;
  currency?: string;
}

// Strict decimal pattern — rejects hex (0x1F), octal (0o17), binary (0b1111), scientific (1e5)
const DECIMAL_RE = /^\s*-?\d+(\.\d+)?\s*$/;

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(format: ColumnFormat, locale: string, currency: string): Intl.NumberFormat {
  const key = `${format}|${locale}|${currency}`;
  let fmt = formatterCache.get(key);
  if (fmt) return fmt;
  switch (format) {
    case 'currency':
      fmt = new Intl.NumberFormat(locale, { style: 'currency', currency });
      break;
    case 'integer':
      fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
      break;
    case 'average':
      fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      break;
    case 'percent':
      fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
      break;
    case 'general':
    default:
      fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
      break;
  }
  formatterCache.set(key, fmt);
  return fmt;
}

/** True when the string is a plain decimal number (no hex, exponent, or separators). */
export function isDecimalString(value: string | null | undefined): boolean {
  return value != null && DECIMAL_RE.test(value);
}

/**
 * Format a cell value using the backend-provided column format.
 *
 * @param value     Raw string value from the backend (can be null)
 * @param format    Backend-determined format ('currency', 'percent', etc.) or null
 * @param isNumeric Whether the column was detected as numeric
 * @param settings  Locale and currency; default en-US / USD
 * @returns Formatted display string (empty string if value is null)
 */
export function formatCellValue(
  value: string | null,
  format: string | null,
  isNumeric: boolean,
  settings: FormatSettings = {},
): string {
  if (value == null) return '';
  if (value.trim() === '') return value;

  // Non-numeric columns with no format hint — return raw
  if (!format && !isNumeric) return value;

  // Validate it's actually a decimal number before formatting
  if (!DECIMAL_RE.test(value)) return value;

  const num = Number(value);
  // Guard against NaN and Infinity
  if (isNaN(num) || !isFinite(num)) return value;

  const fmt = (format as ColumnFormat | null) ?? 'general';
  const locale = settings.locale ?? 'en-US';
  const currency = settings.currency ?? 'USD';

  switch (fmt) {
    case 'identity':
      return value;
    case 'percent':
      // Values are already percentages (not ratios) — don't multiply by 100
      return getFormatter('percent', locale, currency).format(num) + '%';
    case 'currency':
    case 'integer':
    case 'average':
    case 'general':
      return getFormatter(fmt, locale, currency).format(num);
    default:
      return getFormatter('general', locale, currency).format(num);
  }
}
