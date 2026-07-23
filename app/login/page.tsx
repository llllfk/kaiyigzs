"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useUi } from "@/components/ui/Feedback";

type DemoAccount = {
  label: string;
  hint: string;
  email: string;
  phone: string;
  password: string;
};

const features = [
  { index: "01", title: "客户管理", detail: "客户资料与联系记录统一管理" },
  { index: "02", title: "销售过程", detail: "商机、报价和待办全程跟踪" },
  { index: "03", title: "AI 销售助手", detail: "客户洞察与跟进建议智能生成" },
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

function LoginParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvasElement: HTMLCanvasElement = currentCanvas;

    const currentContext = canvasElement.getContext("2d");
    if (!currentContext) return;
    const renderingContext: CanvasRenderingContext2D = currentContext;

    let width = 0;
    let height = 0;
    let frame = 0;
    let particles: Particle[] = [];
    const pointer = { x: 0, y: 0, active: false };

    function resize() {
      const rect = canvasElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvasElement.width = Math.round(width * ratio);
      canvasElement.height = Math.round(height * ratio);
      renderingContext.setTransform(ratio, 0, 0, ratio, 0, 0);

      const count = Math.max(36, Math.min(64, Math.round((width * height) / 13500)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        radius: 1.25 + Math.random() * 1.35,
      }));
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvasElement.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    }

    function onPointerOut(event: PointerEvent) {
      if (!event.relatedTarget) pointer.active = false;
    }

    function draw() {
      renderingContext.clearRect(0, 0, width, height);

      if (pointer.active) {
        const glow = renderingContext.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          150,
        );
        glow.addColorStop(0, "rgba(89, 185, 164, 0.12)");
        glow.addColorStop(1, "rgba(89, 185, 164, 0)");
        renderingContext.beginPath();
        renderingContext.arc(pointer.x, pointer.y, 150, 0, Math.PI * 2);
        renderingContext.fillStyle = glow;
        renderingContext.fill();
      }

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];

        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < 150) {
            const force = (150 - distance) / 150;
            particle.vx += (dx / distance) * force * 0.027;
            particle.vy += (dy / distance) * force * 0.027;
          }
        }

        particle.vx *= 0.995;
        particle.vy *= 0.995;
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -4) particle.x = width + 4;
        if (particle.x > width + 4) particle.x = -4;
        if (particle.y < -4) particle.y = height + 4;
        if (particle.y > height + 4) particle.y = -4;

        renderingContext.beginPath();
        renderingContext.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        renderingContext.fillStyle = "rgba(160, 207, 239, 0.68)";
        renderingContext.fill();

        for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex += 1) {
          const other = particles[otherIndex];
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          if (distance < 112) {
            renderingContext.beginPath();
            renderingContext.moveTo(particle.x, particle.y);
            renderingContext.lineTo(other.x, other.y);
            renderingContext.strokeStyle = `rgba(137, 187, 224, ${(1 - distance / 112) * 0.26})`;
            renderingContext.lineWidth = 0.75;
            renderingContext.stroke();
          }
        }

        if (pointer.active) {
          const pointerDistance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
          if (pointerDistance < 190) {
            renderingContext.beginPath();
            renderingContext.moveTo(particle.x, particle.y);
            renderingContext.lineTo(pointer.x, pointer.y);
            renderingContext.strokeStyle = `rgba(111, 219, 194, ${(1 - pointerDistance / 190) * 0.68})`;
            renderingContext.lineWidth = 1;
            renderingContext.stroke();
          }
        }
      }

      frame = window.requestAnimationFrame(draw);
    }

    function onVisibilityChange() {
      window.cancelAnimationFrame(frame);
      if (!document.hidden) frame = window.requestAnimationFrame(draw);
    }

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerOut);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-particles" aria-hidden="true" />;
}

