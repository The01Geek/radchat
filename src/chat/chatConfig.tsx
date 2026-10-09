/**
 * Builds the react-chatbot-kit configuration for one widget: the welcome
 * message, the avatar, Markdown bot messages, and the custom message types for
 * block answers, user messages with attachments, and the typing indicator.
 */
import type { ReactElement, ReactNode } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { TypingIndicator } from './Loading';
import { BlockRenderer } from '../blocks/BlockRenderer';
import {
  BLOCKS_MESSAGE,
  TYPING_MESSAGE,
  USER_ATTACHMENTS_MESSAGE,
  type BlocksPayload,
  type KitMessage,
  type UserAttachmentsPayload,
} from './ChatController';

/** Neutral default avatar: a speech bubble. */
export function DefaultAvatarIcon() {
  return (
    <svg
      className="react-chatbot-kit-chat-bot-avatar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BotAvatar({ avatar }: { avatar?: ReactNode }) {
  return (
    <div className="react-chatbot-kit-chat-bot-avatar" aria-hidden="true">
      <div className="react-chatbot-kit-chat-bot-avatar-container">{avatar ?? <DefaultAvatarIcon />}</div>
    </div>
  );
}

function BotRow({ avatar, children, className = '' }: { avatar?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="react-chatbot-kit-chat-bot-message-container">
      <BotAvatar avatar={avatar} />
      <div className={`react-chatbot-kit-chat-bot-message ${className}`.trim()}>{children}</div>
    </div>
  );
}

const ATTACHMENT_ICONS: Record<string, string> = { image: '🖼️', file: '📄' };

function UserMessageWithAttachments({ payload }: { payload?: UserAttachmentsPayload }) {
  const attachments = payload?.attachments ?? [];
  return (
    <div className="react-chatbot-kit-user-chat-message-container">
      <div className="react-chatbot-kit-user-chat-message">
        {payload?.text}
        {attachments.length > 0 && (
          <div className="radchat-user-msg-attachments">
            {attachments.map((a, i) => (
              <span key={i} className="radchat-user-msg-attachment-tag" title={a.name}>
                <span aria-hidden="true">{ATTACHMENT_ICONS[a.type] ?? '📎'}</span> {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CustomMessageProps {
  payload?: unknown;
}

export interface ChatConfigOptions {
  title: string;
  initialMessages: KitMessage[];
  avatar?: ReactNode;
}

/** react-chatbot-kit `config` object. */
export function buildChatConfig({ title, initialMessages, avatar }: ChatConfigOptions) {
  return {
    botName: title,
    initialMessages,
    customComponents: {
      // The widget renders its own header.
      header: (): ReactElement => <div style={{ display: 'none' }} />,
      botAvatar: (): ReactElement => <BotAvatar avatar={avatar} />,
      botChatMessage: ({ message }: { message: string }): ReactElement => (
        <div className="react-chatbot-kit-chat-bot-message">
          <MarkdownMessage content={message} />
        </div>
      ),
    },
    customMessages: {
      [BLOCKS_MESSAGE]: ({ payload }: CustomMessageProps): ReactElement => {
        const data = (payload ?? {}) as Partial<BlocksPayload>;
        return (
          <BotRow avatar={avatar} className="radchat-blocks-message">
            <BlockRenderer blocks={Array.isArray(data.blocks) ? data.blocks : []} sources={data.sources} />
          </BotRow>
        );
      },
      [USER_ATTACHMENTS_MESSAGE]: ({ payload }: CustomMessageProps): ReactElement => (
        <UserMessageWithAttachments payload={payload as UserAttachmentsPayload | undefined} />
      ),
      [TYPING_MESSAGE]: (): ReactElement => (
        <BotRow avatar={avatar}>
          <TypingIndicator />
        </BotRow>
      ),
    },
  };
}
