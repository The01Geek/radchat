/**
 * SlashAutocomplete — suggestions shown while the user types "/" in the input.
 *
 * Watches the react-chatbot-kit input inside this widget (found through
 * `rootRef`, never through a page-wide query). Arrow keys move the selection,
 * Tab or Enter completes the command, Escape dismisses.
 */
import { useState, useEffect, useLayoutEffect, useRef, useMemo, type RefObject } from 'react';
import type { ChatCommand } from '../types';

interface Suggestion {
  command: string;
  description: string;
}

interface SlashAutocompleteProps {
  /** The widget root; the input is looked up inside it. */
  rootRef: RefObject<HTMLElement | null>;
  /** Enabled commands, in display order. */
  commands: readonly ChatCommand[];
  /**
   * When this key changes, find the input again and re-attach listeners.
   * Starting a new conversation remounts the chat and creates a new input.
   */
  resetKey?: number;
}

/** Set the kit's controlled input value and notify React. */
export function setChatInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function SlashAutocomplete({ rootRef, commands, resetKey }: SlashAutocompleteProps) {
  const suggestions = useMemo<Suggestion[]>(
    () => commands.map((cmd) => ({ command: `/${cmd.name}`, description: cmd.description })),
    [commands],
  );

  const [matches, setMatches] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Handlers read the latest state through refs so listeners attach once per input.
  const visibleRef = useRef(visible);
  const matchesRef = useRef(matches);
  const selectedRef = useRef(selectedIndex);
  const suggestionsRef = useRef(suggestions);
  useLayoutEffect(() => {
    visibleRef.current = visible;
    matchesRef.current = matches;
    selectedRef.current = selectedIndex;
    suggestionsRef.current = suggestions;
  });

  useEffect(() => {
    let input: HTMLInputElement | null = null;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const handleInput = () => {
      if (!input) return;
      const value = input.value;
      if (value.startsWith('/') && !/\s/.test(value)) {
        const query = value.toLowerCase();
        const filtered = suggestionsRef.current.filter(
          (s) => s.command.startsWith(query) || s.description.toLowerCase().includes(query.slice(1)),
        );
        setMatches(filtered);
        setSelectedIndex(0);
        setVisible(filtered.length > 0);
      } else {
        setVisible(false);
        setMatches([]);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visibleRef.current || !input) return;
      const current = matchesRef.current;
      const selected = current[selectedRef.current];

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, current.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        // Enter submits once the command is fully typed; before that it completes.
        if (selected && (e.key === 'Tab' || input.value.length < selected.command.length)) {
          e.preventDefault();
          e.stopPropagation();
          setChatInputValue(input, `${selected.command} `);
          setVisible(false);
        }
      } else if (e.key === 'Escape') {
        // Keep the widget's own Escape handling from also firing.
        e.stopPropagation();
        setVisible(false);
      }
    };

    const handleBlur = () => {
      // Brief delay so a click on a suggestion registers first.
      blurTimer = setTimeout(() => setVisible(false), 150);
    };

    const attach = () => {
      const found = rootRef.current?.querySelector<HTMLInputElement>('.react-chatbot-kit-chat-input') ?? null;
      if (!found) return false;
      input = found;
      inputRef.current = found;
      found.addEventListener('input', handleInput);
      // Capture phase so these keys are handled before the kit submits the form.
      found.addEventListener('keydown', handleKeyDown, true);
      found.addEventListener('blur', handleBlur);
      return true;
    };

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!attach()) {
      interval = setInterval(() => {
        if (attach()) clearInterval(interval);
      }, 100);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (blurTimer) clearTimeout(blurTimer);
      if (input) {
        input.removeEventListener('input', handleInput);
        input.removeEventListener('keydown', handleKeyDown, true);
        input.removeEventListener('blur', handleBlur);
      }
    };
  }, [rootRef, resetKey]);

  if (!visible || matches.length === 0) return null;

  return (
    <div className="radchat-slash-autocomplete" role="listbox" aria-label="Commands">
      {matches.map((cmd, i) => (
        <button
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          key={cmd.command}
          className={`radchat-slash-autocomplete-item ${i === selectedIndex ? 'selected' : ''}`}
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus in the input
            const input = inputRef.current;
            if (input) {
              setChatInputValue(input, `${cmd.command} `);
              input.focus();
            }
            setVisible(false);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="radchat-slash-autocomplete-cmd">{cmd.command}</span>
          <span className="radchat-slash-autocomplete-desc">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}
