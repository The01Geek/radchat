import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MarkdownMessage, preprocessMarkdown } from './MarkdownMessage';
import { RenderContext, DEFAULT_RENDER_CONTEXT } from '../shared/context';

describe('MarkdownMessage', () => {
  it('splits an inline numbered list into a two-item list', () => {
    const { container } = render(<MarkdownMessage content={'1. first 2. second'} />);
    expect(container.querySelectorAll('li').length).toBe(2);
  });

  it('renders bold text and links as elements, not raw Markdown', () => {
    const { container } = render(<MarkdownMessage content={'**bold** and a [link](https://example.com)'} />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).not.toContain('**');
  });

  it('renders GitHub-flavored Markdown tables', () => {
    const md = '| Region | Sales |\n| --- | --- |\n| North - East | 10 |';
    const { container } = render(<MarkdownMessage content={md} />);
    expect(container.querySelectorAll('table td').length).toBe(2);
    expect(container.querySelector('td')?.textContent).toBe('North - East');
  });

  it('does not render raw HTML', () => {
    const { container } = render(<MarkdownMessage content={'<img src=x onerror="alert(1)"> hi'} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('drops javascript: links', () => {
    const { container } = render(<MarkdownMessage content={'[x](javascript:alert(1))'} />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href') ?? '').not.toContain('javascript');
  });

  it('lets the host intercept link clicks', () => {
    const onLinkClick = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    const { container } = render(
      <RenderContext.Provider value={{ ...DEFAULT_RENDER_CONTEXT, onLinkClick }}>
        <MarkdownMessage content={'[Report](https://example.com/report)'} />
      </RenderContext.Provider>,
    );
    const a = container.querySelector('a')!;
    expect(fireEvent.click(a)).toBe(false); // default prevented
    expect(onLinkClick).toHaveBeenCalledWith(expect.objectContaining({ href: 'https://example.com/report' }));
  });
});

describe('preprocessMarkdown', () => {
  it('leaves fenced code blocks untouched', () => {
    const md = 'Query:\n```sql\nSELECT a - b FROM t\n```';
    expect(preprocessMarkdown(md)).toBe(md);
  });

  it('leaves table rows and inline code untouched', () => {
    expect(preprocessMarkdown('| a - b | c |')).toBe('| a - b | c |');
    expect(preprocessMarkdown('Use `x - y` here')).toBe('Use `x - y` here');
  });

  it('splits inline bullet lists', () => {
    expect(preprocessMarkdown('Items: - one - two')).toBe('Items:\n- one\n- two');
  });
});
