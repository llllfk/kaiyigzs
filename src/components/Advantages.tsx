'use client';

import { motion } from 'framer-motion';
import { advantages } from '@/data/advantages';

export default function Advantages() {
  return (
    <section className="relative py-32 px-6">
      {/* Subtle divider glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)',
        }}
      />

      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            为什么选择我们
          </h2>
          <p className="mt-4 text-zinc-400 max-w-lg mx-auto">
            以 AI 为核心驱动力，帮助企业在数字化浪潮中抢占先机
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-xl border border-white/[0.06] bg-[#111] p-6"
              >
                <div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Icon size={20} strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-500">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
