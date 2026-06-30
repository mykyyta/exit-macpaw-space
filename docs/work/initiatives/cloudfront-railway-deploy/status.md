---
state: in-progress
last_updated: 2026-06-30
owner: Orchestrator
---

# CloudFront Railway Deploy Status

## Packet Status

| Packet | Status | Notes |
| --- | --- | --- |
| Technical contract | Complete | Recorded in `docs/build-system/integrations/cloud-deployment.md`. |
| Local infrastructure files | Complete | Single-environment Terraform, Railway config, and scripts are prepared locally. |
| Local validation | Complete | `npm run build`, `terraform fmt`, and `terraform validate` passed locally. |
| Railway deploy | Complete | Service `vibecoding-colective-macpaw` is deployed and healthy. |
| CloudFront apply and frontend upload | Complete | CloudFront/S3 are created and serving the app. |
| Custom domain support | Complete | The custom domain resolves through a parent-zone CNAME to CloudFront and smoke tests pass. |

## Current Handoff

Cloud deployment is restored for the 2026-06-30 demo. CloudFront/S3 serves the
browser-facing site and Railway serves the Express API behind `/api/*` and
`/health`.

## Resource Outputs

Live resource identifiers are intentionally omitted from public work docs. Use
Terraform outputs, Railway, AWS, and GitHub repository variables when operating
the deployment.

- Railway service: configured in Railway and GitHub repository variables.
- S3 bucket: Terraform-managed frontend bucket.
- CloudFront distribution: Terraform-managed distribution.
- Custom domain: configured through `infra/app.tfvars` when enabled.
- ACM status: `ISSUED` during the completed custom-domain validation.
- CloudFront fallback: keep the default CloudFront URL working internally after
  the custom domain alias is attached.

## Custom Domain Validation

- The custom-domain `CNAME` resolves to the CloudFront distribution.
- The custom-domain root URL returned `200`.
- The custom-domain `/health` endpoint returned `200`.
- The custom-domain `/api/status` endpoint returned `200`.

## Validation

- 2026-06-30 demo restore:
  - Frontend pause mode disabled in `src/client/App.tsx`.
  - Manual GitHub Actions deploy succeeded:
    `https://github.com/mykyyta/exit-macpaw-space/actions/runs/28439329452`.
  - Custom-domain `/` returned `200` through CloudFront/S3.
  - Custom-domain frontend bundle no longer contains pause-warning copy.
  - Custom-domain `/health` returned `{"ok":true}` through CloudFront/Railway.
  - Custom-domain `/api/status` returned `200` with Claude and ElevenLabs
    configured.
  - Custom-domain `/api/leaderboard?limit=3` returned `200` with newest-first
    entries.
  - Live `/api/voice-turn` smoke returned `sofia-introduced`, Sofiia/Dan name
    tags, and ElevenLabs `audio/mpeg` without `audioError`.
- 2026-06-13 pause validation:
  - CloudFront frontend deploy completed and invalidation
    `IEJQJYLFSHY7OWLTZDCCFTBPA4` finished.
  - The custom-domain root URL returned `200` and rendered the temporary pause
    warning.
  - The custom-domain `/health` endpoint returned `404 Application not found`.
  - The custom-domain `/api/status` endpoint returned `404 Application not
    found`.
  - Railway deployment `d88a3d9d-5e15-4b25-882f-704b3d22c5d2` is `REMOVED`.
- Railway `/health` returned `{"ok":true}`.
- Railway `/api/status` returned `200` with Claude and ElevenLabs configured.
- CloudFront `/` returned `200`.
- CloudFront `/health` returned `{"ok":true}`.
- CloudFront `/api/status` returned `200` with Claude and ElevenLabs configured.
- S3 bucket contains only frontend assets: `index.html` and `assets/*`.

## Notes

An accidental deploy was started against an unrelated existing Railway service
because the first local script used an unsafe default service name. That service
was restored from its main worktree. Deployment scripts now require explicit
repository variables or local configuration for public-operation details.
