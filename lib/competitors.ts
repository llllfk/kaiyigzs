import pool from "@/lib/db";

export type CompetitorPlaybook = {
  id: number;
  name: string;
  summary: string | null;
  strengths: string | null;
  weaknesses: string | null;
  playbook: string | null;
};

/** 按名称匹配公司竞品库（精确优先，其次包含关系） */
export async function matchCompetitorsByNames(
  companyId: number,
  names: string[]
): Promise<CompetitorPlaybook[]> {
  const cleaned = [
    ...new Set(
      names.map((n) => String(n || "").trim()).filter(Boolean)
    ),
  ];
  if (!cleaned.length) return [];

  const res = await pool.query(
    `SELECT id, name, summary, strengths, weaknesses, playbook
     FROM competitors
     WHERE company_id = $1
     ORDER BY updated_at DESC
     LIMIT 300`,
    [companyId]
  );
  const rows = res.rows as CompetitorPlaybook[];
  const matched: CompetitorPlaybook[] = [];
  const used = new Set<number>();

  for (const raw of cleaned) {
    const exact = rows.find(
      (r) => !used.has(r.id) && r.name.toLowerCase() === raw.toLowerCase()
    );
    if (exact) {
      matched.push(exact);
      used.add(exact.id);
      continue;
    }
    const fuzzy = rows.find(
      (r) =>
        !used.has(r.id) &&
        (r.name.toLowerCase().includes(raw.toLowerCase()) ||
          raw.toLowerCase().includes(r.name.toLowerCase()))
    );
    if (fuzzy) {
      matched.push(fuzzy);
      used.add(fuzzy.id);
    }
  }

  return matched;
}

export function formatCompetitorPlaybooks(
  items: CompetitorPlaybook[],
  heading = "【竞品应对资料】"
): string[] {
  if (!items.length) return [];
  const lines = [heading];
  for (const c of items) {
    lines.push(`- ${c.name}`);
    if (c.summary) lines.push(`  简介：${String(c.summary).slice(0, 200)}`);
    if (c.strengths) lines.push(`  优势：${String(c.strengths).slice(0, 200)}`);
    if (c.weaknesses) lines.push(`  劣势：${String(c.weaknesses).slice(0, 200)}`);
    if (c.playbook) lines.push(`  话术：${String(c.playbook).slice(0, 300)}`);
  }
  return lines;
}
