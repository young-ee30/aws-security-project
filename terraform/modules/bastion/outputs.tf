output "instance_id" {
  value = aws_instance.this.id
}

output "public_ip" {
  description = "Elastic IP (재시작해도 변하지 않는 고정 IP)"
  value       = aws_eip.bastion.public_ip
}

output "public_dns" {
  value = aws_instance.this.public_dns
}

output "security_group_id" {
  value = aws_security_group.bastion.id
}