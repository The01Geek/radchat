// Minimal declaration for the Plotly bundle, which ships no TypeScript types.
// Traces, layout and config are passed through from the data source unchanged.

declare module 'plotly.js-basic-dist-min' {
  const Plotly: unknown;
  export default Plotly;
}
