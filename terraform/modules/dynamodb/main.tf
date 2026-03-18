resource "aws_dynamodb_table" "reviews" {
  name         = "${var.name_prefix}-reviews"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "productId"
  range_key    = "createdAt#userId"

  attribute {
    name = "productId"
    type = "S"
  }

  attribute {
    name = "createdAt#userId"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-reviews" })
}
