# Terraform Architecture Visualization

�� ������ ���� Terraform �ڵ� ��������, �����ں��� �������� �̾����� ��ü �帧�� �ð������� ������ ������.
���� �������� `terraform/envs/dev/main.tf` �̰�, `prod`�� ���� ���� ������ ������.

## 1. End-to-End Overview

```mermaid
flowchart LR
    Dev["������"] --> Git["GitHub Repository"]
    Git --> Boot["Bootstrap Terraform State\n.github/workflows/bootstrap-terraform-state.yml"]
    Boot --> TFState["Terraform State S3 Bucket\ndevsecops-tfstate-<account>-<region>"]
    Git --> PlanApply["Terraform Dev Plan and Apply\n.github/workflows/terraform-dev-plan-apply.yml"]
    PlanApply --> Role["AWS_TERRAFORM_ROLE_ARN"]
    Role --> Env["terraform/envs/dev\nmain.tf"]

    Env --> Network["network\nVPC / IGW / NAT / Public-A,C / Private-A,C"]
    Env --> Security["security\nALB SG / ECS SG / ECS IAM Roles"]
    Env --> Bastion["bastion\nEC2 + Bastion SG\n(optional)"]
    Env --> ECR["ecr\napi-node / api-python / api-spring / frontend"]
    Env --> Logging["logging\nCloudWatch Log Groups"]
    Env --> ALB["alb\nALB / HTTP Listener / TGs"]
    Env --> Storage["storage\nArtifacts S3 / Reviews S3 / EFS"]
    Env --> DDB["dynamodb\nReviews Table"]
    Env --> RDS["rds\nMySQL + RDS SG"]
    Env --> ECS["ecs\nCluster / TaskDefs / Services"]
    Env --> Monitoring["monitoring\nSNS + CPU Alarms"]

    Customer["���� ������"] --> ALB
    Operator["��� PC"] --> Bastion

    ALB --> ECS
    ECS --> RDS
    ECS --> Storage
    ECS --> DDB
    ECS --> Logging
    Monitoring --> Operator
    Bastion --> RDS
    ECR -. image pull .-> ECS
    TFState -. backend state .-> Env
```

## 2. Terraform Composition Map

```mermaid
flowchart TD
    Env["terraform/envs/dev/main.tf"]

    Env --> Network
    Env --> Security
    Env --> Bastion
    Env --> ECR
    Env --> Logging
    Env --> ALB
    Env --> Storage
    Env --> DDB
    Env --> RDS
    Env --> ECS
    Env --> Monitoring

    Network --> VPC["VPC"]
    Network --> IGW["Internet Gateway"]
    Network --> NAT["NAT Gateway in Public-A"]
    Network --> PubA["Public-A"]
    Network --> PubC["Public-C"]
    Network --> PriA["Private-A"]
    Network --> PriC["Private-C"]

    Security --> ALBSG["ALB SG"]
    Security --> ECSSG["ECS SG"]
    Security --> ExecRole["ecs task execution role"]
    Security --> TaskRole["ecs task role"]

    Bastion --> BastionEC2["Bastion EC2"]
    Bastion --> BastionSG["Bastion SG"]

    ALB --> ALBRes["ALB"]
    ALB --> Listener["HTTP :80 Listener"]
    ALB --> TGs["Target Groups"]

    Storage --> ArtifactS3["Artifacts S3"]
    Storage --> ReviewS3["Reviews S3"]
    Storage --> EFS["EFS + Mount Targets"]

    DDB --> ReviewsTable["Reviews DynamoDB Table"]

    RDS --> DBSG["RDS SG"]
    RDS --> MySQL["MySQL RDS"]

    ECS --> Cluster["ECS Cluster"]
    ECS --> TaskDefs["Task Definitions"]
    ECS --> Services["Services\nfrontend / api-node / api-python / api-spring"]

    Logging --> LogGroups["CloudWatch Log Groups"]
    ECR --> Repos["ECR Repositories"]
    Monitoring --> SNS["SNS Topic"]
    Monitoring --> Alarms["Per-service CPU Alarms"]
```

## 3. Network Layout

