/**
 * The demo page: a fake host page with controls on the left and the widget
 * running on the mock data source. Nothing leaves the browser.
 */
import { useMemo, useRef, useState } from 'react';
import {
  ChatWidget,
  createMockDataSource,
  type ChatCommand,
  type ChatWidgetHandle,
  type LayoutMode,
  type WidgetPosition,
} from '../src';
import './demo.css';

const STORAGE_KEY = 'radchat-demo';
const MOCK_STORE_KEY = 'radchat-demo:mock-conversations';

const COMMANDS: ChatCommand[] = [
  // Pass-through: no run(), so the text goes to the data source (the mock answers it).
  { name: 'sql', description: 'Run a read-only SQL query (handled by the data source)' },
  // Local command: runs in the browser.
  {
    name: 'time',
    description: 'Show the current time (runs locally)',
    run: (ctx) => ctx.reply(`It is **${new Date().toLocaleTimeString()}** in your browser.`),
  },
];

const COLORS = [
  { label: 'Blue (default)', value: '' },
  { label: 'Teal', value: '#0f766e' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Orange', value: '#c2410c' },
];

export function Demo() {
  const widget = useRef<ChatWidgetHandle>(null);
  const [latencyMs, setLatencyMs] = useState(700);
  const [position, setPosition] = useState<WidgetPosition>('bottom-right');
  const [primaryColor, setPrimaryColor] = useState('');
  const [attachments, setAttachments] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const dataSource = useMemo(() => createMockDataSource({ latencyMs, persistKey: MOCK_STORE_KEY }), [latencyMs]);

  const resetDemo = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_KEY))
      .forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  return (
    <main className="demo">
      <header className="demo-header">
        <h1>RadChat demo</h1>
        <p>
          The widget below runs on the built-in mock data source with synthetic data for a fictional coffee company.
          Try <em>"Show the revenue trend as a chart"</em>, <em>"What are the top products?"</em>, <code>/help</code>,
          or <code>/sql select 1</code>.
        </p>
      </header>

      <section className="demo-panel" aria-label="Demo controls">
        <h2>Widget</h2>
        <div className="demo-row">
          <button type="button" onClick={() => widget.current?.toggle()}>
            {isOpen ? 'Close' : 'Open'}
          </button>
          <button type="button" onClick={() => widget.current?.open({ command: '/help' })}>
            Open with /help
          </button>
          <button type="button" onClick={() => widget.current?.open({ prefillInput: 'Which month had the most orders?' })}>
            Open with a draft
          </button>
          <button type="button" onClick={() => widget.current?.newConversation()}>
            New conversation
          </button>
        </div>

        <h2>Layout</h2>
        <div className="demo-row">
          {(['floating', 'sidebar', 'fullscreen'] as LayoutMode[]).map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => {
                widget.current?.setLayout(mode);
                widget.current?.open();
              }}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <h2>Options</h2>
        <label className="demo-field">
          Launcher corner
          <select value={position} onChange={(e) => setPosition(e.target.value as WidgetPosition)}>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
          </select>
        </label>
        <label className="demo-field">
          Primary color
          <select value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}>
            {COLORS.map((c) => (
              <option key={c.label} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="demo-field">
          Mock latency: {latencyMs} ms
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            value={latencyMs}
            onChange={(e) => setLatencyMs(Number(e.target.value))}
          />
        </label>
        <label className="demo-check">
          <input type="checkbox" checked={attachments} onChange={(e) => setAttachments(e.target.checked)} />
          Attachments
        </label>

        <div className="demo-row">
          <button type="button" className="demo-secondary" onClick={resetDemo}>
            Reset demo storage
          </button>
        </div>
      </section>

      <ChatWidget
        ref={widget}
        dataSource={dataSource}
        title="Demo Assistant"
        welcomeMessage="Hi! I answer questions about **Acme Coffee Co.** sales from synthetic data. Type **/help** for commands."
        position={position}
        primaryColor={primaryColor || undefined}
        storageKey={STORAGE_KEY}
        initialOpen="remember"
        onOpenChange={setIsOpen}
        commands={COMMANDS}
        attachments={attachments ? {} : false}
      />
    </main>
  );
}
