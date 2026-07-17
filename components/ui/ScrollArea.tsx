"use client";

import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Scroll container with project scrollbar styling */
export function ScrollArea({ children, className }: Props) {
  return (
    <div className={cn("overflow-auto", className)} data-scroll-area>
      {children}
    </div>
  );
}
