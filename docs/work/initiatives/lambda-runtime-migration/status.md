---
state: complete
last_updated: 2026-06-30
owner: Orchestrator
---

# Lambda Runtime Migration Status

## Current State

Implementation, live cutover, custom-domain attachment, and Railway cleanup are
complete. AWS resources were created in account `211125295398` on 2026-06-30.
That was corrected on 2026-07-03: active AWS resources now live in account
`273354659544` through profile `mykyyta-personal`. The public URL is
`https://exit-macpaw-space.mykyyta.link`.

## Packet Status

| Packet | Status | Notes |
| --- | --- | --- |
| Lambda-compatible backend entrypoints | Done | Express app split from process listener; Lambda handler added. |
| Lambda packaging | Done | esbuild zip packaging added for API Lambda and Lambda@Edge helper. |
| Terraform Lambda origin | Done | CloudFront API origin targets Lambda Function URL through OAC, with Lambda@Edge body-hash support for POST. |
| Docs and cutover notes | Done | Build-system docs and this initiative capture the new runtime contract. |
| Live cutover | Done | The CloudFront distribution serves frontend and API through Lambda. |
| Custom domain | Done | `exit-macpaw-space.mykyyta.link` points to the Lambda-backed CloudFront distribution through Route53 in `mykyyta-personal`. |
| Railway cleanup | Done | Railway service `vibecoding-colective-macpaw` was deleted from project `pult`; unrelated `pult` services were left untouched. |
| AWS account correction | Done | Stack was recreated in `273354659544`, Route53 cut over, and old CloudFront/S3/API Lambda/DynamoDB/ACM/Lambda@Edge resources were destroyed from `211125295398`. |

## Next Step

No active migration work remains.

## Validation

- `npm run typecheck`
- `npm run build`
- `npm run package:lambda`
- `terraform -chdir=infra validate`
- `AWS_PROFILE=default npm run infra:plan`
- `AWS_PROFILE=default npm run infra:apply`
- `AWS_PROFILE=default npm run deploy:cloudfront`
- CloudFront smoke tests for `/`, `/health`, `/api/status`,
  `/api/stt/capability`, `/api/stt/elevenlabs/session`, full six-turn
  `/api/voice-turn` quest completion, and leaderboard read/write.
- Custom-domain smoke tests for `/`, `/health`, `/api/status`, and
  `/api/voice-turn`.
- Railway status check confirmed `vibecoding-colective-macpaw` is no longer in
  project `pult`.
- 2026-07-03 custom-domain smoke tests passed after the account correction:
  `/`, `/health`, `/api/status`, `/api/leaderboard`, and `/api/voice-turn`.
- The migrated leaderboard table in `273354659544` contains the 10 historical
  entries from the prior `thehrdwood` table.

## Residual Cleanup

Wrong account `211125295398` no longer has the app CloudFront distribution,
frontend S3 bucket, API Lambda, Lambda Function URL, DynamoDB leaderboard table,
ACM certificate, Lambda@Edge helper, app IAM roles, legacy Terraform state
bucket, or legacy Terraform lock table.

Old `thehrdwood` account `398606271029` no longer has the app CloudFront
distribution, frontend S3 bucket, DynamoDB leaderboard table, ACM certificate,
Lambda functions, or app IAM roles.
