import { describe, expect, it, vi } from 'vitest';
import { computeResize } from './ResizeHandles';
import { themeVariables, validateCSSColor } from './theme';
import { createStorage } from './storage';

const limits = { minWidth: 300, minHeight: 400, maxWidth: 1000, maxHeight: 1200 };
const gesture = { startX: 500, startY: 500, startWidth: 350, startHeight: 500, startLeft: 100, startTop: 100 };

describe('computeResize', () => {
  it('grows to the right and down without moving', () => {
    expect(computeResize({ ...gesture, direction: 'bottom-right' }, { clientX: 550, clientY: 600 }, limits)).toEqual({
      width: 400,
      height: 600,
      x: 100,
      y: 100,
    });
  });

  it('keeps the right edge anchored when dragging the left edge', () => {
    const r = computeResize({ ...gesture, direction: 'left' }, { clientX: 450, clientY: 500 }, limits);
    expect(r.width).toBe(400);
    expect(r.x).toBe(50);
  });

  it('clamps to min and max sizes', () => {
    expect(computeResize({ ...gesture, direction: 'right' }, { clientX: 0, clientY: 0 }, limits).width).toBe(300);
    expect(computeResize({ ...gesture, direction: 'bottom' }, { clientX: 0, clientY: 5000 }, limits).height).toBe(1200);
  });

  it('never moves the window above or left of the viewport', () => {
    const r = computeResize({ ...gesture, direction: 'top-left' }, { clientX: -900, clientY: -900 }, limits);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});

describe('validateCSSColor', () => {
  it('accepts hex, rgb, hsl and named colors', () => {
    for (const c of ['#123', '#112233', '#11223344', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(200, 50%, 40%)', 'navy']) {
      expect(validateCSSColor(c)).toBe(c);
    }
  });

  it('rejects anything that could inject CSS', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const c of ['red;color:blue', 'url(x)', 'expression(alert(1))', '#12345', 'a'.repeat(200)]) {
      expect(validateCSSColor(c)).toBeNull();
    }
  });

  it('derives shade variables only for valid colors', () => {
    expect(themeVariables('#ff0000')).toMatchObject({ '--radchat-primary-color': '#ff0000' });
    expect(themeVariables(undefined)).toEqual({});
  });
});

describe('createStorage', () => {
  it('prefixes keys and round-trips JSON', () => {
    const s = createStorage('pfx');
    s.setJSON('geometry', { a: 1 });
    expect(localStorage.getItem('pfx:geometry')).toBe('{"a":1}');
    expect(s.getJSON('geometry')).toEqual({ a: 1 });
    s.remove('geometry');
    expect(s.get('geometry')).toBeNull();
  });

  it('ignores corrupt JSON and does nothing when disabled', () => {
    localStorage.setItem('radchat:geometry', '{oops');
    expect(createStorage(undefined).getJSON('geometry')).toBeNull();
    const off = createStorage(false);
    off.set('layout', 'sidebar');
    expect(localStorage.getItem('false:layout')).toBeNull();
    expect(off.get('layout')).toBeNull();
  });
});
