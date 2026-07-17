import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer, getVisibleOwnerIds } from "@/lib/permissions";
import { saveObject } from "@/lib/storage";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { runMediaAnalysis } from "@/lib/analyze";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id && user.role !== "super_admin") {
      return jsonError("缺少公司信息", 400);
    }

    const customerId = request.nextUrl.searchParams.get("customer_id");
    const owners = await getVisibleOwnerIds(user);

    let sql = `SELECT m.*, c.name AS customer_name, u.name AS uploader_name
      FROM media_assets m
      LEFT JOIN customers c ON c.id = m.customer_id
      LEFT JOIN users u ON u.id = m.uploader_id
      WHERE 1=1`;
    const params: unknown[] = [];

    if (user.role !== "super_admin") {
      params.push(user.company_id);
      sql += ` AND m.company_id = $${params.length}`;
      if (Array.isArray(owners)) {
        params.push(owners);
        sql += ` AND m.uploader_id = ANY($${params.length}::bigint[])`;
      }
    }

    if (customerId) {
      params.push(Number(customerId));
      sql += ` AND m.customer_id = $${params.length}`;
    }

    sql += " ORDER BY m.created_at DESC LIMIT 100";
    const result = await pool.query(sql, params);
    return jsonOk(result.rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const form = await request.formData();
    const kind = String(form.get("kind") || "call");
    const customerId = Number(form.get("customer_id") || 0);
    const transcript = String(form.get("transcript") || "").trim();
    const textContent = String(form.get("text_content") || "").trim();
    const file = form.get("file");
    const analyzeNow = String(form.get("analyze") || "1") === "1";

    if (!customerId) return jsonError("请选择客户");
    if (kind !== "call" && kind !== "wechat") return jsonError("类型无效");

    await assertCanAccessCustomer(user, customerId);

    let uri = "";
    let fileName = "";
    let mime: string | null = null;
    let size = 0;
    let finalTranscript = transcript;

    if (file && typeof file !== "string" && "arrayBuffer" in file) {
      const blob = file as File;
      const buf = Buffer.from(await blob.arrayBuffer());
      if (buf.length > 200 * 1024 * 1024) {
        return jsonError("单文件不能超过 200MB");
      }
      fileName = blob.name || `${kind}-upload`;
      mime = blob.type || null;
      const saved = await saveObject({
        companyId: user.company_id,
        folder: "crm",
        fileName,
        contentType: mime || undefined,
        body: buf,
      });
      uri = saved.uri;
      size = saved.size;

      // If wechat text file uploaded without paste, try decode as text
      if (kind === "wechat" && !finalTranscript && !textContent) {
        if (
          mime?.includes("text") ||
          /\.(txt|csv|md|log)$/i.test(fileName)
        ) {
          finalTranscript = buf.toString("utf8").slice(0, 200000);
        }
      }
    } else if (kind === "wechat" && textContent) {
      fileName = `wechat-${Date.now()}.txt`;
      const buf = Buffer.from(textContent, "utf8");
      const saved = await saveObject({
        companyId: user.company_id,
        folder: "crm",
        fileName,
        contentType: "text/plain",
        body: buf,
      });
      uri = saved.uri;
      size = saved.size;
      finalTranscript = textContent;
    } else {
      return jsonError(kind === "call" ? "请上传录音文件并填写转写文本" : "请上传聊天文件或粘贴文本");
    }

    if (kind === "call" && !finalTranscript) {
      return jsonError("通话分析需要转写文本（可粘贴）");
    }
    if (kind === "wechat" && !finalTranscript) {
      return jsonError("请提供聊天文本内容");
    }

    const inserted = await pool.query(
      `INSERT INTO media_assets
        (company_id, customer_id, uploader_id, kind, file_name, uri, mime, size_bytes, transcript, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'uploaded')
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
        finalTranscript,
      ]
    );

    await writeAuditLog({
      user,
      action: "media.upload",
      targetType: "media_asset",
      targetId: inserted.rows[0].id,
      summary: `上传${kind === "call" ? "通话" : "微信"} ${fileName}`,
    });

    let insight = null;
    if (analyzeNow) {
      insight = await runMediaAnalysis({
        user,
        mediaId: inserted.rows[0].id,
      });
    }

    return jsonOk({ media: inserted.rows[0], insight }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
