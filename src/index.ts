/**
 * RadChat — an embeddable React chat widget for analytics assistants.
 *
 * @packageDocumentation
 */

export { ChatWidget } from './widget/ChatWidget';
export { mount, type MountedChatWidget } from './mount';
export { BlockRenderer, SourcesList } from './blocks/BlockRenderer';
export { MarkdownMessage } from './chat/MarkdownMessage';
export { BUILT_IN_COMMANDS, CommandRegistry, parseCommandInput, resolveCommands } from './commands/registry';
export { defaultFormatError } from './chat/ChatController';
export { validateCSSColor } from './widget/theme';
export { createMockDataSource, type MockDataSourceOptions } from './data/mock/createMockDataSource';
export { createFetchDataSource, HttpError, type FetchDataSourceOptions } from './data/fetch/createFetchDataSource';
export type * from './types';
