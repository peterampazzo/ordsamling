# ---------------------------------------------------------------------------
# KV namespaces
# ---------------------------------------------------------------------------

resource "cloudflare_workers_kv_namespace" "lexicon_prod" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-lexicon-prod"
}

resource "cloudflare_workers_kv_namespace" "lexicon_preview" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-lexicon-preview"
}

# ---------------------------------------------------------------------------
# Pages project
# ---------------------------------------------------------------------------
# This resource is configured for Direct Upload deployments (Wrangler / API).
# No `source` block is defined, so Terraform will not connect a Git provider.

resource "cloudflare_pages_project" "ordsamling" {
  account_id = var.cloudflare_account_id
  name       = var.project_name
  # Required by Cloudflare API even for Direct Upload projects.
  # This does not configure a Git repository integration.
  production_branch = var.production_branch

  deployment_configs {
    production {
      kv_namespaces = {
        LEXICON = cloudflare_workers_kv_namespace.lexicon_prod.id
      }
      compatibility_date  = "2026-04-04"
      compatibility_flags = []
    }

    preview {
      kv_namespaces = {
        LEXICON = cloudflare_workers_kv_namespace.lexicon_preview.id
      }
      compatibility_date  = "2026-04-04"
      compatibility_flags = []
    }
  }
}

data "cloudflare_zone" "primary" {
  name = var.zone_name
}

resource "cloudflare_pages_domain" "custom" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.ordsamling.name
  domain       = var.custom_hostname
}

resource "cloudflare_record" "pages_custom_domain" {
  zone_id = data.cloudflare_zone.primary.id
  name    = var.custom_hostname
  type    = "CNAME"
  content = "${var.project_name}.pages.dev"
  ttl     = 1
  proxied = true
}

# ---------------------------------------------------------------------------
# Cloudflare Access – protect the Pages site with email OTP login
#
# Any request to ordsamling.pages.dev will be intercepted by Cloudflare Access.
# Users must authenticate with one of the emails listed in var.access_allowed_emails
# via a one-time passcode (no passwords, no OAuth app required).
# ---------------------------------------------------------------------------

resource "cloudflare_zero_trust_access_application" "ordsamling" {
  account_id       = var.cloudflare_account_id
  name             = "Ordsamling"
  domain           = var.custom_hostname
  type             = "self_hosted"
  session_duration = var.access_session_duration

  # Allow Cloudflare's built-in one-time-pin identity provider.
  # Users will receive a magic link / OTP to their email.
  allowed_idps              = []
  auto_redirect_to_identity = false
}

# Block all access to the pages.dev URL so only the custom domain is usable.
resource "cloudflare_zero_trust_access_application" "pages_dev_block" {
  account_id       = var.cloudflare_account_id
  name             = "Ordsamling (pages.dev – blocked)"
  domain           = "${var.project_name}.pages.dev"
  type             = "self_hosted"
  session_duration = "1m"

  allowed_idps              = []
  auto_redirect_to_identity = false
}

resource "cloudflare_zero_trust_access_policy" "allow_emails" {
  account_id     = var.cloudflare_account_id
  application_id = cloudflare_zero_trust_access_application.ordsamling.id
  name           = "Allow allowed emails"
  precedence     = 1
  decision       = "allow"

  include {
    email = var.access_allowed_emails
  }
}
