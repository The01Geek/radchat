/**
 * Public data model for RadChat.
 *
 * The widget never talks to a network on its own. A host application passes a
 * {@link ChatDataSource}; the widget calls it for each user turn and, when the
 * optional methods exist, to restore and list past conversations.
 */
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Response blocks
// ---------------------------------------------------------------------------

/** Number formats a table column can request. `null` means "detect". */
export type ColumnFormat = 'currency' | 'percent' | 'integer' | 'identity' | 'average' | 'general';

/** Markdown text. When `label` is set the block renders as a collapsed disclosure (e.g. "Executed SQL"). */
export interface TextBlock {
  type: 'text';
  content: string;
  label?: string;
}

/** Tabular result. Cells are strings (or null) so the host controls precision. */
export interface TableBlock {
  type: 'table';
  headers: string[];
  rows: (string | null)[][];
  /** One entry per column. Numeric columns without a format use `general`. */
  column_formats?: (ColumnFormat | null)[];
}

/** A Plotly figure: `data` traces, `layout`, optional `config`. Rendered with plotly.js-basic-dist-min. */
export interface ChartBlock {
  type: 'chart';
  // Plotly's own types are not a dependency; traces and layout are passed through unchanged.
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

/** Any block type the host renders itself through `blockRenderers`. */
export interface CustomBlock {
  type: string;
  [key: string]: unknown;
}

export type BuiltInBlock = TextBlock | TableBlock | ChartBlock;
export type Block = BuiltInBlock | CustomBlock;

/** A document or record the answer was based on. Rendered as a "Sources" list. */
export interface ChatSource {
  title: string;
  /** Optional section within the source. */
  heading?: string;
  /** Optional http(s) link. Other schemes are ignored. */
  url?: string;
}

// ---------------------------------------------------------------------------
// Messages and attachments
// ---------------------------------------------------------------------------

export type AttachmentType = 'image' | 'file';

/** A file the user attached to a message. `data` is a `data:` URI (base64). */
export interface ChatAttachment {
  id: string;
  type: AttachmentType;
  name: string;
  data: string;
  size: number;
  mimeType?: string;
}

/** Name and type only; what the transcript shows for an attachment. */
export interface AttachmentSummary {
  type: AttachmentType | string;
  name: string;
}

/** One stored turn, used to restore a conversation. */
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  /** Plain Markdown text. Assistant turns may use `blocks` instead (or as well). */
  text?: string;
  blocks?: Block[];
  sources?: ChatSource[];
  attachments?: AttachmentSummary[];
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

export interface SendMessageRequest {
  /** `null` for the first turn of a new conversation. */
  conversationId: string | null;
  text: string;
  attachments: ChatAttachment[];
  /** Aborted when the user starts a new conversation or the widget unmounts. */
  signal: AbortSignal;
}

export interface SendMessageResponse {
  /** The conversation this turn belongs to. Returned IDs are reused for later turns. */
  conversationId?: string;
  blocks: Block[];
  sources?: ChatSource[];
}

export interface ConversationSummary {
  id: string;
  /** First user message or a title; shown in the History list. */
  preview: string | null;
  /** ISO timestamp of the latest message (or of creation). */
  lastMessageAt: string | null;
  messageCount: number;
}

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
}

/**
 * The only integration point between RadChat and a backend.
 *
 * Only `sendMessage` is required. Optional methods enable features:
 * - `getConversation` restores the transcript after a reload and when switching conversations.
 * - `listConversations` shows the History menu item and panel.
 */
