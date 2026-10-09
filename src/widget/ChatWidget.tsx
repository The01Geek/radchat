/**
 * ChatWidget — the RadChat shell around react-chatbot-kit.
 *
 * - Launcher bubble, header with menu, new-conversation and close buttons
 * - Floating (draggable, resizable from 8 edges/corners), sidebar and
 *   fullscreen layouts
 * - Position, size, layout, open state and the current conversation persist
 *   in localStorage under `storageKey`
 * - History panel when the data source can list conversations
 * - Imperative API through `ref` (see ChatWidgetHandle)
 *
 * All DOM lookups are scoped to this widget's root element, so several
 * widgets can live on one page with different `storageKey`s.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Chatbot from 'react-chatbot-kit';
import 'react-chatbot-kit/build/main.css';
import './chat.css';

import type { ChatWidgetHandle, ChatWidgetOptions, LayoutMode, OpenOptions } from '../types';
import {
  ChatController,
  botMessage,
  createKitAdapters,
  defaultFormatError,
  transcriptToMessages,
  type ControllerHost,
  type KitMessage,
} from '../chat/ChatController';
import { buildChatConfig } from '../chat/chatConfig';
import { resolveCommands, CommandRegistry } from '../commands/registry';
import { SlashAutocomplete, setChatInputValue } from '../commands/SlashAutocomplete';
import { AttachmentPickerIntegration } from '../attachments/AttachmentPickerIntegration';
import { ConversationHistory } from '../panels/ConversationHistory';
import { RenderContext, type RadChatRenderContext } from '../shared/context';
import { ResizeHandles, useResize, type Dimensions, type Position } from './ResizeHandles';
import { themeVariables } from './theme';
import { createStorage } from './storage';

export const DEFAULT_TITLE = 'Assistant';
export const DEFAULT_WELCOME = 'Hi! Ask me a question, or type **/help** to see what I can do.';
export const DEFAULT_PLACEHOLDER = 'Ask anything';

const DEFAULT_SIZE = { width: 350, height: 500 };
const MIN_WIDTH = 300;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 1200;
const EDGE_PADDING = 20;
const LAYOUTS: LayoutMode[] = ['floating', 'sidebar', 'fullscreen'];

const LAYOUT_OPTIONS: { mode: LayoutMode; label: string; icon: ReactNode }[] = [
  {
    mode: 'floating',
    label: 'Floating',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    mode: 'sidebar',
    label: 'Sidebar',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
  },
  {
    mode: 'fullscreen',
    label: 'Fullscreen',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
      </svg>
    ),
  },
];

const viewport = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1920,
  height: typeof window !== 'undefined' ? window.innerHeight : 1080,
});

function defaultPosition(corner: ChatWidgetOptions['position'], size: { width: number; height: number }): Position {
  const { width: vw, height: vh } = viewport();
  const left = corner?.includes('left');
  const top = corner?.includes('top');
  return {
    x: Math.max(0, left ? EDGE_PADDING : vw - size.width - EDGE_PADDING),
    y: Math.max(0, top ? EDGE_PADDING : vh - size.height - EDGE_PADDING),
  };
}

const clampPosition = (pos: Position, size: { width: number; height: number }): Position => {
  const { width: vw, height: vh } = viewport();
  return {
    x: Math.max(0, Math.min(pos.x, vw - size.width)),
    y: Math.max(0, Math.min(pos.y, vh - size.height)),
  };
};

