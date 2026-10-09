/**
 * Slash command registry: lookup by name or alias, enabled-list filtering, and
 * the built-in commands (help, clear, reset, history).
 *
 * Hosts add their own commands through the `commands` option. A command
 * without `run` is a pass-through that sends the typed text to the data source.
 */
import type { BuiltInCommandName, ChatCommand } from '../types';

/** Built-in commands. Their `run` functions only use the CommandContext. */
export const BUILT_IN_COMMANDS: readonly ChatCommand[] = [
  {
    name: 'help',
    description: 'Show available commands',
    aliases: ['h', '?'],
    alwaysEnabled: true,
    run: (ctx) => {
      const list = ctx.commands
        .map((cmd) => {
          const aliases = cmd.aliases?.length ? ` (aliases: ${cmd.aliases.map((a) => `/${a}`).join(', ')})` : '';
          return `- **/${cmd.name}**${aliases} — ${cmd.description}`;
        })
        .join('\n');
      ctx.reply(`**Available commands**\n\n${list}\n\nYou can also just type a question.`);
    },
  },
  {
    name: 'clear',
    description: 'Clear the messages on screen (the conversation continues)',
    aliases: ['cls'],
    run: (ctx) => {
      ctx.clearDisplay();
    },
  },
  {
    name: 'reset',
    description: 'Start a new conversation',
    aliases: ['new', 'restart'],
    run: (ctx) => {
      ctx.newConversation();
    },
  },
  {
    name: 'history',
    description: 'Show your past conversations',
    run: (ctx) => {
      if (!ctx.openHistory()) {
        ctx.reply('Conversation history is not available here.');
      }
    },
  },
];

export const BUILT_IN_COMMAND_NAMES: readonly BuiltInCommandName[] = ['help', 'clear', 'reset', 'history'];

/**
 * Merge built-in and host commands. A host command with the same name as a
 * built-in replaces it. The `history` built-in is dropped when the data source
 * cannot list conversations.
 */
export function resolveCommands(options: {
  builtIns?: readonly BuiltInCommandName[];
  commands?: readonly ChatCommand[];
  historyAvailable: boolean;
}): ChatCommand[] {
  const builtInNames = new Set(options.builtIns ?? BUILT_IN_COMMAND_NAMES);
  const hostCommands = options.commands ?? [];
  const hostNames = new Set(hostCommands.map((c) => c.name.toLowerCase()));

  const builtIns = BUILT_IN_COMMANDS.filter(
    (cmd) =>
      builtInNames.has(cmd.name as BuiltInCommandName) &&
      !hostNames.has(cmd.name) &&
      (cmd.name !== 'history' || options.historyAvailable),
  );
  return [...builtIns, ...hostCommands];
}

/**
 * Command registry for runtime lookup and validation.
 * Maps command names and aliases (case-insensitive) to their definitions.
 * When two commands share a name or alias, the later one wins.
 */
export class CommandRegistry {
  private commandMap: Map<string, ChatCommand>;
  private commands: readonly ChatCommand[];

  constructor(commands: readonly ChatCommand[] = BUILT_IN_COMMANDS) {
    this.commands = commands;
    this.commandMap = new Map();

    for (const cmd of commands) {
      this.commandMap.set(cmd.name.toLowerCase(), cmd);
      for (const alias of cmd.aliases ?? []) {
        this.commandMap.set(alias.toLowerCase(), cmd);
      }
    }
  }

  /**
   * Check if a string is a valid command.
   * Handles both "/command" and "command" formats.
   */
  isCommand(input: string): boolean {
    const normalized = this.normalizeCommand(input);
    return normalized !== null && this.commandMap.has(normalized);
  }

  /** Get a command by name or alias, or null when unknown. */
  getCommand(input: string): ChatCommand | null {
    const normalized = this.normalizeCommand(input);
    if (normalized === null) return null;
    return this.commandMap.get(normalized) || null;
  }

  /**
   * Normalize command input by removing a leading slash and lowercasing.
   * Returns null if the input is not a valid command format.
   */
  private normalizeCommand(input: string): string | null {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    const withoutSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    if (!withoutSlash) return null;

    return withoutSlash.toLowerCase();
  }

  /**
   * Commands that may run. `undefined` enables everything; otherwise only the
   * listed names plus commands marked `alwaysEnabled`.
   */
  filterEnabled(enabledCommands?: readonly string[]): ChatCommand[] {
    if (!enabledCommands) return this.getAllCommands();
    const enabled = new Set(enabledCommands.map((c) => c.toLowerCase()));
    return this.getAllCommands().filter((cmd) => cmd.alwaysEnabled || enabled.has(cmd.name.toLowerCase()));
  }

  /** Whether a command may run under the given enabled list. */
  isEnabled(command: ChatCommand, enabledCommands?: readonly string[]): boolean {
    if (!enabledCommands || command.alwaysEnabled) return true;
    return enabledCommands.some((name) => name.toLowerCase() === command.name.toLowerCase());
  }

  /** All unique commands in registration order (aliases are not repeated). */
  getAllCommands(): ChatCommand[] {
    const live = new Set(this.commandMap.values());
    return this.commands.filter((cmd, i) => live.has(cmd) && this.commands.indexOf(cmd) === i);
  }
}

/**
 * Split "/name arg1 arg2" into its parts. Returns null when the text is not a
 * slash command. A bare "/" yields an empty name.
 */
export function parseCommandInput(text: string): { name: string; args: string[]; argText: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const body = trimmed.slice(1);
  const match = /^(\S*)\s*([\s\S]*)$/.exec(body);
  const name = match?.[1] ?? '';
  const argText = match?.[2] ?? '';
  const args = argText.trim() ? argText.trim().split(/\s+/) : [];
  return { name, args, argText };
}
