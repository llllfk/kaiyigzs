import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getVisibleOwnerIds, buildOwnerFilter, crmRole } from "@/lib/permissions";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { aggregatePainPointCounts } from "@/lib/pain-points";

export async function GET() {
  try {
    const user = await requireSession();
    if (user.role === "super_admin" && !user.act_as_company_id) {
      return jsonError("请先进入公司业务视图查看分析", 400);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const owners = await getVisibleOwnerIds(user);
    const cFilter = buildOwnerFilter(owners, user.company_id, "c");
    const oFilter = buildOwnerFilter(owners, user.company_id, "o", {
      includePoolStatus: false,
    });

    const [
      customersByIndustry,
      customersBySource,
      oppByStage,
      followFreq,
      painPoints,
      competitorHits,
      reviews,
      intentDist,
      recentInsights,
      uploadStats,
    ] = await Promise.all([
      pool.query(
        `SELECT COALESCE(NULLIF(c.industry,''), '未填') AS key, COUNT(*)::int AS value
         FROM customers c WHERE ${cFilter.sql}
         GROUP BY 1 ORDER BY value DESC LIMIT 10`,
        cFilter.params
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(c.source,''), '未填') AS key, COUNT(*)::int AS value
         FROM customers c WHERE ${cFilter.sql}
         GROUP BY 1 ORDER BY value DESC LIMIT 10`,
        cFilter.params
      ),
      pool.query(
        `SELECT o.stage AS key, COUNT(*)::int AS value
         FROM opportunities o WHERE ${oFilter.sql}
         GROUP BY o.stage`,
        oFilter.params
      ),
      pool.query(
        `SELECT to_char(f.followed_at, 'YYYY-MM-DD') AS key, COUNT(*)::int AS value
         FROM follow_ups f
         JOIN customers c ON c.id = f.customer_id
         WHERE ${cFilter.sql}
           AND f.followed_at >= CURRENT_DATE - INTERVAL '14 days'
         GROUP BY 1 ORDER BY 1`,
        cFilter.params
      ),
      pool.query(
        `SELECT jsonb_array_elements_text(COALESCE(c.profile_json->'pain_points','[]'::jsonb)) AS key,
                COUNT(*)::int AS value
         FROM customers c
         WHERE ${cFilter.sql}
         GROUP BY 1 ORDER BY value DESC LIMIT 200`,
        cFilter.params
      ),
      pool.query(
        `SELECT COALESCE(comp.name, m.name) AS key, COUNT(*)::int AS value
         FROM competitor_mentions m
         LEFT JOIN competitors comp ON comp.id = m.competitor_id
         WHERE m.company_id = $1
         GROUP BY 1 ORDER BY value DESC LIMIT 15`,
        [user.company_id]
      ),
      pool.query(
        `SELECT r.outcome AS key, COUNT(*)::int AS value,
                COALESCE(r.reason_category, '未分类') AS reason
         FROM opportunity_reviews r
         JOIN opportunities o ON o.id = r.opportunity_id
         WHERE r.company_id = $1
           ${Array.isArray(owners) ? "AND o.owner_id = ANY($2::bigint[])" : ""}
         GROUP BY r.outcome, COALESCE(r.reason_category, '未分类')
         ORDER BY value DESC`,
        Array.isArray(owners) ? [user.company_id, owners] : [user.company_id]
      ),
      pool.query(
        `SELECT COALESCE(c.profile_json->>'intent', 'unknown') AS key, COUNT(*)::int AS value
         FROM customers c WHERE ${cFilter.sql}
         GROUP BY 1`,
        cFilter.params
      ),
      pool.query(
        `SELECT i.id, i.kind, i.summary, i.created_at, c.name AS customer_name,
                i.customer_id, c.public_id AS customer_public_id
         FROM ai_insights i
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.company_id = $1
         ORDER BY i.created_at DESC LIMIT 10`,
        [user.company_id]
      ),
      pool.query(
        `SELECT status AS key, COUNT(*)::int AS value
         FROM media_assets
         WHERE company_id = $1
         GROUP BY status`,
        [user.company_id]
      ),
    ]);

    return jsonOk({
      customers_by_industry: customersByIndustry.rows,
      customers_by_source: customersBySource.rows,
      opportunities_by_stage: oppByStage.rows,
      follow_ups_14d: followFreq.rows,
      pain_points: aggregatePainPointCounts(painPoints.rows, 15),
      competitors: competitorHits.rows,
      reviews: reviews.rows,
      intent_distribution: intentDist.rows,
      recent_insights: recentInsights.rows,
      upload_stats: uploadStats.rows,
      scope:
        crmRole(user) === "company_admin"
          ? "company"
          : user.role === "sales_manager"
            ? "team"
            : "self",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
