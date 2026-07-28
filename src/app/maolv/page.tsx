"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./maolv.css";

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

export default function MaolvPage() {
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
      {/* Hero */}
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
          <img src="/wechat-qr.png" alt="毛驴快拼小程序码" width={160} height={160} />
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
