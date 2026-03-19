global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: dev
    region: ${region}

scrape_configs:
  # ─── Node.js API (port 5000) ─────────────────────────────────────────────
  - job_name: api-node
    metrics_path: /api/metrics
    ecs_sd_configs:
      - region: ${region}
    relabel_configs:
      - source_labels: [__meta_ecs_task_definition_family]
        regex: ${name_prefix}-api-node
        action: keep
      - source_labels: [__address__]
        regex: '([^:]+)(?::\d+)?'
        replacement: '$${1}:5000'
        target_label: __address__
      - source_labels: [__meta_ecs_task_definition_family]
        target_label: job

  # ─── FastAPI Python (port 8000) ──────────────────────────────────────────
  - job_name: api-python
    metrics_path: /api/metrics
    ecs_sd_configs:
      - region: ${region}
    relabel_configs:
      - source_labels: [__meta_ecs_task_definition_family]
        regex: ${name_prefix}-api-python
        action: keep
      - source_labels: [__address__]
        regex: '([^:]+)(?::\d+)?'
        replacement: '$${1}:8000'
        target_label: __address__
      - source_labels: [__meta_ecs_task_definition_family]
        target_label: job

  # ─── Spring Boot (port 8080) ─────────────────────────────────────────────
  - job_name: api-spring
    metrics_path: /api/metrics
    ecs_sd_configs:
      - region: ${region}
    relabel_configs:
      - source_labels: [__meta_ecs_task_definition_family]
        regex: ${name_prefix}-api-spring
        action: keep
      - source_labels: [__address__]
        regex: '([^:]+)(?::\d+)?'
        replacement: '$${1}:8080'
        target_label: __address__
      - source_labels: [__meta_ecs_task_definition_family]
        target_label: job

  # ─── Prometheus self-monitoring ──────────────────────────────────────────
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']
