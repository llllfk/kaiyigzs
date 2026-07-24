import pool from "@/lib/db";
import type { SessionUser } from "@/types";
import type { StageChangeSource } from "@/lib/opportunity-stage-labels";

export type { StageChangeSource } from "@/lib/opportunity-stage-labels";
export { STAGE_CHANGE_SOURCE_LABELS } from "@/lib/opportunity-stage-labels";

export async function recordOpportunityStageChange(opts: {
  user: SessionUser;
  companyId: number;
  opportunityId: number;
  fromStage: string | null;
  toStage: string;
  reason?: string | null;
  source?: StageChangeSource;
}) {
  const to = String(opts.toStage || "").trim();
  if (!to) return;
  const from = opts.fromStage != null ? String(opts.fromStage) : null;
  if (from === to) return;

  const reason = String(opts.reason || "").trim() || null;
  const source = opts.source || "manual";

  await pool.query(
    `INSERT INTO opportunity_stage_history
      (company_id, opportunity_id, actor_id, from_stage, to_stage, reason, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      opts.companyId,
      opts.opportunityId,
      opts.user.id,
      from,
      to,
      reason,
      source,
    ]
  );
}

export async function listOpportunityStageHistory(opportunityId: number) {
  const { rows } = await pool.query(
    `SELECT h.id, h.from_stage, h.to_stage, h.reason, h.source, h.created_at,
            u.name AS actor_name
     FROM opportunity_stage_history h
     LEFT JOIN users u ON u.id = h.actor_id
     WHERE h.opportunity_id = $1
     ORDER BY h.created_at DESC, h.id DESC`,
    [opportunityId]
  );
  return rows as Array<{
    id: number;
    from_stage: string | null;
    to_stage: string;
    reason: string | null;
    source: string;
    created_at: string;
    actor_name: string | null;
  }>;
}
