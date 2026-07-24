'use client';

import { motion } from 'framer-motion';

export default function About() {
  return (
    <section id="about" className="relative py-32 px-6">
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)',
        }}
      />

      <div className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-8">
            关于我们
          </h2>
          <p className="text-base leading-[1.85] text-zinc-400">
            凯艺软件开发工作室成立于2026年，专注于为传统行业提供AI原生的数字化解决方案。我们相信技术应该服务于业务增长，而非增加复杂性。团队拥有丰富的全栈开发经验和深厚的行业理解，已成功交付多个垂直领域的管理系统。
          </p>
        </motion.div>
      </div>
    </section>
  );
}
