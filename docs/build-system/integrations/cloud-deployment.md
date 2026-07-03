---
last_updated: 2026-07-03
owner: Architect
---

# Cloud Deployment

This project can deploy as a small CloudFront + Lambda stack when the pet
project needs a stable public URL without a developer-owned server process.

## Decision

- **Frontend edge entrypoint:** AWS S3 + CloudFront in the project AWS account.
- **Project AWS account:** the active project-owned AWS account is
  `273354659544`, operated locally through profile `mykyyta-personal`.
- **Backend runtime:** one AWS Lambda function exposed through a Lambda Function
  URL and reached by CloudFront.
- **Lambda runtime:** `nodejs22.x` for the first cutover, matching the current
  Terraform AWS provider support in this repo.
- **Environment model:** one cloud environment only. Do not create separate
  staging and production stacks for this prototype.
- **Public request shape:** CloudFront is the browser-facing URL. It serves
  static Vite assets from S3 and routes `/api/*` plus `/health` to the Lambda
  Function URL origin.
- **Custom domain:** `https://exit-macpaw-space.mykyyta.link` is the active
  public URL. The Route53 hosted zone lives in `mykyyta-personal`. This
  Terraform stack creates the ACM certificate and CloudFront alias configuration
  only; Route53 DNS records are applied separately in the same personal account.
  The default CloudFront URL remains live as a fallback after the custom domain
  alias is added.
- **Terraform state:** use an S3 backend configured through local
  `infra/backend.hcl`.
- **AWS profile:** set `AWS_PROFILE` for privileged AWS and Terraform commands.

## Why This Shape Is Sufficient

The current app is a Vite client plus one Express API. It does not need
workers, queues, custom auth, API Gateway, or a separate API domain for the
current product shape. Add durable storage behind Express when a product feature
needs it. Routing API traffic through CloudFront keeps browser requests
same-origin and avoids adding CORS surface area.

## Runtime Boundary

```text
Browser
  -> optional custom domain
      -> CloudFront
      -> S3 frontend origin for /* static assets
      -> Lambda Function URL origin for /api/* and /health
          -> Lambda@Edge origin-request body hash helper for body-bearing API requests
          -> Express app through Lambda handler
              -> Claude, Gemini, ElevenLabs provider APIs, and storage adapters
```

Secrets stay in the server-side runtime. For Lambda, configure provider API keys,
`LEADERBOARD_COMPLETION_TOKEN_SECRET`, and `CLOUDFRONT_ORIGIN_SECRET` through
Lambda environment variables or a secret store, not in the built frontend.
DynamoDB access should use the Lambda IAM role, not committed AWS access keys.

Terraform-managed Lambda environment variables are stored in Terraform state.
Use the private backend only, and keep real values in local `infra/app.tfvars`
or another approved secret-management path.

## Local Files

- `src/server/app.ts` exports the reusable Express app.
- `src/server/index.ts` starts the local or long-running Node server.
- `src/server/lambda.ts` exports the Lambda handler.
- `scripts/lambda/package.sh` bundles the Lambda handler into
  `.lambda-build/function.zip`.
- `scripts/lambda/edge-content-sha256.cjs` is the Lambda@Edge origin-request
  helper that adds `x-amz-content-sha256` for POST/PUT/PATCH requests before
  CloudFront OAC signs requests to the Lambda Function URL origin.
- `infra/` defines the S3 bucket, Lambda API runtime, Lambda Function URL,
  Lambda@Edge helper, CloudFront distribution, origin access controls, API
  origin routing, optional ACM certificate, optional CloudFront aliases, and
  outputs for parent-zone DNS records.
- `scripts/infra/plan.sh` runs a Terraform plan.
- `scripts/infra/apply.sh` applies the reviewed Terraform plan.
- `scripts/cloudfront/deploy-frontend.sh` builds, uploads to S3,
  and invalidates CloudFront after Terraform has been applied.

## Required Manual Inputs

Before applying Terraform, create local config files from the public examples:

```bash
cp infra/backend.example.hcl infra/backend.hcl
cp infra/app.tfvars.example infra/app.tfvars
```

Fill `infra/backend.hcl` with the real Terraform state bucket, key, region, and
lock table. Fill `infra/app.tfvars` with the real project slug and Lambda
environment variables needed by the providers used in the live product.

To attach a custom domain, use a two-step alias flow:

1. Set `custom_domain_name` in `infra/app.tfvars` to the desired app subdomain,
   and keep `enable_custom_domain_alias = false`.
2. Run `AWS_PROFILE=<profile> npm run infra:apply`. Terraform creates the ACM
   certificate in `us-east-1` and outputs
   `custom_domain_certificate_validation_records`.
3. In the Route53 hosted zone, add the output `CNAME` record for ACM DNS
   validation. For the active deployment this zone is in profile
   `mykyyta-personal`.
4. Wait until the ACM certificate is `ISSUED`.
5. Set `enable_custom_domain_alias = true` and run the Terraform apply command
   again. Terraform attaches the custom domain to CloudFront.
