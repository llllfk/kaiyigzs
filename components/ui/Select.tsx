"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useDelayedTruncateTip } from "@/components/ui/DelayedTooltip";

export type SelectOption = { value: string; label: string };

/** 展开方向：down 向下（默认）/ up 向上 / auto 按剩余空间自动 */
export type SelectPlacement = "down" | "up" | "auto";

type CommonProps = {
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** 下拉展开方向，默认向下 */
  placement?: SelectPlacement;
  /** 是否可搜索过滤选项，默认关闭；开启后在选择框内直接输入，不另出搜索框 */
  searchable?: boolean;
  /**
   * 搜索词变化回调。传入后默认不再本地过滤 options（由调用方按查询结果更新 options），
   * 除非同时设 filterLocal。
   */
  onQueryChange?: (query: string) => void;
  /** 有 onQueryChange 时是否仍本地过滤，默认 false */
  filterLocal?: boolean;
};

type SingleProps = CommonProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

type MultiProps = CommonProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type Props = SingleProps | MultiProps;

type MenuPos = { top: number; left: number; width: number; maxHeight: number; place: "bottom" | "top" };

/** 下拉列表最高高度，超出滚动 */
const SELECT_MENU_MAX_HEIGHT = 240;

export function Select(props: Props) {
  const {
    options,
    placeholder = "请选择",
    disabled,
    className,
    id,
    placement = "down",
    searchable = false,
    onQueryChange,
    filterLocal,
  } = props;
  const shouldFilterLocal =
    searchable && (filterLocal === true || !onQueryChange);
  const multiple = props.multiple === true;
  const value = props.value;
  const onChange = props.onChange;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedValues = useMemo(
    () => (multiple ? (value as string[]) : value ? [value as string] : []),
    [multiple, value]
  );

  const selectedLabels = useMemo(() => {
    if (selectedValues.length === 0) return "";
    return selectedValues
      .map((v) => options.find((o) => o.value === v)?.label || v)
      .join("、");
  }, [options, selectedValues]);

  const triggerLabel =
    selectedValues.length === 0
      ? placeholder
      : multiple && selectedValues.length > 1
        ? `已选 ${selectedValues.length} 项`
        : selectedLabels || placeholder;
  const triggerTip = useDelayedTruncateTip(triggerLabel, 500);

  const filtered = useMemo(() => {
    if (!shouldFilterLocal || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query, shouldFilterLocal]);

  const updatePos = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let place: "bottom" | "top";
    if (placement === "up") {
      place = "top";
    } else if (placement === "auto") {
      place = spaceBelow >= 160 || spaceBelow >= spaceAbove ? "bottom" : "top";
    } else {
      place = "bottom";
    }

    const available = place === "bottom" ? spaceBelow : spaceAbove;
    const maxHeight = Math.min(SELECT_MENU_MAX_HEIGHT, Math.max(120, available));
    const next: MenuPos = {
      top: place === "bottom" ? rect.bottom + 4 : rect.top - 4,
      left: rect.left,
      width: rect.width,
      maxHeight,
      place,
    };
    setPos(next);
    return next;
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    if (searchable) inputRef.current?.focus();
  }, [open, updatePos, options.length, filtered.length, searchable]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      updatePos();
    }
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    // capture：先于弹层内逻辑判断，避免误关仍允许选项 mousedown 选中
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => selectedValues.includes(o.value));
    setActive(idx >= 0 ? idx : 0);
  }, [open, filtered, selectedValues]);

  function pick(v: string) {
    if (multiple) {
      const cur = value as string[];
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      (onChange as (value: string[]) => void)(next);
      return;
    }
    (onChange as (value: string) => void)(v);
    setOpen(false);
    setQuery("");
  }

  function toggleOpen() {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    updatePos();
    setOpen(true);
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        updatePos();
        setOpen(true);
        return;
      }
      const opt = filtered[active];
      if (opt) pick(opt.value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        updatePos();
        setOpen(true);
      } else setActive((i) => Math.min(Math.max(filtered.length - 1, 0), i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        updatePos();
        setOpen(true);
      } else setActive((i) => Math.max(0, i - 1));
    }
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(Math.max(filtered.length - 1, 0), i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) pick(opt.value);
    }
  }

  const isMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          isMobile ? (
            <div
              ref={menuRef}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              className="fixed inset-x-0 bottom-0 z-[200] max-h-[50vh] overflow-y-auto overscroll-contain rounded-t-2xl border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow)]"
            >
              <OptionList
                options={filtered}
                selectedValues={selectedValues}
                multiple={multiple}
                active={active}
                setActive={setActive}
                onPick={pick}
                emptyText={query.trim() ? "无匹配结果" : "暂无选项"}
              />
            </div>
          ) : pos ? (
            <div
              ref={menuRef}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              className="fixed z-[200] max-h-[240px] overflow-y-auto overscroll-contain rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow)]"
              style={{
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
                top: pos.place === "bottom" ? pos.top : undefined,
                bottom: pos.place === "top" ? window.innerHeight - pos.top : undefined,
              }}
            >
              <OptionList
                options={filtered}
                selectedValues={selectedValues}
                multiple={multiple}
                active={active}
                setActive={setActive}
                onPick={pick}
                emptyText={query.trim() ? "无匹配结果" : "暂无选项"}
              />
            </div>
          ) : null,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        ref={buttonRef}
        className="input relative flex w-full items-center justify-between gap-2"
      >
        <button
          type="button"
          id={searchable ? undefined : id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          tabIndex={searchable && open ? -1 : 0}
          className="absolute inset-0 z-0 cursor-pointer rounded-[8px] disabled:cursor-not-allowed"
          onClick={toggleOpen}
          onKeyDown={onTriggerKeyDown}
        />
        <span
          ref={triggerTip.ref as React.RefObject<HTMLSpanElement>}
          className={cn(
            "relative z-0 min-w-0 flex-1 truncate pointer-events-none",
            selectedValues.length === 0 && "text-[var(--color-muted)]",
            searchable && open && "invisible"
          )}
          onMouseEnter={searchable && open ? undefined : triggerTip.onMouseEnter}
          onMouseLeave={triggerTip.onMouseLeave}
          title={multiple && selectedValues.length > 1 ? selectedLabels : undefined}
        >
          {triggerLabel}
        </span>
        <span className="relative z-0 pointer-events-none">
          <Chevron open={open} />
        </span>
        {searchable && (
          <input
            ref={inputRef}
            id={id}
            type="text"
            disabled={disabled}
            tabIndex={open ? 0 : -1}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            className={cn(
              "absolute inset-0 z-[1] rounded-[8px] border-0 bg-white py-[0.4rem] pl-[0.75rem] pr-9 text-sm outline-none",
              open ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            value={query}
            placeholder={selectedLabels || placeholder}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setActive(0);
              onQueryChange?.(next);
            }}
            onKeyDown={onSearchKeyDown}
            onClick={(e) => {
              e.stopPropagation();
              if (!open) toggleOpen();
            }}
          />
        )}
      </div>
      {!(searchable && open) && triggerTip.tip}
      {menu}
    </div>
  );
}

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={cn("shrink-0", open && "rotate-180")}
    >
      <path d="M5.25 7.5L10 12.25L14.75 7.5" />
    </svg>
  );
}

