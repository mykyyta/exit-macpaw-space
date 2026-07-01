---
last_updated: 2026-05-09
owner: Architect
---

# Baseline Stack

The baseline stack is optimized for local iteration first and durable pet-project
deployment second.

## Decision

- **Language:** TypeScript.
- **Client:** Vite + React.
- **Server:** Node.js + Express, deployable as either a local process or an AWS
  Lambda handler.
- **Shared contracts:** TypeScript types in `src/shared/`.
- **Local delivery:** one `npm run dev` command starts client and server.
- **External access:** expose the local client or server with ngrok or Cloudflare Tunnel for temporary callback testing; use the cloud runtime for stable public access.
- **Persistent storage:** keep storage behind the Express server. Use DynamoDB
  for durable product data such as leaderboard entries when persistence matters.

## Why This Stack

- Fast local startup.
- Familiar browser-first UI path.
- Server boundary is available for secrets and ElevenLabs API calls.
- Express can host webhooks, API routes, and future MCP endpoints without committing to a larger framework.
- Vite keeps the frontend simple while the product shape continues to evolve.
- DynamoDB is a small durable storage option for append/read product data without
  introducing a full relational database or queue.

## Runtime Shape

```text
Browser
  -> Vite dev server :3000
      -> /api proxy
          -> Express server :8787
              -> ElevenLabs / MCP / webhook integrations
```

With a temporary tunnel:

```text
Public ngrok URL
  -> localhost:3000
      -> Vite UI and /api proxy
          -> localhost:8787 Express API
```

For cloud deployment, build output is:

- `dist/` for the client;
- `dist/server/` for the compiled server.
- `.lambda-build/function.zip` for the Lambda API handler.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run package:lambda
npm start
```

## Environment

- `PORT` controls the Vite client port for local development.
- `SERVER_PORT` controls the Express API port.
- `CLAUDE_API_KEY` and `CLAUDE_MODEL` configure server-side Claude text generation.
- `GEMINI_API_KEY` and `GEMINI_MODEL` configure server-side Gemini text generation and image-generation readiness.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_STT_MODEL`, and `ELEVENLABS_SFX_MODEL`
  configure server-side or script-driven ElevenLabs direct API calls.
- The ElevenLabs TTS model is a code constant in `src/server/providers/config.ts`.
  The quest uses `eleven_v3` for more expressive character speech rather than a
  deployment environment variable.
- ElevenLabs voice IDs for Dan, Hoover, and Sofiia are code constants in
  `src/server/providers/config.ts`, not deployment environment variables.
  Per-character ElevenLabs TTS tuning lives in
  `src/server/quest/engine/voice-adapter.ts`; Sofia and Dan intentionally use
  slower, more expressive settings so their voices read deeper and more
  emotional. There is no room or door TTS voice in the current scenario.
- Fixel is a nonverbal actor. His purr/grumble audio should be generated as
  static ElevenLabs Sound Effects assets under `public/audio/` with
  `npm run elevenlabs:sfx:fixel -- --yes`, then played as local assets at
  runtime. Runtime quest turns should not call Sound Effects generation.
- `ELEVENLABS_MCP_SERVER_URL` is used by the MCP registration helper.
- `DEMO_API_TOKEN` can protect paid provider endpoints if a demo route is exposed through a public tunnel.
- DynamoDB configuration belongs in server-side environment variables when a
  persistent storage adapter is introduced. Do not expose AWS credentials to the
  browser.
- In the AWS Lambda runtime, DynamoDB access should come from the Lambda IAM
  role. Provider API keys and completion-token secrets stay in Lambda
  environment variables or another server-side secret store, never in the
  frontend bundle.

## Client Layout

`src/client/` is grouped by concern so that orchestration in `App.tsx` stays
thin and helpers stay easy to find:

- `App.tsx`, `main.tsx` — top-level orchestration and bootstrap.
- `components/` — presentational React components.
- `api/` — `fetch` wrappers around the Express routes plus shared error parsing.
- `audio/` — reply audio playback, browser speech synthesis, and the small
  module-level singletons that back them.
- `speech/` — STT helpers: browser detection and the ElevenLabs realtime
  recognizer factory.
- `quest/` — quest state mapping, language input shaping, and bubble copy
  selection.
- `leaderboard/` — leaderboard-only formatters.
- `copy/` — bilingual UI copy as a typed dictionary.
- `config/` — runtime constants (timing thresholds, supported languages,
  static asset URLs).
- `types/` — DOM shim types and small client-only contracts.
- `styles/` — split CSS modules combined through `styles/index.css`.

Pure helpers and constants live in their feature folder. `App.tsx` keeps the
React state, refs, and effect orchestration; it imports helpers but does not
re-implement them.

## Provider Boundary

Direct provider API calls live under `src/server/providers/` and are called only from the Express server. The browser may receive readiness metadata, generated content, or audio responses through server routes, but it must never receive raw provider API keys.

Claude quest-brain requests use provider-level content blocks so stable scenario
instructions can be marked with Anthropic prompt caching `cache_control`. Keep
current quest state, allowed transitions, reply language, and player transcript
in an uncached dynamic block.

Quest-brain routing is LLM-first. The backend supplies the current state and
allowed transition cards, then accepts the LLM's semantic transition choice when
that transition is available in the current state and passes critical safety
checks. Keyword classifiers and aliases may support emergency fallback and tests,
but they must not duplicate normal scenario routing or block an otherwise
available LLM decision. Runtime fallback should avoid progressing the quest
except for the first mandatory Sofiia introduction; progression, direct hints,
and cat puzzle interpretation should come from the LLM prompt.

