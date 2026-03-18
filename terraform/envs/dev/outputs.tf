output "alb_dns_name" { value = module.alb.alb_dns_name }
output "cluster_name" { value = module.ecs.cluster_name }
output "ecr_repository_urls" { value = module.ecr.repository_urls }
output "artifact_bucket_name" { value = module.storage.artifact_bucket_name }
output "efs_id" { value = module.storage.efs_id }
output "reviews_bucket_name" { value = module.storage.reviews_bucket_name }
output "reviews_dynamodb_table_name" { value = module.dynamodb.reviews_table_name }
