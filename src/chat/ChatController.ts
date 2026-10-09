/**
 * ChatController — the per-widget conversation engine.
 *
 * react-chatbot-kit re-creates its ActionProvider and MessageParser on every
 * render, so durable state (conversation ID, staged attachments, in-flight
 * requests) lives here, one instance per widget. The kit-facing classes built
 * by {@link createKitAdapters} are thin shims that forward to this object.
 *
 * Flow for a user turn: typing indicator -> dataSource.sendMessage -> blocks
 * rendered as messages. Turns are serialized so a second question waits for
 * the first answer (and its conversation ID).
 */
import type {
  AttachmentSummary,
  Block,
  ChatAttachment,
  ChatCommand,
  ChatDataSource,
  ChatMessage,
  ChatSource,
  CommandContext,
  TextBlock,
} from '../types';
import { CommandRegistry, parseCommandInput } from '../commands/registry';
import { TYPING_INDICATOR_WIDGET, isTypingIndicator } from './Loading';

/**
 * Custom message types registered with react-chatbot-kit (`customMessages`).
 * Plain assistant text uses the kit's own `bot` type and user text its `user` type.
 */
export const BLOCKS_MESSAGE = 'radchatBlocks';
export const USER_ATTACHMENTS_MESSAGE = 'radchatUserWithAttachments';
export const TYPING_MESSAGE = TYPING_INDICATOR_WIDGET;

/** The message shape react-chatbot-kit keeps in its state. */
export interface KitMessage {
  message: string;
  /** `bot`, `user`, or one of the custom message types above. */
  type: string;
  id: number;
  loading?: boolean;
  widget?: string;
  payload?: unknown;
  withAvatar?: boolean;
}

interface KitState {
  messages: KitMessage[];
  [key: string]: unknown;
}

type SetKitState = (updater: (prev: KitState) => KitState) => void;

export interface BlocksPayload {
  blocks: Block[];
  sources?: ChatSource[];
}

export interface UserAttachmentsPayload {
  text: string;
  attachments: AttachmentSummary[];
}

/** Settings and callbacks the widget supplies; read fresh on every use. */
export interface ControllerHost {
  dataSource: ChatDataSource;
  commands: readonly ChatCommand[];
  enabledCommands?: readonly string[];
  unknownCommands: 'error' | 'send';
  formatError: (error: unknown) => string;
  /** Clears the transcript and remounts the chat with the welcome message. */
  onNewConversation: () => void;
  /** Opens the History panel; false when unavailable. */
  onOpenHistory: () => boolean;
  /** The conversation ID changed (new ID from the backend, or reset to null). */
  onConversationIdChange: (id: string | null) => void;
}

let idCounter = 0;
/** Unique numeric IDs for kit messages (the kit requires numbers). */
export const nextMessageId = (): number => Date.now() * 1000 + (idCounter++ % 1000);

export const botMessage = (message: string, extra: Partial<KitMessage> = {}): KitMessage => ({
  message,
  type: 'bot',
  id: nextMessageId(),
  loading: false,
  ...extra,
});

const userMessage = (message: string, attachments?: AttachmentSummary[]): KitMessage =>
  attachments && attachments.length > 0
    ? {
        message,
        type: USER_ATTACHMENTS_MESSAGE,
        id: nextMessageId(),
        payload: { text: message, attachments } satisfies UserAttachmentsPayload,
      }
    : { message, type: 'user', id: nextMessageId() };

