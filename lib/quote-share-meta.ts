import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadPublicQuoteByToken } from "@/lib/quotes";
import { appPublicBaseUrl } from "@/lib/temp-audio";

const FALLBACK_TITLE = "报价确认";
const FALLBACK_DESC = "请点击查看并确认报价";

export async function resolvePublicOrigin(): Promise<string> {
  const configured = appPublicBaseUrl();
  if (configured) return configured;

  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
    if (host) {
      const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim() || "https";
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    /* headers() may be unavailable in some contexts */
  }

  const firstOrigin = (process.env.APP_ORIGINS || "")
    .split(",")
    .map((v) => v.trim().replace(/\/$/, ""))
    .find(Boolean);
  return firstOrigin || "http://localhost:3001";
}

export function buildQuoteShareCardCopy(quote: {
  title?: string | null;
  company_name?: string | null;
  customer_name?: string | null;
  opportunity_title?: string | null;
}) {
  const company = String(quote.company_name || "").trim() || "凯艺";
  const title = String(quote.title || "").trim() || "报价单";
  const customer = String(quote.customer_name || "").trim();
  const opportunity = String(quote.opportunity_title || "").trim();

  const cardTitle = `${title} · 报价确认`;
  const bits = [company, customer ? `致 ${customer}` : "", opportunity]
    .filter(Boolean)
    .join(" · ");
  const cardDescription = bits
    ? `${bits}。点击查看明细并确认报价。`
    : FALLBACK_DESC;

  return { company, title, cardTitle, cardDescription };
}

/** 供微信/IM 链接预览使用的 Metadata（需服务端 HTML，勿放在纯客户端页） */
export async function buildPublicQuoteMetadata(token: string): Promise<Metadata> {
  const origin = await resolvePublicOrigin();
  const path = `/q/${encodeURIComponent(token)}`;
  const url = `${origin}${path}`;
  /** 静态封面（微信链接卡片缩略图）；标题/摘要走下方动态文案 */
  const imageUrl = `${origin}/og-quote-share.png`;

  let cardTitle = FALLBACK_TITLE;
  let cardDescription = FALLBACK_DESC;
  let company = "凯艺销售CRM";

  try {
    const loaded = await loadPublicQuoteByToken(token);
    if (loaded.ok) {
      const copy = buildQuoteShareCardCopy(loaded.quote);
      cardTitle = copy.cardTitle;
      cardDescription = copy.cardDescription;
      company = copy.company;
    } else if (loaded.code === "revoked" || loaded.code === "expired") {
      cardTitle = "报价链接已失效";
      cardDescription = "该确认链接已过期或已撤销，请联系销售重新发送。";
    } else if (loaded.code === "views_exhausted") {
      cardTitle = "报价链接不可用";
      cardDescription = "该确认链接查看次数已用完，请联系销售重新发送。";
    }
  } catch {
    /* 元数据失败时仍返回可用的通用卡片 */
  }

  return {
    metadataBase: new URL(origin),
    title: cardTitle,
    description: cardDescription,
    applicationName: company,
    robots: { index: false, follow: false, nocache: true },
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: cardTitle,
      description: cardDescription,
      siteName: company,
      locale: "zh_CN",
      images: [
        {
          url: imageUrl,
          width: 600,
          height: 600,
          alt: cardTitle,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: cardTitle,
      description: cardDescription,
      images: [imageUrl],
    },
    // 微信等爬虫额外识别 itemprop（会输出为 name="itemprop:*"）
    other: {
      "itemprop:name": cardTitle,
      "itemprop:description": cardDescription,
      "itemprop:image": imageUrl,
    },
  };
}
