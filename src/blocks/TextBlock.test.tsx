import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { TextBlock } from './TextBlock';
import { RenderContext, DEFAULT_RENDER_CONTEXT } from '../shared/context';

const CONTENT = 'Read [Guide](https://example.com/guide) and [Top](#top).';

describe('TextBlock', () => {
  it('renders links in a new tab with noopener', () => {
    const { container } = render(<TextBlock content={CONTENT} />);
    for (const a of Array.from(container.querySelectorAll('a'))) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('hands link clicks to the host when it intercepts them', () => {
    const onLinkClick = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    const { container } = render(
      <RenderContext.Provider value={{ ...DEFAULT_RENDER_CONTEXT, onLinkClick }}>
        <TextBlock content={CONTENT} />
      </RenderContext.Provider>,
    );
    const a = Array.from(container.querySelectorAll('a')).find((el) => el.textContent === 'Guide')!;
    expect(fireEvent.click(a)).toBe(false);
    expect(onLinkClick).toHaveBeenCalledWith(expect.objectContaining({ href: 'https://example.com/guide' }));
  });

  it('collapses labelled content until the label is clicked', () => {
    render(<TextBlock label="Executed SQL" content={'```sql\nSELECT 1\n```'} />);
    const toggle = screen.getByRole('button', { name: /Executed SQL/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('SELECT 1')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('SELECT 1')).toBeInTheDocument();
  });
});
