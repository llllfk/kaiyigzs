"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  accept?: string;
  disabled?: boolean;
  multiple?: boolean;
  /** 受控：已选文件（单选） */
  value?: File | null;
  onFile?: (file: File | null) => void;
  onFiles?: (files: File[]) => void;
  /** 选完立刻回调且不展示文件名（适合选完即上传） */
  clearAfterSelect?: boolean;
  label?: string;
  hint?: string;
  className?: string;
};

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({
  accept,
  disabled,
  multiple,
  value,
  onFile,
  onFiles,
  clearAfterSelect,
  label = "点击选择或拖拽文件到此处",
  hint,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [innerFile, setInnerFile] = useState<File | null>(null);

  const shown = value !== undefined ? value : innerFile;

  function applyFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const arr = Array.from(list);
    if (!arr.length) return;

    if (multiple) {
      onFiles?.(arr);
      if (!clearAfterSelect && value === undefined) {
        setInnerFile(arr[0] || null);
      }
    } else {
      const file = arr[0] || null;
      onFile?.(file);
      if (!clearAfterSelect && value === undefined) {
        setInnerFile(file);
      }
    }

    if (clearAfterSelect && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function clear() {
    onFile?.(null);
    onFiles?.([]);
    setInnerFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("w-full", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        className={cn(
          "relative flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
          disabled
            ? "cursor-not-allowed border-[var(--color-border)] bg-slate-50 opacity-60"
            : dragging
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-[var(--color-border)] bg-slate-50/80 hover:border-[var(--color-accent)]/50 hover:bg-slate-50",
          shown && !clearAfterSelect && "min-h-[5.5rem]"
        )}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (disabled) return;
          applyFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => applyFiles(e.target.files)}
          onClick={(e) => e.stopPropagation()}
        />
        {shown && !clearAfterSelect ? (
          <>
            <div className="max-w-full truncate text-sm font-medium text-[var(--color-text)]">
              {shown.name}
            </div>
            <div className="text-xs text-[var(--color-muted)]">
              {formatSize(shown.size)} · 点击可更换，也可拖入新文件
            </div>
            <button
              type="button"
              className="mt-1 text-xs text-[var(--color-accent)] hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
            >
              清除
            </button>
          </>
        ) : (
          <>
            <div
              className={cn(
                "text-sm font-medium",
                dragging ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"
              )}
            >
              {dragging ? "松开以上传" : label}
            </div>
            {hint ? (
              <div className="max-w-sm text-xs text-[var(--color-muted)]">{hint}</div>
            ) : (
              <div className="text-xs text-[var(--color-muted)]">支持点击选择或拖拽放入</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
