/**
 * BlockRenderer — renders an assistant answer made of blocks.
 *
 * Built-in types are `text`, `table` and `chart`; any other type is passed to
 * the host's `blockRenderers[type]` and ignored when no renderer exists. Each
 * block renders inside its own error boundary so one malformed block cannot
 * break the rest of the answer or the widget.
 */
import React, { Component, Suspense, useEffect, type ReactNode } from 'react';
import { TextBlock } from './TextBlock';
import { TableBlock } from './TableBlock';
import { useRenderContext } from '../shared/context';
import type { Block, ChartBlock, ChatSource, CustomBlock, TableBlock as TableBlockData, TextBlock as TextBlockData } from '../types';
import './blocks.css';

const loadChartBlock = () => import('./ChartBlock');
const LazyChartBlock = React.lazy(loadChartBlock);

interface BlockRendererProps {
  blocks: Block[];
  sources?: ChatSource[];
}

class BlockErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[RadChat] A response block failed to render:', error);
  }

  render() {
    if (this.state.failed) {
      return <div className="radchat-block-error">This part of the answer could not be displayed.</div>;
    }
    return this.props.children;
  }
}

const isTextBlock = (b: Block): b is TextBlockData => b.type === 'text' && typeof b.content === 'string';
const isTableBlock = (b: Block): b is TableBlockData =>
  b.type === 'table' && Array.isArray(b.headers) && Array.isArray(b.rows);
const isChartBlock = (b: Block): b is ChartBlock => b.type === 'chart' && Array.isArray(b.data);

/** Only http(s) source links are rendered as links. */
const safeUrl = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);

export function SourcesList({ sources }: { sources: ChatSource[] }) {
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    const key = `${s.title}|${s.heading ?? ''}`;
    if (!s.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return null;
  return (
    <div className="radchat-sources">
      <div className="radchat-sources-title">Sources</div>
      <ul>
        {unique.map((s, i) => {
          const url = safeUrl(s.url);
          const label = (
            <>
              <strong>{s.title}</strong>
              {s.heading ? ` › ${s.heading}` : ''}
            </>
          );
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BlockRenderer({ blocks, sources }: BlockRendererProps) {
  const { blockRenderers } = useRenderContext();
  const hasChart = blocks.some((b) => b.type === 'chart');

  // Start fetching the chart chunk as soon as an answer contains a chart.
  useEffect(() => {
    if (hasChart) void loadChartBlock();
  }, [hasChart]);

  const renderBlock = (block: Block): ReactNode => {
    if (isTextBlock(block)) return <TextBlock content={block.content} label={block.label} />;
    if (isTableBlock(block)) {
      return <TableBlock headers={block.headers} rows={block.rows} columnFormats={block.column_formats} />;
    }
    if (isChartBlock(block)) {
      return (
        <Suspense fallback={<div className="radchat-block-chart-loading">Loading chart…</div>}>
          <LazyChartBlock data={block.data} layout={block.layout} config={block.config} />
        </Suspense>
      );
    }
    const custom = blockRenderers?.[block.type];
    return custom ? custom(block as CustomBlock) : null;
  };

  return (
    <div className="radchat-blocks">
      {blocks.map((block, i) => (
        <BlockErrorBoundary key={i}>{renderBlock(block)}</BlockErrorBoundary>
      ))}
      {sources && sources.length > 0 && <SourcesList sources={sources} />}
    </div>
  );
}
