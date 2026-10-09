# RadChat

An embeddable React chat widget for analytics and AI agents.

RadChat is the user interface only. It renders a chat window that can float, dock as a sidebar, or go fullscreen. It shows Markdown answers, tables, and Plotly charts, supports slash commands and file attachments, and keeps a conversation history. It never talks to a network by itself: you give it a small `ChatDataSource` object, and that object talks to your backend.

- **Three layouts.** Floating window, right-hand sidebar, and fullscreen, switchable from the menu.
- **Drag and resize.** The floating window drags by its header and resizes from all four edges and corners. Position, size, layout, open state, and the current conversation persist in `localStorage`.
- **Rich answers.** Markdown with GitHub-flavored tables, labelled disclosures (for example "Executed SQL"), formatted, collapsible tables with CSV download and a compact view, and Plotly charts that load lazily. Raw HTML is never rendered.
- **Slash commands.** Built-in `/help`, `/clear`, `/reset`, and `/history`, plus your own commands. A command can run in the browser or pass through to the backend. Autocomplete works from the keyboard.
- **Attachments.** Image, document, and camera pickers with count, size, and type limits. Files reach your data source as `data:` URIs.
- **History.** When the data source can list conversations, a History panel pages through them and reopens any one.
- **Themeable.** One `primaryColor` option, or override any `--radchat-*` CSS token.
- **Two builds.** An ES module for React apps, and a standalone UMD script (React included) for plain HTML pages.

## Try the demo

```bash
git clone https://github.com/The01Geek/radchat.git
cd radchat
npm install
npm run demo
```

Open the printed local URL. The demo runs on the built-in mock data source with synthetic data for a fictional coffee company. Nothing leaves the browser. Try "Show the revenue trend as a chart", "What are the top products?", `/help`, or `/sql select 1`.

## Install

RadChat is not published to npm yet. Install it from GitHub; the `prepare` script builds the library and the standalone script during install:

```bash
npm install github:The01Geek/radchat
```

You can also build a tarball from a clone with `npm pack` and install that file.

React 18.2+ or 19 is a peer dependency.

## Quick start

```tsx
import { ChatWidget, createMockDataSource } from 'radchat';
import 'radchat/style.css';

const dataSource = createMockDataSource();

export function App() {
  return <ChatWidget dataSource={dataSource} title="Assistant" />;
}
```

Create the data source once (outside the component or with `useMemo`). Replace the mock with your own data source when you are ready to connect a backend.

### Imperative control

Pass a `ref` to open the widget from your own buttons:

```tsx
import { useRef } from 'react';
import { ChatWidget, type ChatWidgetHandle } from 'radchat';

const chat = useRef<ChatWidgetHandle>(null);

<button onClick={() => chat.current?.open({ command: '/help' })}>Help</button>
<button onClick={() => chat.current?.open({ prefillInput: 'Summarize last week' })}>Ask</button>
<ChatWidget ref={chat} dataSource={dataSource} hideBubble />
```

The handle has `open(options?)`, `close()`, `toggle()`, `isOpen()`, `newConversation()`, and `setLayout(layout)`. `open` accepts `command` (run a slash command), `prefillInput` (fill the input without sending), and `startNewConversation`.

### Without React (standalone script)

```html
<link rel="stylesheet" href="radchat/dist/standalone/radchat.css" />
<script src="radchat/dist/standalone/radchat.umd.js"></script>
<div id="chat"></div>
<script>
  const chat = RadChat.mount(document.getElementById('chat'), {
    dataSource: RadChat.createFetchDataSource({ baseUrl: '/api/chat' }),
    title: 'Assistant',
  });
  // chat.open(), chat.update({ primaryColor: '#0f766e' }), chat.unmount()
</script>
```

`mount()` is also exported from the ES module for React apps that want to mount the widget outside their own tree.

## Connecting a backend

### The `ChatDataSource` interface

```ts
interface ChatDataSource {
  sendMessage(request: {
    conversationId: string | null; // null for the first turn
    text: string;
    attachments: ChatAttachment[];  // { id, type: 'image' | 'file', name, data (data: URI), size, mimeType? }
    signal: AbortSignal;            // aborted on new conversation or unmount
  }): Promise<{
    conversationId?: string;        // reused for the next turn
    blocks: Block[];
    sources?: { title: string; heading?: string; url?: string }[];
  }>;

  // Optional: restore a transcript after reload and when switching conversations.
  getConversation?(id: string, options?: { signal?: AbortSignal }): Promise<ChatMessage[]>;

  // Optional: enables the History menu item, panel, and /history command.
  listConversations?(page: number, pageSize: number, options?: { signal?: AbortSignal }):
    Promise<{ items: { id; preview; lastMessageAt; messageCount }[]; total: number }>;
}
```

