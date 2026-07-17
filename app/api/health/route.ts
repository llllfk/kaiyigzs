import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ data: { status: "ok", db: true } });
  } catch (err) {
    return NextResponse.json(
      {
        data: {
          status: "degraded",
          db: false,
          message: err instanceof Error ? err.message : "db error",
        },
      },
      { status: 200 }
    );
  }
}
