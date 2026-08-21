'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Globe,
  Building2,
  GraduationCap,
  Car,
  CreditCard,
  Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Globe,
  Building2,
  GraduationCap,
  Car,
  CreditCard,
  Bot,
};

interface Product {
  id: string;
  name: string;
  url: string | null;
  description: string;
  icon: string | null;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setProducts(json.data);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch products:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section id="products" className="relative py-32 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              我们的产品
            </h2>
            <p className="mt-4 text-zinc-400 max-w-lg mx-auto">
              覆盖贸易、家装、教育、出行、零售等多个垂直领域的数字化解决方案
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.06] bg-[#111] p-6 animate-pulse"
              >
                <div className="mb-4 w-10 h-10 rounded-lg bg-white/[0.05]" />
                <div className="h-5 w-24 bg-white/[0.05] rounded mb-3" />
                <div className="h-4 w-full bg-white/[0.05] rounded mb-2" />
                <div className="h-4 w-3/4 bg-white/[0.05] rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="products" className="relative py-32 px-6">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            我们的产品
          </h2>
          <p className="mt-4 text-zinc-400 max-w-lg mx-auto">
            覆盖贸易、家装、教育、出行、零售等多个垂直领域的数字化解决方案
          </p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, i) => {
            const IconComponent =
              (product.icon && iconMap[product.icon]) || Globe;
            return (
              <motion.a
                key={product.id}
                href={product.url || '#'}
                target={product.url ? '_blank' : undefined}
                rel={product.url ? 'noopener noreferrer' : undefined}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group relative rounded-xl border border-white/[0.06] bg-[#111] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.12] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
              >
                <div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/[0.05] text-zinc-300 group-hover:text-white transition-colors">
                  <IconComponent size={20} strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {product.name}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-500 mb-4">
                  {product.description}
                </p>
                <span className="inline-flex items-center text-sm text-zinc-400 group-hover:text-white transition-colors">
                  了解更多
                  <svg
                    className="ml-1 w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
