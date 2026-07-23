import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer, getVisibleOwnerIds } from "@/lib/permissions";
import { deleteObject, saveObject } from "@/lib/storage";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { previewMediaAnalysis } from "@/lib/analyze";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import { assertSafeUpload } from "@/lib/file-security";
import { clientIp, enforceRateLimit } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const platformWide =
      user.role === "super_admin" && !user.act_as_company_id;
    if (!platformWide && !user.company_id) {
      return jsonError("缺少公司信息", 400);
    }

    const sp = request.nextUrl.searchParams;
    const customerId = sp.get("customer_id");
    const q = sp.get("q")?.trim() || "";
    const kind = sp.get("kind")?.trim() || "";
    const status = sp.get("status")?.trim() || "";
    const { paginate, page, pageSize } = parsePageParams(sp);
    const owners = await getVisibleOwnerIds(user);

    let where = `WHERE 1=1`;
    const params: unknown[] = [];

    if (!platformWide) {
      params.push(user.company_id);
      where += ` AND m.company_id = $${params.length}`;
      if (Array.isArray(owners)) {
        params.push(owners);
        where += ` AND m.uploader_id = ANY($${params.length}::bigint[])`;
      }
    }

    if (customerId) {
      params.push(Number(customerId));
      where += ` AND m.customer_id = $${params.length}`;
    }

    if (kind === "call" || kind === "wechat") {
      params.push(kind);
      where += ` AND m.kind = $${params.length}`;
    }

    if (status === "uploaded" || status === "analyzing" || status === "analyzed" || status === "failed") {
      params.push(status);
      where += ` AND m.status = $${params.length}`;
    }

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        m.file_name ILIKE $${params.length}
        OR COALESCE(c.name, '') ILIKE $${params.length}
        OR COALESCE(c.company_name, '') ILIKE $${params.length}
        OR COALESCE(u.name, '') ILIKE $${params.length}
      )`;
    }

    const fromSql = `FROM media_assets m
      LEFT JOIN customers c ON c.id = m.customer_id
      LEFT JOIN users u ON u.id = m.uploader_id
      LEFT JOIN LATERAL (
        SELECT i.result_json
        FROM ai_insights i
        WHERE i.media_asset_id = m.id
        ORDER BY i.created_at DESC
        LIMIT 1
      ) insight ON TRUE
      ${where}`;
    const selectSql = `SELECT m.*, c.name AS customer_name, c.company_name AS customer_company_name,
      c.public_id AS customer_public_id, u.name AS uploader_name,
      COALESCE(insight.result_json->'pain_points', '[]'::jsonb) AS pain_points,
      COALESCE(insight.result_json->'competitors', '[]'::jsonb) AS competitors`;

    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql} ORDER BY m.created_at DESC LIMIT 100`,
        params
      );
      return jsonOk(result.rows);
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total ${fromSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);
    const listParams = [...params, limit, offset];
    const result = await pool.query(
      `${selectSql} ${fromSql}
       ORDER BY m.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return jsonOk(result.rows, 200, meta);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    await enforceRateLimit({
      key: `upload:${user.company_id}:${user.id}:${clientIp(request)}`,
      limit: 30,
      windowSeconds: 3600,
    });

    const form = await request.formData();
    const kind = String(form.get("kind") || "call");
    const customerId = Number(form.get("customer_id") || 0);
    const transcript = String(form.get("transcript") || "").trim();
    const textContent = String(form.get("text_content") || "").trim();
    const file = form.get("file");
    const analyzeNow = String(form.get("analyze") || "1") === "1";
    const durationRaw = Number(form.get("duration_ms") || 0);
    const durationMs =
      Number.isFinite(durationRaw) && durationRaw > 0
        ? Math.round(durationRaw)
        : null;

    if (!customerId) return jsonError("请选择客户");
    if (kind !== "call" && kind !== "wechat") return jsonError("类型无效");
    if (transcript.length > 1_000_000 || textContent.length > 1_000_000) {
      return jsonError("文本内容不能超过 100 万字符");
    }

    await assertCanAccessCustomer(user, customerId);

    let uri = "";
    let fileName = "";
    let mime: string | null = null;
    let size = 0;
    let finalTranscript = transcript;
    let pendingBuf: Buffer | null = null;

    if (kind === "wechat") {
      if (!textContent) return jsonError("请粘贴微信聊天内容");
      fileName = `wechat-${Date.now()}.txt`;
      mime = "text/plain";
      pendingBuf = Buffer.from(textContent, "utf8");
      finalTranscript = textContent;
    } else if (file && typeof file !== "string" && "arrayBuffer" in file) {
      const blob = file as File;
      const buf = Buffer.from(await blob.arrayBuffer());
      assertSafeUpload(blob,buf,{ maxBytes:200*1024*1024, allowedExts:["mp3","wav","m4a","aac","ogg","flac","webm","mp4"] });
      if (buf.length > 200 * 1024 * 1024) {
        return jsonError("单文件不能超过 200MB");
      }
      fileName = blob.name || `${kind}-upload`;
      mime = blob.type || null;
      pendingBuf = buf;
    } else {
      return jsonError("请上传录音文件");
    }

    // 通话：须先在前端识别并校对转写，再上传（本接口不再自动 ASR）
    if (kind === "call" && !finalTranscript) {
      return jsonError("请先识别并校对转写文本后再上传");
    }

    // Persist only after validation; on later failure roll back file + row and still audit
    let mediaId: number | null = null;
    try {
      if (!uri) {
        const quotaBytes = Number(process.env.COMPANY_STORAGE_QUOTA_BYTES || 10 * 1024 ** 3);
        const usage = await pool.query(
          `SELECT COALESCE(SUM(size_bytes),0)::bigint AS used FROM media_assets WHERE company_id = $1`,
          [user.company_id]
        );
        if (Number(usage.rows[0]?.used || 0) + pendingBuf!.length > quotaBytes) {
          return jsonError("公司存储空间已用完", 413);
        }
        const saved = await saveObject({
          companyId: user.company_id,
          folder: "crm",
          fileName,
          contentType: mime || undefined,
          body: pendingBuf!,
        });
        uri = saved.uri;
        size = saved.size;
      }

      const inserted = await pool.query(
        `INSERT INTO media_assets
          (company_id, customer_id, uploader_id, kind, file_name, uri, mime, size_bytes, duration_ms, transcript, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'uploaded')
         RETURNING *`,
        [
          user.company_id,
          customerId,
          user.id,
          kind,
          fileName,
          uri,
          mime,
          size,
          kind === "call" ? durationMs : null,
          finalTranscript,
        ]
      );

      mediaId = inserted.rows[0].id as number;

      let draft = null;
      if (analyzeNow) {
        draft = await previewMediaAnalysis({
          user,
          mediaId,
        });
      }

      await writeAuditLog({
        user,
        action: "media.upload",
        targetType: "media_asset",
        targetId: mediaId,
        summary: `上传${kind === "call" ? "通话" : "微信"} ${fileName}${
          analyzeNow ? "（待确认保存）" : ""
        }`,
      });

      return jsonOk({ media: inserted.rows[0], draft }, 201);
    } catch (err) {
      if (mediaId != null) {
        await pool.query(`DELETE FROM media_assets WHERE id = $1`, [mediaId]).catch(() => undefined);
      }
      if (uri) await deleteObject(uri);
      const msg =
        err instanceof Error ? err.message : "AI 解析失败，文件未保存";
      await writeAuditLog({
        user,
        action: "media.upload_analyze_failed",
        targetType: "media_asset",
        summary: `上传解析失败（未保存文件）${fileName}：${msg}`,
      });
      return jsonError(msg, 502);
    }
  } catch (err) {
    return handleApiError(err);
  }
}
