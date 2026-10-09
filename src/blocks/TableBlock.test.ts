/**
 * Tests for TableBlock CSV export utilities.
 * Covers RFC 4180 escaping, null/undefined coercion, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { escapeCsvValue } from './TableBlock';

describe('escapeCsvValue', () => {
  it('returns plain strings unchanged', () => {
    expect(escapeCsvValue('hello')).toBe('hello');
    expect(escapeCsvValue('42')).toBe('42');
  });

  it('wraps values containing commas in quotes', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
  });

  it('wraps values containing double quotes and doubles internal quotes', () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps values containing newlines', () => {
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvValue('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('handles combined special characters', () => {
    expect(escapeCsvValue('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  // SQL results frequently contain null values
  it('coerces null to empty string', () => {
    expect(escapeCsvValue(null)).toBe('');
  });

  it('coerces undefined to empty string', () => {
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(escapeCsvValue('')).toBe('');
  });
});

describe('escapeCsvValue — spreadsheet formula neutralization', () => {
  it('prefixes values that start like a formula', () => {
    expect(escapeCsvValue('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvValue('+1+1')).toBe("'+1+1");
    expect(escapeCsvValue('@cmd')).toBe("'@cmd");
    expect(escapeCsvValue('-x')).toBe("'-x");
  });

  it('keeps negative numbers unchanged', () => {
    expect(escapeCsvValue('-500.25')).toBe('-500.25');
    expect(escapeCsvValue('-3')).toBe('-3');
  });
});
