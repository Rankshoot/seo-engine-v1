-- User CMS Integrations
-- Stores per-user credentials for external CMS platforms (Strapi, WordPress, etc.)
-- api_token is stored server-side only and never returned to the client; masked_token is safe to expose.

create table if not exists public.user_cms_integrations (
  id               uuid        primary key default gen_random_uuid(),
  user_id          text        not null,
  cms_type         text        not null check (cms_type in ('strapi', 'wordpress', 'contentful', 'ghost')),
  base_url         text        not null,
  api_token        text        not null,
  masked_token     text        not null,
  collection_name  text        not null default 'articles',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint user_cms_integrations_user_cms_unique unique (user_id, cms_type)
);

-- Index for fast user lookups
create index if not exists user_cms_integrations_user_id_idx on public.user_cms_integrations (user_id);

-- RLS: users can only see and manage their own integrations
alter table public.user_cms_integrations enable row level security;

-- Service-role bypass (used by API routes)
create policy "service_role_all" on public.user_cms_integrations
  for all
  using (auth.role() = 'service_role');

comment on table public.user_cms_integrations is 'Per-user CMS integration credentials. api_token is stored encrypted at rest by Supabase; masked_token is safe for UI display.';
comment on column public.user_cms_integrations.api_token is 'Full bearer token — never returned to the client. Use masked_token for display.';
