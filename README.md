# Exit MacPaw Space - Vibecoding Collective

Vibecoding Collective is a small voice-first AI quest-room pet project centered
on speech, audio, and conversational interaction.

The current prototype is **Exit MacPaw Space: Badge Not Found**. The player is
in a simplified MacPaw Space room after a vibecoding event and has to find the
exit code by speaking to the right characters in the right way. Spoken input is
the intended interaction: who the player addresses matters, the room state moves
through voice turns, and spoken output closes the loop when provider credentials
are configured.

The current cast is Sofiia, Dan, Hoover, and Fixel. Sofiia opens the room and
keeps unaddressed turns grounded, Dan is tied to the missing badge and final
code entry, Hoover reveals the Fixel clue only after a gentle direct address,
and Fixel is a nonverbal cat whose visual state reveals the badge code.

## Current Production State

The public demo is intended to run through the browser-facing CloudFront/custom
domain entrypoint with the Express API behind the same origin. Voice play and
leaderboard features require the production backend and provider credentials to
be available.

## Demo Promise

- A fullscreen quest-room scene, not a dashboard.
- Voice-first player input with minimal UI chrome.
- Ukrainian and English spoken play without an in-room language selector.
- Distinct spoken character roles when ElevenLabs TTS is configured.
- Server-side provider calls so API keys never ship to the browser.
- A small, explainable happy path that can be shown live in a few minutes.

## Tech Snapshot

- TypeScript
- Vite + React
- Node.js + Express
- Optional Claude text generation behind the Express boundary
- Optional ElevenLabs STT/TTS and local Fixel sound effects
- Optional DynamoDB-backed leaderboard storage

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

Default local URLs:

- UI: `http://localhost:3000`
- API: `http://localhost:8787`

The app can run locally without paid provider keys, but the richest voice path
needs server-side environment variables in `.env`. Keep real values local or in
platform secrets only.

Useful checks:

```bash
npm run typecheck
npm run test:quest
npm run build
```

## Environment

`.env.example` documents the supported variables. Common local values include:

- `CLAUDE_API_KEY` and `CLAUDE_MODEL` for server-side Claude replies.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_STT_MODEL` for ElevenLabs speech paths.
- `LEADERBOARD_TABLE_NAME` and `LEADERBOARD_COMPLETION_TOKEN_SECRET` for
  persistent leaderboard storage.
- `SERVER_PORT` for the Express API port.

Do not commit `.env`, provider keys, AWS credentials, Railway tokens, or MCP
server tokens.

## Project Docs

- `docs/product/product.md` is the product source of truth.
- `docs/readme.md` indexes the documentation system.
- `docs/build-system/architecture/stack.md` records the stack and contracts.
- `docs/build-system/integrations/cloud-deployment.md` records the cloud path.
- `docs/build-system/integrations/elevenlabs-mcp.md` explains the ElevenLabs MCP
  setup.
- `AGENTS.md` and `CLAUDE.md` define agent workflow rules.

## Security

Do not open public issues containing secrets, API keys, tokens, credentials, or
private infrastructure details. See `SECURITY.md`.

## License

MIT. See `LICENSE`.
