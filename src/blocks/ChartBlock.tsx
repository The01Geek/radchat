/**
 * ChartBlock — renders a Plotly figure. Loaded lazily by BlockRenderer so the
 * Plotly bundle is only fetched when the first chart arrives.
 */
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';

const Plot = createPlotlyComponent(Plotly);

interface ChartBlockProps {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export function ChartBlock({ data, layout, config }: ChartBlockProps) {
  return (
    <div className="radchat-block-chart">
      <Plot
        data={data}
        layout={{ margin: { t: 40, r: 20, b: 40, l: 50 }, ...layout, autosize: true }}
        config={{ responsive: true, displayModeBar: false, ...config }}
        useResizeHandler
        style={{ width: '100%' }}
      />
    </div>
  );
}

export default ChartBlock;
