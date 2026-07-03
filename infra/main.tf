terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}

locals {
  bucket_name           = "${var.project_slug}-frontend-${data.aws_caller_identity.current.account_id}"
  leaderboard_table     = "${var.project_slug}-leaderboard"
  api_lambda_name       = "${var.project_slug}-api"
  edge_lambda_name      = "${var.project_slug}-api-content-sha256-edge"
  api_lambda_zip        = "${path.module}/../.lambda-build/function.zip"
  edge_lambda_zip       = "${path.module}/../.lambda-build/edge-content-sha256.zip"
  s3_origin_id          = "s3-frontend"
  lambda_api_origin_id  = "lambda-api"
  lambda_api_domain     = trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")
  origin_secret         = lookup(var.lambda_environment_variables, "CLOUDFRONT_ORIGIN_SECRET", "")
  custom_domain_enabled = trimspace(var.custom_domain_name) != ""
  custom_domain_alias   = local.custom_domain_enabled && var.enable_custom_domain_alias
}

resource "aws_s3_bucket" "frontend" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_dynamodb_table" "leaderboard" {
  name         = local.leaderboard_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "leaderboardId"
  range_key    = "createdKey"

  attribute {
    name = "leaderboardId"
    type = "S"
  }

  attribute {
    name = "createdKey"
    type = "S"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_lambda_name}"
  retention_in_days = 14
}

resource "aws_iam_role" "api_lambda" {
  name = "${var.project_slug}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "${var.project_slug}-api-lambda"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.leaderboard.arn
      }
    ]
  })
}

resource "aws_iam_role" "edge_lambda" {
  name = "${var.project_slug}-edge-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = [
          "lambda.amazonaws.com",
          "edgelambda.amazonaws.com"
        ]
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "edge_lambda_basic" {
  role       = aws_iam_role.edge_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "api" {
  function_name    = local.api_lambda_name
  role             = aws_iam_role.api_lambda.arn
  filename         = local.api_lambda_zip
  source_code_hash = filebase64sha256(local.api_lambda_zip)
  handler          = "index.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout_seconds
  architectures    = ["arm64"]

  environment {
    variables = merge(
      {
        AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
        LEADERBOARD_TABLE_NAME              = aws_dynamodb_table.leaderboard.name
      },
      var.lambda_environment_variables
    )
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy.api_lambda
  ]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"

  cors {
    allow_credentials = false
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    allow_headers     = ["*"]
    max_age           = 0
  }
}

resource "aws_lambda_function" "edge_content_sha256" {
  provider         = aws.us_east_1
  function_name    = local.edge_lambda_name
  role             = aws_iam_role.edge_lambda.arn
  filename         = local.edge_lambda_zip
  source_code_hash = filebase64sha256(local.edge_lambda_zip)
  handler          = "edge-content-sha256.handler"
  runtime          = var.lambda_runtime
  memory_size      = 128
  timeout          = 5
  publish          = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_slug}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "api" {
  name                              = "${var.project_slug}-api-oac"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "app" {
  count             = local.custom_domain_enabled ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.custom_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${var.project_slug} app"
  price_class         = "PriceClass_100"
  aliases             = local.custom_domain_alias ? [var.custom_domain_name] : []

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    domain_name              = local.lambda_api_domain
    origin_id                = local.lambda_api_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.api.id

    custom_header {
      name  = "x-cloudfront-origin-secret"
      value = local.origin_secret
    }

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    target_origin_id         = local.lambda_api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

    lambda_function_association {
      event_type   = "origin-request"
      include_body = true
      lambda_arn   = aws_lambda_function.edge_content_sha256.qualified_arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/health"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    target_origin_id         = local.lambda_api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.custom_domain_enabled ? null : true
    acm_certificate_arn            = local.custom_domain_enabled ? aws_acm_certificate.app[0].arn : null
    ssl_support_method             = local.custom_domain_enabled ? "sni-only" : null
    minimum_protocol_version       = local.custom_domain_enabled ? "TLSv1.2_2021" : "TLSv1"
  }

  lifecycle {
    precondition {
      condition     = !var.enable_custom_domain_alias || local.custom_domain_enabled
      error_message = "enable_custom_domain_alias requires custom_domain_name."
    }
  }
}

resource "aws_lambda_permission" "allow_cloudfront_function_url" {
  statement_id           = "AllowCloudFrontFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.app.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "allow_cloudfront_invoke_function" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.app.arn
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.app.arn
        }
      }
    }]
  })
}
