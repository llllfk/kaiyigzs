import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "scripts", "_ai-test-out.txt");

function loadEnv() {
  const text = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function parseCozeSse(raw) {
  let answer = "";
  let lastCompleted = "";
  for (const block of raw.split(/\n\n+/)) {
    const lines = block.split("\n");
    let event = "";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLine += line.slice(5).trim();
    }
    if (!dataLine || dataLine === "[DONE]") continue;
    try {
      const data = JSON.parse(dataLine);
      if (event.includes("message.delta") && data.content) answer += data.content;
      if (event.includes("message.completed") && data.type === "answer" && data.content) {
        lastCompleted = data.content;
      }
      if (event.includes("chat.failed") || event === "error") {
        throw new Error(data.msg || data.last_error?.msg || JSON.stringify(data).slice(0, 200));
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  return (lastCompleted || answer).trim();
}

const env = loadEnv();
const base = env.COZE_API_BASE || "https://api.coze.cn";
const lines = [
  `base=${base}`,
  `bot=${env.COZE_BOT_ID || "(missing)"}`,
  `key=${env.COZE_AI_API_KEY ? env.COZE_AI_API_KEY.slice(0, 8) + "..." : "(missing)"}`,
];

try {
  const res = await fetch(`${base}/v3/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COZE_AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bot_id: env.COZE_BOT_ID,
      user_id: "sales-crm-test",
      stream: true,
      auto_save_history: false,
      additional_messages: [
        { role: "user", content: "请只回复两个字母：ok", content_type: "text" },
      ],
    }),
  });
  const text = await res.text();
  lines.push(`HTTP ${res.status}`);
  const parsed = parseCozeSse(text);
  lines.push(`parsed=${JSON.stringify(parsed)}`);
  lines.push(`ok=${/ok/i.test(parsed) ? "yes" : "no"}`);
  // keep tail of stream for debug
  lines.push("--- sse tail ---");
  lines.push(text.slice(-1500));
} catch (e) {
  lines.push(`FAIL ${e instanceof Error ? e.message : String(e)}`);
}

fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
