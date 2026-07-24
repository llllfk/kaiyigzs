"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type DrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footer?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  danger?: boolean;
  /** 桌面端宽度 */
  size?: "sm" | "md" | "lg";
  closeOnOverlay?: boolean;
  className?: string;
  bodyClassName?: string;
};

const WIDTH_CLASS: Record<NonNullable<DrawerProps["size"]>, string> = {
  sm: "md:max-w-md",
  md: "md:max-w-lg",
  lg: "md:max-w-xl",
};

/**
 * 抽屉：桌面从右侧滑出，手机改为底部 sheet（与 Modal 小屏体验一致）。
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footerLeft,
  footer,
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  confirmDisabled,
  confirmLoading,
  danger,
  size = "md",
  closeOnOverlay = true,
  className,
  bodyClassName,
}: DrawerProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const top = dialogs[dialogs.length - 1];
      if (top && top.dataset.modalId !== titleId) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, titleId]);

  if (!open || typeof document === "undefined") return null;

  const defaultFooter = (
    <>
      <Button type="button" variant="secondary" onClick={onClose}>
        {cancelText}
      </Button>
      {onConfirm && (
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          disabled={confirmDisabled || confirmLoading}
          onClick={onConfirm}
        >
          {confirmLoading ? "提交中…" : confirmText}
        </Button>
      )}
    </>
  );

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[120] flex justify-center",
        "items-end p-0",
        "md:items-stretch md:justify-end md:p-0"
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭抽屉"
        onClick={() => {
          if (closeOnOverlay) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-modal-id={titleId}
        className={cn(
          "relative flex w-full flex-col overflow-hidden border border-[var(--color-border)] bg-white shadow-[var(--shadow)]",
          // 手机：底部 sheet
          "max-h-[92vh] rounded-t-2xl",
          // 桌面：右侧抽屉
          "md:h-full md:max-h-none md:rounded-none md:border-y-0 md:border-r-0",
          WIDTH_CLASS[size],
          className
        )}
      >
        <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={titleId} className="text-lg font-bold leading-snug">
                {title}
              </h3>
              {description && (
                <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
          {children}
        </div>

        {(footer != null || onConfirm || footerLeft) && (
          <div className="shrink-0 border-t border-[var(--color-border)] bg-white px-5 py-3">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-0">{footerLeft}</div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {footer ?? defaultFooter}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
