---
last_updated: 2026-06-30
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

For the CloudFront + Lambda path accepted on 2026-06-30, use
`docs/build-system/integrations/cloud-deployment.md` as the deployment contract.
The cloud path keeps CloudFront as the public entrypoint and Lambda Function URL
as the serverless Express runtime.

| Need | Default choice | Why |
| --- | --- | --- |
| Local development | Local app | Fastest path while the feature is changing. |
| Temporary webhook or MCP URL | Local app + ngrok or Cloudflare Tunnel | Gives ElevenLabs a public HTTPS URL with minimal ceremony. |
| Frontend-only product slice that must stay online | Vercel | Fast Git or CLI deployment, preview URLs, environment variables. |
| Public backend or API that should stay reachable without a developer server | CloudFront + Lambda Function URL | Serverless runtime with no long-running service to keep alive. |
| Durable product data such as leaderboard entries | Express API + DynamoDB | Keeps writes server-side and survives local restarts. |
| Public backend backup option | Render or another approved web service host | Conventional always-on web service hosting if Lambda is a poor fit. |

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

## Option C: CloudFront + Lambda Function URL

Use this as the default cloud path when the product needs a public backend that
should stay reachable without the local machine or a developer-owned server
process.

Good for:

- Express routes that fit request/response HTTP;
- server-side provider API calls;
- same-origin `/api/*` requests behind CloudFront;
- durable leaderboard writes through DynamoDB.

Implementation requirements:

- Express app must be importable without starting a listener.
- Lambda handler must be packaged before Terraform plan/apply.
- Secrets must be configured as Lambda environment variables or an approved
  secret store, not committed.
- DynamoDB access should use the Lambda IAM role.
- CloudFront should be the browser-facing entrypoint and route `/api/*` plus
  `/health` to the Lambda Function URL origin.

Prepared command shape:

```bash
AWS_PROFILE=<profile> npm run infra:plan
AWS_PROFILE=<profile> npm run infra:apply
AWS_PROFILE=<profile> npm run deploy:cloudfront
```

## Option D: Always-On Web Service Host

Use this as a backup for a persistent public backend if Lambda Function URL is a
poor fit for latency, streaming, or runtime constraints.

Good for:

- Node, Python, or Docker web services;
- stable public service URLs;
- a conventional always-on web service model.

Implementation requirements:

- Server must bind to `0.0.0.0`.
- Server must read the platform port from the environment.
- Secrets must be configured in the platform, not committed.
- Add a platform-specific deployment script only when this option is selected
  again.

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
6. Deploy to the CloudFront + Lambda path when the URL or runtime must be stable.

## References

- [ElevenLabs MCP tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp)
- [Vercel deployments](https://vercel.com/docs/deployments/deployment-methods)
- [Vercel environment variables](https://vercel.com/docs/projects/environment-variables)
- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html)
- [CloudFront OAC for Lambda Function URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
- [Render web services](https://render.com/docs/web-services/)
- [ngrok secure tunnels](https://ngrok.com/docs/guides/share-localhost/tunnels)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)
