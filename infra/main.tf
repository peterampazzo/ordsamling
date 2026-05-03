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

      secrets = {
        GOOGLE_CLIENT_ID     = var.google_client_id
        GOOGLE_CLIENT_SECRET = var.google_client_secret
      }
    }

    preview {
      compatibility_date  = "2026-04-04"
      compatibility_flags = []

      secrets = {
        GOOGLE_CLIENT_ID     = var.google_client_id
        GOOGLE_CLIENT_SECRET = var.google_client_secret
      }
    }
  }
}
