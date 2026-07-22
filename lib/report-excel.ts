import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const artifactModule =
  process.env.ARTIFACT_TOOL_PATH ||
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

async function runBuilder(input: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "scripts/build-report.mjs"),
        input,
        output,
        artifactModule,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let error = "";
    p.stderr.on("data", (d) => {
      error += d;
    });
    p.on("error", reject);
    p.on("close", (c) =>
      c === 0
        ? resolve()
        : reject(new Error(error || `Excel 生成失败 (${c})`))
    );
  });
}

/** 用临时目录生成 Excel，读入内存后立刻清理，不落业务盘 */
export async function buildReportXlsxBytes(payload: unknown): Promise<Buffer> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-report-"));
  const token = randomUUID();
  const input = path.join(tempDir, `${token}.json`);
  const output = path.join(tempDir, `${token}.xlsx`);
  try {
    await fs.writeFile(input, JSON.stringify(payload), "utf8");
    await runBuilder(input, output);
    return await fs.readFile(output);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function reportAttachmentHeaders(fileName: string) {
  return {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "no-store",
  };
}
