"use client";

import { Suspense } from "react";
import QuotesClient from "./QuotesClient";

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--color-muted)]">加载中…</div>}>
      <QuotesClient />
    </Suspense>
  );
}
