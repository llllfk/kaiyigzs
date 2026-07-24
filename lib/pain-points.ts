const MAX_PROFILE_PAINS = 20;
const JACCARD_THRESHOLD = 0.72;

const PAIN_CONCEPTS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "付款条件",
    pattern: /账期|付款|预付|首付|尾款|结算|开票|发票|税点|含税|回款/,
  },
  {
    label: "最小起订量",
    pattern: /起订量|起订数量|最小订单|最低订单|MOQ|数量太少|小批量|少量生产/i,
  },
  {
    label: "价格敏感",
    pattern: /价格|报价|费用|成本|预算|降价|便宜|优惠|折扣|性价比|偏高|太贵|贵了|超预算/,
  },
  {
    label: "竞品对比",
    pattern:
      /竞品|竞争对手|对比.{0,8}(供应商|厂家|方案|产品)|其他.{0,6}(供应商|厂家)|多家比较|货比/,
  },
  {
    label: "测试验证",
    pattern: /测试|试用|验证|打样|样品|试运行/,
  },
  {
    label: "合规要求",
    pattern: /合规|备案|资质|认证|审查|监管|标准要求/,
  },
  {
    label: "决策流程",
    pattern: /决策|审批|拍板|决策人|采购流程|内部流程|招标|立项/,
  },
  {
    label: "项目不确定性",
    pattern:
      /项目.{0,10}(未确定|不确定|待定|未知|是否存在|尚未明确|没有确定)|是否.{0,6}(立项|启动|有项目)|立项.{0,6}(待定|不确定|未明确)/,
  },
  {
    label: "采购时机",
    pattern: /采购时机|采购时间|采购计划|采购窗口|何时采购|暂不采购|后续采购|采购节奏/,
  },
  {
    label: "交期要求",
    pattern: /交期|交付|周期|上线|启动时间|项目时间|时间节点|进度|排期|工期/,
  },
  {
    label: "规格匹配",
    pattern: /规格|尺寸|型号|参数|材质|材料|公差|精度|性能指标|技术指标/,
  },
  {
    label: "定制需求",
    pattern: /定制|非标|专用|特殊工艺|特殊颜色|特殊包装|按图生产|来图加工/,
  },
  {
    label: "功能缺口",
    pattern: /功能|能力不足|不支持|缺少|缺失|无法满足|需求未满足/,
  },
  {
    label: "对接集成",
    pattern: /接口|集成|对接|兼容|系统衔接|数据打通/,
  },
  {
    label: "服务响应",
    pattern: /售后|服务|响应|技术支持|维护|实施支持/,
  },
  {
    label: "质量稳定性",
    pattern: /质量|品质|稳定性|可靠性|良率|故障率/,
  },
  {
    label: "供应稳定性",
    pattern: /供货|产能|库存|缺货|供应稳定|备货/,
  },
  {
    label: "物流与地域",
    pattern: /物流|运输|运费|配送|到货地点|跨境|报关|清关|地域|偏远地区/,
  },
  {
    label: "需求待确认",
    pattern:
      /需求.{0,8}(不明确|未明确|待确认|不清楚)|未明确.{0,10}(需求|能力|规格|人员|方案)|尚未明确|暂未明确|具体.{0,6}(不清楚|待确认|未明确)/,
  },
];

/** trim、压空白、去首尾常见标点 */
export function normalizePainLabel(s: string): string {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^[，,。.!！？?、；;：:\-—~～]+|[，,。.!！？?、；;：:\-—~～]+$/g, "");
}

/** 将不同说法归到稳定的业务概念；未命中时保留原短标签。 */
export function canonicalizePainLabel(s: string): string {
  const raw = String(s || "").trim();
  const normalized = normalizePainLabel(raw);
  if (!normalized) return "";
  return PAIN_CONCEPTS.find((concept) => concept.pattern.test(normalized))?.label || raw;
}

function bigrams(s: string): Set<string> {
  const chars = [...s];
  if (chars.length < 2) {
    return chars.length === 1 ? new Set([chars[0]]) : new Set();
  }
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    out.add(chars[i] + chars[i + 1]);
  }
  return out;
}

function jaccard(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function preferLabel(a: string, b: string): string {
  if (a.length !== b.length) return a.length < b.length ? a : b;
  return a;
}

function isSameOrNear(a: string, b: string): boolean {
  const na = normalizePainLabel(a);
  const nb = normalizePainLabel(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return jaccard(na, nb) >= JACCARD_THRESHOLD;
}

/**
 * 合并痛点标签：精确/规范化相同、包含关系、近义（bigram Jaccard）归并到更短标签。
 */
export function mergePainPoints(
  prev: unknown,
  next: unknown,
  limit = MAX_PROFILE_PAINS
): string[] {
  const incoming = [
    ...(Array.isArray(prev) ? prev : []),
    ...(Array.isArray(next) ? next : []),
  ]
    .map((x) => canonicalizePainLabel(String(x || "")))
    .filter(Boolean);

  const merged: string[] = [];
  for (const raw of incoming) {
    const idx = merged.findIndex((m) => isSameOrNear(m, raw));
    if (idx < 0) {
      merged.push(raw);
      continue;
    }
    merged[idx] = preferLabel(merged[idx], raw);
  }
  return merged.slice(0, Math.max(0, limit));
}

export type PainPointCount = { key: string; value: number };

/**
 * 看板聚合：将近义痛点归并计数，展示名取簇内最短标签，按合计降序截断。
 */
export function aggregatePainPointCounts(
  rows: Array<{ key?: string | null; value?: number | string | null }>,
  limit = 15
): PainPointCount[] {
  type Cluster = { label: string; value: number };
  const clusters: Cluster[] = [];

  for (const row of rows) {
    const key = canonicalizePainLabel(String(row.key || ""));
    if (!key) continue;
    const value = Number(row.value) || 0;
    if (value <= 0) continue;

    const idx = clusters.findIndex((c) => isSameOrNear(c.label, key));
    if (idx < 0) {
      clusters.push({ label: key, value });
      continue;
    }
    clusters[idx].value += value;
    clusters[idx].label = preferLabel(clusters[idx].label, key);
  }

  return clusters
    .sort((a, b) => b.value - a.value || a.label.length - b.label.length)
    .slice(0, limit)
    .map((c) => ({ key: c.label, value: c.value }));
}
