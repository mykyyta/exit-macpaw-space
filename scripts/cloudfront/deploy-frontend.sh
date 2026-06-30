#!/usr/bin/env bash
# Build the Vite app, upload it to the Terraform-managed S3 bucket, and
# invalidate CloudFront. This assumes Terraform has already been applied.

set -euo pipefail

if [[ "${CI:-}" == "true" ]]; then
  AWS_PROFILE="${AWS_PROFILE:-}"
else
  AWS_PROFILE="${AWS_PROFILE:-}"
  if [[ -z "$AWS_PROFILE" ]]; then
    echo "Error: set AWS_PROFILE before deploying CloudFront assets." >&2
    exit 1
  fi
fi
AWS_S3_FRONTEND_BUCKET="${AWS_S3_FRONTEND_BUCKET:-}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: required command not found: $1" >&2
    exit 1
  }
}

require_cmd aws
require_cmd npm
aws_args=()

if [[ -n "$AWS_PROFILE" ]]; then
  aws_args+=(--profile "$AWS_PROFILE")
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

npm run build

if [[ -z "$AWS_S3_FRONTEND_BUCKET" || -z "$CLOUDFRONT_DISTRIBUTION_ID" ]]; then
  require_cmd terraform
  AWS_S3_FRONTEND_BUCKET="${AWS_S3_FRONTEND_BUCKET:-$(terraform -chdir=infra output -raw frontend_bucket_name)}"
  CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-$(terraform -chdir=infra output -raw cloudfront_distribution_id)}"
fi

aws "${aws_args[@]}" s3 sync dist "s3://${AWS_S3_FRONTEND_BUCKET}" \
  --delete \
  --exclude "index.html" \
  --exclude "server/*" \
  --exclude "shared/*" \
  --cache-control "public,max-age=31536000,immutable"

aws "${aws_args[@]}" s3 cp dist/index.html "s3://${AWS_S3_FRONTEND_BUCKET}/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

aws "${aws_args[@]}" cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*"
