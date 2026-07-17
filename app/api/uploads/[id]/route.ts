import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { runMediaAnalysis } from "@/lib/analyze";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import pool from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.transcript) {
      await pool.query(
        `UPDATE media_assets SET transcript = $1 WHERE id = $2`,
        [String(body.transcript), id]
      );
    }

    const insight = await runMediaAnalysis({
      user,
      mediaId: Number(id),
    });
    return jsonOk(insight);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const result = await pool.query(
      `SELECT m.*, i.id AS insight_id, i.result_json, i.summary AS insight_summary
       FROM media_assets m
       LEFT JOIN ai_insights i ON i.media_asset_id = m.id
       WHERE m.id = $1
       ORDER BY i.created_at DESC
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return jsonError("未找到", 404);
    if (
      user.role !== "super_admin" &&
      row.company_id !== user.company_id
    ) {
      return jsonError("无权访问", 403);
    }
    return jsonOk(row);
  } catch (err) {
    return handleApiError(err);
  }
}
