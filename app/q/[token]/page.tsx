import type { Metadata } from "next";
import PublicQuoteClient from "./PublicQuoteClient";
import {
  buildPublicQuoteMetadata,
  buildQuoteShareCardCopy,
  resolvePublicOrigin,
} from "@/lib/quote-share-meta";
import { loadPublicQuoteByToken } from "@/lib/quotes";

export const dynamic = "force-dynamic";

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

/**
 * 微信爬虫认 itemprop + og:property。
 * App Router 的 Metadata.other 会把 itemprop 错写成 name="itemprop:*"，这里直接输出正确属性。
 */
async function WeChatCardMeta({ token }: { token: string }) {
  const origin = await resolvePublicOrigin();
  const path = `/q/${encodeURIComponent(token)}`;
  const pageUrl = `${origin}${path}`;
  const imageUrl = `${origin}/og-quote-share.png`;
  let name = "报价确认";
  let description = "请点击查看并确认报价";
  let siteName = "凯艺销售CRM";

  try {
    const loaded = await loadPublicQuoteByToken(token);
    if (loaded.ok) {
      const copy = buildQuoteShareCardCopy(loaded.quote);
      name = copy.cardTitle;
      description = copy.cardDescription;
      siteName = copy.company;
    }
  } catch {
    /* keep fallbacks */
  }

  return (
    <>
      <meta property="og:type" content="website" />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={name} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:secure_url" content={imageUrl} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="600" />
      <meta property="og:image:height" content="600" />
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
