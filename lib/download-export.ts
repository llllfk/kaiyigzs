/** 浏览器下载导出文件（CSV 等） */
export function exportStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
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
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fallbackFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
