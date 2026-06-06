output "push_subs_kv_namespace_id" {
  description = "ID of the KV namespace shared between Pages and the cron Worker. Wire this into workers/push-cron/wrangler.toml."
  value       = cloudflare_workers_kv_namespace.push_subs.id
}
