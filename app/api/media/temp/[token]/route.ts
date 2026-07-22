import { NextRequest } from "next/server";
import { takeTempAudio } from "@/lib/temp-audio";

type Ctx = { params: Promise<{ token: string }> };

/** 临时音频下载：供火山 ASR 拉取（需公网可访问的 PUBLIC_APP_BASE_URL） */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const hit = takeTempAudio(token);
  if (!hit) {
    return new Response("not found or expired", { status: 404 });
  }
  return new Response(new Uint8Array(hit.body), {
    status: 200,
    headers: {
      "Content-Type": hit.mime,
      "Cache-Control": "no-store",
      "Content-Length": String(hit.body.length),
    },
  });
}
