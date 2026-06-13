---
state: in-progress
last_updated: 2026-06-13
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
| Custom domain support | Complete | `exit-macpaw-space.mykyyta.link` resolves through a parent-zone CNAME to CloudFront and smoke tests pass. |

## Current Handoff

Cloud deployment is paused at the backend boundary. CloudFront/S3 are still
serving the browser-facing site with a temporary warning banner, and the
Railway API deployment is removed.

## Resource Outputs

- Railway service: `vibecoding-colective-macpaw` (backend deployment removed)
- Railway URL: `https://vibecoding-colective-macpaw-production.up.railway.app`
- S3 bucket: `vibecoding-colective-macpaw-frontend`
- CloudFront distribution: `E1LXAVVGHT4YKQ`
- CloudFront URL: `https://d1uswfdwd46dyc.cloudfront.net`
- Custom domain: `exit-macpaw-space.mykyyta.link`
- ACM certificate:
  `arn:aws:acm:us-east-1:398606271029:certificate/234524b2-a9b8-42c4-97f0-556a3e8b0feb`
- ACM status: `ISSUED`
- CloudFront alias: deployed on distribution `E1LXAVVGHT4YKQ`
- Parent Route53 validation record added:
  - name:
    `_9cd6baeb7a433b1f18517494fe33d951.exit-macpaw-space.mykyyta.link.`
  - type: `CNAME`
  - value:
    `_29cc08a6198e5d0a5417e021b03f9662.jkddzztszm.acm-validations.aws.`
- Parent Route53 app record added:
  - `exit-macpaw-space.mykyyta.link` `CNAME` to
    `d1uswfdwd46dyc.cloudfront.net`
- CloudFront fallback: keep the default CloudFront URL working after the custom
  domain alias is attached

## Custom Domain Validation

- `dig CNAME exit-macpaw-space.mykyyta.link` returns
  `d1uswfdwd46dyc.cloudfront.net.`
- `https://exit-macpaw-space.mykyyta.link/` returned `200`.
- `https://exit-macpaw-space.mykyyta.link/health` returned `200`.
- `https://exit-macpaw-space.mykyyta.link/api/status` returned `200`.

## Validation

- 2026-06-13 pause validation:
  - CloudFront frontend deploy completed and invalidation
    `IEJQJYLFSHY7OWLTZDCCFTBPA4` finished.
  - `https://exit-macpaw-space.mykyyta.link/` returned `200` and rendered the
    temporary pause warning.
  - `https://exit-macpaw-space.mykyyta.link/health` returned `404 Application
    not found`.
  - `https://exit-macpaw-space.mykyyta.link/api/status` returned
    `404 Application not found`.
  - Railway deployment `d88a3d9d-5e15-4b25-882f-704b3d22c5d2` is `REMOVED`.
- Railway `/health` returned `{"ok":true}`.
- Railway `/api/status` returned `200` with Claude and ElevenLabs configured.
- CloudFront `/` returned `200`.
- CloudFront `/health` returned `{"ok":true}`.
- CloudFront `/api/status` returned `200` with Claude and ElevenLabs configured.
- S3 bucket contains only frontend assets: `index.html` and `assets/*`.

## Notes

An accidental deploy was started against the existing Pult `web` service because
the first local script defaulted to `web`. It was restored from the Pult `main`
worktree and is now `SUCCESS` on deployment
`83fcb31c-5920-4867-bbec-e7bc1723e773`. The local script now defaults to
`vibecoding-colective-macpaw`.
