/** 浏览器端读取音频文件时长（毫秒） */
export function probeAudioDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (ms: number | null) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      done(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null);
    };
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
