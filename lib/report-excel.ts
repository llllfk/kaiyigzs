import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const DEFAULT_ARTIFACT =
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

function resolveArtifactModule() {
  const fromEnv = process.env.ARTIFACT_TOOL_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(DEFAULT_ARTIFACT)) return DEFAULT_ARTIFACT;
  return fromEnv || DEFAULT_ARTIFACT;
}

function resolveProjectRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "scripts", "build-report.mjs"))) return dir;
    if (existsSync(path.join(dir, "package.json"))) {
      // still prefer scripts present
      if (existsSync(path.join(dir, "scripts"))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function runBuilder(
  input: string,
  output: string,
  builderScriptAbs: string,
  artifactModule: string
) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [builderScriptAbs, input, output, artifactModule],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: path.dirname(builderScriptAbs),
        windowsHide: true,
      }
    );
    let stderr = "";
    let stdout = "";
    p.stderr.on("data", (d) => {
      stderr += d;
    });
    p.stdout.on("data", (d) => {
      stdout += d;
    });
    p.on("error", reject);
    p.on("close", (c) => {
      if (c === 0) {
        resolve();
        return;
      }
      const detail = (stderr || stdout || "").trim().slice(0, 2000);
      reject(
        new Error(
          detail
            ? `Excel 生成失败: ${detail}`
            : `Excel 生成失败 (exit ${c})`
        )
      );
    });
  });
}

/** 用临时目录生成 Excel，读入内存后立刻清理，不落业务盘 */
export async function buildReportXlsxBytes(
  payload: unknown,
  builderScript = "scripts/build-report.mjs"
): Promise<Buffer> {
  const root = resolveProjectRoot();
  const builderAbs = path.isAbsolute(builderScript)
    ? builderScript
    : path.join(root, builderScript);
  const artifactModule = resolveArtifactModule();

  if (!existsSync(builderAbs)) {
    throw new Error(`找不到 Excel 脚本: ${builderAbs}`);
  }
  if (!existsSync(artifactModule)) {
    throw new Error(
      `找不到 Excel 组件，请配置环境变量 ARTIFACT_TOOL_PATH。当前: ${artifactModule}`
    );
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-report-"));
  const token = randomUUID();
  const input = path.join(tempDir, `${token}.json`);
  const output = path.join(tempDir, `${token}.xlsx`);
  try {
    await fs.writeFile(input, JSON.stringify(payload), "utf8");
    await runBuilder(input, output, builderAbs, artifactModule);
    if (!existsSync(output)) {
      throw new Error("Excel 文件未生成");
    }
    return await fs.readFile(output);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function reportAttachmentHeaders(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_");
  return {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "no-store",
  };
}