export const ChatWidget = forwardRef<ChatWidgetHandle, ChatWidgetOptions>(function ChatWidget(props, ref) {
  const {
    dataSource,
    title = DEFAULT_TITLE,
    welcomeMessage = DEFAULT_WELCOME,
    placeholder = DEFAULT_PLACEHOLDER,
    avatar,
    primaryColor,
    position: corner = 'bottom-right',
    layout: initialLayout = 'floating',
    hideBubble = false,
    initialOpen = false,
    storageKey = 'radchat',
    locale = 'en-US',
    currency = 'USD',
    blockRenderers,
    onLinkClick,
  } = props;

  const storage = useMemo(() => createStorage(storageKey), [storageKey]);
  const rootRef = useRef<HTMLDivElement>(null);

  // ---- props the controller reads at call time --------------------------------
  const historyAvailable = typeof dataSource.listConversations === 'function';
  const commands = useMemo(
    () => resolveCommands({ builtIns: props.builtInCommands, commands: props.commands, historyAvailable }),
    [props.builtInCommands, props.commands, historyAvailable],
  );
  const enabledCommandList = useMemo(
    () => new CommandRegistry(commands).filterEnabled(props.enabledCommands),
    [commands, props.enabledCommands],
  );

  // ---- open state ---------------------------------------------------------------
  const [isOpen, setIsOpenState] = useState<boolean>(() =>
    initialOpen === 'remember' ? storage.get('open') === 'true' : Boolean(initialOpen),
  );
  const [hasOpened, setHasOpened] = useState(isOpen);
  const onOpenChangeRef = useRef(props.onOpenChange);
  useLayoutEffect(() => {
    onOpenChangeRef.current = props.onOpenChange;
  });

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpenState((prev) => {
        if (prev !== open) {
          // Notify after the state update is scheduled.
          queueMicrotask(() => onOpenChangeRef.current?.(open));
        }
        return open;
      });
      if (open) setHasOpened(true);
      if (initialOpen === 'remember') storage.set('open', String(open));
    },
    [initialOpen, storage],
  );

  // ---- layout and geometry ------------------------------------------------------
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    const saved = storage.get('layout') as LayoutMode | null;
    return saved && LAYOUTS.includes(saved) ? saved : LAYOUTS.includes(initialLayout) ? initialLayout : 'floating';
  });
  const changeLayout = useCallback(
    (mode: LayoutMode) => {
      if (!LAYOUTS.includes(mode)) return;
      setLayoutMode(mode);
      storage.set('layout', mode);
    },
    [storage],
  );

  const [dimensions, setDimensions] = useState<Dimensions>(() => {
    const saved = storage.getJSON<{ dimensions?: { width?: number; height?: number } }>('geometry');
    const width = Number(saved?.dimensions?.width) || DEFAULT_SIZE.width;
    const height = Number(saved?.dimensions?.height) || DEFAULT_SIZE.height;
    return {
      width: Math.max(MIN_WIDTH, width),
      height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)),
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      maxWidth: viewport().width,
      maxHeight: MAX_HEIGHT,
    };
  });
  const [position, setPosition] = useState<Position>(() => {
    const saved = storage.getJSON<{ position?: Position }>('geometry');
    if (saved?.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y)) {
      return clampPosition(saved.position, dimensions);
    }
    return defaultPosition(corner, dimensions);
  });

  const { handleResizeMouseDown, isResizing } = useResize(dimensions, position, setDimensions, setPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Persist geometry once a gesture ends.
  useEffect(() => {
    if (isDragging || isResizing) return;
    storage.setJSON('geometry', { position, dimensions: { width: dimensions.width, height: dimensions.height } });
  }, [storage, position, dimensions.width, dimensions.height, isDragging, isResizing]);

  // Keep the window on screen when the browser is resized.
  useEffect(() => {
    const handleWindowResize = () => {
      setDimensions((prev) => (prev.maxWidth === window.innerWidth ? prev : { ...prev, maxWidth: window.innerWidth }));
      setPosition((prev) => {
        const next = clampPosition(prev, dimensions);
        return next.x === prev.x && next.y === prev.y ? prev : next;
      });
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [dimensions]);

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (layoutMode !== 'floating' || e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    e.preventDefault();
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition(
        clampPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y }, dimensions),
      );
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, dimensions]);

  // ---- panels and menu ----------------------------------------------------------
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!isMenuOpen && !showHistory) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!rootRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (isMenuOpen) setIsMenuOpen(false);
      else setShowHistory(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen, showHistory]);

  // ---- conversation -------------------------------------------------------------
  const welcome = useCallback(() => [botMessage(welcomeMessage)], [welcomeMessage]);
  const [initialMessages, setInitialMessages] = useState<KitMessage[]>(() => [botMessage(welcomeMessage)]);
  const [chatResetKey, setChatResetKey] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const focusChatInput = useCallback((delay = 300) => {
    setTimeout(() => {
      rootRef.current?.querySelector<HTMLInputElement>('.react-chatbot-kit-chat-input')?.focus();
    }, delay);
  }, []);

  const canPersistConversation = typeof dataSource.getConversation === 'function';

  const hostRef = useRef<ControllerHost>(null as unknown as ControllerHost);
  const hostValue: ControllerHost = {
    dataSource,
    commands,
    enabledCommands: props.enabledCommands,
    unknownCommands: props.unknownCommands ?? 'error',
    formatError: props.formatError ?? defaultFormatError,
    onNewConversation: () => {
      setInitialMessages(welcome());
      setChatResetKey((k) => k + 1);
      setShowHistory(false);
      focusChatInput(100);
    },
    onOpenHistory: () => {
      if (!historyAvailable) return false;
      setIsMenuOpen(false);
      setShowHistory(true);
      return true;
    },
    onConversationIdChange: (id) => {
      setConversationId(id);
      if (!canPersistConversation) return;
      if (id) storage.set('conversation', id);
      else storage.remove('conversation');
    },
  };
  useLayoutEffect(() => {
    hostRef.current = hostValue;
  });

  const [controller] = useState(() => new ChatController(() => hostRef.current ?? hostValue));
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  const { ActionProvider, MessageParser } = useMemo(() => createKitAdapters(controller), [controller]);

  /** Load a stored conversation into the chat. */
  const loadConversation = useCallback(
    async (id: string, options: { onlyIfIdle?: boolean } = {}) => {
      const getConversation = dataSource.getConversation;
      if (!getConversation) {
        controller.switchConversation(id);
        setInitialMessages([...welcome(), botMessage('Continuing an earlier conversation.')]);
        setChatResetKey((k) => k + 1);
        return true;
      }
      const activityBefore = controller.activity;
      try {
        const messages = await getConversation.call(dataSource, id);
        if (options.onlyIfIdle && controller.activity !== activityBefore) return false;
        controller.switchConversation(id);
        setInitialMessages([...welcome(), ...transcriptToMessages(Array.isArray(messages) ? messages : [])]);
        setChatResetKey((k) => k + 1);
        return true;
      } catch (error) {
        console.error('[RadChat] Failed to load conversation:', error);
        return false;
      }
    },
    [controller, dataSource, welcome],
  );

  // Restore the last conversation once, when persistence is on.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = canPersistConversation ? storage.get('conversation') : null;
    if (!saved) return;
    void loadConversation(saved, { onlyIfIdle: true }).then((ok) => {
      if (!ok && controller.activity === 0) storage.remove('conversation');
    });
  }, [canPersistConversation, controller, loadConversation, storage]);

  const switchToConversation = useCallback(
    async (id: string) => {
      const ok = await loadConversation(id);
      if (ok) {
        setShowHistory(false);
        focusChatInput(100);
      } else {
        controller.reply("Sorry, that conversation couldn't be opened. Please try again.");
        setShowHistory(false);
      }
    },
    [controller, focusChatInput, loadConversation],
  );

  // ---- pending actions after open -----------------------------------------------
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !pendingCommand) return;
    const command = pendingCommand;
    setPendingCommand(null);
    void controller.runCommandInput(command.startsWith('/') ? command : `/${command}`);
  }, [isOpen, pendingCommand, controller, chatResetKey]);

  useEffect(() => {
    if (!isOpen || pendingPrefill === null) return;
    const root = rootRef.current;
    if (!root) return;
    const text = pendingPrefill;
    const apply = (input: HTMLInputElement) => {
      setChatInputValue(input, text);
      input.focus();
      input.setSelectionRange(text.length, text.length);
      setPendingPrefill(null);
    };
    const input = root.querySelector<HTMLInputElement>('.react-chatbot-kit-chat-input');
    if (input) {
      apply(input);
      return;
    }
    const observer = new MutationObserver(() => {
      const found = root.querySelector<HTMLInputElement>('.react-chatbot-kit-chat-input');
      if (found) {
        observer.disconnect();
        apply(found);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isOpen, pendingPrefill, chatResetKey]);

  useEffect(() => {
    if (isOpen) focusChatInput();
  }, [isOpen, focusChatInput]);

  // ---- imperative API -----------------------------------------------------------
  const isOpenRef = useRef(isOpen);
  useLayoutEffect(() => {
    isOpenRef.current = isOpen;
  });

  const open = useCallback(
    (options: OpenOptions = {}) => {
      if (options.startNewConversation) controller.newConversation();
      setShowHistory(false);
      setOpen(true);
      if (options.command) setPendingCommand(options.command);
      if (options.prefillInput !== undefined) setPendingPrefill(options.prefillInput);
    },
    [controller, setOpen],
  );

  useImperativeHandle(
    ref,
    () => ({
      open,
      close: () => setOpen(false),
      toggle: () => setOpen(!isOpenRef.current),
      isOpen: () => isOpenRef.current,
      newConversation: () => controller.newConversation(),
      setLayout: changeLayout,
    }),
    [open, setOpen, controller, changeLayout],
  );

  // ---- rendering ----------------------------------------------------------------
  const renderContext = useMemo<RadChatRenderContext>(
    () => ({ locale, currency, blockRenderers, onLinkClick }),
    [locale, currency, blockRenderers, onLinkClick],
  );

  const chatConfig = useMemo(
    () => buildChatConfig({ title, initialMessages, avatar }),
    [title, initialMessages, avatar],
  );

  const validator = useCallback((input: string) => input.trim().length > 0, []);

  const attachmentOptions = props.attachments === false ? null : (props.attachments ?? {});
  const handleAttachmentsChange = useCallback(
    (attachments: Parameters<ChatController['setAttachments']>[0]) => controller.setAttachments(attachments),
    [controller],
  );
  const subscribeReset = useCallback(
    (listener: Parameters<ChatController['onAttachmentsReset']>[0]) => controller.onAttachmentsReset(listener),
    [controller],
  );

  const windowStyle: React.CSSProperties =
    layoutMode === 'floating'
      ? {
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          left: `${position.x}px`,
          top: `${position.y}px`,
          position: 'fixed',
          zIndex: 2147483644,
          boxShadow: '0 5px 20px rgba(0, 0, 0, 0.15)',
          borderRadius: '8px',
          overflow: 'hidden',
          minWidth: `${dimensions.minWidth}px`,
          minHeight: `${dimensions.minHeight}px`,
          maxHeight: `${dimensions.maxHeight}px`,
        }
      : layoutMode === 'sidebar'
        ? { width: `${dimensions.width}px` }
        : {};

  const isBusy = isDragging || isResizing;

  return (
    <div
      ref={rootRef}
      className={`radchat-widget ${isOpen ? 'open' : 'closed'}${isBusy ? ' radchat-is-busy' : ''}`}
      style={themeVariables(primaryColor)}
    >
      {!isOpen && !hideBubble && (
        <button
          type="button"
          className="radchat-toggle-button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${title}`}
          title={title}
          style={{
            position: 'fixed',
            bottom: corner.includes('top') ? 'auto' : '20px',
            top: corner.includes('top') ? '20px' : 'auto',
            left: corner.includes('left') ? '20px' : 'auto',
            right: corner.includes('left') ? 'auto' : '20px',
          }}
        >
          <span className="radchat-toggle-icon" aria-hidden="true">
            💬
          </span>
        </button>
      )}

      {hasOpened && (
        <div
          className={`radchat-container radchat-layout-${layoutMode}`}
          style={{ ...windowStyle, display: isOpen ? undefined : 'none' }}
          role="dialog"
          aria-modal="false"
          aria-label={title}
          hidden={!isOpen}
        >
          <ResizeHandles onResizeStart={handleResizeMouseDown} />
          <div className="radchat-container">
            <div className="radchat-header" onMouseDown={handleHeaderMouseDown}>
              <button
                type="button"
                className={`radchat-hamburger-button ${isMenuOpen ? 'open' : ''}`}
                onClick={() => setIsMenuOpen((prev) => !prev)}
                title="Menu"
                aria-label="Menu"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
              >
                <span className="radchat-hamburger-icon" />
              </button>
              <span className="radchat-title">{title}</span>
              <div className="radchat-header-buttons">
                <button
                  type="button"
                  className="radchat-new-chat-button"
                  onClick={() => controller.newConversation()}
                  title="New conversation"
                  aria-label="New conversation"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="radchat-close-button"
                  onClick={() => setOpen(false)}
                  title="Close"
                  aria-label="Close chat"
                >
                  ✕
                </button>
              </div>
            </div>

            {isMenuOpen && (
              <>
                <div className="radchat-menu-backdrop" onClick={() => setIsMenuOpen(false)} />
                <nav className="radchat-menu-panel" role="menu" aria-label="Chat menu">
                  {historyAvailable && (
                    <button
                      type="button"
                      className="radchat-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setShowHistory(true);
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>History</span>
                    </button>
                  )}
                  <div className="radchat-menu-section-label">Layout</div>
                  {LAYOUT_OPTIONS.map(({ mode, label, icon }) => (
                    <button
                      type="button"
                      key={mode}
                      className={`radchat-menu-item ${layoutMode === mode ? 'active' : ''}`}
                      role="menuitemradio"
                      aria-checked={layoutMode === mode}
                      onClick={() => {
                        changeLayout(mode);
                        setIsMenuOpen(false);
                      }}
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  ))}
                </nav>
              </>
            )}

            <div className="radchat-body">
              <RenderContext.Provider value={renderContext}>
                <Chatbot
                  key={`chatbot-${chatResetKey}`}
                  config={chatConfig}
                  actionProvider={ActionProvider}
                  messageParser={MessageParser}
                  placeholderText={placeholder}
                  validator={validator}
                  disableScrollToBottom={isResizing}
                />
              </RenderContext.Provider>
              <SlashAutocomplete rootRef={rootRef} commands={enabledCommandList} resetKey={chatResetKey} />
              {attachmentOptions && (
                <AttachmentPickerIntegration
                  rootRef={rootRef}
                  resetKey={chatResetKey}
                  options={attachmentOptions}
                  onAttachmentsChange={handleAttachmentsChange}
                  subscribeReset={subscribeReset}
                />
              )}
              {showHistory && historyAvailable && (
                <div className="radchat-history-overlay">
                  <ConversationHistory
                    dataSource={dataSource}
                    locale={locale}
                    onClose={() => setShowHistory(false)}
                    onSelectConversation={(id) => void switchToConversation(id)}
                    currentConversationId={conversationId}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
