# Copy this file to infra/backend.hcl before running Terraform.
# Keep real state bucket and lock table names in infra/backend.hcl only; it is
# gitignored.

bucket         = "your-terraform-state-bucket"
key            = "your-project/terraform.tfstate"
region         = "eu-central-1"
dynamodb_table = "your-terraform-lock-table"
encrypt        = true
