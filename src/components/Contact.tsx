'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormData({ name: '', email: '', message: '' });
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <section id="contact" className="relative py-32 px-6">
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
            开始合作
          </h2>
          <p className="mt-4 text-zinc-400 max-w-lg mx-auto">
            无论您是需要定制开发还是产品咨询，我们都期待与您交流
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 max-w-4xl mx-auto">
          {/* Contact info */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/[0.05] text-zinc-400 shrink-0">
                <MessageSquare size={18} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-white mb-1">微信</p>
                <p className="text-sm text-zinc-400">kaiyigzs</p>
              </div>
            </div>
          </motion.div>

          {/* Contact form */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="您的姓名"
                required
                className="w-full rounded-lg border border-white/[0.08] bg-[#111] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/[0.2] transition-colors"
              />
            </div>
            <div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="您的邮箱"
                required
                className="w-full rounded-lg border border-white/[0.08] bg-[#111] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/[0.2] transition-colors"
              />
            </div>
            <div>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="请描述您的需求..."
                rows={4}
                required
                className="w-full rounded-lg border border-white/[0.08] bg-[#111] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/[0.2] transition-colors resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-white py-3 text-sm font-medium text-black hover:bg-zinc-200 transition-colors duration-200"
            >
              {submitted ? '已提交，感谢您的留言！' : '提交'}
            </button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
