# ---------------------------------------------------------------------------
# KV namespace shared by the Pages app (functions/api/notifications/*) and
# the standalone cron Worker (workers/push-cron). Stores Web Push
# subscriptions and per-user `lastQuizAt` heartbeats.
# ---------------------------------------------------------------------------

resource "cloudflare_workers_kv_namespace" "push_subs" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-push-subs"
}

# ---------------------------------------------------------------------------
# Pages project
# ---------------------------------------------------------------------------
# This resource is configured for Direct Upload deployments (Wrangler / API).
# No `source` block is defined, so Terraform will not connect a Git provider.

resource "cloudflare_pages_project" "ordsamling" {
  account_id        = var.cloudflare_account_id
  name              = var.project_name
  production_branch = var.production_branch

  deployment_configs {
    production {
      compatibility_date  = "2026-04-04"
      compatibility_flags = []

      env_vars = {
        VITE_VAPID_PUBLIC_KEY = var.vapid_public_key
      }

      secrets = {
        GOOGLE_CLIENT_ID     = var.google_client_id
        GOOGLE_CLIENT_SECRET = var.google_client_secret
      }

      kv_namespaces = {
        PUSH_SUBS = cloudflare_workers_kv_namespace.push_subs.id
      }
    }

    preview {
      compatibility_date  = "2026-04-04"
      compatibility_flags = []

      env_vars = {
        VITE_VAPID_PUBLIC_KEY = var.vapid_public_key
      }

      secrets = {
        GOOGLE_CLIENT_ID     = var.google_client_id
        GOOGLE_CLIENT_SECRET = var.google_client_secret
      }

      kv_namespaces = {
        PUSH_SUBS = cloudflare_workers_kv_namespace.push_subs.id
      }
    }
  }
}