```mermaid
flowchart LR
    Internet["Internet"] --> IGW["Internet Gateway"]
    IGW --> PubA["Public Subnet A"]
    IGW --> PubC["Public Subnet C"]

    PubA --> ALB["ALB"]
    PubA --> Bastion["Bastion EC2\n(optional)"]
    PubA --> NAT["NAT Gateway"]

    NAT --> PriA["Private Subnet A"]
    NAT --> PriC["Private Subnet C"]

    PriA --> ECSA["ECS Tasks"]
    PriC --> ECSC["ECS Tasks"]
    PriA --> RDS["RDS"]
    PriC --> RDS
    PriA --> EFS["EFS Mount Target"]
    PriC --> EFS
```

## 4. Security Group Chaining

```mermaid
flowchart TD
    Internet["0.0.0.0/0"] --> ALBSG["ALB SG\n80 open\n(current code also opens 443)"]
    ALBSG --> ECSSG["ECS SG\nAllow only from ALB SG\nPorts: 80 / 5000 / 8000 / 8080"]
    ECSSG --> RDSSG["RDS SG\n3306 from ECS SG"]

    DevPC["��� IP/32"] --> BastionSG["Bastion SG\n22 open only to trusted CIDRs"]
    BastionSG --> BastionEC2["Bastion EC2"]
    BastionEC2 --> RDSSG2["RDS SG\n3306 from Bastion SG"]
```

## 5. Customer Request Flow

```mermaid
flowchart LR
    Customer["����"] --> ALB["ALB :80"]
    ALB -->|"/*"| Frontend["frontend ECS service"]
    ALB -->|"/api/* , /uploads/*"| Node["api-node ECS service"]
    ALB -->|"/api/python* , /python*"| Python["api-python ECS service"]
    ALB -->|"/api/spring* , /spring*"| Spring["api-spring ECS service"]

    Frontend -. "VITE_API_URL points back to ALB" .-> ALB
    Node --> RDS["MySQL RDS"]
    Python --> RDS
    Spring --> RDS
    Node --> ReviewS3["Reviews S3"]
    Node --> ReviewDDB["Reviews DynamoDB"]
```

## 6. Data / Image / Logs Flow

```mermaid
flowchart TD
    ECR["ECR repositories"] --> ECS["ECS task definitions / services"]
    ECS --> CWL["CloudWatch Logs"]
    ECS --> RDS["MySQL RDS"]
    ECS --> ReviewS3["Reviews S3"]
    ECS --> ReviewDDB["Reviews DynamoDB"]
    StorageS3["Artifacts S3"] -. "separate storage resource" .-> Infra["Terraform-managed infra"]
    EFS["EFS"] -. "currently provisioned but not mounted in ECS task definitions" .-> Infra
```

## 7. Current Module Responsibilities

| Module | Main responsibility |
| --- | --- |
| `network` | VPC, IGW, NAT, public/private subnets, route tables |
| `security` | ALB SG, ECS SG, ECS execution/task IAM roles |
| `bastion` | Bastion EC2 and Bastion SG in Public-A |
| `alb` | ALB, HTTP listener, target groups, listener rules |
| `ecs` | ECS cluster, task definitions, ECS services |
| `ecr` | Container image repositories and lifecycle policies |
| `logging` | CloudWatch log groups per service |
| `storage` | Artifacts S3, Reviews S3, EFS |
| `dynamodb` | Reviews DynamoDB table |
| `rds` | MySQL RDS, DB subnet group, RDS SG |
| `monitoring` | SNS topic and ECS CPU alarms |

## 8. Important Notes

- Bastion�� `bastion_key_name` �� `bastion_ingress_cidrs` �� �� ������ ��쿡�� �����ȴ�.
- ���� ALB �����ʴ� HTTP `80`�� ����Ѵ�. �ٸ� ALB SG�� `443`�� ����� ���´�.
- EFS�� ����������, ���� ECS task definition���� volume mount�� ����Ǿ� ���� �ʴ�.
- `terraform/bootstrap` �� ��Ÿ�� ������ �ƴ϶� Terraform remote state bucket�� ����� ���� ���� �ܰ��.
- `dev` �� `prod` �� ���� ��� ������ �����ϰ�, �ַ� �̸� prefix / CIDR / desired_count ���� ���� �޶�����.
