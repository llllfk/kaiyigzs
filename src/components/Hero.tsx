'use client';

import { motion } from 'framer-motion';

export default function Hero() {
  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
    >
      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Top glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px]"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(99,102,241,0.1) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <h1 className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.1] tracking-tight text-white">
            用技术驱动
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              }}
            >
              商业增长
            </span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
          className="mt-6 text-lg leading-relaxed text-zinc-400 max-w-2xl mx-auto"
        >
          凯艺软件开发工作室 — 专注为企业打造高效、智能的数字化管理系统
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="#products"
            onClick={(e) => handleScroll(e, '#products')}
            className="inline-flex items-center px-6 py-3 text-sm font-medium rounded-lg bg-white text-black hover:bg-zinc-200 transition-colors duration-200"
          >
            查看产品
          </a>
          <a
            href="#contact"
            onClick={(e) => handleScroll(e, '#contact')}
            className="inline-flex items-center px-6 py-3 text-sm font-medium rounded-lg border border-white/[0.12] text-zinc-300 hover:border-white/[0.25] hover:text-white transition-colors duration-200"
          >
            联系我们
          </a>
        </motion.div>
      </div>
    </section>
  );
}
