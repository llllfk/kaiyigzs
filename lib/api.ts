import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return jsonError(err.message, err.status);
  }
  console.error(err);
  return jsonError(err instanceof Error ? err.message : "服务器错误", 500);
}
