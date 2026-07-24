"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** footer 左侧额外内容 */
  footerLeft?: React.ReactNode;
  /** 自定义 footer；默认提供取消按钮 */
  footer?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  danger?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlay?: boolean;
  className?: string;
  bodyClassName?: string;
  /** 外层 portal 容器 class（可用于提高叠层 z-index） */
  portalClassName?: string;
};

const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
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
  portalClassName,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // 叠层时只关最顶层 dialog，避免确认框 Esc 误关下层上传弹窗
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
        "fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4",
        portalClassName
      )}
    >      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭弹窗"
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
          "relative flex w-full max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow)] sm:rounded-2xl",
          SIZE_CLASS[size],
          className
        )}
      >
        {/* Header — fixed */}
        <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
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

        {/* Body — scrollable */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
          {children}
        </div>

        {/* Footer — fixed */}
        <div className="shrink-0 border-t border-[var(--color-border)] bg-white px-5 py-3">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-0">{footerLeft}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer ?? defaultFooter}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
