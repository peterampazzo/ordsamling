variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "project_name" {
  description = "Cloudflare Pages project name."
  type        = string
  default     = "ordsamling"
}

variable "production_branch" {
  description = "Pages production selector. Keep main: only the release workflow deploys with --branch=main; main pushes use --branch=preview."
  type        = string
  default     = "main"
}

variable "production_domain" {
  description = "Custom hostname attached to the production Pages deployment. Its DNS CNAME is managed in the peterampazzo.com zone."
  type        = string
  default     = "ordsamling.peterampazzo.com"
}

variable "google_client_id" {
  description = "Google OAuth2 client ID — set as a Cloudflare Pages secret."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth2 client secret — set as a Cloudflare Pages secret."
  type        = string
  sensitive   = true
}
