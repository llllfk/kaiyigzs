"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
};

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type UiContextValue = {
  toast: (opts: { kind?: ToastKind; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: { kind?: ToastKind; title: string; description?: string }) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [
        ...prev,
        {
          id,
          kind: opts.kind || "info",
          title: opts.title,
          description: opts.description,
        },
      ]);
      window.setTimeout(() => removeToast(id), 3200);
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, description?: string) => toast({ kind: "success", title, description }),
    [toast]
  );
  const error = useCallback(
    (title: string, description?: string) => toast({ kind: "error", title, description }),
    [toast]
  );

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const value = useMemo(
    () => ({ toast, success, error, confirm }),
    [toast, success, error, confirm]
  );

  return (
    <UiContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={removeToast} />
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          description={confirmState.description}
          confirmText={confirmState.confirmText}
          cancelText={confirmState.cancelText}
          danger={confirmState.danger}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
        />
      )}
    </UiContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[150] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto w-full max-w-sm rounded-xl border bg-white px-4 py-3 shadow-[var(--shadow)]",
            t.kind === "success" && "border-emerald-200",
            t.kind === "error" && "border-red-200",
            t.kind === "info" && "border-[var(--color-border)]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  t.kind === "success" && "text-emerald-700",
                  t.kind === "error" && "text-red-600",
                  t.kind === "info" && "text-[var(--color-text)]"
                )}
              >
                {t.title}
              </div>
              {t.description && (
                <div className="mt-1 text-xs text-[var(--color-muted)]">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
              onClick={() => onClose(t.id)}
            >
              关闭
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function ConfirmDialog({
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  danger,
  onCancel,
  onConfirm,
}: ConfirmOptions & { onCancel: () => void; onConfirm: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭确认框"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        data-modal-id="ui-confirm"
        className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow)]"
      >
        <h3 className="text-lg font-bold">{title}</h3>
        {description && (
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="sm:min-w-24" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            className="sm:min-w-24"
            onMouseDown={(e) => {
              // 避免确认后点击穿透到下层 Modal 遮罩导致误关
              e.preventDefault();
              onConfirm();
            }}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
