import { describe, it, expect } from 'vitest';
import { formatCellValue } from './tableFormatters';

describe('formatCellValue', () => {
  // --- Format-driven rendering (backend provides format) ---
  describe('currency format', () => {
    it.each([
      ['1652408.97000', '$1,652,408.97'],
      ['29.99', '$29.99'],
      ['0', '$0.00'],
      ['-500.25', '-$500.25'],
      ['1000000000', '$1,000,000,000.00'],
    ])('renders %s as %s', (input, expected) => {
      expect(formatCellValue(input, 'currency', true)).toBe(expected);
    });
  });

  describe('percent format', () => {
    it.each([
      ['45.2', '45.2%'],
      ['12.0', '12%'],
      ['3.14159', '3.1%'],
      ['100', '100%'],
      ['-2.5', '-2.5%'],
      ['0', '0%'],
    ])('renders %s as %s', (input, expected) => {
      expect(formatCellValue(input, 'percent', true)).toBe(expected);
    });
  });

  describe('integer format', () => {
    it.each([
      ['47976', '47,976'],
      ['1000', '1,000'],
      ['5', '5'],
      ['0', '0'],
    ])('renders %s as %s', (input, expected) => {
      expect(formatCellValue(input, 'integer', true)).toBe(expected);
    });
  });

  describe('average format', () => {
    it.each([
      ['2430.66', '2,430.66'],
      ['100.5', '100.50'],
      ['3.0', '3.00'],
    ])('renders %s as %s', (input, expected) => {
      expect(formatCellValue(input, 'average', true)).toBe(expected);
    });
  });

  describe('identity format', () => {
    it.each([
      ['12345', '12345'],
      ['67890', '67890'],
    ])('returns raw value %s as %s', (input, expected) => {
      expect(formatCellValue(input, 'identity', true)).toBe(expected);
    });
  });

  describe('general format', () => {
    it.each([
      ['12345', '12,345'],
      ['8761.000000000', '8,761'],
      ['1000.50', '1,000.5'],
      ['0.123456', '0.123456'],
    ])('renders %s as %s', (input, expected) => {
      expect(formatCellValue(input, 'general', true)).toBe(expected);
    });
  });

  // --- Fallback: null format (no backend hint) ---
  describe('null format fallback', () => {
    it('applies general formatting to numeric columns', () => {
      expect(formatCellValue('12345', null, true)).toBe('12,345');
    });

    it('returns raw value for non-numeric columns', () => {
      expect(formatCellValue('12345', null, false)).toBe('12345');
    });
  });

  // --- Unknown format string fallback ---
  describe('unknown format fallback', () => {
    it('falls back to general for unrecognized format strings', () => {
      expect(formatCellValue('12345', 'unknown_format', true)).toBe('12,345');
    });
  });

  // --- Backend format overrides frontend numeric detection ---
  describe('format overrides isNumeric', () => {
    it('applies format even when isNumeric is false (backend hint takes precedence)', () => {
      expect(formatCellValue('12345', 'currency', false)).toBe('$12,345.00');
      expect(formatCellValue('45.2', 'percent', false)).toBe('45.2%');
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('returns empty string for null value', () => {
      expect(formatCellValue(null as unknown as string, 'currency', true)).toBe('');
    });

    it('returns empty string as-is', () => {
      expect(formatCellValue('', 'currency', true)).toBe('');
    });

    it('returns non-decimal value as-is', () => {
      expect(formatCellValue('N/A', 'currency', true)).toBe('N/A');
      expect(formatCellValue('NULL', 'integer', true)).toBe('NULL');
    });

    it('handles negative numbers', () => {
      expect(formatCellValue('-1500.50', 'currency', true)).toBe('-$1,500.50');
    });
  });
});

describe('formatCellValue — locale and currency settings', () => {
  it('uses the requested currency', () => {
    expect(formatCellValue('1234.5', 'currency', true, { locale: 'en-US', currency: 'EUR' })).toBe('€1,234.50');
  });

  it('uses the requested locale for grouping and decimals', () => {
    // de-DE groups with "." and uses "," for decimals.
    expect(formatCellValue('1234.5', 'average', true, { locale: 'de-DE' })).toBe('1.234,50');
    expect(formatCellValue('1234567', 'integer', true, { locale: 'de-DE' })).toBe('1.234.567');
  });

  it('defaults to en-US / USD when settings are omitted', () => {
    expect(formatCellValue('10', 'currency', true, {})).toBe('$10.00');
  });
});
