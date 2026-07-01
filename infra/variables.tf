variable "aws_region" {
  type        = string
  description = "Primary AWS region."
  default     = "eu-central-1"
}

variable "project_slug" {
  type        = string
  description = "Resource name prefix."
}

variable "custom_domain_name" {
  type        = string
  description = "Optional browser-facing custom domain for CloudFront, for example macpaw.example.com."
  default     = ""
}

variable "enable_custom_domain_alias" {
  type        = bool
  description = "Attach custom_domain_name to CloudFront after the ACM DNS validation record has been added in the parent hosted zone and the certificate is issued."
  default     = false
}

variable "lambda_runtime" {
  type        = string
  description = "Node.js runtime for the API Lambda function."
  default     = "nodejs22.x"
}

variable "lambda_memory_size" {
  type        = number
  description = "Memory size in MB for the API Lambda function."
  default     = 1024
}

variable "lambda_timeout_seconds" {
  type        = number
  description = "Maximum API Lambda execution time in seconds."
  default     = 60
}

variable "lambda_environment_variables" {
  type        = map(string)
  description = "Additional API Lambda environment variables. Keep real secrets in local app.tfvars only; values are stored in Terraform state."
  default     = {}
  sensitive   = true
}
