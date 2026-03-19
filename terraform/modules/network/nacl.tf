# Network ACL — 서브넷 단위 Stateless 방화벽
# Public: ALB(80/443), Bastion SSH(22, 지정 CIDR), 응답용 에페멀(1024-65535)
# Private: RDS(3306), Bastion→Private(22), ALB→ECS(앱 포트), 에페멀
# 아웃바운드는 초기 운영 안정을 위해 넓게 허용 (추후 축소 가능)

locals {
  app_ports_unique = distinct(var.app_ports)
}

resource "aws_network_acl" "public" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-nacl"
    Tier = "public"
  })
}

resource "aws_network_acl" "private" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-nacl"
    Tier = "private"
  })
}

# ─── Public NACL: 인바운드 ───────────────────────────────────────────────────
resource "aws_network_acl_rule" "public_in_http" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
}

resource "aws_network_acl_rule" "public_in_https" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 110
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "public_in_ssh" {
  for_each = { for idx, cidr in var.bastion_ingress_cidrs : idx => cidr }

  network_acl_id = aws_network_acl.public.id
  rule_number    = 120 + each.key
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = each.value
  from_port      = 22
  to_port        = 22
}

resource "aws_network_acl_rule" "public_in_ephemeral" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 350
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

# ─── Public NACL: 아웃바운드 (넓게) ──────────────────────────────────────────
resource "aws_network_acl_rule" "public_out_allow" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  egress         = true
  protocol       = "-1"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 0
  to_port        = 0
}

# ─── Private NACL: 인바운드 ──────────────────────────────────────────────────
resource "aws_network_acl_rule" "private_in_mysql" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 100
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
  from_port      = 3306
  to_port        = 3306
}

resource "aws_network_acl_rule" "private_in_ssh" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 110
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
  from_port      = 22
  to_port        = 22
}

resource "aws_network_acl_rule" "private_in_app" {
  for_each = { for idx, port in local.app_ports_unique : tostring(port) => { port = port, idx = idx } }

  network_acl_id = aws_network_acl.private.id
  rule_number    = 150 + each.value.idx * 5
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
  from_port      = each.value.port
  to_port        = each.value.port
}

resource "aws_network_acl_rule" "private_in_ephemeral" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 360
  egress         = false
  protocol       = "6"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

# ─── Private NACL: 아웃바운드 (넓게) ─────────────────────────────────────────
resource "aws_network_acl_rule" "private_out_allow" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 100
  egress         = true
  protocol       = "-1"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 0
  to_port        = 0
}

resource "aws_network_acl_association" "public" {
  for_each = aws_subnet.public

  network_acl_id = aws_network_acl.public.id
  subnet_id      = each.value.id
}

resource "aws_network_acl_association" "private" {
  for_each = aws_subnet.private

  network_acl_id = aws_network_acl.private.id
  subnet_id      = each.value.id
}
