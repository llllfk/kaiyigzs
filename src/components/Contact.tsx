'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import Image from 'next/image';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      const res = await fetch('/api/contact/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || '提交失败');
      }

      setStatus('success');
      setFormData({ name: '', contact: '', message: '' });
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const submitText =
    status === 'submitting'
      ? '提交中...'
      : status === 'success'
        ? '已提交，感谢您的留言！'
        : status === 'error'
          ? '提交失败，请重试'
          : '提交';

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
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-white mb-1">微信</p>
                  <p className="text-sm text-zinc-400">kaiyigzs</p>
                </div>
                <Image
                  src="/wechat-qr.png"
                  alt="微信二维码"
                  width={100}
                  height={100}
                  className="rounded-lg border border-white/[0.08]"
                />
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
                disabled={status === 'submitting'}
                className="w-full rounded-lg border border-white/[0.08] bg-[#111] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/[0.2] transition-colors disabled:opacity-50"
              />
            </div>
            <div>
              <input
                type="text"
                name="contact"
                value={formData.contact}
                onChange={handleChange}
                placeholder="您的联系方式"
                required
                disabled={status === 'submitting'}
                className="w-full rounded-lg border border-white/[0.08] bg-[#111] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/[0.2] transition-colors disabled:opacity-50"
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
                disabled={status === 'submitting'}
                className="w-full rounded-lg border border-white/[0.08] bg-[#111] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/[0.2] transition-colors resize-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'submitting'}
              className={`w-full rounded-lg py-3 text-sm font-medium transition-colors duration-200 ${
                status === 'success'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : status === 'error'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-white text-black hover:bg-zinc-200'
              } disabled:opacity-70`}
            >
              {submitText}
            </button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
