from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.custom import Custom

BASE_DIR = Path(__file__).resolve().parent
ICON_DIR = BASE_DIR / "icons"
OUTPUT_DIR = BASE_DIR / "generated"
OUTPUT_DIR.mkdir(exist_ok=True)

GRAPH_ATTR = {
    "pad": "0.4",
    "ranksep": "1.0",
    "nodesep": "0.55",
    "splines": "ortho",
    "fontname": "Arial",
    "fontsize": "18",
}

NODE_ATTR = {
    "fontname": "Arial",
    "fontsize": "11",
}

EDGE_ATTR = {
    "fontname": "Arial",
    "fontsize": "10",
}


def icon(name: str) -> str:
    return str(ICON_DIR / f"{name}.svg")


def node(label: str, kind: str) -> Custom:
    return Custom(label, icon(kind))


def build_end_to_end() -> None:
    with Diagram(
        "Terraform End-to-End Overview",
        filename=str(OUTPUT_DIR / "terraform_end_to_end_overview"),
        show=False,
        direction="LR",
        outformat="png",
        graph_attr=GRAPH_ATTR,
        node_attr=NODE_ATTR,
        edge_attr=EDGE_ATTR,
    ):
        developer = node("Developer", "actor")
        repo = node("GitHub Repository", "workflow")
        bootstrap = node("Bootstrap Terraform State", "workflow")
        plan_apply = node("Terraform Dev Plan and Apply", "workflow")
        tf_state = node("Terraform State S3 Bucket", "data")
        tf_role = node("AWS_TERRAFORM_ROLE_ARN", "security")
        env = node("terraform/envs/dev", "terraform")

        with Cluster("Terraform Modules"):
            network_m = node("network", "terraform")
            security_m = node("security", "terraform")
            bastion_m = node("bastion", "terraform")
            ecr_m = node("ecr", "terraform")
            logging_m = node("logging", "terraform")
            alb_m = node("alb", "terraform")
            storage_m = node("storage", "terraform")
            dynamodb_m = node("dynamodb", "terraform")
            rds_m = node("rds", "terraform")
            ecs_m = node("ecs", "terraform")
            monitoring_m = node("monitoring", "terraform")

        customer = node("Customer", "actor")
        operator = node("Operator", "actor")

        with Cluster("AWS Runtime"):
            alb = node("ALB :80", "app")
            ecs = node(
                "ECS Cluster\nfrontend / api-node / api-python / api-spring",
                "app",
            )
            bastion = node("Bastion EC2\noptional", "app")
            rds = node("MySQL RDS", "data")
            reviews_s3 = node("Reviews S3", "data")
            reviews_ddb = node("Reviews DynamoDB", "data")
            cw_logs = node("CloudWatch Logs", "app")
            ecr = node("ECR Repositories", "app")
            alarms = node("SNS + CPU Alarms", "security")
            efs = node("EFS", "data")
            artifacts = node("Artifacts S3", "data")

        developer >> repo
        repo >> bootstrap >> tf_state
        repo >> plan_apply >> tf_role >> env
        tf_state >> Edge(style="dashed", label="remote state") >> env

        env >> [
            network_m,
            security_m,
            bastion_m,
            ecr_m,
            logging_m,
            alb_m,
            storage_m,
            dynamodb_m,
            rds_m,
            ecs_m,
            monitoring_m,
        ]

        network_m >> [alb, bastion, ecs, rds, efs]
        security_m >> [alb, ecs, bastion, rds]
        alb_m >> alb
        bastion_m >> bastion
        ecr_m >> ecr >> Edge(label="image pull") >> ecs
        logging_m >> cw_logs
        storage_m >> [artifacts, reviews_s3, efs]
        dynamodb_m >> reviews_ddb
        rds_m >> rds
        ecs_m >> ecs
        monitoring_m >> alarms

        customer >> Edge(label="HTTP") >> alb >> ecs
        operator >> Edge(label="SSH") >> bastion >> Edge(label="MySQL admin") >> rds
        ecs >> rds
        ecs >> reviews_s3
        ecs >> reviews_ddb
        ecs >> cw_logs
        alarms >> operator


