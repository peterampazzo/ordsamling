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
  description = "Git branch used as production."
  type        = string
  default     = "main"
}

variable "zone_name" {
  description = "Cloudflare DNS zone where the custom domain is managed."
  type        = string
  default     = "peterampazzo.com"
}

variable "custom_hostname" {
  description = "Custom hostname for the Pages app."
  type        = string
  default     = "ordsamling.peterampazzo.com"
}

variable "access_allowed_emails" {
  description = "Email addresses permitted to access the app via Cloudflare Access (magic-link OTP)."
  type        = list(string)
  default     = []
}

variable "access_session_duration" {
  description = "How long a Cloudflare Access session lasts before re-authentication is required."
  type        = string
  default     = "24h"
}
