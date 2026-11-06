import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartBlock } from './ChartBlock';

const plotProps = vi.hoisted(() => ({ last: undefined as Record<string, unknown> | undefined }));

vi.mock('plotly.js-basic-dist-min', () => ({ default: {} }));
vi.mock('react-plotly.js/factory', () => ({
  default: () => (props: Record<string, unknown>) => {
    plotProps.last = props;
    return <div data-testid="plot" />;
  },
}));

describe('ChartBlock', () => {
  beforeEach(() => {
    plotProps.last = undefined;
  });

  it('hides the mode bar and the Plotly cloud upload button by default', () => {
    render(<ChartBlock data={[{ type: 'bar', x: [1], y: [2] }]} />);
    expect(plotProps.last?.config).toEqual({
      responsive: true,
      displayModeBar: false,
      showSendToCloud: false,
    });
  });

  it('lets the host config override the defaults', () => {
    render(<ChartBlock data={[]} config={{ displayModeBar: true, showSendToCloud: true }} />);
    expect(plotProps.last?.config).toMatchObject({ displayModeBar: true, showSendToCloud: true });
  });

  it('always keeps autosize on and fills in default margins', () => {
    render(<ChartBlock data={[]} layout={{ autosize: false, title: { text: 'Sales' } }} />);
    expect(plotProps.last?.layout).toEqual({
      margin: { t: 40, r: 20, b: 40, l: 50 },
      title: { text: 'Sales' },
      autosize: true,
    });
  });
});