def build_module_map() -> None:
    with Diagram(
        "Terraform Module Map",
        filename=str(OUTPUT_DIR / "terraform_module_map"),
        show=False,
        direction="TB",
        outformat="png",
        graph_attr=GRAPH_ATTR,
        node_attr=NODE_ATTR,
        edge_attr=EDGE_ATTR,
    ):
        env = node("terraform/envs/dev/main.tf", "terraform")

        with Cluster("network"):
            vpc = node("VPC", "cloud")
            igw = node("Internet Gateway", "cloud")
            nat = node("NAT Gateway\nPublic-A", "cloud")
            public_a = node("Public-A", "cloud")
            public_c = node("Public-C", "cloud")
            private_a = node("Private-A", "cloud")
            private_c = node("Private-C", "cloud")

        with Cluster("security"):
            alb_sg = node("ALB SG", "security")
            ecs_sg = node("ECS SG", "security")
            exec_role = node("ECS Task Execution Role", "security")
            task_role = node("ECS Task Role", "security")

        with Cluster("bastion"):
            bastion_ec2 = node("Bastion EC2", "app")
            bastion_sg = node("Bastion SG", "security")

        with Cluster("alb"):
            alb = node("ALB", "app")
            listener = node("HTTP Listener :80", "app")
            target_groups = node("Target Groups", "app")

        with Cluster("ecs"):
            cluster = node("ECS Cluster", "app")
            taskdefs = node("Task Definitions", "app")
            services = node("ECS Services", "app")

        with Cluster("data and storage"):
            rds = node("MySQL RDS", "data")
            rds_sg = node("RDS SG", "security")
            reviews_s3 = node("Reviews S3", "data")
            artifacts_s3 = node("Artifacts S3", "data")
            reviews_ddb = node("Reviews DynamoDB", "data")
            efs = node("EFS + Mount Targets", "data")

        with Cluster("platform"):
            ecr = node("ECR Repositories", "app")
            logs = node("CloudWatch Log Groups", "app")
            monitoring = node("SNS + CPU Alarms", "security")

        env >> [vpc, alb_sg, ecs_sg, bastion_ec2, alb, cluster, rds, reviews_s3, reviews_ddb, ecr, logs, monitoring]

        vpc >> [igw, public_a, public_c, private_a, private_c]
        public_a >> nat
        alb_sg >> alb
        ecs_sg >> services
        bastion_sg >> bastion_ec2
        alb >> listener >> target_groups >> services
        cluster >> taskdefs >> services
        services >> rds_sg >> rds
        bastion_ec2 >> rds_sg
        services >> [reviews_s3, reviews_ddb, logs]
        services >> Edge(style="dashed", label="future mount") >> efs
        ecr >> taskdefs
        monitoring >> services
        artifacts_s3 >> Edge(style="dashed", label="managed storage") >> services
        task_role >> services
        exec_role >> services


def build_runtime_security() -> None:
    with Diagram(
        "Terraform Runtime and Security Flow",
        filename=str(OUTPUT_DIR / "terraform_runtime_and_security_flow"),
        show=False,
        direction="LR",
        outformat="png",
        graph_attr=GRAPH_ATTR,
        node_attr=NODE_ATTR,
        edge_attr=EDGE_ATTR,
    ):
        customer = node("Customer Browser", "actor")
        operator = node("Operator PC\ntrusted IP/32", "actor")
        alb_sg = node("ALB SG\n80 open\ncode also keeps 443", "security")
        ecs_sg = node("ECS SG\nallow only from ALB SG\n80 / 5000 / 8000 / 8080", "security")
        bastion_sg = node("Bastion SG\n22 only from trusted CIDRs", "security")
        rds_sg = node("RDS SG\n3306 from ECS SG + Bastion SG", "security")

        with Cluster("Public Subnets"):
            alb = node("ALB", "app")
            bastion = node("Bastion EC2\noptional", "app")
            nat = node("NAT Gateway", "cloud")

        with Cluster("Private Subnets"):
            frontend = node("frontend service", "app")
            api_node = node("api-node service", "app")
            api_python = node("api-python service", "app")
            api_spring = node("api-spring service", "app")
            rds = node("MySQL RDS", "data")
            reviews_s3 = node("Reviews S3", "data")
            reviews_ddb = node("Reviews DynamoDB", "data")
            logs = node("CloudWatch Logs", "app")

        customer >> alb_sg >> alb
        alb >> Edge(label="/*") >> frontend
        alb >> Edge(label="/api/* , /uploads/*") >> api_node
        alb >> Edge(label="/api/python* , /python*") >> api_python
        alb >> Edge(label="/api/spring* , /spring*") >> api_spring

        alb_sg >> ecs_sg
        ecs_sg >> [frontend, api_node, api_python, api_spring]

        operator >> bastion_sg >> bastion >> rds_sg >> rds
        [api_node, api_python, api_spring] >> rds_sg
        rds_sg >> rds

        api_node >> reviews_s3
        api_node >> reviews_ddb
        [frontend, api_node, api_python, api_spring] >> logs
        nat >> Edge(style="dashed", label="egress for private subnets") >> [frontend, api_node, api_python, api_spring]


def main() -> None:
    build_end_to_end()
    build_module_map()
    build_runtime_security()


if __name__ == "__main__":
    main()
