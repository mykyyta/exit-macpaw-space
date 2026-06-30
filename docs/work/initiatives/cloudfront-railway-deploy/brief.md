---
state: in-progress
last_updated: 2026-05-06
owner: Planner
---

# CloudFront Railway Deploy

## Purpose

Create a stable cloud deployment path for the current voice quest prototype
using the project AWS and Railway accounts.

## Outcome Shape

- Railway runs the Express API as one web service.
- CloudFront is the browser-facing entrypoint.
- S3 stores the Vite build.
- CloudFront proxies `/api/*` and `/health` to Railway.
- Secrets stay in Railway service variables.
- There is one cloud environment only.

## Why Initiative

This work has multiple dependent packets, changes deployment architecture, and
touches external platforms that can create paid resources.

## Scope In

- Local Railway runtime config.
- Terraform for S3 + CloudFront.
- Optional ACM certificate and CloudFront aliases for a custom browser-facing
  domain whose DNS records stay in the parent Route53 account.
- Deployment scripts for planning, Railway deploy, S3 upload, and CloudFront
  invalidation.
- Build-system docs for the cloud deployment contract.
- Local validation before external apply/deploy.

## Scope Out

- Mutating a parent Route53 hosted zone that is owned by another AWS account.
- Creating a delegated child Route53 hosted zone for the app subdomain.
- Database, Redis, queues, workers, auth, or observability services.
- GitHub Actions deployment automation.
- Committing provider secrets or `.env` values.

## Acceptance Criteria

- `npm run build` succeeds locally.
- Terraform files format successfully.
- Railway config uses the existing `npm start` server boundary.
- CloudFront routes frontend assets to S3 and API traffic to Railway.
- Terraform can create the custom-domain ACM certificate and attach the domain
  to CloudFront after the parent hosted zone receives the ACM validation CNAME.
- Docs state account/profile assumptions, command order, secrets boundary, and
  approval gate.
- No external resources are created without explicit user approval.

## First Execution Unit

Prepare local infrastructure, scripts, and docs. Validate syntax and build only.

## Owner And Mode

Planner frames the packets. Executor can implement each packet after approval.

## Open Questions

- Which Railway public domain should the single cloud environment use?
- Which exact Route53 alias records were added in the parent hosted zone?
