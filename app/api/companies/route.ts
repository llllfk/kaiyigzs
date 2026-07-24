import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, hashPassword, AuthError } from "@/lib/auth";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizeCozeDatasets } from "@/lib/coze-datasets";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import {
  mergeVolcAsrConfig,
  normalizeSynthMinutesQuota,
  normalizeVoiceCloneSlots,
  sanitizeCompanyRow,
  type CompanyConfig,
} from "@/lib/company-config";
import { normalizePhone, normalizeEmail, isValidUserPhone } from "@/lib/utils";
import { assertStrongPassword } from "@/lib/security";
import { decryptCompanyConfig, encryptCompanyConfig } from "@/lib/config-crypto";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") throw new AuthError("仅超级管理员可查看公司与 AI 配置", 403);
    const { paginate, page, pageSize } = parsePageParams(request.nextUrl.searchParams);
    const selectSql = `SELECT c.*,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id AND u.status='active') AS user_count,
        (SELECT u.name FROM users u WHERE u.company_id = c.id AND u.role='company_admin' AND u.status='active' LIMIT 1) AS admin_name`;
    const fromSql = `FROM companies c`;

    if (!paginate) {
      const result = await pool.query(`${selectSql} ${fromSql} ORDER BY c.id DESC`);
      return jsonOk(result.rows.map((r) => sanitizeCompanyRow(r)));
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${fromSql}`);
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);
    const result = await pool.query(
      `${selectSql} ${fromSql}
       ORDER BY c.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return jsonOk(
      result.rows.map((r) => sanitizeCompanyRow(r)),
      200,
      meta
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") throw new AuthError("仅超级管理员可创建公司", 403);

    const body = await request.json();
    const name = String(body.name || "").trim();
    const adminName = String(body.admin_name || "").trim();
    const adminPhone = normalizePhone(body.admin_phone);
    const adminEmail = normalizeEmail(body.admin_email);
    const adminPassword = String(body.admin_password || "");

    if (!name || !adminName || !adminPhone) {
      return jsonError("公司名称、管理员姓名与手机号必填");
    }
    assertStrongPassword(adminPassword);
    if (!isValidUserPhone(adminPhone)) return jsonError("管理员手机号格式不正确");

    const phoneDup = await pool.query(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [
      adminPhone,
    ]);
    if (phoneDup.rows[0]) return jsonError("该手机号已被其他账号使用");
    if (adminEmail) {
      const emailDup = await pool.query(
        `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
        [adminEmail]
      );
      if (emailDup.rows[0]) return jsonError("该邮箱已被其他账号使用");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const company = await client.query(
        `INSERT INTO companies (name, status, config)
         VALUES ($1, 'active', '{}'::jsonb)
         RETURNING *`,
        [name]
      );
      const companyId = company.rows[0].id;
      const passwordHash = await hashPassword(adminPassword);
      const admin = await client.query(
        `INSERT INTO users
          (company_id, role, name, email, phone, password_hash, status, must_change_password)
         VALUES ($1, 'company_admin', $2, $3, $4, $5, 'active', TRUE)
         RETURNING id, company_id, role, name, email, phone, status`,
        [companyId, adminName, adminEmail, adminPhone, passwordHash]
      );
      await client.query("COMMIT");

      await writeAuditLog({
        user,
        companyId,
        action: "company.create",
        targetType: "company",
        targetId: companyId,
        summary: `创建公司 ${name}，管理员 ${adminPhone}${adminEmail ? ` / ${adminEmail}` : ""}`,
      });

      await createNotification({
        companyId,
        userId: admin.rows[0].id,
        type: "account",
        title: "公司已开通",
        body: `公司「${name}」已创建，您是公司管理员。`,
        link: "/dashboard",
      });

      return jsonOk(
        { company: sanitizeCompanyRow(company.rows[0]), admin: admin.rows[0] },
        201
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") {
      throw new AuthError("仅超级管理员可配置公司 AI 凭证", 403);
    }

    const body = await request.json();
    const companyId = Number(body.id || body.company_id);
    if (!companyId) return jsonError("缺少公司 ID");

    const existing = await pool.query(`SELECT id, name, config FROM companies WHERE id = $1`, [
      companyId,
    ]);
    if (!existing.rows[0]) return jsonError("公司不存在", 404);

    const prev = decryptCompanyConfig((existing.rows[0].config || {}) as CompanyConfig & Record<string, unknown>);
    const prevCoze = prev.coze || {};
    const nextCoze = { ...prevCoze };

    if (body.coze_bot_id !== undefined) {
      nextCoze.bot_id = String(body.coze_bot_id || "").trim();
    }
    if (body.coze_datasets !== undefined) {
      const raw = Array.isArray(body.coze_datasets) ? body.coze_datasets : [];
      const datasets = normalizeCozeDatasets({ datasets: raw });
      nextCoze.datasets = datasets;
      nextCoze.dataset_id = datasets.find((d) => d.type === "text")?.id || datasets[0]?.id || "";
    } else if (body.coze_dataset_id !== undefined) {
      // 兼容旧单字段
      const id = String(body.coze_dataset_id || "").trim();
      if (id) {
        nextCoze.datasets = [{ id, name: "默认知识库", type: "text" }];
        nextCoze.dataset_id = id;
      } else {
        nextCoze.datasets = [];
        nextCoze.dataset_id = "";
      }
    }
    if (body.coze_api_base !== undefined) {
      nextCoze.api_base = String(body.coze_api_base || "").trim();
    }
    if (body.coze_api_key !== undefined) {
      const key = String(body.coze_api_key || "").trim();
      if (key === "__CLEAR__") {
        nextCoze.api_key = "";
      } else if (key) {
        nextCoze.api_key = key;
      }
    }

    const touchVolc =
      body.volc_asr_api_key !== undefined ||
      body.volc_asr_app_id !== undefined ||
      body.volc_asr_access_token !== undefined ||
      body.volc_asr_resource_id !== undefined;

    const nextVolc = touchVolc
      ? mergeVolcAsrConfig(prev.volc_asr, body)
      : prev.volc_asr;

    const touchSlots = body.voice_clone_slots !== undefined;
    const nextSlots = touchSlots
      ? normalizeVoiceCloneSlots(body.voice_clone_slots)
      : normalizeVoiceCloneSlots(prev.voice_clone_slots);

    const touchSynthMinutes = body.synth_minutes_quota !== undefined;
    const nextSynthMinutes = touchSynthMinutes
      ? normalizeSynthMinutesQuota(body.synth_minutes_quota)
      : normalizeSynthMinutesQuota(prev.synth_minutes_quota);

    const nextConfig: CompanyConfig = {
      ...prev,
      coze: nextCoze,
      ...(touchVolc ? { volc_asr: nextVolc } : {}),
      ...(touchSlots ? { voice_clone_slots: nextSlots } : {}),
      ...(touchSynthMinutes ? { synth_minutes_quota: nextSynthMinutes } : {}),
    };

    const updated = await pool.query(
      `UPDATE companies
       SET config = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(encryptCompanyConfig(nextConfig as CompanyConfig & Record<string, unknown>)), companyId]
    );

    const volcConfigured = Boolean(String(nextVolc?.api_key || "").trim());

    const action = touchVolc
      ? "company.volc_asr_config"
      : touchSynthMinutes && !body.coze_bot_id && !touchSlots
        ? "company.synth_minutes_quota"
        : touchSlots && !body.coze_bot_id
          ? "company.voice_clone_slots"
          : "company.coze_config";

    await writeAuditLog({
      user,
      companyId,
      action,
      targetType: "company",
      targetId: companyId,
      summary: touchVolc
        ? `更新公司「${existing.rows[0].name}」豆包语音识别（API Key=${volcConfigured ? "已配置" : "未配置"}）`
        : touchSynthMinutes && !body.coze_bot_id && !touchSlots
          ? `更新公司「${existing.rows[0].name}」声音合成分钟数=${nextSynthMinutes}`
          : touchSlots && !body.coze_bot_id
            ? `更新公司「${existing.rows[0].name}」声音复刻槽位=${nextSlots}`
            : `更新公司「${existing.rows[0].name}」AI 配置（智能体=${nextCoze.bot_id || "空"}，知识库=${
                Array.isArray(nextCoze.datasets) ? nextCoze.datasets.length : 0
              }个，复刻槽位=${nextSlots}，合成分钟=${nextSynthMinutes}）`,
    });

    return jsonOk(sanitizeCompanyRow(updated.rows[0]));
  } catch (err) {
    return handleApiError(err);
  }
}
