# Changelog

All notable changes to RadChat will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [SemVer](https://semver.org/).

## [Unreleased]

First public version, to be released as 0.1.0.

### Added
- `ChatWidget` React component with floating, sidebar, and fullscreen layouts; header drag, 8-way resize, and persisted position, size, layout, open state, and current conversation.
- `ChatDataSource` interface: one required `sendMessage`, plus optional `getConversation` and `listConversations` for restore and History.
- `createMockDataSource` with synthetic demo data, and `createFetchDataSource` for a small JSON HTTP contract (`HttpError` for non-2xx responses).
- Answer blocks: Markdown text (with labelled disclosures), formatted tables with CSV download, lazily loaded Plotly charts, sources, and host-rendered custom blocks.
- Slash commands with keyboard autocomplete: built-in `/help`, `/clear`, `/reset`, `/history`; host commands that run locally or pass through to the data source; `enabledCommands` and `unknownCommands` options.
- Image, document, and camera attachments with count, size, and type limits.
- History panel with paging.
- Imperative handle (`open`, `close`, `toggle`, `isOpen`, `newConversation`, `setLayout`) and `mount()` for non-React pages; standalone UMD build exposing `window.RadChat`.
- Theming through `primaryColor` and `--radchat-*` CSS tokens.
- Demo app, unit and component tests, and CI (lint, typecheck, tests, builds, license allowlist, secret scan).