Only `sendMessage` is required. Turns are sent one at a time, in order. If `sendMessage` rejects, the user sees a short, safe message (`formatError` lets you change it); error details are never shown.

### Answer blocks

An answer is a list of blocks:

| Block | Shape | Renders as |
| --- | --- | --- |
| Text | `{ type: 'text', content, label? }` | Markdown. With `label`, a collapsed disclosure such as "Executed SQL". |
| Table | `{ type: 'table', headers, rows, column_formats? }` | A formatted table with CSV download and a compact view. Cells are strings or `null`. Formats: `currency`, `percent` (values are percentages, e.g. `24.8`), `integer`, `identity`, `average`, `general`, or `null` to detect. |
| Chart | `{ type: 'chart', data, layout?, config? }` | A Plotly figure (traces and layout are passed through). Uses the `plotly.js-basic-dist-min` bundle: bar, line/scatter, and pie charts. |
| Custom | `{ type: 'anything-else', ... }` | Your renderer from `blockRenderers`. Unknown types without a renderer are skipped. |

An answer made only of plain text blocks renders as a single chat bubble. Anything else renders in a wider bubble that fits tables and charts.

### The built-in fetch adapter

`createFetchDataSource` implements the interface over a small JSON HTTP contract:

| Method | Path (relative to `baseUrl`) | Request | Response |
| --- | --- | --- | --- |
| `POST` | `messages` | `{ conversationId, text, attachments }` | `{ conversationId?, blocks, sources? }` |
| `GET` | `conversations/{id}` | | `{ messages: ChatMessage[] }` or a bare array |
| `GET` | `conversations?page=1&pageSize=20` | | `{ items, total }` |

```ts
import { createFetchDataSource } from 'radchat';

const dataSource = createFetchDataSource({
  baseUrl: '/api/chat',
  // Called for every request, so it can return a fresh token.
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  credentials: 'same-origin', // default
  // paths: { message: 'ask', conversation: (id) => `threads/${id}`, conversations: 'threads' },
  // history: false,          // backend has no conversation endpoints
});
```

Non-2xx responses throw an `HttpError` with `status` and the response `body` (for your logging). The default error text distinguishes sign-in problems (401/403), rate limits (429), network failures, and everything else.

### Connecting an analytics agent

A typical analytics agent produces some prose, the SQL it ran, a result set, and sometimes a chart. Map that to blocks in a thin endpoint next to your agent:

```ts
// POST /api/chat/messages  (server side, any framework)
const result = await agent.ask({ question: body.text, threadId: body.conversationId });

return {
  conversationId: result.threadId,
  blocks: [
    { type: 'text', content: result.summary },
    { type: 'text', label: 'Executed SQL', content: '```sql\n' + result.sql + '\n```' },
    { type: 'table', headers: result.columns, rows: result.rows.map((r) => r.map(String)) },
    ...(result.plotlyFigure ? [{ type: 'chart', ...result.plotlyFigure }] : []),
  ],
  sources: result.citations, // optional
};
```

If your agent already has its own client API, write a custom `ChatDataSource` instead of an HTTP endpoint. It is an object with one async function. Keep credentials on the server: RadChat sends whatever headers you configure, so do not embed long-lived secrets in browser code.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `dataSource` | required | See above. |
| `title` | `"Assistant"` | Header title and launcher label. |
| `welcomeMessage` | greeting | First assistant message (Markdown). |
| `placeholder` | `"Ask anything"` | Input placeholder. |
| `avatar` | neutral icon | React node shown beside assistant messages. |
| `primaryColor` | blue | Hex, rgb(a), hsl(a), or a named color. Hover and light shades are derived. |
| `position` | `bottom-right` | Launcher corner and initial floating position. |
| `layout` | `floating` | Initial layout until the user picks one. |
| `hideBubble` | `false` | Hide the launcher; open through the handle. |
| `initialOpen` | `false` | `true`, `false`, or `'remember'` (restore the last state). |
| `onOpenChange` | | Called with `true`/`false`. |
| `storageKey` | `"radchat"` | Prefix for persisted keys; `false` disables persistence. |
| `commands` | | Extra slash commands. |
| `builtInCommands` | all | Subset of `help`, `clear`, `reset`, `history`. |
| `enabledCommands` | all | Allowlist of command names (help always stays). |
| `unknownCommands` | `'error'` | `'send'` passes unknown `/commands` to the data source. |
| `attachments` | enabled | `{ sources, maxCount, maxBytes, documentExtensions }` or `false`. |
| `locale` / `currency` | `en-US` / `USD` | Table number formatting. |
| `blockRenderers` | | `{ [type]: (block) => ReactNode }` for custom blocks. |
| `onLinkClick` | | Intercept answer links; call `event.preventDefault()` to handle routing. |
| `formatError` | built-in | Turn a `sendMessage` failure into user-facing text. |

