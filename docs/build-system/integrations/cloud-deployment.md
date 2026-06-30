---
last_updated: 2026-05-07
owner: Architect
---

# Cloud Deployment

This project can deploy as a small CloudFront + Railway stack when the pet
project needs a stable public URL.

## Decision

- **Frontend edge entrypoint:** AWS S3 + CloudFront in the project AWS account.
- **Backend runtime:** one Railway web service in the project Railway account.
- **Environment model:** one cloud environment only. Do not create separate
  staging and production stacks for this prototype.
- **Public request shape:** CloudFront is the browser-facing URL. It serves
  static Vite assets from S3 and routes `/api/*` plus `/health` to Railway.
- **Custom domain:** when a stable branded URL is needed and the parent Route53
  hosted zone is owned by another AWS account, keep DNS records in that parent
  account. This Terraform stack creates the ACM certificate and CloudFront alias
  configuration only; the parent zone owner manually adds ACM validation and
  CloudFront alias records. The default CloudFront URL remains live as a
  fallback after the custom domain alias is added.
- **Terraform state:** use an S3 backend configured through local
  `infra/backend.hcl`.
- **AWS profile:** set `AWS_PROFILE` for privileged AWS and Terraform commands.

## Why This Shape Is Sufficient

The current app is a Vite client plus one Express API. It does not need a
workers, queues, custom auth, or a separate API domain for the current product
shape. Add durable storage behind Express when a product feature needs it.
Routing API traffic through CloudFront keeps browser requests
same-origin and avoids adding CORS surface area.

## Runtime Boundary

```text
Browser
  -> optional custom domain
      -> CloudFront
      -> S3 frontend origin for /* static assets
      -> Railway origin for /api/* and /health
          -> Express server
              -> Claude, Gemini, ElevenLabs provider APIs, and storage adapters
```

Secrets stay in Railway service variables. The built frontend must not contain
provider API keys or AWS credentials.

## Local Files

- `railway.toml` defines the Railway build and start command.
- `infra/` defines the S3 bucket, CloudFront distribution, S3 origin access
  control, API origin routing, optional ACM certificate, optional CloudFront
  aliases, and outputs for parent-zone DNS records.
- `scripts/infra/plan.sh` runs a Terraform plan.
- `scripts/infra/apply.sh` applies the reviewed Terraform plan.
- `scripts/railway/deploy-web.sh` deploys the web service.
- `scripts/cloudfront/deploy-frontend.sh` builds, uploads to S3,
  and invalidates CloudFront after Terraform has been applied.

## Required Manual Inputs

Before applying Terraform, create local config files from the public examples:

```bash
cp infra/backend.example.hcl infra/backend.hcl
cp infra/app.tfvars.example infra/app.tfvars
```

Fill `infra/backend.hcl` with the real Terraform state bucket, key, region, and
lock table. Fill `infra/app.tfvars` with the real project slug and Railway
public domain. The Railway domain must not include `https://`.

To attach a custom domain whose parent domain is hosted in another Route53
account, use a two-step parent-zone alias flow:

1. Set `custom_domain_name` in `infra/app.tfvars` to the desired app subdomain,
   and keep `enable_custom_domain_alias = false`.
2. Run `AWS_PROFILE=<profile> npm run infra:apply`. Terraform creates the ACM
   certificate in `us-east-1` and outputs
   `custom_domain_certificate_validation_records`.
3. In the parent Route53 hosted zone, add the output `CNAME` record for ACM DNS
   validation.
4. Wait until the ACM certificate is `ISSUED`.
5. Set `enable_custom_domain_alias = true` and run the Terraform apply command
   again. Terraform attaches the custom domain to CloudFront.
6. In the parent Route53 hosted zone, add either a `CNAME` record from the
   subdomain to `cloudfront_alias_target`, or `A` and `AAAA` alias records using
   `cloudfront_alias_target` as the alias target and
   `cloudfront_alias_hosted_zone_id` as the CloudFront hosted zone ID. Use
   `CNAME` only for subdomains, not for a root/apex domain.

The Terraform stack intentionally does not mutate the parent hosted zone. That
boundary keeps the parent domain owner separate from this app's infrastructure.

Before deploying Railway, set service variables for any providers or storage
adapters used by the product:

- `CLAUDE_API_KEY`
- `CLAUDE_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_STT_MODEL`
- `DEMO_API_TOKEN` if paid routes are exposed beyond the demo team
- `LEADERBOARD_TABLE_NAME` and `LEADERBOARD_COMPLETION_TOKEN_SECRET` when
  persistent leaderboard storage is enabled
- AWS credential variables for Railway when it writes to DynamoDB
  (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_REGION`;
  region defaults to `eu-central-1`)

## Command Order

Run only after confirming that external resource creation is approved:

```bash
npm run deploy:railway
```

Create or copy the Railway public domain into `infra/app.tfvars`, then plan:

```bash
AWS_PROFILE=<profile> npm run infra:plan
```

After reviewing the plan, apply Terraform, then deploy the frontend:

```bash
AWS_PROFILE=<profile> npm run infra:apply
```

```bash
AWS_PROFILE=<profile> npm run deploy:cloudfront
```

## GitHub Actions

Automatic deployment from `main` is temporarily disabled while the production
backend is intentionally stopped. The workflow file remains at
`.github/workflows/deploy-main.yml` for future reactivation.

When re-enabled, the workflow:

1. installs dependencies;
2. typechecks;
3. deploys Railway service `vibecoding-colective-macpaw`;
4. waits for the Railway deployment to reach `SUCCESS`;
5. builds and uploads frontend assets to S3;
6. creates a CloudFront invalidation;
7. smoke-tests `/`, `/health`, and `/api/status` through CloudFront.

Required GitHub repository secrets:

- `RAILWAY_TOKEN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Required GitHub repository variables:

- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT`
- `RAILWAY_SERVICE`
- `AWS_REGION`
- `AWS_S3_FRONTEND_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `CLOUDFRONT_URL`

The workflow intentionally uses the existing single environment and does not
create or mutate Terraform-managed infrastructure.

## Risks And Mitigations

- **Paid resources:** Railway service, S3, CloudFront, and DynamoDB can incur
  cost. Apply only after approval.
- **Wrong account:** always set `AWS_PROFILE` explicitly before privileged
  commands.
- **Broken API origin:** CloudFront needs the exact Railway domain before
  Terraform apply.
- **Incomplete DNS validation:** CloudFront will reject the custom domain until
  the ACM certificate is issued. Add the ACM validation `CNAME` in the parent
  Route53 zone before enabling `enable_custom_domain_alias`.
- **Secret exposure:** keep provider keys and AWS credentials in Railway
  variables only.
- **CloudFront propagation:** distribution and invalidations can take minutes;
  keep the local tunnel path as a fallback during development.
- **Custom domain fallback:** keep the default CloudFront distribution URL
  available internally even after the custom domain is attached.

## Live Resource Outputs

Live resource identifiers are intentionally kept out of public docs. Read them
from Terraform outputs, Railway, AWS, or GitHub repository variables when
operating the deployment.
