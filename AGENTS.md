# Ghazali

Islamic dream interpretation PWA. French-language interface. Draws on the classical dream-interpretation tradition — Ibn Sirin, Al-Nabulsi, Ibn Shahin — and is voiced through a persona named **Ahlam** (أحلام).

Scope is strict: dream interpretation, marriage questions in an Islamic frame, and light related spiritual guidance. Everything else is redirected.

## Tech stack

- Frontend: static HTML/CSS/JS (no framework, no build step). `ghazali.css` holds all styles.
- Backend: Vercel serverless functions in `api/` (Node.js, ES modules).
- LLM: Anthropic Codex (`Codex-sonnet-4-6`) via streaming SSE. Key read from `ANTHROPIC_API_KEY` env var — never shipped to the browser.
- Data: Supabase (REST, service-role key server-side only) for conversations + messages. Works without Supabase (degraded, anonymous-only) if env vars are absent.
- PWA: `manifest.json` + `sw.js` service worker. `standalone` display, theme `#1A2D42`.
- Deploy: Vercel. `vercel.json` defines function durations, rewrites (`/app`, `/onboarding`), redirects (`/` → `/onboarding`, `/chat` → `/app`), and security headers.

## Entry points

- `index.html` — bare meta-refresh to `/onboarding.html`.
- `onboarding.html` — landing + first-run flow.
- `app.html` — main chat UI where the user talks to Ahlam. (`app.old.html` is the previous version, kept for reference.)

Public assets: `favicon.ico`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `robots.txt`, `sitemap.xml`.

## `api/` layout

Everything prefixed with `_` is a shared helper, not a route.

- `_system-prompt.js` — Ahlam's system prompt (`SYSTEM_PROMPT` export, ~30 KB French template literal). Server-side only, never sent to the browser. `_system-prompt.backup.js` is the previous version.
- `_dream-data.js` — bundled dream dictionary (~3 MB), sourced from the classical tradition.
- `_dream-lookup.js` — builds an in-memory lookup index over `_dream-data.js`; `getDreamContext(text)` returns relevant entries to inject as `[REFERENCE]` context before the user's last message.
- `_supabase.js` — thin REST helper (`supabaseQuery`, `getAuthUser`) using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `_cors.js` — `setCors` + `getUserIdentity` (resolves authenticated user vs. anonymous `anon_id`).

Routes:

- `chat.js` — POST, streaming. Validates the message array, enforces a 3 assistant-replies-per-hour rate limit (bypassable via `RATE_LIMIT_WHITELIST` emails), persists the conversation + user message to Supabase when configured, enriches the last user turn with dream-dictionary context, then proxies a streamed Anthropic response back to the client. `maxDuration: 60`.
- `conversations.js` — GET (list) + DELETE (with ownership check). Filters by `user_id` or `anon_id`.
- `messages.js` — messages for a conversation.
- `save-response.js` — persists the assistant's final streamed reply.
- `migrate-anon.js` — moves a prior anonymous session's conversations onto a newly signed-in user.
- `config.js` — exposes the public Supabase config (URL + anon key) to the frontend.

## `data/`

- `dream_entries.json` — source-of-truth dream dictionary.
- `daily-content.json` — daily content surface (hadith / reminders / tips).

## `scripts/`

One-off Python helpers used to build the dream dictionary; not run at request time.

- `parse_dream_dict.py` — parses the source dictionary text.
- `add_translations.py` — adds per-language aliases.
- `merge_translations.py` — merges translation passes back into `dream_entries.json`.

## Conventions

- ES modules throughout `api/` (`import` / `export`).
- Never expose `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the client. Client uses the Supabase anon key via `/api/config`.
- User-facing strings are French. Ahlam never refers to herself as AI / LLM / Codex / Anthropic — see the persona rules at the top of `_system-prompt.js`.
- `RÈGLE ABSOLUE N°1` in the system prompt (Islamic sensitivity) is load-bearing. Don't weaken it.
- Streaming: `chat.js` forwards the Anthropic SSE bytes as-is; the client parses events.
- Rate limit: 3 assistant replies/hour/user (or anon_id). Whitelist via env.
- Commits: conventional, English.

## Deploy

Vercel. `vercel.json` is the source of truth for routes, headers, and function `maxDuration`. Required env vars: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional: `RATE_LIMIT_WHITELIST`.
