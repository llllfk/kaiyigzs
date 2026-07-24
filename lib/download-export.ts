/** 浏览器下载导出文件（CSV 等） */
export function exportStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** 必须优先 filename*（UTF-8 中文名）；filename= 仅为 ASCII 兜底（中文会被替换成 _） */
export function filenameFromContentDisposition(
  cd: string,
  fallbackFilename: string
) {
  const star = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = cd.match(/(?:^|[;\s])filename\s*=\s*"?([^";]+)"?/i);
  if (plain?.[1]) return plain[1].trim();
  return fallbackFilename;
}

export async function downloadExport(url: string, fallbackFilename: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = "导出失败";
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) msg = json.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  downloadBlob(blob, filenameFromContentDisposition(cd, fallbackFilename));
}
