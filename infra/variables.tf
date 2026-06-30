variable "aws_region" {
  type        = string
  description = "Primary AWS region."
  default     = "eu-central-1"
}

variable "project_slug" {
  type        = string
  description = "Resource name prefix."
}

variable "railway_api_domain" {
  type        = string
  description = "Railway public domain for the Express API, without https://."
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
