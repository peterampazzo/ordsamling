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