export interface ChatDataSource {
  sendMessage(request: SendMessageRequest): Promise<SendMessageResponse>;
  getConversation?(conversationId: string, options?: { signal?: AbortSignal }): Promise<ChatMessage[]>;
  listConversations?(
    page: number,
    pageSize: number,
    options?: { signal?: AbortSignal },
  ): Promise<ConversationPage>;
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

export interface CommandContext {
  /** Words after the command name. */
  args: string[];
  /** Everything after the command name, untrimmed of inner spacing. */
  argText: string;
  /** The full input as typed, including the slash. */
  input: string;
  /** Show an assistant message (Markdown). */
  reply(markdown: string): void;
  /** Show an assistant message made of blocks. */
  replyBlocks(blocks: Block[]): void;
  /** Send text to the data source as a normal user turn (shows typing, renders the answer). */
  send(text: string): Promise<void>;
  /** Remove every message from the display. The conversation itself is untouched. */
  clearDisplay(): void;
  /** Start a new conversation (clears the display and forgets the conversation ID). */
  newConversation(): void;
  /** Open the History panel when the data source supports it. Returns false otherwise. */
  openHistory(): boolean;
  /** Attachments currently staged in the input. */
  readonly attachments: readonly ChatAttachment[];
  readonly conversationId: string | null;
  /** Commands that are enabled for this widget (for help text). */
  readonly commands: readonly ChatCommand[];
}

export interface ChatCommand {
  /** Name without the slash, e.g. `help`. Matched case-insensitively. */
  name: string;
  description: string;
  aliases?: string[];
  /** Help is always enabled; set on a command to exempt it from `enabledCommands`. */
  alwaysEnabled?: boolean;
  /**
   * Runs the command. When omitted the command is a pass-through: the full input
   * (e.g. `/sql select 1`) is sent to the data source as a normal user turn so a
   * backend can implement it.
   */
  run?(context: CommandContext): void | Promise<void>;
}

/** Names of the commands RadChat provides. */
export type BuiltInCommandName = 'help' | 'clear' | 'reset' | 'history';

// ---------------------------------------------------------------------------
// Widget options
// ---------------------------------------------------------------------------

export type LayoutMode = 'floating' | 'sidebar' | 'fullscreen';
export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface AttachmentOptions {
  /** Picker entries. Default: all three. */
  sources?: Array<'image' | 'document' | 'camera'>;
  /** Maximum attachments per message. Default 5. */
  maxCount?: number;
  /** Maximum size per file in bytes. Default 10 MB. */
  maxBytes?: number;
  /**
   * Allowed document extensions (with the dot). Default: .pdf .zip .txt .csv .md
   * .json .doc .docx .xls .xlsx
   */
  documentExtensions?: string[];
}

export interface OpenOptions {
  /** Run a slash command after opening, e.g. `/help`. */
  command?: string;
  /** Put text in the input without sending it. */
  prefillInput?: string;
  /** Start a new conversation before opening. */
  startNewConversation?: boolean;
}

export interface LinkClickEvent {
  href: string;
  /** Call to stop the default behavior (open in a new tab). */
  preventDefault(): void;
}

export interface ChatWidgetOptions {
  dataSource: ChatDataSource;

  /** Header title. Default "Assistant". */
  title?: string;
  /** First assistant message (Markdown). Default greets and mentions `/help`. */
  welcomeMessage?: string;
  /** Input placeholder. Default "Ask anything". */
  placeholder?: string;
  /** Replaces the default neutral avatar. */
  avatar?: ReactNode;
  /** Brand color for buttons, user bubbles and accents (hex, rgb[a] or hsl[a]). */
  primaryColor?: string;

  /** Corner for the launcher bubble and the initial floating position. Default bottom-right. */
  position?: WidgetPosition;
  /** Initial layout when the user has not picked one. Default floating. */
  layout?: LayoutMode;
  /** Hide the launcher bubble; open the widget through the imperative API instead. */
  hideBubble?: boolean;
  /** Open on first render. `'remember'` restores the user's last open/closed state. Default false. */
  initialOpen?: boolean | 'remember';
  /** Called when the widget opens or closes. */
  onOpenChange?(open: boolean): void;

  /**
   * Prefix for localStorage keys (position, size, layout, open state, current
   * conversation). Default `radchat`. Use different prefixes for several widgets
   * on one page; `false` disables persistence.
   */
  storageKey?: string | false;

  /** Extra slash commands. A command with a built-in name replaces the built-in. */
  commands?: ChatCommand[];
  /** Built-in commands to include. Default: all of help, clear, reset, history. */
  builtInCommands?: BuiltInCommandName[];
  /** When set, only these command names (plus `alwaysEnabled` ones such as help) run and autocomplete. */
  enabledCommands?: string[];
  /**
   * What to do with an unknown `/command`. `'error'` (default) shows "Unknown command";
   * `'send'` passes the text to the data source.
   */
  unknownCommands?: 'error' | 'send';

  /** Attachment picker settings; `false` hides the paperclip. */
  attachments?: AttachmentOptions | false;

  /** Locale for number formatting in tables. Default `en-US`. */
  locale?: string;
  /** ISO currency code for `currency` columns. Default `USD`. */
  currency?: string;

  /** Renderers for custom block types (anything other than text, table, chart). */
  blockRenderers?: Record<string, (block: CustomBlock) => ReactNode>;
  /** Intercept link clicks in answers (e.g. to route inside the host app). */
  onLinkClick?(event: LinkClickEvent): void;
  /** Turns a failed `sendMessage` into the text shown to the user. */
  formatError?(error: unknown): string;
}

/** Imperative handle exposed through `ref` on `<ChatWidget>` and returned by `mount()`. */
export interface ChatWidgetHandle {
  open(options?: OpenOptions): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  newConversation(): void;
  setLayout(layout: LayoutMode): void;
}
