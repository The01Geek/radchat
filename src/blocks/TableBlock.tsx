import { useState, useMemo } from 'react';
import { formatCellValue } from './tableFormatters';
import { useRenderContext } from '../shared/context';
import type { ColumnFormat } from '../types';

interface TableBlockProps {
  headers: string[];
  rows: (string | null)[][];
  columnFormats?: (ColumnFormat | null)[];
}

// Monospace stack for numeric columns — crisp alignment without extra deps
const MONO_FONT = "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace";

// ~10 visible rows in compact mode — balances data visibility with chat readability
const TABLE_MAX_HEIGHT = '400px';

// Strict decimal pattern — rejects hex (0x1F), octal (0o17), binary (0b1111), scientific (1e5)
const DECIMAL_RE = /^\s*-?\d+(\.\d+)?\s*$/;

/** Format DB column names for display: replace underscores/dashes with spaces, uppercase */
function formatHeader(header: string): string {
  return header.replace(/[_-]/g, ' ').toUpperCase();
}

/** Check if all non-empty values in a column are strict decimal numbers */
function isNumericColumn(rows: (string | null)[][], colIndex: number): boolean {
  let hasValue = false; // all-empty columns are not numeric
  for (const row of rows) {
    const val = row[colIndex];
    // Skip null, empty, and whitespace-only cells
    if (val == null || val.trim() === '') continue;
    // Strict validation — reject hex/octal/binary literals
    if (!DECIMAL_RE.test(val)) return false;
    hasValue = true;
  }
  return hasValue;
}

// Chevron for accordion collapse/expand
const ChevronIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 150ms ease', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Compact/expand SVG icons — inline to avoid icon library dependency
const CompactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

/**
 * RFC 4180 CSV escaping: wraps in quotes if value contains comma, quote, or newline;
 * doubles internal quotes. Coerces null/undefined to empty string since SQL results
 * frequently contain nulls.
 *
 * Cells a spreadsheet would treat as a formula (leading =, +, @, tab, CR, or a
 * "-" that is not part of a number) get an apostrophe prefix so an exported
 * file cannot run formulas when opened.
 */
