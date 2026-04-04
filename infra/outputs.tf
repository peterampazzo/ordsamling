output "pages_url" {
  description = "Production Cloudflare Pages URL."
  value       = "https://${var.project_name}.pages.dev"
}

output "custom_pages_url" {
  description = "Custom production URL for the Pages app."
  value       = "https://${var.custom_hostname}"
}

output "kv_namespace_id_prod" {
  description = "KV namespace ID for production. Use this as `id` in wrangler.toml."
  value       = cloudflare_workers_kv_namespace.lexicon_prod.id
}

output "kv_namespace_id_preview" {
  description = "KV namespace ID for preview. Use this as `preview_id` in wrangler.toml."
  value       = cloudflare_workers_kv_namespace.lexicon_preview.id
}

output "access_application_id" {
  description = "Cloudflare Access application ID."
  value       = cloudflare_zero_trust_access_application.ordsamling.id
}

output "wrangler_toml_snippet" {
  description = "Paste this into wrangler.toml after a successful apply."
  value       = <<-EOT
    [[kv_namespaces]]
    binding    = "LEXICON"
    id         = "${cloudflare_workers_kv_namespace.lexicon_prod.id}"
    preview_id = "${cloudflare_workers_kv_namespace.lexicon_preview.id}"
  EOT
}