The direct ElevenLabs connector is separate from the ElevenLabs MCP registration helper. Use the direct connector when this app calls ElevenLabs APIs. Use MCP registration when an ElevenLabs Conversational AI agent needs to call tools exposed by this project or another MCP server.

ElevenLabs Sound Effects generation is treated as an asset-production step, not
a per-turn runtime dependency. The generation script requires `--yes` because it
can consume paid credits. Generated files are served by Vite or the built client
from `public/audio/`.

## Voice Language Contract

The voice quest supports Ukrainian and English without a visible language
selector. Language is decided per voice turn and carried through shared
TypeScript contracts in `src/shared/voice.ts`.

Supported quest languages are:

```ts
type QuestLanguage = "uk" | "en";
```

The browser may send provider language metadata with `/api/voice-turn`, but the
server owns the final `languageDecision` used for quest classification and reply
generation. The decision should consider, in order:

1. high-confidence ElevenLabs STT metadata for Ukrainian or English;
2. transcript heuristics when provider metadata is missing;
3. the last reliable session language for short or ambiguous turns;
4. Ukrainian as the default when no reliable signal exists.

Short turns such as `Hoover`, `Fixel`, `404`, `hey`, `boo`, `бу`, `mrr`, or
`мрр` are language-ambiguous. They should not switch the reply language unless
provider confidence is high enough. Use a sticky previous language for these
turns when a quest session already has one.

Main quest UI copy should follow the current quest language for player-facing
messages, errors, leaderboard states, and accessibility labels. The microphone
control is the deliberate exception: its primary button label may remain fixed
English as `Push to talk`, with a compact bilingual hint such as
`EN/UA · sound on` so players understand both input languages are accepted
without adding a selector.

ElevenLabs recorded and realtime STT are the primary bilingual paths. Browser
speech recognition is only a fallback because browser support for automatic
per-turn Ukrainian/English language detection is inconsistent; fallback may use
the last reliable language or a conservative default. Do not claim browser STT
has provider-grade language detection.

ElevenLabs STT may auto-detect languages outside the product's supported
Ukrainian/English set when audio is short, noisy, or ambiguous. Realtime STT
requests should include provider language detection metadata, and the app should
treat clearly unsupported detected transcripts, especially CJK-script output
without Ukrainian or English signal, as unrecognized speech rather than sending
that transcript into the quest brain.

Do not store raw voice transcripts for language analytics unless the product
privacy posture is updated first.

## Storage Boundary

Persistent product data lives behind Express API routes. The browser sends
validated request data to the server; the server owns normalization, rate
limits, persistence, and read shapes.

For leaderboard entries, the expected path is:

```text
Browser
  -> /api/leaderboard
      -> Express route
          -> leaderboard storage adapter
              -> DynamoDB table
```

Store only the smallest needed fields, such as display name, completion time,
attempt count, and completion timestamp. Do not store raw voice transcripts or
PII unless the product explicitly needs it and the privacy posture is updated.

### Leaderboard Contract

The first leaderboard is `exit-macpaw-space:v1`. The browser may read recent
entries at `GET /api/leaderboard`, but writes must go through
`POST /api/leaderboard` with a server-issued completion token.

The server owns completion metrics:

- `startedAt`: first accepted voice turn in a quest session;
- `completedAt`: server timestamp when the session reaches completion;
- `durationMs`: `completedAt - startedAt`;
- `attempts`: accepted final voice turns in the session.

The create request accepts only:

```json
{
  "displayName": "Player",
  "completionToken": "opaque-server-token"
}
```

The token carries signed session metrics and a nonce. The client must not submit
`durationMs`, `attempts`, `completedAt`, `sessionId`, or DynamoDB keys directly.

DynamoDB item shape:

```ts
{
  leaderboardId: "exit-macpaw-space:v1";
  createdKey: "completed#<reverseEpochMs:13>#<entryId>";
  entryId: string;
  sessionId: string;
  displayName: string;
  completedAt: string;
  durationMs: number;
  attempts: number;
  submittedAt: string;
  tokenNonce: string;
}
```

`reverseEpochMs` is `9999999999999 - completedAtEpochMs`, zero-padded to 13
digits. Querying one `leaderboardId` in ascending `createdKey` order returns
newest completions first without scanning the table. Duplicate display names and
multiple runs are allowed.

Validation rules:

- reject unknown write fields;
- trim display names and require 1 to 32 characters;
- reject missing, invalid, or reused completion tokens;
- enable leaderboard storage when `LEADERBOARD_TABLE_NAME` and
  `LEADERBOARD_COMPLETION_TOKEN_SECRET` are configured;
- allow `LEADERBOARD_ENABLED=false` or `LEADERBOARD_WRITE_ENABLED=false` as
  optional kill switches;
- bound list reads to `LEADERBOARD_MAX_ENTRIES`, with a hard maximum of 50;
- return predictable 4xx errors for validation and disabled states, and 5xx only
  for server or storage failures.

## Rules

- Keep secrets server-side.
- Keep shared request/response shapes in `src/shared/`.
- Add backend routes only when the client, direct provider APIs, MCP, or webhook flow needs them.
- Protect paid provider routes before exposing them through a public tunnel.
- Keep the first version of a feature small enough to explain in under a minute.
- Keep Vite `allowedHosts` compatible with ngrok tunnel domains used for temporary callback testing.
