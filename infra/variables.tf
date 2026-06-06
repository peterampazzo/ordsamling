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
  description = "Required by Cloudflare Pages API; does not imply Git integration."
  type        = string
  default     = "main"
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

variable "vapid_public_key" {
  description = "VAPID public key (base64url). Exposed to the browser as VITE_VAPID_PUBLIC_KEY at build time and to the cron Worker."
  type        = string
  default     = ""
}

variable "vapid_private_key" {
  description = "VAPID private key (base64url). Used only by the cron Worker."
  type        = string
  sensitive   = true
  default     = ""
}

variable "vapid_subject" {
  description = "VAPID subject — `mailto:` URL used as the From header for push delivery."
  type        = string
  default     = "mailto:hello@ordsamling.pages.dev"
}
