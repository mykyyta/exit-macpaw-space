#!/usr/bin/env bash
# Apply Terraform changes for the single cloud environment.

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-}"

if [[ -z "$AWS_PROFILE" ]]; then
  echo "Error: set AWS_PROFILE before running Terraform." >&2
  exit 1
fi

AWS_PROFILE="$AWS_PROFILE" terraform -chdir=infra init -backend-config="backend.hcl"
AWS_PROFILE="$AWS_PROFILE" terraform -chdir=infra apply -auto-approve -var-file="app.tfvars"
