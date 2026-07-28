/**
 * 毛驴快拼 — 个人网站项目介绍页
 *
 * 用法（Next.js / Vite React）：
 *   import MaoluKuaipinProject from "./MaoluKuaipinProject";
 *   <MaoluKuaipinProject />
 *
 * 可选 props：
 *   githubUrl  — 仓库地址（不传则隐藏 GitHub 按钮）
 *   qrImageUrl — 小程序码图片（默认可用同目录 wechat-qrcode.png）
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  githubUrl?: string;
  qrImageUrl?: string;
};

const FEATURES = [
  {
    title: "双端角色切换",
    desc: "乘客发需求、车主刷大厅，一套流程覆盖两端；按距离筛选、关键词搜索、实时新单提醒。",
  },
  {
    title: "行程全生命周期",
    desc: "发布 → 接单 → 联系 → 取消/完成 → 互评；定时任务自动过期与发车提醒，减少脏数据。",
  },
  {
    title: "信任与安全",
    desc: "手机号授权、车主证件审核、信用分与金银铜牌、双向评价与黑名单屏蔽。",
  },
  {
    title: "VIP 与增长",
    desc: "车主会员：不限接单、优先推送；微信支付 / 虚拟支付履约；邀请码裂变与到期提醒。",
  },
  {
    title: "管理后台",
    desc: "数据看板、用户/行程/评价/审核、VIP 发放与订单管理，独立 Web Admin 支撑运营。",
  },
  {
    title: "合规与隐私",
    desc: "隐私弹窗、用户协议与隐私政策、位置与手机号按需授权，贴合微信小程序审核规范。",
  },
] as const;

const TECH = [
  { label: "微信小程序", detail: "WXML / WXSS / JS" },
  { label: "云开发 CloudBase", detail: "30+ 云函数 · Node.js 18" },
  { label: "微信支付", detail: "VIP 下单 · 回调履约" },
  { label: "定时触发器", detail: "过期清理 · 发车提醒" },
  { label: "管理后台", detail: "原生 HTML/CSS/JS SPA" },
  { label: "定位与隐私", detail: "chooseLocation · 隐私组件" },
] as const;

const HIGHLIGHTS = [
  { value: "30+", label: "云函数" },
  { value: "20+", label: "业务页面" },
  { value: "双角色", label: "乘客 / 车主" },
  { value: "本地化", label: "沧州互助出行" },
] as const;

export default function MaoluKuaipinProject({
  githubUrl,
  qrImageUrl = "/wechat-qrcode.png",
}: Props) {
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <article
      ref={rootRef}
      className={`mkp ${visible ? "mkp--in" : ""}`}
      aria-labelledby="mkp-brand"
    >
      <style>{css}</style>

      {/* Hero — brand first, one composition */}
      <header className="mkp-hero">
        <div className="mkp-hero__glow" aria-hidden />
        <div className="mkp-hero__road" aria-hidden />
        <div className="mkp-hero__inner">
          <p className="mkp-kicker">微信小程序 · 本地出行互助</p>
          <h1 id="mkp-brand" className="mkp-brand">
            毛驴快拼
          </h1>
          <p className="mkp-tagline">
            沧州人自己的出行互助平台——只做行程信息发布与匹配，不做营运、不抽成。
          </p>
          <div className="mkp-cta">
            {githubUrl ? (
              <a className="mkp-btn mkp-btn--solid" href={githubUrl} target="_blank" rel="noreferrer">
                查看源码
              </a>
            ) : null}
            <a className="mkp-btn mkp-btn--ghost" href="#mkp-features">
              了解能力
            </a>
          </div>
        </div>
      </header>

      {/* Snapshot */}
      <section className="mkp-section mkp-snapshot" aria-label="项目速览">
        <ul className="mkp-stats">
          {HIGHLIGHTS.map((item) => (
            <li key={item.label}>
              <span className="mkp-stats__value">{item.value}</span>
              <span className="mkp-stats__label">{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="mkp-lead">
          从微信群里刷消息找顺路，到结构化发布、按距离抢单、信用互评——毛驴快拼把本地拼车信息流做成可运营的产品闭环，定位清晰：
          <em>信息互助工具，而非网约车平台</em>。
        </p>
      </section>

      {/* Features */}
      <section id="mkp-features" className="mkp-section">
        <h2 className="mkp-h2">产品能力</h2>
        <p className="mkp-sub">围绕「发布—匹配—信任—运营」四条主线落地。</p>
        <div className="mkp-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="mkp-feature"
              style={{ "--i": i } as CSSProperties}
            >
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech */}
      <section className="mkp-section">
        <h2 className="mkp-h2">技术栈</h2>
        <p className="mkp-sub">微信云开发全栈：小程序前端 + 云函数后端 + 运营后台。</p>
        <ul className="mkp-tech">
          {TECH.map((t) => (
            <li key={t.label}>
              <strong>{t.label}</strong>
              <span>{t.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Architecture note */}
      <section className="mkp-section mkp-arch">
        <h2 className="mkp-h2">我负责什么</h2>
        <div className="mkp-arch__body">
          <p>
            独立完成从 0 到 1：需求分析、小程序页面与交互、云函数业务（行程、接单、信用、VIP
            支付、邀请、评价、拉黑）、定时任务与运营后台，以及隐私合规与审核整改。
          </p>
          <ul>
            <li>行程池实时性：新单轮询 / 提醒、VIP 优先推送、非 VIP 延迟可见</li>
            <li>信用体系：评分徽章、信用分奖惩与接单门槛联动</li>
            <li>商业化：会员套餐、支付回调履约、iOS 虚拟支付策略</li>
            <li>运维闭环：过期清理、待支付订单清理、发车提醒触发器</li>
          </ul>
        </div>
      </section>

      {/* Try */}
      <section className="mkp-section mkp-try">
        <div className="mkp-try__copy">
          <h2 className="mkp-h2">体验产品</h2>
          <p className="mkp-sub">微信搜索「毛驴快拼」，或扫描小程序码进入。</p>
        </div>
        <figure className="mkp-qr">
          <img src={qrImageUrl} alt="毛驴快拼小程序码" width={160} height={160} />
          <figcaption>微信扫码体验</figcaption>
        </figure>
      </section>

      <footer className="mkp-foot">
        <span>毛驴快拼</span>
        <span className="mkp-foot__dot" aria-hidden />
        <span>凯艺软件开发工作室</span>
      </footer>
    </article>
  );
}

const css = `
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&family=Noto+Sans+SC:wght@400;500;700&display=swap");

.mkp {
  --mkp-bg: #0c1017;
  --mkp-surface: #141a24;
  --mkp-line: rgba(255, 255, 255, 0.08);
  --mkp-text: #f2f4f8;
  --mkp-muted: #9aa6b8;
  --mkp-accent: #ff6b35;
  --mkp-accent-soft: rgba(255, 107, 53, 0.16);
  --mkp-warm: #ffb347;
  color: var(--mkp-text);
  background: var(--mkp-bg);
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.65;
  overflow: clip;
}

.mkp * { box-sizing: border-box; }

.mkp-hero {
  position: relative;
  min-height: min(92vh, 820px);
  display: grid;
  place-items: end start;
  padding: clamp(48px, 8vw, 96px) clamp(20px, 5vw, 72px) clamp(56px, 8vw, 100px);
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(255, 107, 53, 0.22), transparent 55%),
    radial-gradient(ellipse 50% 40% at 10% 80%, rgba(255, 179, 71, 0.1), transparent 50%),
    linear-gradient(165deg, #121820 0%, #0c1017 55%, #0a0e14 100%);
}

.mkp-hero__glow {
  position: absolute;
  inset: auto -10% 20% 40%;
  height: 40%;
  background: radial-gradient(circle, rgba(255, 107, 53, 0.35), transparent 65%);
  filter: blur(40px);
  animation: mkp-pulse 6s ease-in-out infinite;
  pointer-events: none;
}

.mkp-hero__road {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(105deg, transparent 0%, transparent 42%, rgba(255,255,255,0.03) 42.5%, transparent 43%),
    repeating-linear-gradient(
      105deg,
      transparent,
      transparent 48px,
      rgba(255, 255, 255, 0.025) 48px,
      rgba(255, 255, 255, 0.025) 50px
    );
  mask-image: linear-gradient(to top, black 10%, transparent 70%);
  pointer-events: none;
  animation: mkp-road 22s linear infinite;
}

.mkp-hero__inner {
  position: relative;
  max-width: 720px;
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.9s ease, transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}

.mkp--in .mkp-hero__inner {
  opacity: 1;
  transform: none;
}

.mkp-kicker {
  margin: 0 0 14px;
  font-size: 0.85rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mkp-warm);
  font-weight: 500;
}

.mkp-brand {
  margin: 0;
  font-family: "Outfit", "Noto Sans SC", sans-serif;
  font-weight: 800;
  font-size: clamp(3.2rem, 10vw, 6.5rem);
  letter-spacing: -0.03em;
  line-height: 0.95;
  background: linear-gradient(120deg, #fff 20%, var(--mkp-accent) 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.mkp-tagline {
  margin: 22px 0 0;
  max-width: 34em;
  font-size: clamp(1.05rem, 2.2vw, 1.25rem);
  color: var(--mkp-muted);
}

.mkp-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.mkp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.mkp-btn:hover { transform: translateY(-2px); }

.mkp-btn--solid {
  background: var(--mkp-accent);
  color: #fff;
}

.mkp-btn--solid:hover { background: #ff814f; }

.mkp-btn--ghost {
  border: 1px solid var(--mkp-line);
  color: var(--mkp-text);
  background: rgba(255, 255, 255, 0.03);
}

.mkp-btn--ghost:hover { border-color: rgba(255, 107, 53, 0.45); }

.mkp-section {
  padding: clamp(48px, 7vw, 88px) clamp(20px, 5vw, 72px);
  max-width: 1100px;
  margin: 0 auto;
}

.mkp-h2 {
  margin: 0;
  font-family: "Outfit", "Noto Sans SC", sans-serif;
  font-size: clamp(1.6rem, 3.5vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.mkp-sub {
  margin: 10px 0 0;
  color: var(--mkp-muted);
  max-width: 40em;
}

.mkp-snapshot {
  padding-top: 40px;
}

.mkp-stats {
  list-style: none;
  margin: 0 0 28px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.mkp-stats li {
  background: var(--mkp-surface);
  border: 1px solid var(--mkp-line);
  border-radius: 16px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mkp-stats__value {
  font-family: "Outfit", sans-serif;
  font-weight: 700;
  font-size: 1.45rem;
  color: var(--mkp-accent);
}

.mkp-stats__label {
  font-size: 0.85rem;
  color: var(--mkp-muted);
}

.mkp-lead {
  margin: 0;
  font-size: 1.08rem;
  color: #c5cedc;
}

.mkp-lead em {
  font-style: normal;
  color: var(--mkp-warm);
  font-weight: 500;
}

.mkp-grid {
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.mkp-feature {
  padding: 22px 20px;
  border-radius: 18px;
  border: 1px solid var(--mkp-line);
  background: linear-gradient(160deg, rgba(255,107,53,0.07), transparent 55%), var(--mkp-surface);
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.55s ease, transform 0.55s ease;
  transition-delay: calc(var(--i, 0) * 70ms);
}

.mkp--in .mkp-feature {
  opacity: 1;
  transform: none;
}

.mkp-feature h3 {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 700;
}

.mkp-feature p {
  margin: 0;
  font-size: 0.92rem;
  color: var(--mkp-muted);
}

.mkp-tech {
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.mkp-tech li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border-left: 3px solid var(--mkp-accent);
  background: var(--mkp-accent-soft);
  border-radius: 0 12px 12px 0;
}

.mkp-tech strong { font-size: 0.98rem; }
.mkp-tech span { font-size: 0.85rem; color: var(--mkp-muted); }

.mkp-arch__body {
  margin-top: 22px;
  padding: 24px 22px;
  border-radius: 20px;
  border: 1px solid var(--mkp-line);
  background:
    radial-gradient(circle at 100% 0%, rgba(255, 107, 53, 0.12), transparent 40%),
    var(--mkp-surface);
}

.mkp-arch__body > p {
  margin: 0 0 14px;
  color: #c5cedc;
}

.mkp-arch__body ul {
  margin: 0;
  padding-left: 1.15em;
  color: var(--mkp-muted);
}

.mkp-arch__body li + li { margin-top: 8px; }

.mkp-try {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  flex-wrap: wrap;
  border-top: 1px solid var(--mkp-line);
}

.mkp-qr {
  margin: 0;
  text-align: center;
}

.mkp-qr img {
  width: 160px;
  height: 160px;
  object-fit: cover;
  border-radius: 16px;
  background: #fff;
  padding: 8px;
  display: block;
}

.mkp-qr figcaption {
  margin-top: 10px;
  font-size: 0.82rem;
  color: var(--mkp-muted);
}

.mkp-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 20px 48px;
  font-size: 0.82rem;
  color: var(--mkp-muted);
}

.mkp-foot__dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--mkp-accent);
}

@keyframes mkp-pulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.08); }
}

@keyframes mkp-road {
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 0, 120px 0; }
}

@media (max-width: 800px) {
  .mkp-stats { grid-template-columns: repeat(2, 1fr); }
  .mkp-grid { grid-template-columns: 1fr; }
  .mkp-tech { grid-template-columns: 1fr; }
  .mkp-hero { place-items: center start; min-height: 78vh; }
}

@media (prefers-reduced-motion: reduce) {
  .mkp-hero__glow,
  .mkp-hero__road { animation: none; }
  .mkp-hero__inner,
  .mkp-feature { transition: none; opacity: 1; transform: none; }
}
`;
