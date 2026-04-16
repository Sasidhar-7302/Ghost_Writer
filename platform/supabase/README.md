# Supabase Assets

This folder contains the optional Supabase-side pieces used by Ghost Writer for licensing, analytics, and checkout completion flows.

## What Is Here

- `schema.sql`
  - base schema for installation tracking, global configuration, checkout sessions, and the `register_beta_user` RPC
- `analytics_migration.sql`
  - analytics-related schema additions and the `update_analytics_heartbeat` RPC
- `fix_v_config.sql`
  - idempotent repair script for older deployments that may be missing `trial_duration_days`
- `functions/gumroad-webhook/index.ts`
  - Supabase Edge Function that completes a checkout session from a Gumroad webhook

## When You Need Supabase

Supabase is only needed if you want:

- hosted beta/license tracking
- install analytics
- Gumroad webhook completion

It is not required for the core local interview and meeting workflow.

## Recommended Order

1. Run `schema.sql`
2. Run `analytics_migration.sql` if you want install analytics
3. Run `fix_v_config.sql` only for older deployments that need the repair
4. Deploy `functions/gumroad-webhook`

## Notes

- Review table names and RPC definitions before applying changes to production
- Keep the desktop app version and release process aligned with any license or runtime distribution workflow
- Store Supabase service-role keys only in the Edge Function environment, never in the desktop app
