# tgADBot

tgADBot is a Telegram moderation bot that scores incoming group messages for advertising intent using an LLM classifier. High-risk content is logged, persisted, and optionally removed while administrators are exempt from scoring.

## Quick Start
- Install prerequisites: Node.js 20+, `corepack enable pnpm`.
- Install dependencies: `pnpm install`.
- Copy `config/.env.example` to `.env.local`, then fill required secrets (see [Configuration](#configuration)).
- Run the bot locally: `pnpm dev`. The entry point is `src/index.ts`, which boots the Telegram webhook/polling handler.

## Configuration
Environment variables are read exclusively in `src/config/env.ts`. Provide them via `.env.local`:

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token issued by BotFather. |
| `LLM_API_KEY` | ✅ | API key for the LLM provider (default endpoint: SiliconFlow). |
| `LLM_API_URL` | ⛔️ | Override classification endpoint (defaults to `https://api.siliconflow.cn/v1`). |
| `LLM_MODEL` | ⛔️ | Model identifier, defaults to `Qwen/Qwen3-8B`. |
| `DATABASE_PATH` | ⛔️ | JSON storage path for lowdb, defaults to `./data/db.json`. |

Avoid committing secrets; `.env.local` is git-ignored.

## Project Layout
- `src/index.ts` – bootstraps the bot and registers webhooks/polling.
- `src/bot/handlers/` – Telegram update handlers; middleware lives in `src/bot/middleware/`.
- `src/services/` – framework-agnostic business logic.
- `src/lib/` – shared helpers (logging, rate limiting, adapters).
- `src/config/` – typed configuration factories and env parsing.
- `tests/unit/` & `tests/integration/` – Vitest suites mirroring the source tree.
- `data/` – runtime JSON datastore (ignored in git, seeded at runtime).

## Commands
- `pnpm dev` – run the bot with live reload via `tsx watch src/index.ts`.
- `pnpm build` – compile TypeScript to `dist/` for deployment.
- `pnpm test` – execute Vitest; append `--runInBand` for specs hitting external APIs.
- `pnpm lint` – run ESLint.
- `pnpm format` – apply Prettier fixes.
- `pnpm audit` – review dependency advisories (recommended monthly).

## Testing & Quality
- Maintain ≥85% coverage; mirror source paths for spec files (e.g. `tests/unit/bot/handlers/user.test.ts`).
- Stub Telegram APIs and HTTP calls with `nock` or `msw` to keep suites deterministic.
- Tag slow or network-bound specs with `test.runIf(process.env.CI)`.
- Run `pnpm lint` and `pnpm format` before opening a pull request.

## Contribution Workflow
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) with ≤72-character subjects.
- Pull requests should outline intent, risks, linked issues, and include evidence of `pnpm test` and `pnpm lint`.
- Highlight breaking changes, new config, or migration steps up front.