function OptionList({
  options,
  selectedValues,
  multiple,
  active,
  setActive,
  onPick,
  emptyText = "暂无选项",
}: {
  options: SelectOption[];
  selectedValues: string[];
  multiple: boolean;
  active: number;
  setActive: (i: number) => void;
  onPick: (value: string) => void;
  emptyText?: string;
}) {
  return (
    <>
      {options.length === 0 && (
        <div className="px-3 py-2 text-sm text-[var(--color-muted)]">{emptyText}</div>
      )}
      {options.map((opt, idx) => (
        <OptionRow
          key={opt.value}
          opt={opt}
          selected={selectedValues.includes(opt.value)}
          multiple={multiple}
          active={idx === active}
          onActive={() => setActive(idx)}
          onPick={() => onPick(opt.value)}
        />
      ))}
    </>
  );
}

function OptionRow({
  opt,
  selected,
  multiple,
  active,
  onActive,
  onPick,
}: {
  opt: SelectOption;
  selected: boolean;
  multiple: boolean;
  active: boolean;
  onActive: () => void;
  onPick: () => void;
}) {
  const tip = useDelayedTruncateTip(opt.label, 500);

  return (
    <>
      <button
        ref={tip.ref as React.RefObject<HTMLButtonElement>}
        type="button"
        role="option"
        aria-selected={selected}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 truncate px-3 py-2 min-h-9 text-left text-sm hover:bg-[#eff6ff]",
          active && "bg-[#eff6ff]",
          selected && "font-semibold text-[var(--color-accent)]"
        )}
        onMouseEnter={() => {
          onActive();
          tip.onMouseEnter();
        }}
        onMouseLeave={tip.onMouseLeave}
        onMouseDown={(e) => {
          // 在 Modal 等场景用 mousedown 选中，避免 document 先关菜单导致 click 丢失
          e.preventDefault();
          e.stopPropagation();
          onPick();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {multiple ? (
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
              selected
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "border-slate-300 bg-white"
            )}
            aria-hidden
          >
            {selected ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6.2 4.8 8.5 9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{opt.label}</span>
      </button>
      {tip.tip}
    </>
  );
}