/** Only http(s) links are kept in Markdown source citations. */
const safeUrl = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);
const escapeMd = (text: string) => text.replace(/([\\`*_[\]<>])/g, '\\$1');

/** Renders sources as a Markdown list (used for text-only answers). */
export function sourcesToMarkdown(sources: ChatSource[]): string {
  const seen = new Set<string>();
  const lines = sources
    .filter((s) => {
      const key = `${s.title}|${s.heading ?? ''}`;
      if (!s.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => {
      const title = `**${escapeMd(s.title)}**`;
      const url = safeUrl(s.url);
      const linked = url ? `[${title}](${url})` : title;
      return `- ${linked}${s.heading ? ` › ${escapeMd(s.heading)}` : ''}`;
    });
  return lines.length ? `**Sources:**\n${lines.join('\n')}` : '';
}

const isPlainText = (b: Block): b is TextBlock => b.type === 'text' && !(b as TextBlock).label;

/**
 * Convert an answer to kit messages: plain Markdown when every block is
 * unlabelled text, otherwise one block-renderer message.
 */
export function answerToMessages(blocks: Block[], sources?: ChatSource[]): KitMessage[] {
  const safeBlocks = Array.isArray(blocks) ? blocks.filter((b) => b && typeof b.type === 'string') : [];
  if (safeBlocks.every(isPlainText)) {
    let text = safeBlocks
      .map((b) => (b as TextBlock).content ?? '')
      .join('\n\n')
      .trim();
    if (sources && sources.length > 0) {
      const md = sourcesToMarkdown(sources);
      if (md) text = text ? `${text}\n\n${md}` : md;
    }
    return text ? [botMessage(text)] : [];
  }
  return [
    {
      message: '',
      type: BLOCKS_MESSAGE,
      id: nextMessageId(),
      payload: { blocks: safeBlocks, sources } satisfies BlocksPayload,
    },
  ];
}

/** Convert a stored transcript (from `getConversation`) to kit messages. */
export function transcriptToMessages(messages: ChatMessage[]): KitMessage[] {
  const out: KitMessage[] = [];
  for (const msg of messages ?? []) {
    if (msg.role === 'user') {
      out.push(userMessage(msg.text ?? '', msg.attachments));
    } else if (msg.role === 'assistant') {
      const blocks: Block[] = msg.blocks?.length ? msg.blocks : msg.text ? [{ type: 'text', content: msg.text }] : [];
      out.push(...answerToMessages(blocks, msg.sources));
    }
  }
  return out;
}

const DEFAULT_EMPTY_ANSWER =
  "I'm sorry, I wasn't able to produce an answer. Could you rephrase the question or add more detail?";

export class ChatController {
  conversationId: string | null = null;

  private host: () => ControllerHost;
  private setState: SetKitState | null = null;
  private stagedAttachments: ChatAttachment[] = [];
  private attachmentListeners = new Set<(attachments: ChatAttachment[]) => void>();
  private inFlight = new Set<AbortController>();
  private queue: Promise<void> = Promise.resolve();
  /** Incremented on new conversation; answers from an older generation are dropped. */
  private generation = 0;
  private disposed = false;
  /** Number of user turns or commands handled; restore is skipped once the user has interacted. */
  activity = 0;

  constructor(host: () => ControllerHost) {
    this.host = host;
  }

  // ---- kit binding ---------------------------------------------------------

  /** Called by the kit adapter each time react-chatbot-kit constructs it. */
  bind(setState: SetKitState) {
    this.setState = setState;
  }

  private update(updater: (messages: KitMessage[]) => KitMessage[]) {
    this.setState?.((prev) => ({ ...prev, messages: updater(Array.isArray(prev.messages) ? prev.messages : []) }));
  }

  addMessages(...messages: KitMessage[]) {
    if (messages.length === 0) return;
    this.update((prev) => [...prev, ...messages]);
  }

  // ---- attachments ---------------------------------------------------------

  get attachments(): readonly ChatAttachment[] {
    return this.stagedAttachments;
  }

  setAttachments(attachments: ChatAttachment[]) {
    this.stagedAttachments = [...attachments];
  }

  /** The picker subscribes so its chips clear when a message takes the attachments. */
  onAttachmentsReset(listener: (attachments: ChatAttachment[]) => void): () => void {
    this.attachmentListeners.add(listener);
    return () => this.attachmentListeners.delete(listener);
  }

  private takeAttachments(): ChatAttachment[] {
    const taken = this.stagedAttachments;
    this.stagedAttachments = [];
    if (taken.length > 0) this.attachmentListeners.forEach((l) => l([]));
    return taken;
  }

  // ---- input handling ------------------------------------------------------

  /**
   * Entry point for text the user submitted through the kit's input. The kit
   * has already appended the user message to its state.
   */
  handleUserInput(text: string) {
    this.activity++;
    const attachments = this.stagedAttachments.map((a) => ({ type: a.type, name: a.name }));
    if (attachments.length > 0) this.attachToLastUserMessage(text, attachments);

    if (text.trim().startsWith('/')) {
      void this.runCommandInput(text.trim());
      return;
    }
    void this.sendTurn(text);
  }

  /** Run a slash command typed by the user or requested through `open({ command })`. */
  async runCommandInput(input: string): Promise<void> {
    this.activity++;
    const host = this.host();
    const registry = new CommandRegistry(host.commands);
    const parsed = parseCommandInput(input);
    if (!parsed) {
      await this.sendTurn(input);
      return;
    }

    // A bare "/" shows help.
    const name = parsed.name || 'help';
    const command = registry.getCommand(name);

    if (!command) {
      if (host.unknownCommands === 'send') {
        await this.sendTurn(input);
      } else {
        this.reply(`Unknown command: \`/${name}\`. Type **/help** to see available commands.`);
      }
      return;
    }

    if (!registry.isEnabled(command, host.enabledCommands)) {
      this.reply(`The command \`/${command.name}\` is not available.`);
      return;
    }

    if (!command.run) {
      // Pass-through: the backend implements this command.
      await this.sendTurn(input);
      return;
    }

    const context: CommandContext = {
      args: parsed.args,
      argText: parsed.argText,
      input,
      reply: (markdown) => this.reply(markdown),
      replyBlocks: (blocks) => this.addMessages(...answerToMessages(blocks)),
      send: (text) => this.sendTurn(text, { echo: true }),
      clearDisplay: () => this.clearDisplay(),
      newConversation: () => this.newConversation(),
      openHistory: () => this.host().onOpenHistory(),
      attachments: this.stagedAttachments,
      conversationId: this.conversationId,
      commands: registry.filterEnabled(host.enabledCommands),
    };

    try {
      await command.run(context);
    } catch (error) {
      console.error(`[RadChat] Command /${command.name} failed:`, error);
      this.reply(`Sorry, \`/${command.name}\` failed. Please try again.`);
    }
  }

  reply(markdown: string) {
    this.addMessages(botMessage(markdown));
  }

  clearDisplay() {
    this.update(() => []);
  }

  /** Abort pending answers, forget the conversation, and remount with the welcome message. */
  newConversation() {
    this.abortAll();
    this.generation++;
    this.takeAttachments();
    this.setConversationId(null);
    this.host().onNewConversation();
  }

  /** Point the controller at an existing conversation (History switch or restore). */
  switchConversation(id: string | null) {
    this.abortAll();
    this.generation++;
    this.setConversationId(id);
  }

  private setConversationId(id: string | null) {
    if (this.conversationId === id) return;
    this.conversationId = id;
    this.host().onConversationIdChange(id);
  }

  // ---- data source turns ---------------------------------------------------

  /**
   * Send text to the data source. `echo` shows the text as a user message
   * (used when a command sends text the user did not type).
   */
  sendTurn(text: string, options: { echo?: boolean } = {}): Promise<void> {
    const attachments = this.takeAttachments();
    if (options.echo) {
      this.addMessages(userMessage(text, attachments.map((a) => ({ type: a.type, name: a.name }))));
    }
    const generation = this.generation;
    const run = () => this.performTurn(text, attachments, generation);
    // Serialize turns so a follow-up uses the conversation ID from the previous answer.
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async performTurn(text: string, attachments: ChatAttachment[], generation: number): Promise<void> {
    if (this.disposed || generation !== this.generation) return;

    const typing: KitMessage = {
      message: '',
      type: TYPING_MESSAGE,
      id: nextMessageId(),
      payload: { isTypingIndicator: true },
    };
    this.addMessages(typing);

    const abort = new AbortController();
    this.inFlight.add(abort);
    const host = this.host();

    try {
      const response = await host.dataSource.sendMessage({
        conversationId: this.conversationId,
        text,
        attachments,
        signal: abort.signal,
      });
      if (abort.signal.aborted || generation !== this.generation || this.disposed) return;

      if (response?.conversationId) this.setConversationId(response.conversationId);

      const messages = answerToMessages(response?.blocks ?? [], response?.sources);
      this.update((prev) => [
        ...prev.filter((m) => !isTypingIndicator(m)),
        ...(messages.length > 0 ? messages : [botMessage(DEFAULT_EMPTY_ANSWER)]),
      ]);
    } catch (error) {
      if (abort.signal.aborted || generation !== this.generation || this.disposed) return;
      console.error('[RadChat] sendMessage failed:', error);
      let text: string;
      try {
        text = host.formatError(error);
      } catch {
        text = defaultFormatError(error);
      }
      this.update((prev) => [
        ...prev.filter((m) => !isTypingIndicator(m)),
        botMessage(text),
      ]);
    } finally {
      this.inFlight.delete(abort);
      if (generation === this.generation && !this.disposed) {
        // Remove the indicator even when the turn was dropped.
        this.update((prev) => (prev.some(isTypingIndicator) && this.inFlight.size === 0 ? prev.filter((m) => !isTypingIndicator(m)) : prev));
      }
    }
  }

  private attachToLastUserMessage(text: string, attachments: AttachmentSummary[]) {
    this.update((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        const m = prev[i];
        if (m.type === 'user' && m.message === text) {
          const copy = [...prev];
          copy[i] = {
            ...m,
            type: USER_ATTACHMENTS_MESSAGE,
            payload: { text, attachments } satisfies UserAttachmentsPayload,
          };
          return copy;
        }
      }
      return prev;
    });
  }

  private abortAll() {
    this.inFlight.forEach((a) => a.abort());
    this.inFlight.clear();
    this.queue = Promise.resolve();
  }

  /** Re-enable after `dispose` (React StrictMode unmounts and remounts effects in development). */
  activate() {
    this.disposed = false;
  }

  /** Abort in-flight requests and ignore late answers. */
  dispose() {
    this.disposed = true;
    this.abortAll();
  }
}

/** Default user-facing text for a failed request. Never includes server details. */
export function defaultFormatError(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401 || status === 403) {
    return 'You need to sign in to use this assistant. Please sign in and try again.';
  }
  if (status === 429) {
    return 'Too many requests right now. Please wait a moment and try again.';
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network error')) {
    return "I couldn't reach the assistant. Check your connection and try again.";
  }
  return 'Sorry, something went wrong while answering. Please try again.';
}

/**
 * Builds the ActionProvider and MessageParser classes react-chatbot-kit
 * instantiates. Both forward to the given controller.
 */
export function createKitAdapters(controller: ChatController) {
  class ActionProvider {
    constructor(_createChatBotMessage?: unknown, setState?: SetKitState) {
      // react-chatbot-kit also constructs these classes with no arguments to
      // detect class components; only a real setState is bound.
      if (typeof setState === 'function') controller.bind(setState);
    }
  }

  class MessageParser {
    parse(message: string) {
      controller.handleUserInput(message);
    }
  }

  return { ActionProvider, MessageParser };
}
