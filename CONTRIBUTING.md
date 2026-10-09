# Contributing to RadChat

Thanks for considering a contribution. RadChat is open to pull requests.

## Local setup

```bash
git clone https://github.com/The01Geek/radchat.git
cd radchat
npm install
npm run demo
```

Use Node.js 20.19 or newer (`.nvmrc` pins 22). Keep `package-lock.json` in sync with `package.json`; use npm.

## Workflow

1. Open an issue describing the problem or feature before sending a pull request for anything beyond a typo or one-line fix. We would rather agree on the design first than turn down a finished change.
2. Branch naming: `feat/short-description`, `fix/short-description`, `docs/...`, `chore/...`.
3. Keep pull requests focused. One concern per pull request.
4. Add tests. Anything new needs at least a unit test; changes to the widget shell, the controller, or the data-source contract also need a case in `src/widget/ChatWidget.test.tsx` or `src/chat/ChatController.test.ts`.
5. Run `npm run check` (lint, typecheck, tests, and all builds) before pushing.
6. Sign off your commits (`git commit -s`).

## Ground rules

- **No network access from the widget.** All backend traffic goes through the host's `ChatDataSource`.
- **No raw HTML.** Markdown renders through React elements only; links are limited to safe schemes.
- **Fixtures are synthetic.** Never commit real conversations, customer data, credentials, internal hostnames, or screenshots of real systems.
- **Permissive dependencies only.** Production dependencies must be MIT, ISC, BSD, Apache-2.0, or similar. CI enforces this. Do not add a dependency without discussing it in an issue first.
- **CSS stays prefixed.** New classes start with `radchat-`, and new tokens with `--radchat-`.

## Reporting bugs

Use the bug report template. Include the RadChat version or commit, your React version and browser, and the widget options you use (with secrets and URLs redacted). Report security issues privately; see [SECURITY.md](SECURITY.md).

## Code style

- ESLint (flat config) and TypeScript in strict mode. CI rejects lint or type errors.
- Public APIs are typed in `src/types.ts` and documented with TSDoc.
- Keep the widget accessible: keyboard paths for every action, ARIA roles that match behavior, and respect for reduced motion.

## Releases

Maintainers cut releases by updating `CHANGELOG.md` and the version in `package.json`, then tagging `vX.Y.Z`. RadChat is not published to npm yet.
