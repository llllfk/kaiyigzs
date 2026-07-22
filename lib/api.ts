import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { AiBusyError } from "@/lib/ai";

export function jsonOk<T>(data: T, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(meta ? { data, meta } : { data }, { status });
}

export function jsonError(
  error: string,
  status = 400,
  detail?: Record<string, unknown> | string | null
) {
  if (detail == null || detail === "") {
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ error, detail }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof AiBusyError) {
    return jsonError(err.message, err.status);
  }
  console.error(err);
  return jsonError(err instanceof Error ? err.message : "服务器错误", 500);
}
