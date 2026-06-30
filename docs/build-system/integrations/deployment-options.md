---
last_updated: 2026-05-07
owner: Architect
---

# Deployment Options

This project has moved from a one-off event posture to a durable pet-project
posture. Local execution remains the default for development, but product
features that need persistence, stable public access, or external callbacks can
use the cloud path.

## Decision Rule

Default to **local development** for iteration. Use **local tunnel** for
temporary external callback testing. Use **cloud deployment** when the product
needs a stable public backend, persistent storage, a long-lived MCP server, or
shareable access while the laptop is offline.

For the CloudFront + Railway path requested on 2026-05-06, use
`docs/build-system/integrations/cloud-deployment.md` as the deployment contract.
The cloud path keeps CloudFront as the public entrypoint and Railway as the
single Express runtime.

| Need | Default choice | Why |
| --- | --- | --- |
| Local development | Local app | Fastest path while the feature is changing. |
| Temporary webhook or MCP URL | Local app + ngrok or Cloudflare Tunnel | Gives ElevenLabs a public HTTPS URL with minimal ceremony. |
| Frontend-only product slice that must stay online | Vercel | Fast Git or CLI deployment, preview URLs, environment variables. |
| Public backend, API, or MCP server that should stay reachable | Railway | Simple GitHub or CLI deploy, public domain generation, normal web service model. |
| Durable product data such as leaderboard entries | Express API + DynamoDB | Keeps writes server-side and survives local restarts. |
| Public backend backup option | Render | Simple persistent web service hosting with public URL and env vars. |

## Option A: Local Tunnel

Use this when the prototype can run on the developer machine and only needs a
temporary public HTTPS URL for the room, webhooks, or ElevenLabs MCP.

Good for:

- ElevenLabs MCP server testing;
- webhooks;
- local development demos;
- avoiding cloud setup during early ideation.

Trade-offs:

- The laptop must stay online.
- Free or ephemeral URLs may change.
- If the URL changes, the ElevenLabs MCP server integration may need to be updated.
- Do not expose admin panels or sensitive local services.

Typical commands:

```bash
ngrok http 3000
```

or a Cloudflare Tunnel equivalent if Cloudflare is already available.

Tunnel requirements:

- The local app starts with one command.
- The app reads `PORT` or documents the fixed local port.
- The tunnel URL is copied into any external tool that calls the app.
- The developer keeps the laptop awake and connected.
- A cloud deployment is preferred once the URL must be stable.

### Verified Tunnel Flow

Current local flow:

```bash
npm run dev
ngrok http 3000
```

Verified on 2026-05-06:

- Vite UI serves at `http://localhost:3000`.
- Express API serves at `http://localhost:8787`.
- The tunnel public URL forwards to `http://localhost:3000`.
- Public root URL should return `HTTP 200`.
- Public `/api/status` should return the Express status JSON through the Vite
  proxy.

Tunnel URLs are ephemeral and should not be committed as stable project
configuration.

Vite requires explicit allowed hosts for ngrok. The project currently allows:

```ts
allowedHosts: [".ngrok-free.dev", ".ngrok-free.app"]
```

Useful checks:

```bash
curl -I https://<ngrok-host>
curl https://<ngrok-host>/api/status
curl http://127.0.0.1:4040/api/tunnels
```

## Option B: Vercel

Use this when the project is primarily a web UI or a Next.js-style app with light serverless routes and needs to remain available without the local machine.

Good for:

- frontend product slices;
- landing-free product UI;
- simple API endpoints that do not need long-lived connections;
- preview deployments from GitHub.

Trade-offs:

- Long-running SSE MCP servers may not be the best fit for serverless functions.
- Any secret used by server-side routes must be configured as a Vercel environment variable.

Prepared command shape:

```bash
npx vercel
npx vercel --prod
```

## Option C: Railway

Use this as the default cloud path when the product needs a public backend or MCP server that should stay reachable without the local machine.

Good for:

- Express, Fastify, Hono, FastAPI, or similar HTTP servers;
- public MCP server URL;
- apps that need a normal long-running process;
- quick GitHub or CLI deploys.

Implementation requirements:

- Server must listen on `0.0.0.0`.
- Server must use `process.env.PORT` or the equivalent in its runtime.
- Secrets must be configured as Railway service variables, not committed.
- Generate a public domain for the service before registering it in ElevenLabs.

Prepared command shape:

```bash
railway init
railway up
```

## Option D: Render

Use this as a backup for a persistent public backend if Railway is unavailable.

Good for:

- Node, Python, or Docker web services;
- stable public `onrender.com` URL;
- a conventional always-on web service model.

Implementation requirements:

- Server must bind to `0.0.0.0`.
- Server must read the platform port from the environment.
- Secrets must be configured in Render, not committed.

## Runtime Checklist

Before exposing the app:

- GitHub repo is pushed and accessible.
- `.env.example` documents required secrets.
- No real `.env` file is tracked.
- `PORT` is supported by any server code we add.
- The app can run locally with one command.
- If MCP is needed, the server exposes an SSE or streamable HTTP endpoint.

For temporary tunnel testing:

1. Start the local app.
2. Expose it with ngrok or Cloudflare Tunnel if a public URL is needed.
3. Copy the tunnel URL into ElevenLabs MCP setup if needed.
4. Run `npm run elevenlabs:mcp:create`.
5. Run `npm run elevenlabs:mcp:tools -- <mcp_server_id>` to confirm tool visibility.
6. Deploy to Vercel, Railway, or Render when the URL or runtime must be stable.

## References

- [ElevenLabs MCP tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp)
- [Vercel deployments](https://vercel.com/docs/deployments/deployment-methods)
- [Vercel environment variables](https://vercel.com/docs/projects/environment-variables)
- [Railway quick start](https://docs.railway.com/quick-start)
- [Railway public networking](https://docs.railway.com/deploy/exposing-your-app)
- [Render web services](https://render.com/docs/web-services/)
- [ngrok secure tunnels](https://ngrok.com/docs/guides/share-localhost/tunnels)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)
