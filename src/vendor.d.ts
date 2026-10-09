// Minimal declarations for the Plotly packages, which ship no TypeScript types.
// Traces, layout and config are passed through from the data source unchanged.

declare module 'react-plotly.js/factory' {
  import type { ComponentType, CSSProperties } from 'react';

  export interface PlotProps {
    data: Record<string, unknown>[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    useResizeHandler?: boolean;
    style?: CSSProperties;
    className?: string;
  }

  export default function createPlotlyComponent(plotly: unknown): ComponentType<PlotProps>;
}

declare module 'plotly.js-basic-dist-min' {
  const Plotly: unknown;
  export default Plotly;
}