export function escapeCsvValue(val: string | null | undefined): string {
  let str = String(val ?? '');
  if (/^[=+@\t\r]/.test(str) || (str.startsWith('-') && !/^-\d+(\.\d+)?$/.test(str))) {
    str = `'${str}`;
  }
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Exports table data as a CSV file. Handles proper escaping of values
 * containing commas, double quotes, and newlines per RFC 4180.
 */
function exportAsCsv(headers: string[], rows: (string | null)[][]): void {
  try {
    const lines = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'results.csv';
    a.click();
    // Defer revocation — browser downloads the blob asynchronously after click()
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (err) {
    // Surface error to console — widget context makes toast/modal impractical
    console.error('CSV export failed:', err);
  }
}

/**
 * Download icon for the export button. Stroke-based SVG matching codebase conventions.
 */
function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * TableBlock — renders tabular data from AI responses (e.g., SQL query results).
 * Features: CSV export, compact/expanded toggle, smart column sizing, numeric detection,
 * ellipsis truncation with hover tooltips, horizontal scroll for wide tables,
 * vertical scroll with sticky headers for large result sets.
 */
export function TableBlock({ headers, rows, columnFormats }: TableBlockProps) {
  const { locale, currency } = useRenderContext();
  const [compact, setCompact] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Detect numeric columns once, reuse across renders
  const numericCols = useMemo(
    () => headers.map((_, i) => isNumericColumn(rows, i)),
    [headers, rows],
  );

  const fontSize = compact ? '11px' : '13px';
  const cellPadding = compact ? '4px 8px' : '8px 12px';
  const headerPadding = compact ? '4px 8px' : '8px 12px';

  return (
    <div
      className="radchat-block-table"
      style={{
        borderRadius: '8px',
        border: '1px solid var(--radchat-border-color, #e2e8f0)',
        marginBottom: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar — accordion toggle left, action icons right */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '3px 6px',
        borderBottom: collapsed ? 'none' : '1px solid var(--radchat-border-color-light, #f1f5f9)',
        background: 'var(--radchat-background-tertiary, #f1f5f9)',
        borderRadius: collapsed ? '8px' : '8px 8px 0 0',
        cursor: 'pointer',
      }}
        onClick={() => setCollapsed((c) => !c)}
      >
        {/* Left: accordion chevron + header preview (keyboard-operable toggle) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand table" : "Collapse table"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setCollapsed((c) => !c);
            }
          }}
          style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--radchat-text-secondary, #64748b)',
          fontSize: '11px',
          fontWeight: 500,
        }}>
          <ChevronIcon collapsed={collapsed} />
          {collapsed && headers.length > 0 && (
            <span>{formatHeader(headers[0])}{headers.length > 1 ? ` + ${headers.length - 1} cols` : ''} ({rows.length} rows)</span>
          )}
        </div>

        {/* Right: action icons */}
        <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => exportAsCsv(headers, rows)}
            title="Export CSV"
            aria-label="Export CSV"
            style={{
              padding: '4px',
              border: 'none',
              borderRadius: '4px',
              background: 'transparent',
              color: 'var(--radchat-text-secondary, #64748b)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--radchat-background-color, #ffffff)';
              e.currentTarget.style.color = 'var(--radchat-primary-color, #2563eb)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--radchat-text-secondary, #64748b)';
            }}
          >
            <DownloadIcon />
          </button>

          <button
            type="button"
            onClick={() => setCompact((c) => !c)}
            title={compact ? "Show full cell text" : "Compact table"}
            aria-label={compact ? "Show full cell text" : "Compact table"}
            style={{
              padding: '4px',
              border: 'none',
              borderRadius: '4px',
              background: 'transparent',
              color: 'var(--radchat-text-secondary, #64748b)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--radchat-background-color, #ffffff)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {compact ? <ExpandIcon /> : <CompactIcon />}
          </button>
        </div>
      </div>

      {/* Collapsible table body — max height prevents large result sets from dominating the chat */}
      {!collapsed && <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: TABLE_MAX_HEIGHT }}>
        <table style={{
          width: '100%',
          // 'separate' instead of 'collapse' — collapsed borders break position:sticky in Chrome/Safari
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontSize,
          lineHeight: '1.5',
          color: 'var(--radchat-text-color, #1e293b)',
          transition: 'font-size 0.15s ease',
        }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  style={{
                    padding: headerPadding,
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: compact ? '10px' : '12px',
                    background: 'var(--radchat-background-tertiary, #f1f5f9)',
                    borderBottom: '1px solid var(--radchat-border-color, #e2e8f0)',
                    whiteSpace: 'nowrap',
                    color: 'var(--radchat-text-color, #1e293b)',
                    fontFamily: numericCols[i] ? MONO_FONT : 'inherit',
                    // Sticky header stays visible when scrolling vertically
                    position: 'sticky' as const,
                    top: 0,
                    zIndex: 1,
                    transition: 'padding 0.15s ease, font-size 0.15s ease',
                  }}
                >
                  {formatHeader(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0
                    ? 'var(--radchat-background-color, #ffffff)'
                    : 'var(--radchat-background-secondary, #f8fafc)',
                }}
              >
                {headers.map((_h, j) => {
                  const value = row[j] ?? '';
                  const isNumeric = numericCols[j];
                  // Format comes from the backend's column_formats; locale/currency from widget options
                  const displayValue = formatCellValue(value, columnFormats?.[j] ?? null, isNumeric, { locale, currency });
                  return (
                    <td
                      key={j}
                      title={value} // Always show raw DB value on hover
                      style={{
                        padding: cellPadding,
                        borderBottom: '1px solid var(--radchat-border-color-light, #f1f5f9)',
                        verticalAlign: 'top',
                        textAlign: 'left',
                        fontFamily: isNumeric ? MONO_FONT : 'inherit',
                        transition: 'padding 0.15s ease',
                        // Compact: truncate with ellipsis; Expanded: full text with generous min-width
                        ...(compact
                          ? { maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
                          : { minWidth: isNumeric ? undefined : '120px', overflowWrap: 'break-word' as const }),
                      }}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
