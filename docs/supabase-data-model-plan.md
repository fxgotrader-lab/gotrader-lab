# Supabase Data Model Plan

## Purpose

Supabase should provide durable storage for GoTrader AI Lab research state while preserving AI Lab as the source of truth for research, readiness, and safety decisions.

Broker execution remains disabled.

## Principles

- Use Supabase Auth for identity.
- Use workspace-scoped tables.
- Require RLS on every table.
- Store compact summaries, not raw runtime blobs.
- Store uploaded market-data files in Supabase Storage.
- Store metadata and validation summaries in Postgres.
- Keep service-role keys server-side only.
- Record audit fields on every mutation.
- Preserve run fingerprints and metric provenance.

## Core Ownership Model

### `users`

Supabase Auth owns user identity. A public profile table may store display metadata only.

Suggested fields:

- `id uuid primary key references auth.users`
- `email text`
- `display_name text`
- `created_at timestamptz`
- `updated_at timestamptz`

### `workspaces`

Workspace container for research state.

Suggested fields:

- `id uuid primary key`
- `name text`
- `owner_user_id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

### `workspace_members`

Maps users to workspaces.

Suggested fields:

- `workspace_id uuid`
- `user_id uuid`
- `role text`
- `created_at timestamptz`

RLS should allow a user to read only workspaces where membership exists.

## Research Tables

### `research_cycles`

Stores compact AI Research Cycle summaries.

Suggested fields:

- `id uuid primary key`
- `workspace_id uuid`
- `cycle_id text unique`
- `status text`
- `started_at timestamptz`
- `completed_at timestamptz`
- `data_source text`
- `active_calibration_id text`
- `readiness_state text`
- `result_summary text`
- `created_proposal_id text`
- `runtime_fingerprint jsonb`
- `summary jsonb`

### `runtime_snapshots`

Stores canonical runtime read-model snapshots.

Suggested fields:

- `id uuid primary key`
- `workspace_id uuid`
- `snapshot_id text unique`
- `generated_at timestamptz`
- `latest_cycle_id text`
- `active_data_source text`
- `active_calibration_id text`
- `readiness_state text`
- `source_trace jsonb`
- `stale_state_warnings jsonb`
- `mismatch_warnings jsonb`
- `snapshot_summary jsonb`

### `canonical_metrics`

Stores the canonical metric set for a cycle/proposal.

Suggested fields:

- `id uuid primary key`
- `workspace_id uuid`
- `source_cycle_id text`
- `source_proposal_id text`
- `source_candidate_id text`
- `metric_source_type text`
- `data_source text`
- `symbol text`
- `timeframe text`
- `candle_window text`
- `raw_candle_count integer`
- `processed_candle_count integer`
- `starting_balance numeric`
- `current_balance numeric`
- `realized_pnl numeric`
- `total_trades integer`
- `win_rate numeric`
- `average_r numeric`
- `max_drawdown_r numeric`
- `profit_factor numeric`
- `readiness_score integer`
- `stability_score integer`
- `generated_at timestamptz`
- `runtime_fingerprint jsonb`

### `self_improvement_proposals`

Stores calibration proposal snapshots and approval state.

Suggested fields:

- `id uuid primary key`
- `workspace_id uuid`
- `proposal_id text unique`
- `source_cycle_id text`
- `source_candidate_id text`
- `status text`
- `category text`
- `target_problem text`
- `approval_required boolean`
- `proposed_changes jsonb`
- `metrics_snapshot jsonb`
- `comparison_result jsonb`
- `created_at timestamptz`
- `approved_at timestamptz`
- `rejected_at timestamptz`
- `reviewer_user_id uuid`

### `approved_calibrations`

Stores approved active research calibrations.

Suggested fields:

- `id uuid primary key`
- `workspace_id uuid`
- `approved_calibration_id text unique`
- `source_proposal_id text`
- `approved_at timestamptz`
- `approved_by uuid`
- `applied_config_patch jsonb`
- `baseline_config_before jsonb`
- `active_config_after jsonb`
- `audit_note text`

### `readiness_results`

Stores readiness gate snapshots.

Suggested fields:

- `id uuid primary key`
- `workspace_id uuid`
- `source_cycle_id text`
- `state text`
- `actual_blockers jsonb`
- `passed_requirements jsonb`
- `warnings jsonb`
- `next_action text`
- `approval_status text`
- `generated_at timestamptz`
- `snapshot jsonb`

## Agent and LLM Tables

### `agent_audit_traces`

- `id uuid primary key`
- `workspace_id uuid`
- `trace_id text unique`
- `agent_id text`
- `agent_name text`
- `decision_type text`
- `audit_score numeric`
- `audit_verdict text`
- `generated_at timestamptz`
- `trace_summary jsonb`

### `agent_debate_sessions`

- `id uuid primary key`
- `workspace_id uuid`
- `session_id text unique`
- `source_cycle_id text`
- `consensus_reached boolean`
- `position text`
- `probability numeric`
- `generated_at timestamptz`
- `session_summary jsonb`

### `llm_advisory_runs`

- `id uuid primary key`
- `workspace_id uuid`
- `run_id text unique`
- `source_cycle_id text`
- `provider text`
- `schema_version text`
- `advisory_passed boolean`
- `missing_reviewers jsonb`
- `unsafe_rejections integer`
- `generated_at timestamptz`
- `compact_response jsonb`

## Evidence, Maturity, and Walk-Forward Tables

### `evidence_quality_snapshots`

- `id uuid primary key`
- `workspace_id uuid`
- `snapshot_id text unique`
- `source_cycle_id text`
- `overall_score numeric`
- `real_evidence_coverage numeric`
- `weakest_categories jsonb`
- `readiness_warnings jsonb`
- `generated_at timestamptz`
- `ledger_summary jsonb`

### `research_maturity_snapshots`

- `id uuid primary key`
- `workspace_id uuid`
- `snapshot_id text unique`
- `active_calibration_id text`
- `grade text`
- `score numeric`
- `cycles_tested integer`
- `windows_tested integer`
- `next_requirement text`
- `generated_at timestamptz`
- `summary jsonb`

### `walk_forward_runs`

- `id uuid primary key`
- `workspace_id uuid`
- `run_id text unique`
- `source_cycle_id text`
- `data_preset text`
- `window_count integer`
- `oos_windows_passed integer`
- `verdict text`
- `overfit_risk text`
- `stability_score numeric`
- `failure_diagnostics jsonb`
- `summary jsonb`
- `started_at timestamptz`
- `completed_at timestamptz`

## Simulation and Market Data Tables

### `simulation_runbook_records`

- `id uuid primary key`
- `workspace_id uuid`
- `record_id text unique`
- `source_cycle_id text`
- `completed_checks integer`
- `total_checks integer`
- `broker_execution_skipped boolean`
- `verified_at timestamptz`
- `record jsonb`

### `market_data_imports`

- `id uuid primary key`
- `workspace_id uuid`
- `import_id text unique`
- `symbol text`
- `contract text`
- `timeframe text`
- `raw_candle_count integer`
- `first_timestamp timestamptz`
- `last_timestamp timestamptz`
- `storage_bucket text`
- `storage_path text`
- `validation_warnings jsonb`
- `created_at timestamptz`

Raw imported files should live in Supabase Storage. Parsed candle metadata and validation summaries live in Postgres. Do not store giant candle arrays in research-cycle rows.

## Autonomous, Communications, and Paperclip Tables

### `autonomous_loop_runs`

- `id uuid primary key`
- `workspace_id uuid`
- `run_id text unique`
- `status text`
- `max_iterations integer`
- `current_iteration integer`
- `latest_scenario_family text`
- `stop_reason text`
- `auto_apply_policy_enabled boolean`
- `summary jsonb`
- `started_at timestamptz`
- `completed_at timestamptz`

### `communications_events`

- `id uuid primary key`
- `workspace_id uuid`
- `event_id text unique`
- `category text`
- `severity text`
- `title text`
- `summary text`
- `route_to_open text`
- `related_cycle_id text`
- `related_proposal_id text`
- `created_at timestamptz`
- `event_payload jsonb`

### `paperclip_task_refs`

Planning-only references to future Paperclip tasks.

- `id uuid primary key`
- `workspace_id uuid`
- `paperclip_task_id text`
- `source_cycle_id text`
- `runtime_fingerprint jsonb`
- `task_type text`
- `status text`
- `authority jsonb`
- `route_to_open text`
- `created_at timestamptz`
- `updated_at timestamptz`

Paperclip tasks must not mutate readiness, calibrations, broker settings, or handoff authority.

## Storage Buckets

Suggested buckets:

- `market-data-imports`
- `research-reports`
- `walk-forward-reports`
- `audit-exports`

Bucket rules:

- authenticated access only
- workspace-scoped object paths
- no API keys or broker credentials
- signed URLs for temporary downloads
- retention policy for large imported files

## RLS Requirements

Every table should enforce:

- user can read rows only for workspaces they belong to
- user can write rows only for workspaces where role allows it
- server-side functions can use service role only where required
- audit tables should be append-only for normal users
- proposal approval rows require explicit user identity

## Migration Approach

1. Add schema and RLS in a staging Supabase project.
2. Add read/write repository interfaces in AI Lab.
3. Mirror localStorage to Supabase for selected tables.
4. Keep local fallback until persistence is stable.
5. Migrate uploaded market-data files to Storage.
6. Add server-side provider functions.
7. Keep broker execution disabled.

