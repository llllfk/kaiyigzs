import type { Metadata } from "next";
import PublicQuoteClient from "./PublicQuoteClient";
import {
  buildPublicQuoteMetadata,
  buildQuoteShareCardCopy,
  resolvePublicOrigin,
} from "@/lib/quote-share-meta";
import { loadPublicQuoteByToken } from "@/lib/quotes";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const token = String((await params).token || "").trim();
  if (!token) {
    return {
      title: "报价确认",
      description: "请点击查看并确认报价",
      robots: { index: false, follow: false },
    };
  }
  return buildPublicQuoteMetadata(token);
}

/** 微信爬虫更认 itemprop；App Router 会把组件内 meta 提升到 head */
async function WeChatCardMeta({ token }: { token: string }) {
  const origin = await resolvePublicOrigin();
  const imageUrl = `${origin}/og-quote-share.png`;
  let name = "报价确认";
  let description = "请点击查看并确认报价";

  try {
    const loaded = await loadPublicQuoteByToken(token);
    if (loaded.ok) {
      const copy = buildQuoteShareCardCopy(loaded.quote);
      name = copy.cardTitle;
      description = copy.cardDescription;
    }
  } catch {
    /* keep fallbacks */
  }

  return (
    <>
      <meta itemProp="name" content={name} />
      <meta itemProp="description" content={description} />
      <meta itemProp="image" content={imageUrl} />
    </>
  );
}

export default async function PublicQuotePage({ params }: PageProps) {
  const token = String((await params).token || "").trim();
  return (
    <>
      {token ? <WeChatCardMeta token={token} /> : null}
      <PublicQuoteClient token={token} />
    </>
  );
}
