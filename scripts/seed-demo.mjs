import fs from "fs";
import path from "path";
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

async function one(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0];
}

async function many(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function main() {
  const company = await one(
    `SELECT id FROM companies WHERE name = '凯艺演示科技' LIMIT 1`
  );
  if (!company) {
    throw new Error("请先运行 npm run db:init 创建演示公司与账号");
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
    throw new Error("演示账号缺失，请先 npm run db:init");
  }

  await pool.query(
    `UPDATE companies SET
      config = COALESCE(config, '{}'::jsonb) || '{"pool_recycle_days": 7}'::jsonb
     WHERE id = $1`,
    [companyId]
  );

  // Clear previous demo business data (keep users/company)
  await pool.query(`DELETE FROM kb_qa_messages`);
  await pool.query(`DELETE FROM kb_qa_sessions`);
  await pool.query(`DELETE FROM kb_files WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM kb_folders WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM competitor_mentions WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM competitors WHERE company_id=$1`, [companyId]);
  await pool.query(`DELETE FROM opportunity_reviews WHERE company_id=$1`, [companyId]);
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
        new Date(Date.now() - 2 * 86400000).toISOString(),
        JSON.stringify(c.profile),
      ]
    );
    customerIds.push(row.id);
  }

  // 公海客户（可直接领取）
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

  // 超时未跟进客户：claimed 很久且无跟进，便于测试自动回收
  await pool.query(
    `INSERT INTO customers
      (company_id, owner_id, company_name, name, industry, source, status, pool_status, claimed_at, created_at, tags, profile_json)
     VALUES ($1,$2,'久未跟进商贸','钱助理','零售','电话拓客','active','private',$3,$3,'["回收测试"]'::jsonb,'{}'::jsonb)`,
    [
      companyId,
      sales.id,
      new Date(Date.now() - 20 * 86400000).toISOString(),
    ]
  );

  // Contacts
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

  // Opportunities
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
      stage === "won" || stage === "lost"
        ? "2026-07-10"
        : "2026-08-15";
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

  // Reviews for won/lost
  await pool.query(
    `INSERT INTO opportunity_reviews
      (company_id, opportunity_id, outcome, reason_category, detail, lessons, created_by)
     VALUES
      ($1,$2,'won','服务','门店话术统一需求明确，交付节奏可控。','先做试点门店再铺开。',$3),
      ($1,$4,'lost','价格','客户认为首年费用偏高，选择了更低价方案。','报价需准备阶梯套餐。',$5)`,
    [companyId, oppIds[4], admin.id, oppIds[5], sales.id]
  );

  // Follow-ups
  const followSpecs = [
    [0, "visit", "现场拜访，确认两周内完成演示。", manager.id, -2],
    [0, "wechat", "发送了产品白皮书与对接清单。", manager.id, -1],
    [1, "call", "电话沟通预算，客户希望控制在 7 万内。", sales.id, -3],
    [2, "wechat", "客户确认需要多仓协同模块。", sales.id, -1],
    [3, "call", "暂缓推进，等待合规评估结果。", manager.id, -5],
    [4, "email", "成交后回访，收集使用反馈。", admin.id, -4],
  ];
  for (const [idx, type, content, ownerId, dayOffset] of followSpecs) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
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
        d.toISOString(),
      ]
    );
  }

  // Tasks
  const taskSpecs = [
    [sales.id, customerIds[1], "给青禾发送阶梯报价", 1, "pending", "ai"],
    [sales.id, customerIds[2], "准备云栈多仓演示环境", 2, "confirmed", "manual"],
    [manager.id, customerIds[0], "约王总确认方案评审时间", 1, "pending", "ai"],
    [admin.id, customerIds[4], "整理海川成交复盘材料", 3, "pending", "manual"],
    [sales.id, customerIds[1], "已完成：首次需求访谈", -2, "done", "manual"],
  ];
  for (const [ownerId, customerId, title, dayOffset, status, source] of taskSpecs) {
    const due = new Date();
    due.setDate(due.getDate() + dayOffset);
    await pool.query(
      `INSERT INTO tasks
        (company_id, customer_id, owner_id, title, due_at, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, customerId, ownerId, title, due.toISOString(), status, source]
    );
  }

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

  await pool.query(
    `INSERT INTO competitor_mentions (company_id, competitor_id, customer_id, name)
     VALUES
      ($1,$2,$3,'纷享销客'),
      ($1,$2,$3,'纷享销客'),
      ($1,$4,$5,'销售易'),
      ($1,$6,$7,'Salesforce'),
      ($1,$8,$9,'钉钉')`,
    [
      companyId,
      competitorIds[0],
      customerIds[0],
      competitorIds[1],
      customerIds[1],
      competitorIds[2],
      customerIds[3],
      competitorIds[3],
      customerIds[4],
    ]
  );

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
      "# 凯艺销售 CRM\n\n核心能力：\n- 客户/商机/跟进\n- 通话与微信上传解析\n- 知识库与智能问答\n- 阶段建议与成交复盘\n\n适用对象：销售、销售经理、公司管理员。",
    ],
  ];

  for (const [folderId, fileName, content] of kbFiles) {
    const rel = `${companyId}/kb/${Date.now()}-${fileName}`;
    const full = path.join(root, "storage", rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    await pool.query(
      `INSERT INTO kb_files
        (company_id, folder_id, file_name, uri, mime, size_bytes, uploader_id)
       VALUES ($1,$2,$3,$4,'text/plain',$5,$6)`,
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

  // Media + insights for uploads page / customer profile
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

  await pool.query(
    `INSERT INTO ai_insights
      (company_id, customer_id, media_asset_id, kind, result_json, summary, created_by)
     VALUES
      ($1,$2,$3,'call',$4::jsonb,'客户要求两周上线，关注价格与 ERP 对接，提及纷享销客。',$5),
      ($1,$6,$7,'wechat',$8::jsonb,'预算约 7 万，关注基础版与销售易对比。',$9)`,
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

  // Notifications for each role
  const notices = [
    [admin.id, "account", "欢迎使用凯艺销售 CRM", "演示数据已就绪，可从工作台开始体验。", "/dashboard"],
    [manager.id, "stage_suggestion", "商机阶段建议", "星河 CRM 上线项目建议推进到报价中。", "/opportunities"],
    [manager.id, "ai_done", "AI 解析完成", "星河智能科技通话记录已生成洞察。", `/customers/${customerIds[0]}`],
    [sales.id, "task", "已生成 AI 跟进待办", "青禾教育有 1 条待办待确认。", "/tasks"],
    [sales.id, "kb", "知识库有新文件", "管理员上传了价格异议话术。", "/knowledge"],
    [admin.id, "review", "请查看成交复盘", "海川门店话术知识库已成交，可对照复盘。", "/insights"],
  ];
  for (const [userId, type, title, body, link] of notices) {
    await pool.query(
      `INSERT INTO notifications (company_id, user_id, type, title, body, link)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, userId, type, title, body, link]
    );
  }

  // Sample audit
  await pool.query(
    `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, summary)
     VALUES
      ($1,$2,'seed.demo','company',$3,'导入演示业务数据'),
      ($1,$4,'customer.create','customer',$5,'创建客户 星河智能科技'),
      ($1,$6,'opportunity.stage_change','opportunity',$7,'阶段 contact → proposal')`,
    [
      companyId,
      admin.id,
      String(companyId),
      manager.id,
      String(customerIds[0]),
      sales.id,
      String(oppIds[0]),
    ]
  );

  const summary = {
    companyId,
    customers: customerIds.length,
    opportunities: oppIds.length,
    kbFolders: 3,
    competitors: competitorIds.length,
    media: 2,
  };
  console.log("Seed OK:", summary);
  console.log("请使用公司管理员/销售经理/销售账号登录测试完整菜单。");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
