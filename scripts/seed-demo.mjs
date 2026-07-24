import fs from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnv();

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5433/sales_crm",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function daysFromNow(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function one(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0];
}

async function main() {
  const company = await one(
    `SELECT id FROM companies WHERE name = '凯艺演示科技' LIMIT 1`
  );
  if (!company) {
    throw new Error("请先运行 pnpm db:init 创建演示公司与账号");
  }
  const companyId = company.id;

  const admin = await one(
    `SELECT id FROM users WHERE email='company@kaiyi.local'`
  );
  const manager = await one(
    `SELECT id FROM users WHERE email='manager@kaiyi.local'`
  );
  const sales = await one(
    `SELECT id FROM users WHERE email='sales@kaiyi.local'`
  );
  if (!admin || !manager || !sales) {
    throw new Error("演示账号缺失，请先 pnpm db:init");
  }

  await pool.query(
    `UPDATE companies SET
      config = COALESCE(config, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [
      companyId,
      JSON.stringify({
        pool_recycle_days: 7,
        quote_approval_amount: 50000,
        quote_approval_discount_pct: 10,
        quote_share_valid_days: 14,
        quote_share_max_views: 20,
      }),
    ]
  );

  // —— 清理本司演示业务数据（保留公司/账号）——
  await pool.query(
    `DELETE FROM quote_share_views
     WHERE share_id IN (SELECT id FROM quote_shares WHERE company_id=$1)`,
    [companyId]
  );
  await pool.query(`DELETE FROM quote_shares WHERE company_id=$1`, [companyId]);
  await pool.query(
    `DELETE FROM quote_items
     WHERE quote_id IN (SELECT id FROM quotes WHERE company_id=$1)`,
    [companyId]
  );
  await pool.query(`DELETE FROM quotes WHERE company_id=$1`, [companyId]);

  await pool.query(
    `DELETE FROM kb_qa_messages
     WHERE session_id IN (SELECT id FROM kb_qa_sessions WHERE company_id=$1)`,
    [companyId]
  );
  await pool.query(`DELETE FROM kb_qa_sessions WHERE company_id=$1`, [companyId]);

  await pool.query(
    `DELETE FROM context_chat_messages
     WHERE session_id IN (SELECT id FROM context_chat_sessions WHERE company_id=$1)`,
    [companyId]
  );
  await pool.query(`DELETE FROM context_chat_sessions WHERE company_id=$1`, [
    companyId,
  ]);

  await pool.query(`DELETE FROM voice_synth_logs WHERE company_id=$1`, [
    companyId,
  ]);
  await pool.query(`DELETE FROM voice_speakers WHERE company_id=$1`, [
    companyId,
  ]);
  await pool.query(`DELETE FROM report_exports WHERE company_id=$1`, [
    companyId,
  ]);

  await pool.query(`DELETE FROM opportunity_stage_history WHERE company_id=$1`, [
    companyId,
  ]);
  await pool.query(`DELETE FROM kb_files WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM kb_folders WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM competitor_mentions WHERE company_id=$1`, [
    companyId,
  ]);
  await pool.query(`DELETE FROM competitors WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM opportunity_reviews WHERE company_id=$1`, [
    companyId,
  ]);
  await pool.query(`DELETE FROM ai_insights WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM media_assets WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM tasks WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM follow_ups WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM opportunities WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM contacts WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM customers WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM notifications WHERE company_id=$1`, [companyId]);

  const customersSpec = [
    {
      company_name: "星河智能科技",
      name: "王总",
      industry: "制造业",
      scale: "200人",
      source: "展会",
      owner: manager.id,
      profile: {
        intent: "high",
        sentiment: "positive",
        pain_points: ["上线时间紧", "需要和 ERP 对接"],
        competitors: ["纷享销客"],
        last_summary: "客户希望两周内看到演示方案，决策人是王总。",
        stage_suggestion: "proposal",
      },
    },
    {
      company_name: "青禾教育集团",
      name: "李主任",
      phone: "13910001001",
      industry: "教育",
      scale: "50人",
      source: "线上咨询",
      owner: sales.id,
      profile: {
        intent: "medium",
        sentiment: "neutral",
        pain_points: ["价格敏感 / 预算顾虑"],
        competitors: ["销售易"],
        last_summary: "对价格比较敏感，需要对比竞品后再定。",
        stage_suggestion: "contact",
      },
    },
    {
      company_name: "云栈物流",
      name: "赵经理",
      phone: "13910001002",
      industry: "物流",
      scale: "500人",
      source: "转介绍",
      owner: sales.id,
      profile: {
        intent: "high",
        sentiment: "positive",
        pain_points: ["多仓协同", "跟进记录分散"],
        competitors: [],
        last_summary: "已确认采购意向，等待正式报价。",
        stage_suggestion: "proposal",
      },
    },
    {
      company_name: "南湾医疗器械",
      name: "陈采购",
      phone: "13910001003",
      industry: "医疗",
      scale: "120人",
      source: "电话拓客",
      owner: manager.id,
      profile: {
        intent: "low",
        sentiment: "negative",
        pain_points: ["合规要求高", "正在对比竞品"],
        competitors: ["Salesforce"],
        last_summary: "短期暂缓，关注合规认证进度。",
        stage_suggestion: "lead",
      },
    },
    {
      company_name: "海川零售连锁",
      name: "周督导",
      phone: "13910001004",
      industry: "零售",
      scale: "800人",
      source: "展会",
      owner: admin.id,
      profile: {
        intent: "medium",
        sentiment: "neutral",
        pain_points: ["门店督导难", "话术不统一"],
        competitors: ["钉钉"],
        last_summary: "希望结合知识库做门店话术统一。",
        stage_suggestion: "contact",
      },
    },
  ];

  const customerIds = [];
  for (const c of customersSpec) {
    const row = await one(
      `INSERT INTO customers
        (company_id, owner_id, company_name, name, phone, industry, scale, source, status, pool_status, claimed_at, tags, profile_json, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','private',$9,'["重点","演示"]'::jsonb,$10::jsonb,'{}'::jsonb)
       RETURNING id`,
      [
        companyId,
        c.owner,
        c.company_name,
        c.name,
        c.phone || null,
        c.industry,
        c.scale,
        c.source,
        daysFromNow(-2).toISOString(),
        JSON.stringify(c.profile),
      ]
    );
    customerIds.push(row.id);
  }

  const publicSpecs = [
    ["华东贸易", "张总", "贸易", "线上咨询"],
    ["北辰制造", "刘工", "制造业", "展会"],
    ["金桥物业", "孙经理", "服务业", "转介绍"],
  ];
  for (const [companyName, contactName, industry, source] of publicSpecs) {
    await pool.query(
      `INSERT INTO customers
        (company_id, owner_id, company_name, name, industry, source, status, pool_status, released_at, tags, profile_json)
       VALUES ($1,NULL,$2,$3,$4,$5,'active','public',CURRENT_TIMESTAMP,'["公海"]'::jsonb,'{}'::jsonb)`,
      [companyId, companyName, contactName, industry, source]
    );
  }

  await pool.query(
    `INSERT INTO customers
      (company_id, owner_id, company_name, name, industry, source, status, pool_status, claimed_at, created_at, tags, profile_json)
     VALUES ($1,$2,'久未跟进商贸','钱助理','零售','电话拓客','active','private',$3,$3,'["回收测试"]'::jsonb,'{}'::jsonb)`,
    [companyId, sales.id, daysFromNow(-20).toISOString()]
  );

  const contactSpecs = [
    [0, "王总", "总经理", "13800001111", "wangzong"],
    [0, "李经理", "采购经理", "13800001112", "lijingli"],
    [1, "赵老师", "教务主任", "13900002222", "zhaolaoshi"],
    [2, "陈主任", "信息中心", "13700003333", "chenzr"],
    [3, "周医生", "信息科", "13600004444", "zhouys"],
    [4, "孙督导", "运营总监", "13500005555", "sundd"],
  ];
  for (const [idx, name, title, phone, wechat] of contactSpecs) {
    await pool.query(
      `INSERT INTO contacts (company_id, customer_id, name, title, phone, wechat, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        companyId,
        customerIds[idx],
        name,
        title,
        phone,
        wechat,
        `${wechat}@example.com`,
      ]
    );
  }

  const oppSpecs = [
    [0, "星河 CRM 上线项目", "proposal", 180000, manager.id, true],
    [1, "青禾校区跟进系统", "contact", 68000, sales.id, false],
    [2, "云栈销售协作平台", "proposal", 260000, sales.id, false],
    [3, "南湾医疗试点", "lead", 95000, manager.id, false],
    [4, "海川门店话术知识库", "won", 120000, admin.id, false],
    [1, "青禾续费扩展包", "lost", 30000, sales.id, false],
  ];
  const oppIds = [];
  for (const [idx, title, stage, amount, ownerId, withSuggest] of oppSpecs) {
    const suggest = withSuggest
      ? JSON.stringify({
          stage: "proposal",
          reason: "客户已要求正式报价与实施方案，建议推进到报价中。",
          intent: "high",
          created_at: new Date().toISOString(),
        })
      : null;
    const closeDate =
      stage === "won" || stage === "lost" ? "2026-07-10" : "2026-08-15";
    const row = await one(
      `INSERT INTO opportunities
        (company_id, customer_id, owner_id, title, stage, amount, expected_close_date, stage_suggestion_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id`,
      [
        companyId,
        customerIds[idx],
        ownerId,
        title,
        stage,
        amount,
        closeDate,
        suggest,
      ]
    );
    oppIds.push(row.id);
  }

  // 阶段履历（星河提案路径 + 海川成交 + 青禾丢单）
  const stageHistory = [
    [oppIds[0], manager.id, null, "lead", "新建商机", "create", -18],
    [oppIds[0], manager.id, "lead", "contact", "完成首次拜访", "edit", -12],
    [
      oppIds[0],
      manager.id,
      "contact",
      "proposal",
      "客户要求正式报价",
      "ai_accept",
      -3,
    ],
    [oppIds[4], admin.id, null, "lead", "新建商机", "create", -40],
    [oppIds[4], admin.id, "lead", "contact", "试点门店确认需求", "funnel", -30],
    [oppIds[4], admin.id, "contact", "proposal", "方案评审通过", "edit", -20],
    [oppIds[4], admin.id, "proposal", "won", "签约成交", "review_sync", -10],
    [oppIds[5], sales.id, null, "lead", "新建续费机会", "create", -25],
    [oppIds[5], sales.id, "lead", "contact", "沟通续费意向", "edit", -15],
    [
      oppIds[5],
      sales.id,
      "contact",
      "lost",
      "价格原因丢单",
      "review_sync",
      -8,
    ],
  ];
  for (const [oppId, actorId, from, to, reason, source, dayOffset] of stageHistory) {
    await pool.query(
      `INSERT INTO opportunity_stage_history
        (company_id, opportunity_id, actor_id, from_stage, to_stage, reason, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        companyId,
        oppId,
        actorId,
        from,
        to,
        reason,
        source,
        daysFromNow(dayOffset).toISOString(),
      ]
    );
  }

  await pool.query(
    `INSERT INTO opportunity_reviews
      (company_id, opportunity_id, outcome, reason_category, detail, lessons, created_by)
     VALUES
      ($1,$2,'won','服务','门店话术统一需求明确，交付节奏可控。','先做试点门店再铺开。',$3),
      ($1,$4,'lost','价格','客户认为首年费用偏高，选择了更低价方案。','报价需准备阶梯套餐。',$5)`,
    [companyId, oppIds[4], admin.id, oppIds[5], sales.id]
  );

  const followSpecs = [
    [0, "visit", "现场拜访，确认两周内完成演示。", manager.id, -2],
    [0, "wechat", "发送了产品白皮书与对接清单。", manager.id, -1],
    [1, "call", "电话沟通预算，客户希望控制在 7 万内。", sales.id, -3],
    [2, "wechat", "客户确认需要多仓协同模块。", sales.id, -1],
    [3, "call", "暂缓推进，等待合规评估结果。", manager.id, -5],
    [4, "email", "成交后回访，收集使用反馈。", admin.id, -4],
  ];
  for (const [idx, type, content, ownerId, dayOffset] of followSpecs) {
    await pool.query(
      `INSERT INTO follow_ups
        (company_id, customer_id, opportunity_id, owner_id, type, content, followed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        companyId,
        customerIds[idx],
        oppIds[idx] || null,
        ownerId,
        type,
        content,
        daysFromNow(dayOffset).toISOString(),
      ]
    );
  }

  // 待办：status 仅 pending | done；尽量挂商机
  const taskSpecs = [
    [sales.id, customerIds[1], oppIds[1], "给青禾发送阶梯报价", 1, "pending", "ai"],
    [
      sales.id,
      customerIds[2],
      oppIds[2],
      "准备云栈多仓演示环境",
      2,
      "pending",
      "manual",
    ],
    [
      manager.id,
      customerIds[0],
      oppIds[0],
      "约王总确认方案评审时间",
      1,
      "pending",
      "ai",
    ],
    [
      admin.id,
      customerIds[4],
      oppIds[4],
      "整理海川成交复盘材料",
      3,
      "pending",
      "manual",
    ],
    [
      sales.id,
      customerIds[1],
      oppIds[1],
      "已完成：首次需求访谈",
      -2,
      "done",
      "manual",
    ],
  ];
  for (const [
    ownerId,
    customerId,
    opportunityId,
    title,
    dayOffset,
    status,
    source,
  ] of taskSpecs) {
    await pool.query(
      `INSERT INTO tasks
        (company_id, customer_id, opportunity_id, owner_id, title, due_at, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        companyId,
        customerId,
        opportunityId,
        ownerId,
        title,
        daysFromNow(dayOffset).toISOString(),
        status,
        source,
      ]
    );
  }

  // —— 报价（合法状态 + 明细）——
  async function insertQuote({
    oppId,
    customerId,
    ownerId,
    title,
    status,
    note,
    approverId,
    submittedAt,
    decidedAt,
    items,
  }) {
    let listTotal = 0;
    let total = 0;
    let maxDiscount = 0;
    const normalized = items.map((it, i) => {
      const qty = Number(it.qty);
      const unit = Number(it.unit_price);
      const disc = Number(it.discount_pct || 0);
      const amount = Math.round(qty * unit * (1 - disc / 100) * 100) / 100;
      listTotal += qty * unit;
      total += amount;
      maxDiscount = Math.max(maxDiscount, disc);
      return { ...it, qty, unit_price: unit, discount_pct: disc, amount, sort: i };
    });
    listTotal = Math.round(listTotal * 100) / 100;
    total = Math.round(total * 100) / 100;

    const validUntil = ymd(daysFromNow(status === "approved" ? 60 : 30));
    const quote = await one(
      `INSERT INTO quotes
        (company_id, opportunity_id, customer_id, owner_id, version, status, title, currency,
         list_total, total, max_discount_pct, valid_until, note, approver_id,
         submitted_at, decided_at, created_by)
       VALUES ($1,$2,$3,$4,1,$5,$6,'CNY',$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        companyId,
        oppId,
        customerId,
        ownerId,
        status,
        title,
        listTotal,
        total,
        maxDiscount,
        validUntil,
        note || null,
        approverId || null,
        submittedAt || null,
        decidedAt || null,
        ownerId,
      ]
    );

    for (const it of normalized) {
      await pool.query(
        `INSERT INTO quote_items
          (quote_id, sort_order, name, spec, qty, unit_price, discount_pct, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          quote.id,
          it.sort,
          it.name,
          it.spec || null,
          it.qty,
          it.unit_price,
          it.discount_pct,
          it.amount,
        ]
      );
    }
    return quote.id;
  }

  const draftQuoteId = await insertQuote({
    oppId: oppIds[0],
    customerId: customerIds[0],
    ownerId: manager.id,
    title: "星河 CRM 系统报价单 v1",
    status: "draft",
    note: "演示草稿，可继续编辑后提交审批。",
    items: [
      {
        name: "CRM 标准版许可",
        spec: "50 席 / 年",
        qty: 1,
        unit_price: 100000,
        discount_pct: 0,
      },
      {
        name: "实施与对接服务",
        spec: "含 ERP 对接范围评估",
        qty: 1,
        unit_price: 80000,
        discount_pct: 0,
      },
    ],
  });

  const pendingQuoteId = await insertQuote({
    oppId: oppIds[2],
    customerId: customerIds[2],
    ownerId: sales.id,
    title: "云栈销售协作平台报价",
    status: "pending_approval",
    note: "折扣 10%，已超过审批阈值，待公司管理员审批。",
    approverId: admin.id,
    submittedAt: daysFromNow(-1).toISOString(),
    items: [
      {
        name: "销售协作平台",
        spec: "多仓协同模块",
        qty: 1,
        unit_price: 200000,
        discount_pct: 10,
      },
      {
        name: "实施培训",
        spec: "2 场现场培训",
        qty: 1,
        unit_price: 60000,
        discount_pct: 10,
      },
    ],
  });

  const approvedQuoteId = await insertQuote({
    oppId: oppIds[4],
    customerId: customerIds[4],
    ownerId: admin.id,
    title: "海川门店话术知识库方案",
    status: "approved",
    note: "已审批通过，可生成客户确认链接。",
    approverId: admin.id,
    submittedAt: daysFromNow(-12).toISOString(),
    decidedAt: daysFromNow(-11).toISOString(),
    items: [
      {
        name: "知识库与话术方案",
        spec: "试点 10 家门店",
        qty: 1,
        unit_price: 100000,
        discount_pct: 10,
      },
      {
        name: "督导培训包",
        spec: "含复盘模板",
        qty: 1,
        unit_price: 20000,
        discount_pct: 0,
      },
    ],
  });

  // 已通过报价：客户确认分享链接（仅 token_hash，明文不入库演示）
  const shareToken = randomBytes(24).toString("base64url");
  await pool.query(
    `INSERT INTO quote_shares
      (quote_id, company_id, token, token_hash, status, expires_at, max_views, view_count, created_by)
     VALUES ($1,$2,NULL,$3,'active',$4,20,2,$5)`,
    [
      approvedQuoteId,
      companyId,
      sha256(shareToken),
      daysFromNow(14).toISOString(),
      admin.id,
    ]
  );

  // Competitors
  const competitors = [
    ["纷享销客", "偏中大型销售团队", "品牌认知强", "定制成本高", "强调落地实施与知识库协同"],
    ["销售易", "功能全面", "生态丰富", "价格偏高", "用性价比和本地化服务应对"],
    ["Salesforce", "国际品牌", "能力强", "实施周期长", "强调更快上线与国产化支持"],
    ["钉钉", "协同办公入口", "低成本", "销售深度弱", "突出专业 CRM 漏斗与 AI 洞察"],
  ];
  const competitorIds = [];
  for (const [name, summary, strengths, weaknesses, playbook] of competitors) {
    const row = await one(
      `INSERT INTO competitors
        (company_id, name, summary, strengths, weaknesses, playbook)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [companyId, name, summary, strengths, weaknesses, playbook]
    );
    competitorIds.push(row.id);
  }

  // Knowledge base
  const rootFolder = await one(
    `INSERT INTO kb_folders (company_id, parent_id, name, sort_order, created_by)
     VALUES ($1,NULL,'销售资料',0,$2) RETURNING id`,
    [companyId, admin.id]
  );
  const scriptFolder = await one(
    `INSERT INTO kb_folders (company_id, parent_id, name, sort_order, created_by)
     VALUES ($1,$2,'异议处理话术',1,$3) RETURNING id`,
    [companyId, rootFolder.id, manager.id]
  );
  const productFolder = await one(
    `INSERT INTO kb_folders (company_id, parent_id, name, sort_order, created_by)
     VALUES ($1,$2,'产品说明',2,$3) RETURNING id`,
    [companyId, rootFolder.id, admin.id]
  );

  const storageRoot = path.join(root, "storage", String(companyId), "kb");
  fs.mkdirSync(storageRoot, { recursive: true });

  const kbFiles = [
    [
      scriptFolder.id,
      "价格异议话术.txt",
      "客户说太贵时：\n1. 先认同预算压力\n2. 拆解首年可节省的跟进成本\n3. 提供基础版/标准版/旗舰版阶梯报价\n4. 强调知识库与 AI 解析带来的人效提升\n参考话术：理解您关注投入，很多客户会先用标准版跑通流程，三个月后再升级。",
    ],
    [
      scriptFolder.id,
      "竞品对比要点.txt",
      "对比纷享销客/销售易：\n- 我们更强调通话与微信记录的 AI 洞察\n- 知识库问答可直接服务一线销售\n- 实施周期更短，适合中小团队快速上线\n避免直接贬低竞品，突出场景差异。",
    ],
    [
      productFolder.id,
      "产品功能简介.md",
      "# 凯艺销售 CRM\n\n核心能力：\n- 客户/商机/跟进/报价审批\n- 通话与微信上传解析\n- 知识库与智能问答\n- 阶段建议与成交复盘\n- 声音合成与经营报表\n\n适用对象：销售、销售经理、公司管理员。",
    ],
  ];

  for (const [folderId, fileName, content] of kbFiles) {
    const rel = `${companyId}/kb/${Date.now()}-${fileName}`;
    const full = path.join(root, "storage", rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    await pool.query(
      `INSERT INTO kb_files
        (company_id, folder_id, file_name, uri, mime, size_bytes, uploader_id, coze_sync_status)
       VALUES ($1,$2,$3,$4,'text/plain',$5,$6,'local_only')`,
      [
        companyId,
        folderId,
        fileName,
        `local://${rel}`,
        Buffer.byteLength(content, "utf8"),
        admin.id,
      ]
    );
  }

  // 知识库问答样例
  const kbSession = await one(
    `INSERT INTO kb_qa_sessions (company_id, user_id, title)
     VALUES ($1,$2,'价格异议怎么回') RETURNING id`,
    [companyId, sales.id]
  );
  await pool.query(
    `INSERT INTO kb_qa_messages (session_id, role, content, sources_json)
     VALUES
      ($1,'user','客户说太贵，有什么标准话术？','[]'::jsonb),
      ($1,'assistant','可以先认同预算压力，再拆解人效收益，并给出基础/标准/旗舰阶梯报价。参考知识库《价格异议话术》。',$2::jsonb)`,
    [
      kbSession.id,
      JSON.stringify([{ name: "价格异议话术.txt", snippet: "先认同预算压力" }]),
    ]
  );

  // Media + insights
  const callText =
    "销售：王总您好，关于 CRM 方案想跟您确认。客户：我们两周内要上线，也在看纷享销客，你们价格能不能再优一些，另外要和现有 ERP 对接。销售：好的，我明天给您发正式报价和对接清单。";
  const wechatText =
    "客户：预算大概 7 万左右，先看看基础版。销售：可以，我把阶梯报价发您。客户：你们和销售易比优势是什么？销售：我们更偏 AI 解析通话和知识库问答。";

  const media1Uri = `local://${companyId}/crm/demo-call.txt`;
  const media2Uri = `local://${companyId}/crm/demo-wechat.txt`;
  fs.mkdirSync(path.join(root, "storage", String(companyId), "crm"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "storage", String(companyId), "crm", "demo-call.txt"),
    callText,
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "storage", String(companyId), "crm", "demo-wechat.txt"),
    wechatText,
    "utf8"
  );

  const media1 = await one(
    `INSERT INTO media_assets
      (company_id, customer_id, uploader_id, kind, file_name, uri, mime, size_bytes, transcript, status)
     VALUES ($1,$2,$3,'call','星河-通话录音转写.txt',$4,'text/plain',$5,$6,'analyzed')
     RETURNING id`,
    [
      companyId,
      customerIds[0],
      manager.id,
      media1Uri,
      Buffer.byteLength(callText),
      callText,
    ]
  );
  const media2 = await one(
    `INSERT INTO media_assets
      (company_id, customer_id, uploader_id, kind, file_name, uri, mime, size_bytes, transcript, status)
     VALUES ($1,$2,$3,'wechat','青禾-微信聊天.txt',$4,'text/plain',$5,$6,'uploaded')
     RETURNING id`,
    [
      companyId,
      customerIds[1],
      sales.id,
      media2Uri,
      Buffer.byteLength(wechatText),
      wechatText,
    ]
  );

  const insight1 = await one(
    `INSERT INTO ai_insights
      (company_id, customer_id, media_asset_id, kind, result_json, summary, created_by)
     VALUES ($1,$2,$3,'call',$4::jsonb,'客户要求两周上线，关注价格与 ERP 对接，提及纷享销客。',$5)
     RETURNING id`,
    [
      companyId,
      customerIds[0],
      media1.id,
      JSON.stringify({
        intent: "high",
        pain_points: ["上线时间紧", "需要和 ERP 对接", "价格敏感 / 预算顾虑"],
        competitors: ["纷享销客"],
        commitments: ["明天发送正式报价和对接清单"],
        next_actions: ["发送正式报价与方案", "确认 ERP 对接范围"],
        sentiment: "positive",
        summary: "客户要求两周上线，关注价格与 ERP 对接，提及纷享销客。",
        stage_suggestion: "proposal",
      }),
      manager.id,
    ]
  );
  const insight2 = await one(
    `INSERT INTO ai_insights
      (company_id, customer_id, media_asset_id, kind, result_json, summary, created_by)
     VALUES ($1,$2,$3,'wechat',$4::jsonb,'预算约 7 万，关注基础版与销售易对比。',$5)
     RETURNING id`,
    [
      companyId,
      customerIds[1],
      media2.id,
      JSON.stringify({
        intent: "medium",
        pain_points: ["价格敏感 / 预算顾虑", "正在对比竞品"],
        competitors: ["销售易"],
        next_actions: ["发送阶梯报价"],
        sentiment: "neutral",
        summary: "预算约 7 万，关注基础版与销售易对比。",
        stage_suggestion: "contact",
      }),
      sales.id,
    ]
  );

  await pool.query(
    `INSERT INTO competitor_mentions (company_id, competitor_id, customer_id, insight_id, name)
     VALUES
      ($1,$2,$3,$4,'纷享销客'),
      ($1,$2,$3,$4,'纷享销客'),
      ($1,$5,$6,$7,'销售易'),
      ($1,$8,$9,NULL,'Salesforce'),
      ($1,$10,$11,NULL,'钉钉')`,
    [
      companyId,
      competitorIds[0],
      customerIds[0],
      insight1.id,
      competitorIds[1],
      customerIds[1],
      insight2.id,
      competitorIds[2],
      customerIds[3],
      competitorIds[3],
      customerIds[4],
    ]
  );

  // 客户 / 商机 AI 助手样例对话
  const customerChat = await one(
    `INSERT INTO context_chat_sessions
      (company_id, user_id, customer_id, opportunity_id, title)
     VALUES ($1,$2,$3,NULL,'星河客户要点') RETURNING id`,
    [companyId, manager.id, customerIds[0]]
  );
  await pool.query(
    `INSERT INTO context_chat_messages (session_id, role, content)
     VALUES
      ($1,'user','帮我总结星河客户当前重点与下一步。'),
      ($1,'assistant','重点：两周内上线、ERP 对接、价格敏感，并在对比纷享销客。下一步：发送正式报价与对接清单，并约方案评审。')`,
    [customerChat.id]
  );

  const oppChat = await one(
    `INSERT INTO context_chat_sessions
      (company_id, user_id, customer_id, opportunity_id, title)
     VALUES ($1,$2,$3,$4,'云栈报价推进') RETURNING id`,
    [companyId, sales.id, customerIds[2], oppIds[2]]
  );
  await pool.query(
    `INSERT INTO context_chat_messages (session_id, role, content)
     VALUES
      ($1,'user','云栈报价已提交审批，客户侧我该怎么跟？'),
      ($1,'assistant','可同步客户「内部审批中」，并确认多仓协同演示时间；审批通过后尽快发客户确认链接。')`,
    [oppChat.id]
  );

  // 声音复刻：draft + ready 占位（无真实样音文件，合成需重新训练）
  await pool.query(
    `INSERT INTO voice_speakers
      (company_id, created_by, name, slot_index, status, meta)
     VALUES
      ($1,$2,'演示音色-草稿',0,'draft','{"seed":true}'::jsonb),
      ($1,$3,'演示音色-已就绪',1,'ready',$4::jsonb)`,
    [
      companyId,
      sales.id,
      manager.id,
      JSON.stringify({
        seed: true,
        note: "演示占位，无真实 provider_speaker_id；正式合成前请重新训练。",
      }),
    ]
  );
  const readyVoice = await one(
    `SELECT id FROM voice_speakers WHERE company_id=$1 AND slot_index=1`,
    [companyId]
  );
  await pool.query(
    `INSERT INTO voice_synth_logs
      (company_id, user_id, source, voice_speaker_id, speaker_label, status,
       text_content, text_char_count, duration_sec, saved, created_at)
     VALUES
      ($1,$2,'clone',$3,'演示音色-已就绪','success','您好，这是凯艺销售 CRM 演示合成。',18,2.4,true,$4),
      ($1,$5,'official',NULL,'官方-灿灿','success','欢迎体验经营报表与报价审批。',16,2.1,false,$6)`,
    [
      companyId,
      manager.id,
      readyVoice.id,
      daysFromNow(-2).toISOString(),
      admin.id,
      daysFromNow(-1).toISOString(),
    ]
  );

  // 经营报表导出记录（元数据；文件按需现算）
  const periodKey = `${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1
  ).padStart(2, "0")}`;
  await pool.query(
    `INSERT INTO report_exports
      (company_id, created_by, owner_id, period_type, period_key, scope, file_name, file_path, file_size)
     VALUES ($1,$2,NULL,'month',$3,'company',$4,'',0)`,
    [
      companyId,
      admin.id,
      periodKey,
      `凯艺演示科技-${periodKey}-全公司-经营报表.xlsx`,
    ]
  );

  // Notifications
  const notices = [
    [
      admin.id,
      "account",
      "欢迎使用凯艺销售 CRM",
      "演示数据已就绪，可从工作台开始体验。",
      "/dashboard",
    ],
    [
      manager.id,
      "stage_suggestion",
      "商机阶段建议",
      "星河 CRM 上线项目建议推进到报价中。",
      "/opportunities",
    ],
    [
      manager.id,
      "ai_done",
      "AI 解析完成",
      "星河智能科技通话记录已生成洞察。",
      `/customers/${customerIds[0]}`,
    ],
    [
      sales.id,
      "task",
      "已生成 AI 跟进待办",
      "青禾教育有 1 条待办待确认。",
      "/tasks",
    ],
    [
      sales.id,
      "kb",
      "知识库有新文件",
      "管理员上传了价格异议话术。",
      "/knowledge",
    ],
    [
      admin.id,
      "review",
      "请查看成交复盘",
      "海川门店话术知识库已成交，可对照复盘。",
      "/insights",
    ],
    [
      admin.id,
      "quote",
      "待审批报价",
      "销售提交了「云栈销售协作平台报价」，请尽快审批。",
      "/quotes",
    ],
    [
      sales.id,
      "quote",
      "报价已通过",
      "「海川门店话术知识库方案」已审批通过，可生成客户确认链接。",
      "/quotes",
    ],
  ];
  for (const [userId, type, title, body, link] of notices) {
    await pool.query(
      `INSERT INTO notifications (company_id, user_id, type, title, body, link)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, userId, type, title, body, link]
    );
  }

  await pool.query(
    `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, summary)
     VALUES
      ($1,$2,'seed.demo','company',$3,'导入演示业务数据'),
      ($1,$4,'customer.create','customer',$5,'创建客户 星河智能科技'),
      ($1,$6,'opportunity.stage_change','opportunity',$7,'阶段 沟通中 → 报价中'),
      ($1,$8,'quote.submit','quote',$9,'提交报价待审批'),
      ($1,$10,'quote.approve','quote',$11,'审批通过报价')`,
    [
      companyId,
      admin.id,
      String(companyId),
      manager.id,
      String(customerIds[0]),
      manager.id,
      String(oppIds[0]),
      sales.id,
      String(pendingQuoteId),
      admin.id,
      String(approvedQuoteId),
    ]
  );

  const summary = {
    companyId,
    customers: customerIds.length + publicSpecs.length + 1,
    opportunities: oppIds.length,
    quotes: {
      draft: draftQuoteId,
      pending_approval: pendingQuoteId,
      approved: approvedQuoteId,
    },
    kbFolders: 3,
    competitors: competitorIds.length,
    media: 2,
    voices: 2,
    stageHistory: stageHistory.length,
  };
  console.log("Seed OK:", summary);
  console.log("请使用公司管理员/销售经理/销售账号登录测试完整菜单。");
  console.log(
    "提示：报价分享链接 token 仅写入 hash；音色为演示占位，正式合成前请重新训练。"
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
