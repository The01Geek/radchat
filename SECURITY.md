# Security policy

## Supported versions

RadChat is pre-1.0. Security fixes land on `main` and in the next release; older versions are not patched.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub's [private vulnerability reporting](https://github.com/The01Geek/radchat/security/advisories/new) for this repository.

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge reports within a few business days and will keep you informed while a fix is prepared. We are happy to credit reporters who want to be named.

## Scope and design notes

RadChat is a browser UI component. Things that are in scope:

- Script injection through answer content: Markdown, table cells, sources, link URLs, attachment names, or slash-command output.
- Data leaking from the widget to anything other than the host-provided `ChatDataSource`.
- Persisted state (`localStorage`) that contains more than the documented keys.

By design:

- RadChat never renders raw HTML from answers. Markdown links pass through react-markdown's default URL sanitizer, which drops unsafe schemes such as `javascript:`; source links are limited to `http` and `https`. Links open in a new tab with `noopener noreferrer`.
- Error details from the backend are not shown to users; `formatError` maps failures to generic text.
- Authentication is the host's responsibility. The fetch adapter forwards the headers and credentials mode you configure. Do not embed long-lived secrets in browser code.
- Plotly figures from the backend are rendered with the `plotly.js-basic-dist-min` bundle. Treat chart specs from untrusted sources with the same care as any other backend data.
