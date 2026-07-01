-- Idempotent: server-side snapshot of the project fields (domain/niche/region/language)
-- as of the last successful keyword discovery run. Replaces the old client-side
-- localStorage hash, which produced false "Project details have changed" warnings
-- on any new browser/device/account that had never written that key locally.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS discovery_params_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN projects.discovery_params_snapshot IS 'Snapshot of { domain, niche, target_region, target_language } as of the last successful keyword discovery. NULL means discovery has not run since this column was added — treated as "no mismatch" (never a false-positive warning), not as "always stale".';
