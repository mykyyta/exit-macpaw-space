---
state: in-progress
last_updated: 2026-06-30
owner: Planner
---

# Lambda Runtime Migration

## Purpose

Move the public backend runtime from a long-running Railway service to AWS
Lambda so the quest can stay available without a developer-owned server process.

## Outcome Shape

CloudFront remains the browser-facing entrypoint. Static Vite assets are served
from S3, while `/api/*` and `/health` route to an AWS Lambda Function URL origin
running the existing Express API.

## Why This Is Initiative-Scale

The work changes the durable runtime contract, Terraform resources, deployment
commands, and cloud documentation. It also needs a rollback-aware cutover from
the Railway origin.

## Scope In

- Lambda-compatible Express handler.
- Lambda packaging command.
- Terraform-managed Lambda function, Function URL, Lambda@Edge helper,
  CloudFront Lambda origin, IAM role, and log group.
- Cloud deployment documentation updates.
- Validation of local build and Lambda bundle creation.

## Scope Out

- Applying Terraform or creating paid AWS resources without explicit approval.
- Removing Railway scripts before Lambda has been verified live.
- Introducing API Gateway.
- Adding a new database or queue.

## Acceptance Criteria

- Local `npm run dev` still starts the existing Vite + Express development flow.
- `npm run build` succeeds.
- `npm run package:lambda` creates `.lambda-build/function.zip`.
- Terraform describes CloudFront routing `/api/*` and `/health` to a Lambda
  Function URL origin instead of Railway.
- Lambda receives DynamoDB access through IAM role permissions.
- Deployment docs explain the Lambda cutover, secrets handling, validation, and
  rollback window.

## First Execution Unit

Make the current Express backend Lambda-compatible and update the infrastructure
contract without applying external changes.

## Owner And Mode

Planner owns packet framing. Executor owns implementation. Architect should
review the final runtime contract before live cutover.

## Open Questions

- Whether provisioned concurrency is worth the cost after real cold-start
  timings are observed.
