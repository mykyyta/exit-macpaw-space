output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "custom_domain_url" {
  value = var.custom_domain_name == "" ? null : "https://${var.custom_domain_name}"
}

output "custom_domain_certificate_validation_records" {
  value = var.custom_domain_name == "" ? [] : [
    for option in aws_acm_certificate.app[0].domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "cloudfront_alias_target" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_alias_hosted_zone_id" {
  value = aws_cloudfront_distribution.app.hosted_zone_id
}

output "leaderboard_table_name" {
  value = aws_dynamodb_table.leaderboard.name
}

output "api_lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "api_lambda_function_url" {
  value = aws_lambda_function_url.api.function_url
}
