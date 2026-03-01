# SESSION_1159

Use this file as the handoff context for new chats when rate-limits interrupt work.

## Project
- Repo: `kevanaenterprises-bot/LoadTracker-Pro-2026`
- Deployment: Railway
- Primary goal: stabilize production TMS workflow for contract readiness

## Recent deploy commits
- `4ae90d1` Railway build hotfix (`nixpacks.toml`, Node 20 + `npm install`)
- `a7f47cc` tracking persistence + merged invoice/POD flow + load sync fixes

## Current blocker
- Dashboard still shows only one load despite more records expected.

## Session 1159 fixes applied
1. Added dedicated authenticated endpoint `GET /api/loads` in `server/index.js`
   - Returns all loads ordered by `delivery_date`
   - Includes `customer` and `driver` via SQL joins
   - Isolates dashboard from query-builder / mixed data-source behavior
2. Updated `src/components/AppLayout.tsx`
   - `fetchData()` now calls `GET /api/loads` first
   - Falls back to existing `db.from('loads')` path if endpoint fails
   - Preserves existing payment-data and stale-driver cleanup logic

## Why this matters
- Removes ambiguity from optional direct Supabase reads.
- Forces dashboard loads to come from one backend path tied to authenticated API.

## Verification checklist
1. Redeploy Railway from latest `main`.
2. Login as admin.
3. Confirm dashboard buckets reflect all active/invoiced/paid rows.
4. If still one load, check Railway logs for `[GET /api/loads]` row count output.

## If one-load issue persists after this
- It indicates the connected `DATABASE_URL` itself only has one load row.
- Compare row counts directly in Railway DB vs expected Supabase DB.
- Then decide whether to:
  - sync missing records into Railway DB, or
  - intentionally switch all load reads/writes back to Supabase with consistent auth/RLS.
