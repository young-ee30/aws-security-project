terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

# ─── WAF Web ACL (us-east-1 필수 — CloudFront WAF 규칙) ──────────────────────
resource "aws_wafv2_web_acl" "this" {
  provider    = aws.us_east_1
  name        = "${var.name_prefix}-waf"
  description = "WAF for CloudFront - IP reputation, bad inputs, SQLi/XSS, DDoS protection"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # 규칙 1: 알려진 악성 IP 차단 (봇넷, 스캐너 등)
  rule {
    name     = "IPReputationList"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-waf-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # 규칙 2: 알려진 악성 입력값 차단 (Log4Shell 등)
  rule {
    name     = "KnownBadInputs"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-waf-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # 규칙 3: 핵심 룰셋 — SQL 인젝션, XSS 차단
  rule {
    name     = "CommonRuleSet"
    priority = 30

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-waf-common"
      sampled_requests_enabled   = true
    }
  }

  # 규칙 4: Rate Limiting — IP당 5분에 2,000 요청 초과 시 차단 (DDoS 방어)
  rule {
    name     = "RateLimit"
    priority = 40

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-waf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-waf" })
}

# ─── CloudFront Distribution ──────────────────────────────────────────────────
# Origin: ALB (ECS Fargate 앞단)
# WAF 연결 → 모든 엣지 로케이션에서 공격 차단 후 ALB로 전달
resource "aws_cloudfront_distribution" "this" {
  enabled      = true
  comment      = "${var.name_prefix} — ALB origin, WAF attached"
  web_acl_id   = aws_wafv2_web_acl.this.arn
  http_version = "http2"
  price_class  = "PriceClass_All"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # ALB는 HTTP, CloudFront가 HTTPS 종료
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # API 경로: 캐싱 없음, 모든 헤더·쿠키 전달 (인증 등 유지)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Accept", "Content-Type"]
      cookies {
        forward = "all"
      }
    }
  }

  # 업로드 파일 경로: 캐싱 없음
  ordered_cache_behavior {
    path_pattern           = "/uploads/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # 기본 캐시 동작: 프론트엔드 정적 자산 (React 빌드 결과물)
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 86400    # 1일
    max_ttl                = 31536000 # 1년

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # CloudFront 기본 인증서 (*.cloudfront.net)
  # 커스텀 도메인이 생기면 acm_certificate_arn으로 교체
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-cloudfront" })
}