6. In the Route53 hosted zone, add either a `CNAME` record from the
   subdomain to `cloudfront_alias_target`, or `A` and `AAAA` alias records using
   `cloudfront_alias_target` as the alias target and
   `cloudfront_alias_hosted_zone_id` as the CloudFront hosted zone ID. Use
   `CNAME` only for subdomains, not for a root/apex domain.

The Terraform stack intentionally does not mutate Route53 records. DNS changes
are operational cutover actions and should be applied explicitly with
`AWS_PROFILE=mykyyta-personal`.

Before applying Terraform for Lambda, set server-side environment variables for
any providers or storage adapters used by the product:

- `CLAUDE_API_KEY`
- `CLAUDE_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_STT_MODEL`
- `DEMO_API_TOKEN` if paid routes are exposed beyond the demo team
- `LEADERBOARD_COMPLETION_TOKEN_SECRET` when persistent leaderboard storage is
  enabled. Terraform sets `LEADERBOARD_TABLE_NAME` from the managed DynamoDB
  table.
- `CLOUDFRONT_ORIGIN_SECRET` so the Express API can reject direct Function URL
  requests that do not come through CloudFront.
- Do not set AWS access keys for DynamoDB in Lambda. Terraform grants the Lambda
  IAM role `dynamodb:PutItem` and `dynamodb:Query` on the leaderboard table.

## Command Order

Run only after confirming that external resource creation is approved:

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

`npm run infra:plan` and `npm run infra:apply` package the Lambda handler before
running Terraform. `npm run deploy:cloudfront` builds and uploads the static
frontend assets and invalidates the distribution.

## Cutover And Rollback

The Lambda origin has passed smoke tests through CloudFront and the custom
domain. The previous Railway service `vibecoding-colective-macpaw` was deleted
on 2026-06-30, so rollback now means redeploying this Terraform-managed AWS
stack or restoring from source into another runtime.

The safe cutover sequence is:

1. Build and package the Lambda handler locally.
2. Run and review `AWS_PROFILE=<profile> npm run infra:plan`.
3. Apply Terraform only after approval.
4. Smoke-test the CloudFront URL for `/`, `/health`, `/api/status`, a full
   `/api/voice-turn`, ElevenLabs STT session creation, recorded STT with a small
   audio sample, and leaderboard read/write after quest completion.
5. Attach the custom domain after ACM validation is complete.
6. Remove or archive any obsolete non-AWS runtime only after a successful
   verification window.

## GitHub Actions

Automatic deployment from `main` is disabled for controlled demo operations.
Use a manual workflow only after the Lambda deployment path has equivalent
packaging and smoke-test steps.

The workflow:

1. installs dependencies;
2. typechecks;
3. packages the Lambda handler;
4. applies the reviewed Terraform or updates the Lambda function code through an
   approved deployment path;
5. builds and uploads frontend assets to S3;
6. creates a CloudFront invalidation;
7. smoke-tests `/`, `/health`, and `/api/status` through CloudFront.

Required GitHub repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Required GitHub repository variables:

- `AWS_REGION`
- `AWS_S3_FRONTEND_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `CLOUDFRONT_URL`

The workflow intentionally uses the existing single environment and does not
create or mutate Terraform-managed infrastructure.

## Risks And Mitigations

- **Paid resources:** Lambda, CloudFront, S3, CloudWatch Logs, and DynamoDB can incur
  cost. Apply only after approval.
- **Wrong account:** always set `AWS_PROFILE` explicitly before privileged
  commands.
- **Broken API origin:** CloudFront must route `/api/*` and `/health` to the
  Lambda Function URL origin, sign requests with CloudFront OAC, and send the
  `x-cloudfront-origin-secret` custom header. Body-bearing API requests also
  need the Lambda@Edge origin-request helper so `x-amz-content-sha256` matches
  the body before OAC signs the origin request. The Express app rejects requests
  without the custom header when `CLOUDFRONT_ORIGIN_SECRET` is configured.
- **Incomplete DNS validation:** CloudFront will reject the custom domain until
  the ACM certificate is issued. Add the ACM validation `CNAME` in the parent
  Route53 zone before enabling `enable_custom_domain_alias`.
- **Secret exposure:** keep provider keys in the server-side runtime only, and
  use the Lambda IAM role for DynamoDB instead of AWS access keys.
- **Terraform state exposure:** if Lambda environment variables are managed by
  Terraform, secret values are present in Terraform state. Use the private
  backend and never commit real `infra/app.tfvars`.
- **Cold starts:** first requests after idle periods can be slower than an
  always-on web service. Measure real turn latency before deciding whether
  provisioned concurrency is worth the cost.
- **CloudFront propagation:** distribution and invalidations can take minutes;
  keep the local tunnel path as a fallback during development.
- **Custom domain fallback:** keep the default CloudFront distribution URL
  available internally even after the custom domain is attached.

## Live Resource Outputs

- Public URL: `https://exit-macpaw-space.mykyyta.link`
- AWS account: `273354659544`
- AWS profile: `mykyyta-personal`
- CloudFront fallback URL: read `cloudfront_distribution_domain_name` from
  Terraform outputs.
- Other live resource identifiers are intentionally kept out of public docs.
  Read them from Terraform outputs, AWS, or GitHub repository variables when
  operating the deployment.