export default function LoginPage() {
  const ui = useUi();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [activeEmail, setActiveEmail] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dev/demo-accounts", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setDemoAccounts(Array.isArray(json?.data) ? json.data : []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  function fillAccount(item: DemoAccount) {
    setAccount(item.phone);
    setPassword(item.password);
    setActiveEmail(item.email);
    setError("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error || "登录失败";
        setError(message);
        ui.error("登录失败", message);
        setLoading(false);
        return;
      }
      const next = json.data?.must_change_password
        ? "/settings"
        : json.data?.role === "super_admin"
          ? "/platform"
          : "/dashboard";
      window.location.assign(next);
    } catch {
      setError("网络错误，请稍后重试");
      ui.error("网络错误", "请稍后重试");
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="系统功能介绍">
        <div className="login-grid" aria-hidden="true" />
        <LoginParticleField />

        <div className="login-story-content">
          <div className="login-brand login-reveal">
            <span className="login-brand-mark">K</span>
            <span>凯艺销售 CRM</span>
          </div>

          <div className="login-copy login-reveal login-delay-1">
            <p className="login-eyebrow">客户关系与销售过程管理</p>
            <h1>凯艺销售管理系统</h1>
            <p className="login-lead">
              集中管理客户、商机、跟进、报价与团队任务，并通过 AI 分析和语音转写辅助销售人员推进业务。
            </p>
          </div>

          <div className="login-feature-list login-reveal login-delay-2">
            {features.map((feature) => (
              <div className="login-feature" key={feature.index}>
                <span>{feature.index}</span>
                <div>
                  <strong>{feature.title}</strong>
                  <p>{feature.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="login-dashboard login-reveal login-delay-3">
            <div className="login-dashboard-head">
              <div>
                <span>标准销售流程</span>
                <strong>从线索到成交，全程留痕</strong>
              </div>
              <span className="login-process-state">业务工作台</span>
            </div>
            <div className="login-process" aria-label="销售业务流程">
              {[
                ["01", "客户建档"],
                ["02", "商机跟进"],
                ["03", "方案报价"],
                ["04", "成交归档"],
              ].map(([number, label], index) => (
                <div className="login-process-step" key={number}>
                  <span className={index === 1 ? "is-current" : ""}>{number}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>
            <div className="login-dashboard-foot">
              <span><i className="is-blue" />权限分级</span>
              <span><i className="is-green" />过程可追溯</span>
              <span><i className="is-gold" />AI 辅助分析</span>
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap login-reveal login-delay-1">
          <div className="login-mobile-brand">
            <span className="login-brand-mark">K</span>
            <span>凯艺销售 CRM</span>
          </div>

          <div className="login-form-heading">
            <span className="login-status-dot" aria-hidden="true" />
            <p>安全工作台</p>
            <h2>欢迎回来</h2>
            <span>登录后继续处理今天的销售工作</span>
          </div>

          <form onSubmit={onSubmit} className="login-form">
            <div className="field">
              <label htmlFor="account">手机号 / 邮箱</label>
              <input
                id="account"
                className="input login-input"
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setActiveEmail("");
                }}
                autoComplete="username"
                placeholder="请输入手机号或邮箱"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                className="input login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && <div className="login-error" role="alert">{error}</div>}

            <Button type="submit" className="login-submit" disabled={loading}>
              {loading && <span className="login-spinner" aria-hidden="true" />}
              {loading ? "正在登录" : "登录系统"}
            </Button>
          </form>

          {demoAccounts.length > 0 && (
            <div className="login-demo">
              <div className="login-demo-title"><span />开发测试账号<span /></div>
              <div className="login-demo-grid">
                {demoAccounts.map((item) => (
                  <button
                    key={item.email}
                    type="button"
                    onClick={() => fillAccount(item)}
                    className={activeEmail === item.email ? "is-active" : ""}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="login-footnote">登录即表示您已获授权使用本系统</p>
        </div>
      </section>
    </main>
  );
}