## Slash commands

Typing `/` opens autocomplete (arrow keys to move, Tab or Enter to complete, Escape to close). The built-ins:

| Command | Aliases | Action |
| --- | --- | --- |
| `/help` | `/h`, `/?` | Lists the enabled commands. |
| `/clear` | `/cls` | Clears the screen; the conversation continues. |
| `/reset` | `/new`, `/restart` | Starts a new conversation. |
| `/history` | | Opens History (only when `listConversations` exists). |

Add your own:

```tsx
const commands: ChatCommand[] = [
  // Runs in the browser.
  { name: 'time', description: 'Show the time', run: (ctx) => ctx.reply(new Date().toLocaleTimeString()) },
  // No run(): the full input ("/sql select 1") goes to the data source as a normal turn.
  { name: 'sql', description: 'Run a read-only query' },
  // Rewrite before sending.
  { name: 'explain', description: 'Explain a metric', run: (ctx) => ctx.send(`Explain the metric ${ctx.argText}`) },
];
```

The command context has `args`, `argText`, `input`, `reply(markdown)`, `replyBlocks(blocks)`, `send(text)`, `clearDisplay()`, `newConversation()`, `openHistory()`, `attachments`, `conversationId`, and `commands`. A host command with a built-in name replaces the built-in.

## Theming

Set `primaryColor` for the common case. For more control, override the CSS tokens on `:root` or on `.radchat-container`:

```css
:root {
  --radchat-primary-color: #0f766e;
  --radchat-background-color: #ffffff;
  --radchat-text-color: #1e293b;
  --radchat-border-color: #e2e8f0;
  --radchat-radius-lg: 12px;
}
```

`src/widget/chat.css` lists every token. All classes are prefixed `radchat-` (plus the `react-chatbot-kit-` classes of the underlying chat component), so they should not collide with the host page.

## Persistence

With the default `storageKey`, these `localStorage` keys are used:

| Key | Content |
| --- | --- |
| `radchat:geometry` | Floating position and size |
| `radchat:layout` | Last layout |
| `radchat:open` | Open state (only read with `initialOpen: 'remember'`) |
| `radchat:conversation` | Current conversation ID (restored only when `getConversation` exists) |

Use a different `storageKey` for each widget when a page has several. Messages themselves are never stored by RadChat; your backend owns the transcript.

## Accessibility

The window is a labelled dialog. The menu, layout choices, autocomplete, and History list use ARIA roles and work from the keyboard. Escape closes the menu, then History. Dragging and resizing are mouse-only; keyboard users can switch to the sidebar or fullscreen layouts from the menu. Reduced-motion preferences turn off animations.

## Known limitations

- Drag and resize use mouse events only (no touch or keyboard gestures yet).
- The chat transcript is built on `react-chatbot-kit` 2.2.2, which is no longer actively developed. RadChat wraps it behind its own controller so it can be replaced later.
- The standalone UMD bundle is large (about 1.6 MB minified) because it includes React and Plotly. The ES build loads Plotly lazily, only when a chart appears.
- Attachments are base64 `data:` URIs inside the JSON request, which suits files up to a few megabytes. For larger files, upload them separately and send a reference.
- UI strings are English. Number formatting follows `locale` and `currency`.

## Development

```bash
npm install
npm run demo        # demo with hot reload
npm run lint
npm run typecheck
npm test            # vitest + jsdom
npm run build       # library, standalone, and demo builds
npm run check       # all of the above
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

RadChat is licensed under the [Apache License, Version 2.0](LICENSE). Copyright 2026 Radman LLC. Bundled third-party code keeps its own licenses; see [NOTICE](NOTICE) and [LICENSES/THIRD-PARTY.txt](LICENSES/THIRD-PARTY.txt).
