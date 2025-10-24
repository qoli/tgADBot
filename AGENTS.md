# Repository Guidelines

## Project Structure & Module Organization
- Bot bootstrap lives in `src/index.ts`; it wires up webhook or polling mode.
- Telegram handlers sit under `src/bot/handlers/`, with reusable middleware in `src/bot/middleware/`.
- Business logic belongs in `src/services/`; shared utilities (logging, rate limiting, Telegram adapters) go in `src/lib/`.
- Configuration reads and typing stay isolated in `src/config/`, sourced from `.env.local` and mirrored in `config/.env.example`.
- Tests mirror the source tree: fast specs in `tests/unit/`, Telegram sandbox flows in `tests/integration/`.
- Automation scripts executed with `pnpm tsx` live in `scripts/`; deployment manifests stay in `config/`.

## Build, Test, and Development Commands
- `corepack enable pnpm && pnpm install` syncs dependencies from `pnpm-lock.yaml`.
- `pnpm dev` runs the bot with `tsx watch src/index.ts` for local iteration.
- `pnpm build` compiles TypeScript to `dist/` for production packaging.
- `pnpm test` runs the Vitest suite; append `--runInBand` for specs touching external APIs.
- `pnpm lint` invokes ESLint, and `pnpm format` applies Prettier; run both before review.

## Coding Style & Naming Conventions
- Target Node.js 20 with strict TypeScript settings and keep modules `kebab-case`.
- Use two-space indentation, semicolons, and single quotes; Prettier enforces 100-character lines.
- Export functions in `camelCase`, classes in `PascalCase`, and Telegram handlers prefixed with `handle`.
- Prefer the shared logger from `src/lib/logger.ts` over `console.*` statements.

## Testing Guidelines
- Use Vitest; locate specs alongside their source counterparts (e.g., `tests/unit/bot/handlers/user.test.ts`).
- Fake network and Telegram I/O (e.g., `nock`, `msw`) to keep tests deterministic.
- Tag slow or remote scenarios with `test.runIf(process.env.CI)` and maintain ≥85% coverage.
- Integration tests must clean up created chats or fixtures to remain idempotent.

## Commit & Pull Request Guidelines
- Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:` with subjects under 72 characters.
- Summaries should capture intent, risks, and rollout steps; link tracking issues inside the PR body.
- Include evidence for `pnpm test`, `pnpm lint`, and any relevant screenshots or logs.
- Call out breaking changes or new configuration requirements before requesting review.

## Security & Configuration Tips
- Never commit secrets; keep runtime values in `.env.local` and surface sanitized defaults in `.env.example`.
- Rotate Telegram tokens after demos, audit dependencies monthly with `pnpm audit`, and review webhook scopes for least privilege.
- Sanitize identifying information before logging and centralize environment access through `src/config/env.ts`.
