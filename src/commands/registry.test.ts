/**
 * CommandRegistry: lookup, alias resolution, enabled filtering, edge cases,
 * plus built-in/host command merging and input parsing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRegistry, BUILT_IN_COMMANDS, resolveCommands, parseCommandInput } from './registry';
import type { ChatCommand } from '../types';

const HOST_COMMANDS: ChatCommand[] = [
  { name: 'chart', description: 'Chart the last result', aliases: ['plot', 'graph'] },
  { name: 'export', description: 'Export the last result', aliases: ['csv'] },
];
const ALL_COMMANDS = [...BUILT_IN_COMMANDS, ...HOST_COMMANDS];

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry(ALL_COMMANDS);
  });

  describe('isCommand', () => {
    it('returns true for valid command names', () => {
      expect(registry.isCommand('help')).toBe(true);
      expect(registry.isCommand('reset')).toBe(true);
      expect(registry.isCommand('chart')).toBe(true);
    });

    it('returns true for valid aliases', () => {
      expect(registry.isCommand('h')).toBe(true);
      expect(registry.isCommand('?')).toBe(true);
      expect(registry.isCommand('restart')).toBe(true);
      expect(registry.isCommand('plot')).toBe(true);
    });

    it('returns true for commands with leading slash', () => {
      expect(registry.isCommand('/help')).toBe(true);
      expect(registry.isCommand('/reset')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(registry.isCommand('HELP')).toBe(true);
      expect(registry.isCommand('Help')).toBe(true);
      expect(registry.isCommand('hElP')).toBe(true);
    });

    it('returns false for invalid commands', () => {
      expect(registry.isCommand('invalid')).toBe(false);
      expect(registry.isCommand('foo')).toBe(false);
    });

    it('returns false for empty or whitespace strings', () => {
      expect(registry.isCommand('')).toBe(false);
      expect(registry.isCommand(' ')).toBe(false);
      expect(registry.isCommand('   ')).toBe(false);
    });

    it('returns false for bare slash', () => {
      expect(registry.isCommand('/')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      expect(registry.isCommand(null as unknown as string)).toBe(false);
      expect(registry.isCommand(undefined as unknown as string)).toBe(false);
      expect(registry.isCommand(123 as unknown as string)).toBe(false);
      expect(registry.isCommand({} as unknown as string)).toBe(false);
    });
  });

  describe('getCommand', () => {
    it('returns the command definition for a valid name', () => {
      const cmd = registry.getCommand('help');
      expect(cmd?.name).toBe('help');
      expect(cmd?.alwaysEnabled).toBe(true);
    });

    it('resolves aliases to the canonical command', () => {
      expect(registry.getCommand('h')).toBe(registry.getCommand('help'));
      expect(registry.getCommand('?')?.name).toBe('help');
    });

    it('handles commands with leading slash', () => {
      expect(registry.getCommand('/reset')?.name).toBe('reset');
    });

    it('is case-insensitive', () => {
      expect(registry.getCommand('CHART')).toBe(registry.getCommand('chart'));
    });

    it('returns null for invalid, empty, or bare-slash input', () => {
      expect(registry.getCommand('invalid')).toBeNull();
      expect(registry.getCommand('')).toBeNull();
      expect(registry.getCommand(' ')).toBeNull();
      expect(registry.getCommand('/')).toBeNull();
    });

    it('resolves all documented aliases', () => {
      expect(registry.getCommand('restart')?.name).toBe('reset');
      expect(registry.getCommand('new')?.name).toBe('reset');
      expect(registry.getCommand('cls')?.name).toBe('clear');
      expect(registry.getCommand('plot')?.name).toBe('chart');
      expect(registry.getCommand('graph')?.name).toBe('chart');
      expect(registry.getCommand('csv')?.name).toBe('export');
    });
  });

  describe('filterEnabled', () => {
    it('returns everything when no enabled list is given', () => {
      expect(registry.filterEnabled(undefined).length).toBe(ALL_COMMANDS.length);
    });

    it('returns only enabled commands', () => {
      const names = registry.filterEnabled(['reset', 'clear']).map((c) => c.name);
      expect(names).toContain('reset');
      expect(names).toContain('clear');
      expect(names).not.toContain('chart');
    });

    it('always includes alwaysEnabled commands', () => {
      const names = registry.filterEnabled(['chart']).map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('chart');
      expect(names).not.toContain('reset');
    });

    it('is case-insensitive for enabled command names', () => {
      const a = registry.filterEnabled(['RESET', 'CLEAR']).map((c) => c.name).sort();
      const b = registry.filterEnabled(['reset', 'clear']).map((c) => c.name).sort();
      expect(a).toEqual(b);
    });

    it('handles an empty enabled list (only alwaysEnabled)', () => {
      expect(registry.filterEnabled([]).map((c) => c.name)).toEqual(['help']);
    });

    it('ignores unknown names and never duplicates', () => {
      const names = registry.filterEnabled(['reset', 'invalid_cmd', 'help', 'help']).map((c) => c.name);
      expect(names.filter((n) => n === 'help').length).toBe(1);
      expect(names).not.toContain('invalid_cmd');
    });

    it('isEnabled agrees with filterEnabled', () => {
      const chart = registry.getCommand('chart')!;
      const help = registry.getCommand('help')!;
      expect(registry.isEnabled(chart, ['reset'])).toBe(false);
      expect(registry.isEnabled(help, ['reset'])).toBe(true);
      expect(registry.isEnabled(chart, undefined)).toBe(true);
    });
  });

  describe('getAllCommands', () => {
    it('returns all unique commands without alias duplicates', () => {
      const names = registry.getAllCommands().map((c) => c.name);
      expect(names.length).toBe(ALL_COMMANDS.length);
      expect(new Set(names).size).toBe(names.length);
      expect(names).not.toContain('plot');
    });
  });

  describe('Security edge cases', () => {
    it('does not match command text with injected characters', () => {
      expect(registry.isCommand('/help; rm -rf /')).toBe(false);
      expect(registry.isCommand('help && malicious')).toBe(false);
      expect(registry.isCommand('help | cat /etc/passwd')).toBe(false);
    });

    it('handles extremely long input gracefully', () => {
      const longInput = 'a'.repeat(10000);
      expect(() => registry.isCommand(longInput)).not.toThrow();
      expect(registry.isCommand(longInput)).toBe(false);
    });

    it('handles unicode and control characters', () => {
      expect(registry.isCommand('помощь')).toBe(false);
      expect(registry.isCommand('帮助')).toBe(false);
      expect(registry.isCommand('help\u0000')).toBe(false);
      expect(registry.isCommand('help\n')).toBe(true); // surrounding whitespace is trimmed
      expect(registry.isCommand('he\nlp')).toBe(false);
    });
  });

  describe('Custom command sets', () => {
    it('accepts a custom command set', () => {
      const custom = new CommandRegistry(HOST_COMMANDS);
      expect(custom.isCommand('chart')).toBe(true);
      expect(custom.isCommand('csv')).toBe(true);
      expect(custom.isCommand('help')).toBe(false);
    });

    it('handles an empty command set', () => {
      const empty = new CommandRegistry([]);
      expect(empty.getAllCommands()).toEqual([]);
      expect(empty.isCommand('help')).toBe(false);
    });
  });
});

describe('resolveCommands', () => {
  it('includes all built-ins plus host commands by default', () => {
    const names = resolveCommands({ commands: HOST_COMMANDS, historyAvailable: true }).map((c) => c.name);
    expect(names).toEqual(['help', 'clear', 'reset', 'history', 'chart', 'export']);
  });

  it('drops history when the data source cannot list conversations', () => {
    const names = resolveCommands({ historyAvailable: false }).map((c) => c.name);
    expect(names).not.toContain('history');
  });

  it('limits built-ins to the requested names', () => {
    const names = resolveCommands({ builtIns: ['help'], historyAvailable: true }).map((c) => c.name);
    expect(names).toEqual(['help']);
  });

  it('lets a host command replace a built-in with the same name', () => {
    const myHelp: ChatCommand = { name: 'help', description: 'Custom help', alwaysEnabled: true };
    const cmds = resolveCommands({ commands: [myHelp], historyAvailable: true });
    expect(cmds.filter((c) => c.name === 'help')).toEqual([myHelp]);
  });
});

describe('parseCommandInput', () => {
  it('splits name and arguments', () => {
    expect(parseCommandInput('/sql select  1')).toEqual({ name: 'sql', args: ['select', '1'], argText: 'select  1' });
  });

  it('returns an empty name for a bare slash', () => {
    expect(parseCommandInput('/')).toEqual({ name: '', args: [], argText: '' });
  });

  it('returns null for normal text', () => {
    expect(parseCommandInput('what were sales?')).toBeNull();
  });
});
