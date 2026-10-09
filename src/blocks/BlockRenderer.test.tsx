import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlockRenderer } from './BlockRenderer';
import { RenderContext, DEFAULT_RENDER_CONTEXT } from '../shared/context';
import type { Block } from '../types';

vi.mock('./ChartBlock', () => ({ default: () => <div data-testid="chart" />, ChartBlock: () => <div data-testid="chart" /> }));

describe('BlockRenderer', () => {
  it('renders text, table and sources', () => {
    render(
      <BlockRenderer
        blocks={[
          { type: 'text', content: 'Intro **bold**' },
          { type: 'table', headers: ['Name', 'Total'], rows: [['A', '1200.5']], column_formats: [null, 'currency'] },
        ]}
        sources={[
          { title: 'Docs', url: 'https://example.com/docs' },
          { title: 'Docs', url: 'https://example.com/docs' },
          { title: 'Unsafe', url: 'javascript:alert(1)' },
        ]}
      />,
    );
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('$1,200.50')).toBeInTheDocument();
    expect(screen.getAllByText('Docs')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://example.com/docs');
    expect(screen.getByText('Unsafe').closest('a')).toBeNull();
  });

  it('renders charts lazily', async () => {
    render(<BlockRenderer blocks={[{ type: 'chart', data: [{ type: 'bar', x: [1], y: [2] }] }]} />);
    expect(await screen.findByTestId('chart')).toBeInTheDocument();
  });

  it('uses host renderers for custom block types and skips unknown ones', () => {
    render(
      <RenderContext.Provider
        value={{ ...DEFAULT_RENDER_CONTEXT, blockRenderers: { status: (b) => <span>Status: {String(b.value)}</span> } }}
      >
        <BlockRenderer blocks={[{ type: 'status', value: 'green' }, { type: 'mystery' }]} />
      </RenderContext.Provider>,
    );
    expect(screen.getByText('Status: green')).toBeInTheDocument();
  });

  it('contains a failing block with an error boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const blocks: Block[] = [
      { type: 'boom' },
      { type: 'text', content: 'still here' },
    ];
    render(
      <RenderContext.Provider
        value={{
          ...DEFAULT_RENDER_CONTEXT,
          blockRenderers: {
            boom: () => {
              const Thrower = () => {
                throw new Error('bad block');
              };
              return <Thrower />;
            },
          },
        }}
      >
        <BlockRenderer blocks={blocks} />
      </RenderContext.Provider>,
    );
    expect(screen.getByText('This part of the answer could not be displayed.')).toBeInTheDocument();
    expect(screen.getByText('still here')).toBeInTheDocument();
  });
});
