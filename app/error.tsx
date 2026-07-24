"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">出错了</h1>
      <p className="text-[var(--color-muted)]">{error.message || "未知错误"}</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        重试
      </button>
    </div>
  );
}
