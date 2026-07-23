"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Select } from "@/components/ui/Select";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { canManageCompanyVoices } from "@/lib/role-access";
import { cn } from "@/lib/utils";
import {
  DEFAULT_VOICE_ICL_MODEL_TYPE,
  VOICE_ICL_OPTIONS,
  VOICE_SYNTH_TEXT_MAX,
  VOICE_TRAINING_TIMES_LIMIT,
  type VoiceIclModelType,
} from "@/lib/voice-constants";
import { useSessionUser } from "@/components/shared/SessionUserContext";

type VoiceItem = {
  id: number;
  name: string;
  slot_index: number;
  speaker_id?: string | null;
  sample_file_name?: string | null;
  status: string;
  error_message?: string | null;
  has_speaker?: boolean;
  available_training_times?: number | null;
  updated_at?: string;
};

type DemoClip = {
  model_type: number | null;
  label: string;
  demo_audio: string;
};

type OfficialVoiceOpt = {
  speaker_id: string;
  name: string;
  gender: "female" | "male";
  hint?: string | null;
};

type SynthSource = "clone" | "official";

const STATUS_LABEL: Record<string, string> = {
  draft: "待上传训练",
  training: "训练中",
  ready: "可用",
  failed: "训练失败",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  training: "bg-amber-50 text-amber-800",
  ready: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
};

export function VoicesWorkspace() {
  const ui = useUi();
  const me = useSessionUser();
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState(0);
  const [used, setUsed] = useState(0);
  const [voiceConfigured, setVoiceConfigured] = useState(false);
  const [synthQuota, setSynthQuota] = useState<{
    quota_minutes: number;
    used_minutes: number;
    remaining_minutes: number;
    exhausted: boolean;
  } | null>(null);
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [trainOpen, setTrainOpen] = useState(false);
  const [trainTarget, setTrainTarget] = useState<VoiceItem | null>(null);
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [trainIsRetrain, setTrainIsRetrain] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<VoiceItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [demos, setDemos] = useState<DemoClip[]>([]);
  const [activeDemo, setActiveDemo] = useState(0);
  const [previewSource, setPreviewSource] = useState<"demo" | "synthesize" | null>(
    null
  );

  const [synthOpen, setSynthOpen] = useState(false);
  const [synthSource, setSynthSource] = useState<SynthSource>("clone");
  const [synthTarget, setSynthTarget] = useState<VoiceItem | null>(null);
  const [officialVoices, setOfficialVoices] = useState<OfficialVoiceOpt[]>([]);
  const [officialSpeakerId, setOfficialSpeakerId] = useState("");
  const [officialPreviewUrl, setOfficialPreviewUrl] = useState<string | null>(
    null
  );
  const [officialPreviewLoading, setOfficialPreviewLoading] = useState(false);
  const [synthText, setSynthText] = useState("");
  const [synthContext, setSynthContext] = useState("");
  const [synthSpeechRate, setSynthSpeechRate] = useState(0);
  const [synthLoudnessRate, setSynthLoudnessRate] = useState(0);
  const [synthModelType, setSynthModelType] = useState<VoiceIclModelType>(
    DEFAULT_VOICE_ICL_MODEL_TYPE
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadLogged, setDownloadLogged] = useState(false);
  const [synthLogId, setSynthLogId] = useState<number | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const synthResultRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [speakersRes, officialRes] = await Promise.all([
        fetch("/api/voice-speakers"),
        fetch("/api/voice-speakers/official"),
      ]);
      const json = await speakersRes.json();
      if (!speakersRes.ok) {
        ui.error("加载失败", json.error);
        return;
      }
      setSlots(json.data?.slots ?? 0);
      setUsed(json.data?.used ?? 0);
      setVoiceConfigured(Boolean(json.data?.voice_configured));
      const q = json.data?.synth_quota;
      setSynthQuota(
        q && typeof q === "object"
          ? {
              quota_minutes: Number(q.quota_minutes) || 0,
              used_minutes: Number(q.used_minutes) || 0,
              remaining_minutes: Number(q.remaining_minutes) || 0,
              exhausted: Boolean(q.exhausted),
            }
          : null
      );
      setItems(
        (json.data?.items || []).map((row: VoiceItem) => ({
          ...row,
          id: Number(row.id),
        }))
      );

      if (officialRes.ok) {
        const oj = await officialRes.json().catch(() => ({}));
        const list = (oj.data?.items || []) as OfficialVoiceOpt[];
        setOfficialVoices(list);
        setOfficialSpeakerId((prev) =>
          prev && list.some((v) => v.speaker_id === prev)
            ? prev
            : list[0]?.speaker_id || ""
        );
      }
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!audioUrl || !synthOpen) return;
    const t = window.setTimeout(() => {
      synthResultRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [audioUrl, synthOpen]);

  function openTrain(item: VoiceItem, retrain: boolean) {
    if (!canManageCompanyVoices(me || "sales")) {
      ui.error("无权训练", "请联系公司管理员或销售经理上传样音训练");
      return;
    }
    setTrainTarget(item);
    setTrainFile(null);
    setTrainIsRetrain(retrain);
    setTrainOpen(true);
  }

  async function openPreview(item: VoiceItem) {
    if (!item.speaker_id && item.has_speaker === false) {
      ui.error("音色尚未配置", "请联系平台管理员完成配置后再试听");
      return;
    }
    if (item.status === "training") {
      ui.toast({
        kind: "info",
        title: "训练中",
        description: "音色仍在训练，完成后即可试听",
      });
      return;
    }

    setPreviewTarget(item);
    setDemos([]);
    setActiveDemo(0);
    setPreviewSource(null);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/voice-speakers/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("试听失败", json.error);
        setPreviewOpen(false);
        // 火山侧未训练时，管理员/经理可引导上传样音
        if (
          canManageCompanyVoices(me || "sales") &&
          (item.status === "draft" ||
            item.status === "failed" ||
            String(json.error || "").includes("尚未") ||
            String(json.error || "").includes("上传"))
        ) {
          openTrain(item, item.status === "ready");
        }
        return;
      }
      const list = (json.data?.demos || []) as DemoClip[];
      setDemos(list);
      const idx1 = list.findIndex((d) => Number(d.model_type) === 1);
      setActiveDemo(idx1 >= 0 ? idx1 : 0);
      setPreviewSource(
        json.data?.source === "synthesize" ? "synthesize" : "demo"
      );
      // 火山已训练则把本系统状态同步为 ready
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                status: json.data?.status === "ready" ? "ready" : row.status,
                available_training_times:
                  json.data?.available_training_times != null &&
                  Number.isFinite(Number(json.data.available_training_times))
                    ? Number(json.data.available_training_times)
                    : row.available_training_times,
              }
            : row
        )
      );
      setPreviewTarget((prev) =>
        prev && prev.id === item.id
          ? {
              ...prev,
              status: "ready",
              available_training_times:
                json.data?.available_training_times != null
                  ? Number(json.data.available_training_times)
                  : prev.available_training_times,
            }
          : prev
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runTrain(e: React.FormEvent) {
    e.preventDefault();
    if (!trainTarget || !trainFile) {
      ui.error("请上传样音");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("action", "retrain");
      fd.set("file", trainFile);
      const res = await fetch(`/api/voice-speakers/${trainTarget.id}`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error(trainIsRetrain ? "重新训练失败" : "训练失败", json.error);
        await load();
        return;
      }
      ui.success(trainIsRetrain ? "重新训练完成" : "训练完成", trainTarget.name);
      setTrainOpen(false);
      setTrainFile(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function removeVoice(item: VoiceItem) {
    if (!canManageCompanyVoices(me || "sales")) {
      ui.error("无权删除", "请联系公司管理员或销售经理");
      return;
    }
    const ok = await ui.confirm({
      title: "删除该音色？",
      description: `将删除「${item.name}」，释放公司槽位。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/voice-speakers/${item.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      ui.error("删除失败", json.error);
      return;
    }
    ui.success("已删除");
    await load();
  }

  function openSynth(
    item: VoiceItem | null,
    preferredModelType?: VoiceIclModelType | number | null,
    preferredSource: SynthSource = "clone"
  ) {
    setSynthSource(preferredSource);
    setSynthTarget(item);
    setSynthText("");
    setSynthContext("");
    setSynthSpeechRate(0);
    setSynthLoudnessRate(0);
    const mt = Number(preferredModelType);
    setSynthModelType(
      mt === 1 || mt === 5 ? mt : DEFAULT_VOICE_ICL_MODEL_TYPE
    );
    if (preferredSource === "official" && !officialSpeakerId && officialVoices[0]) {
      setOfficialSpeakerId(officialVoices[0].speaker_id);
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDownloadLogged(false);
    setSynthLogId(null);
    setAudioDurationSec(null);
    setOfficialPreviewUrl(null);
    setSynthOpen(true);
  }

  async function runSynth(e: React.FormEvent) {
    e.preventDefault();
    if (!synthText.trim()) {
      ui.error("请填写文案");
      return;
    }
    if (synthText.trim().length > VOICE_SYNTH_TEXT_MAX) {
      ui.error(`文案不能超过 ${VOICE_SYNTH_TEXT_MAX} 字`);
      return;
    }
    if (synthSource === "clone" && !synthTarget) {
      ui.error("请选择复刻音色");
      return;
    }
    if (synthSource === "official") {
      if (!officialVoices.length) {
        ui.error("平台尚未开放官方音色");
        return;
      }
      if (!officialSpeakerId) {
        ui.error("请选择官方音色");
        return;
      }
    }

    const ok = await ui.confirm({
      title: "确认开始合成？",
      confirmText: "开始合成",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/voices/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          synthSource === "official"
            ? {
                action: "synthesize",
                source: "official",
                speaker: officialSpeakerId,
                text: synthText.trim(),
                context_text: synthContext.trim() || undefined,
                speech_rate: synthSpeechRate,
                loudness_rate: synthLoudnessRate,
              }
            : {
                action: "synthesize",
                source: "clone",
                speaker_id: synthTarget!.id,
                text: synthText.trim(),
                context_text: synthContext.trim() || undefined,
                speech_rate: synthSpeechRate,
                loudness_rate: synthLoudnessRate,
                model_type: synthModelType,
              }
        ),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        ui.error("合成失败", json.error || res.statusText);
        return;
      }
      const logHeader = res.headers.get("X-Voice-Synth-Log-Id");
      const logId = logHeader ? Number(logHeader) : null;
      setSynthLogId(Number.isFinite(logId) && logId ? logId : null);
      setAudioDurationSec(null);
      const ctxHeader = res.headers.get("X-Voice-Context-Applied");
      const appliedCtx = ctxHeader ? decodeURIComponent(ctxHeader) : "";
      const blob = await res.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setDownloadLogged(false);
      if (appliedCtx) {
        ui.success("合成完成", `已下发语气指令：${appliedCtx}`);
      } else if (synthContext.trim()) {
        ui.success("合成完成", "本次未下发语气指令");
      } else {
        ui.success("合成完成");
      }
      // 静默刷新合成分钟用量（不打断弹窗）
      void (async () => {
        try {
          const res = await fetch("/api/voice-speakers");
          const json = await res.json().catch(() => ({}));
          if (!res.ok) return;
          const q = json.data?.synth_quota;
          if (q && typeof q === "object") {
            setSynthQuota({
              quota_minutes: Number(q.quota_minutes) || 0,
              used_minutes: Number(q.used_minutes) || 0,
              remaining_minutes: Number(q.remaining_minutes) || 0,
              exhausted: Boolean(q.exhausted),
            });
          }
        } catch {
          /* ignore */
        }
      })();
    } finally {
      setSubmitting(false);
    }
  }

  async function logSynthDownload() {
    if (downloadLogged) return;
    if (synthSource === "clone" && !synthTarget) return;
    setDownloadLogged(true);
    try {
      const official = officialVoices.find(
        (v) => v.speaker_id === officialSpeakerId
      );
      await fetch("/api/voices/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          synthSource === "official"
            ? {
                action: "log_download",
                source: "official",
                speaker: officialSpeakerId,
                speaker_name: official?.name,
                text: synthText.trim(),
                synth_log_id: synthLogId || undefined,
                duration_sec: audioDurationSec || undefined,
              }
            : {
                action: "log_download",
                source: "clone",
                speaker_id: synthTarget!.id,
                text: synthText.trim(),
                model_type: synthModelType,
                synth_log_id: synthLogId || undefined,
                duration_sec: audioDurationSec || undefined,
              }
        ),
      });
    } catch {
      setDownloadLogged(false);
    }
  }

  function onSynthAudioLoadedMetadata(e: React.SyntheticEvent<HTMLAudioElement>) {
    const d = e.currentTarget.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const sec = Math.round(d * 10) / 10;
    setAudioDurationSec(sec);
    if (!synthLogId) return;
    void fetch("/api/voices/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report_duration",
        synth_log_id: synthLogId,
        duration_sec: sec,
      }),
    }).catch(() => {});
  }

  async function previewOfficialVoice() {
    if (!officialSpeakerId) {
      ui.error("请选择官方音色");
      return;
    }
    setOfficialPreviewLoading(true);
    try {
      const res = await fetch("/api/voices/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          source: "official",
          speaker: officialSpeakerId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("试听失败", json.error || res.statusText);
        return;
      }
      const url = String(json.data?.demo_audio || "");
      if (!url) {
        ui.error("试听失败", "未返回音频");
        return;
      }
      setOfficialPreviewUrl(url);
    } finally {
      setOfficialPreviewLoading(false);
    }
  }

  async function closeSynthModal() {
    if (audioUrl && !downloadLogged) {
      const ok = await ui.confirm({
        title: "尚未下载合成音频",
        description:
          "系统不会自动保存本次合成结果。关闭后将无法再播放，请确认已下载 MP3，或仍要直接关闭。",
        confirmText: "仍要关闭",
        cancelText: "返回下载",
        danger: true,
      });
      if (!ok) return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDownloadLogged(false);
    setSynthLogId(null);
    setAudioDurationSec(null);
    setOfficialPreviewUrl(null);
    setSynthOpen(false);
  }

  const currentDemo = demos[activeDemo] || null;
  const canManage = canManageCompanyVoices(me || "sales");

  const clonePct =
    slots > 0 ? Math.min(100, Math.round((used / slots) * 100)) : 0;
  const synthPct =
    synthQuota && synthQuota.quota_minutes > 0
      ? Math.min(
          100,
          Math.round((synthQuota.used_minutes / synthQuota.quota_minutes) * 100)
        )
      : 0;
  const synthWarn =
    Boolean(synthQuota?.exhausted) ||
    (synthQuota != null && synthQuota.quota_minutes <= 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--color-muted)]">
          每个可用音色显示为一张卡片。
          {canManage
            ? "控制台已训练过的音色可直接点击试听；未训练的再上传样音。"
            : "可试听已就绪音色并合成文案；训练与删除请联系管理员或销售经理。"}
        </p>
        <Button
          type="button"
          className="shrink-0"
          onClick={() => {
            if (synthQuota?.exhausted || (synthQuota && synthQuota.quota_minutes <= 0)) {
              ui.error(
                "无法合成",
                synthQuota?.quota_minutes
                  ? `合成分钟已用尽（${synthQuota.used_minutes}/${synthQuota.quota_minutes} 分钟）`
                  : "公司未开通合成分钟数，请联系平台管理员"
              );
              return;
            }
            openSynth(
              items.find((i) => i.status === "ready") || null,
              undefined,
              officialVoices.length && !items.some((i) => i.status === "ready")
                ? "official"
                : "clone"
            );
          }}
        >
          语音合成
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-sky-800/70">复刻槽位</div>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                slots <= 0
                  ? "bg-slate-100 text-slate-600"
                  : used >= slots
                    ? "bg-amber-50 text-amber-800"
                    : "bg-sky-100 text-sky-800"
              }`}
            >
              {slots <= 0 ? "未开通" : used >= slots ? "已满" : "可用"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums leading-none text-sky-950">
              {used}
            </span>
            <span className="text-xs text-sky-800/60">/ {slots}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-sky-100">
            <div
              className={`h-full rounded-full transition-all ${
                slots <= 0
                  ? "bg-slate-300"
                  : used >= slots
                    ? "bg-amber-500"
                    : "bg-sky-500"
              }`}
              style={{ width: `${slots > 0 ? clonePct : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-sky-800/65">
            平台分配的复刻音色数量
          </p>
        </div>

        <div
          className={`rounded-xl border px-3 py-2.5 shadow-sm ${
            synthWarn
              ? "border-amber-300/90 bg-gradient-to-br from-amber-50 to-white ring-1 ring-amber-300/60"
              : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div
              className={`text-xs ${
                synthWarn ? "text-amber-800/70" : "text-emerald-800/70"
              }`}
            >
              合成分钟
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                !synthQuota || synthQuota.quota_minutes <= 0
                  ? "bg-slate-100 text-slate-600"
                  : synthQuota.exhausted
                    ? "bg-rose-50 text-rose-700"
                    : synthPct >= 80
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {!synthQuota || synthQuota.quota_minutes <= 0
                ? "未开通"
                : synthQuota.exhausted
                  ? "已用尽"
                  : `剩 ${synthQuota.remaining_minutes}`}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-lg font-bold tabular-nums leading-none ${
                synthWarn ? "text-amber-950" : "text-emerald-950"
              }`}
            >
              {synthQuota ? synthQuota.used_minutes : "—"}
            </span>
            <span
              className={`text-xs ${
                synthWarn ? "text-amber-800/60" : "text-emerald-800/60"
              }`}
            >
              / {synthQuota ? synthQuota.quota_minutes : "—"} 分
            </span>
          </div>
          <div
            className={`mt-2 h-1 overflow-hidden rounded-full ${
              synthWarn ? "bg-amber-100" : "bg-emerald-100"
            }`}
          >
            <div
              className={`h-full rounded-full transition-all ${
                !synthQuota || synthQuota.quota_minutes <= 0
                  ? "bg-slate-300"
                  : synthQuota.exhausted
                    ? "bg-rose-500"
                    : synthPct >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
              }`}
              style={{
                width: `${
                  synthQuota && synthQuota.quota_minutes > 0 ? synthPct : 0
                }%`,
              }}
            />
          </div>
          <p
            className={`mt-1.5 text-[11px] leading-snug ${
              synthWarn ? "text-amber-800/65" : "text-emerald-800/65"
            }`}
          >
            全公司公用 · 复刻与官方正式合成共用
          </p>
        </div>

        <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-violet-800/70">官方音色</div>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                officialVoices.length
                  ? "bg-violet-100 text-violet-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {officialVoices.length ? "已开放" : "未开放"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums leading-none text-violet-950">
              {officialVoices.length}
            </span>
            <span className="text-xs text-violet-800/60">个可用</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-violet-100">
            <div
              className={`h-full rounded-full ${
                officialVoices.length
                  ? "w-full bg-violet-500"
                  : "w-0 bg-slate-300"
              }`}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-violet-800/65">
            {voiceConfigured
              ? "合成时可选官方音色"
              : "未检测到豆包 API Key"}
          </p>
        </div>
      </div>

      <div
        className="border-t border-[var(--color-border)]"
        role="separator"
        aria-hidden
      />

      {slots <= 0 && (
        <div className="surface p-4 text-sm text-[var(--color-muted)]">
          当前公司未开通声音复刻。如需使用，请联系平台管理员开通。
        </div>
      )}

      {slots > 0 && !loading && items.length === 0 && (
        <div className="surface p-4 text-sm text-[var(--color-muted)]">
          平台尚未为本公司分配音色。请联系平台管理员配置后再上传样音。
        </div>
      )}

      {loading && <CardListSkeleton count={2} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!loading &&
          items.map((item) => {
            const canTrain =
              item.has_speaker !== false &&
              (item.status === "draft" ||
                item.status === "failed" ||
                item.status === "ready");
            const clickable =
              item.status === "ready" ||
              item.status === "draft" ||
              item.status === "failed";
            return (
              <div
                key={item.id}
                role={clickable && item.status !== "training" ? "button" : undefined}
                tabIndex={clickable && item.status !== "training" ? 0 : undefined}
                onClick={() => {
                  if (clickable && item.status !== "training") void openPreview(item);
                }}
                onKeyDown={(e) => {
                  if (
                    clickable &&
                    item.status !== "training" &&
                    (e.key === "Enter" || e.key === " ")
                  ) {
                    e.preventDefault();
                    void openPreview(item);
                  }
                }}
                className={cn(
                  "surface group relative flex flex-col p-5 text-left transition",
                  clickable && item.status !== "training"
                    ? "cursor-pointer hover:border-[var(--color-primary)] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                    : "opacity-90"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold tracking-tight">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      槽位 {item.slot_index + 1}
                      {item.speaker_id ? (
                        <>
                          {" · "}
                          <span className="font-mono">{item.speaker_id}</span>
                        </>
                      ) : (
                        " · 尚未配置"
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                      STATUS_TONE[item.status] || STATUS_TONE.draft
                    )}
                  >
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
                  <div className="text-xs text-[var(--color-muted)]">
                    {item.available_training_times != null
                      ? `剩余训练 ${item.available_training_times}/${VOICE_TRAINING_TIMES_LIMIT}`
                      : "剩余训练未同步"}
                    {item.sample_file_name
                      ? ` · 样音 ${item.sample_file_name}`
                      : ""}
                  </div>
                  {item.error_message && (
                    <div className="line-clamp-2 text-xs text-red-600">
                      {item.error_message}
                    </div>
                  )}
                  {!item.speaker_id && (
                    <div className="text-sm text-[var(--color-muted)]">
                      等待平台配置音色
                    </div>
                  )}
                </div>

                <div
                  className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {item.speaker_id && item.status !== "training" && (
                    <Button
                      type="button"
                      className="!px-3 !py-1.5 text-xs"
                      variant="secondary"
                      onClick={() => void openPreview(item)}
                    >
                      试听
                    </Button>
                  )}
                  {canManage &&
                    (item.status === "draft" || item.status === "failed") && (
                    <Button
                      type="button"
                      className="!px-3 !py-1.5 text-xs"
                      disabled={!canTrain}
                      onClick={() => openTrain(item, false)}
                    >
                      上传训练
                    </Button>
                  )}
                  {item.status === "ready" && (
                    <>
                      <Button
                        type="button"
                        className="!px-3 !py-1.5 text-xs"
                        variant="secondary"
                        onClick={() => openSynth(item)}
                      >
                        合成
                      </Button>
                      {canManage && (
                        <Button
                          type="button"
                          className="!px-3 !py-1.5 text-xs"
                          variant="secondary"
                          onClick={() => openTrain(item, true)}
                        >
                          重新训练
                        </Button>
                      )}
                    </>
                  )}
                  {canManage && (
                    <Button
                      type="button"
                      className="!px-3 !py-1.5 text-xs"
                      variant="secondary"
                      onClick={() => void removeVoice(item)}
                    >
                      删除
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <Modal
        open={previewOpen}
        title={
          previewTarget
            ? `试听 · ${previewTarget.name}`
            : "试听"
        }
        description={
          previewTarget?.speaker_id
            ? "平台音色配置已就绪"
            : "试听当前音色效果"
        }
        onClose={() => setPreviewOpen(false)}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPreviewOpen(false)}
            >
              关闭
            </Button>
            {previewTarget?.status === "ready" && (
              <Button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  if (previewTarget) {
                    openSynth(previewTarget, currentDemo?.model_type);
                  }
                }}
              >
                去合成文案
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {previewLoading && (
            <div className="text-sm text-[var(--color-muted)]">
              正在获取「{previewTarget?.speaker_id || previewTarget?.name}」试听音频…
            </div>
          )}
          {!previewLoading && demos.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">
              暂无可用试听。
              {canManage ? "可重新训练生成 demo，或直接合成文案。" : "可直接合成文案。"}
            </div>
          )}
          {!previewLoading && demos.length > 0 && (
            <>
              {previewSource === "synthesize" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  火山 demo 不可用，已用短文本合成试听（可能产生合成费用）。
                </div>
              )}
              {demos.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {demos.map((d, i) => (
                    <button
                      key={`${d.model_type}-${i}`}
                      type="button"
                      onClick={() => setActiveDemo(i)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
                        i === activeDemo
                          ? "bg-sky-50 text-sky-900 ring-2 ring-sky-500"
                          : "bg-white text-[var(--color-text)] ring-[var(--color-border)] hover:bg-slate-50"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
              {currentDemo && (
                <div className="field">
                  <label>{currentDemo.label}</label>
                  <audio
                    key={currentDemo.demo_audio.slice(0, 80)}
                    controls
                    autoPlay
                    src={currentDemo.demo_audio}
                    className="w-full"
                  />
                  {previewSource === "demo" && (
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      demo 约 1 小时有效；无法播放请关闭后重新点击。正式合成可在弹窗中选择效果版本。
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={trainOpen}
        title={
          trainTarget
            ? `${trainIsRetrain ? "重新训练" : "上传训练"} · ${trainTarget.name}`
            : "上传训练"
        }
        description="建议 10–30 秒、安静环境、单人说话。将使用平台已配置的音色提交训练。"
        onClose={() => setTrainOpen(false)}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTrainOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" form="voice-train-form" disabled={submitting}>
              {submitting ? "训练中…" : "上传并训练"}
            </Button>
          </>
        }
      >
        <form id="voice-train-form" onSubmit={runTrain} className="space-y-4">
          <div className="field">
            <label>样音文件</label>
            <FileDropzone
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
              value={trainFile}
              onFile={setTrainFile}
              hint="最大 10MB"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={synthOpen}
        title={
          synthSource === "official"
            ? "语音合成 · 官方音色"
            : synthTarget
              ? `语音合成 · ${synthTarget.name}`
              : "语音合成"
        }
        description="正式合成会按火山计费。生成后请自行下载 MP3，系统不会自动保存。"
        onClose={() => void closeSynthModal()}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void closeSynthModal()}
            >
              关闭
            </Button>
            <Button type="submit" form="voice-synth-form" disabled={submitting}>
              {submitting ? "合成中…" : "合成"}
            </Button>
          </>
        }
      >
        <form id="voice-synth-form" onSubmit={runSynth} className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            合成结果仅在本弹窗临时可听，关闭后即失效。请及时点击「下载
            MP3」保存到本地，系统不会自动存档。
          </div>

          <div className="field">
            <label>音色来源</label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "clone" as const, label: "声音复刻", hint: "公司 Speaker" },
                  { id: "official" as const, label: "官方音色", hint: "平台开放" },
                ] as const
              ).map((opt) => {
                const selected = synthSource === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSynthSource(opt.id);
                      setOfficialPreviewUrl(null);
                      if (audioUrl) {
                        URL.revokeObjectURL(audioUrl);
                        setAudioUrl(null);
                        setDownloadLogged(false);
                      }
                    }}
                    className={cn(
                      "rounded-md px-3 py-2 text-left text-xs font-medium ring-1 ring-inset transition",
                      selected
                        ? "bg-sky-50 text-sky-900 ring-2 ring-sky-500"
                        : "bg-white text-[var(--color-text)] ring-[var(--color-border)] hover:bg-slate-50"
                    )}
                  >
                    <div>{opt.label}</div>
                    <div
                      className={cn(
                        "mt-0.5 font-normal",
                        selected ? "text-sky-700" : "text-[var(--color-muted)]"
                      )}
                    >
                      {opt.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {synthSource === "clone" ? (
            <div className="field">
              <label>复刻音色</label>
              <Select
                value={synthTarget?.id != null ? String(synthTarget.id) : ""}
                onChange={(v) => {
                  const id = Number(v);
                  setSynthTarget(
                    items.find((i) => Number(i.id) === id) || null
                  );
                }}
                placeholder="请选择已就绪的复刻音色"
                options={items
                  .filter((i) => i.status === "ready")
                  .map((i) => ({ value: String(i.id), label: i.name }))}
              />
              {!items.some((i) => i.status === "ready") && (
                <p className="mt-1 text-xs text-amber-800">
                  暂无可用复刻音色，请先完成训练，或改用官方音色。
                </p>
              )}
            </div>
          ) : officialVoices.length === 0 ? (
            <div className="rounded-md border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm text-[var(--color-muted)]">
              平台尚未开放官方音色。请联系超管在「音色管理」中勾选启用。
            </div>
          ) : (
            <div className="field">
              <label>官方音色</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={officialSpeakerId}
                    onChange={(v) => {
                      setOfficialSpeakerId(v);
                      setOfficialPreviewUrl(null);
                    }}
                    searchable
                    placeholder="请选择官方音色"
                    options={officialVoices.map((v) => ({
                      value: v.speaker_id,
                      label: `${v.name}${
                        v.gender === "female" ? " · 女声" : " · 男声"
                      }${v.hint ? ` · ${v.hint}` : ""}`,
                    }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={officialPreviewLoading || !officialSpeakerId}
                  onClick={() => void previewOfficialVoice()}
                >
                  {officialPreviewLoading ? "试听中…" : "试听"}
                </Button>
              </div>
              {officialPreviewUrl && (
                <audio
                  key={officialPreviewUrl}
                  controls
                  autoPlay
                  src={officialPreviewUrl}
                  className="mt-2 w-full"
                />
              )}
            </div>
          )}

          <div className="field">
            <div className="flex items-end justify-between gap-2">
              <label>文案</label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  synthText.length > VOICE_SYNTH_TEXT_MAX
                    ? "text-rose-600"
                    : "text-[var(--color-muted)]"
                )}
              >
                {synthText.length}/{VOICE_SYNTH_TEXT_MAX}
              </span>
            </div>
            <textarea
              className="input min-h-28"
              value={synthText}
              onChange={(e) =>
                setSynthText(e.target.value.slice(0, VOICE_SYNTH_TEXT_MAX))
              }
              placeholder="输入要朗读的文字"
              maxLength={VOICE_SYNTH_TEXT_MAX}
              required
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              单次合成最多 {VOICE_SYNTH_TEXT_MAX} 字
            </p>
          </div>
          {synthSource === "clone" && (
            <div className="field">
              <label>效果版本</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_ICL_OPTIONS.map((opt) => {
                  const selected = synthModelType === opt.modelType;
                  return (
                    <button
                      key={opt.modelType}
                      type="button"
                      onClick={() => setSynthModelType(opt.modelType)}
                      className={cn(
                        "rounded-md px-3 py-2 text-left text-xs font-medium ring-1 ring-inset transition",
                        selected
                          ? "bg-sky-50 text-sky-900 ring-sky-500 ring-2"
                          : "bg-white text-[var(--color-text)] ring-[var(--color-border)] hover:bg-slate-50"
                      )}
                      title={opt.hint}
                    >
                      <div className={selected ? "text-sky-950" : undefined}>
                        {opt.label}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 font-normal",
                          selected ? "text-sky-700" : "text-[var(--color-muted)]"
                        )}
                      >
                        {opt.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="field">
            <label>语气提示</label>
            <input
              className="input"
              value={synthContext}
              onChange={(e) => setSynthContext(e.target.value)}
              placeholder="例如：最悲伤、特别兴奋（也可写完整指令）"
            />
          </div>
          <div className="field">
            <div className="mb-1 flex items-center justify-between text-sm">
              <label className="!mb-0">语速</label>
              <span className="text-[var(--color-muted)]">{synthSpeechRate}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)]">低</span>
              <input
                type="range"
                className="w-full"
                min={-50}
                max={100}
                step={1}
                value={synthSpeechRate}
                onChange={(e) => setSynthSpeechRate(Number(e.target.value))}
              />
              <span className="text-xs text-[var(--color-muted)]">高</span>
            </div>
          </div>
          <div className="field">
            <div className="mb-1 flex items-center justify-between text-sm">
              <label className="!mb-0">音量</label>
              <span className="text-[var(--color-muted)]">{synthLoudnessRate}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)]">低</span>
              <input
                type="range"
                className="w-full"
                min={-50}
                max={100}
                step={1}
                value={synthLoudnessRate}
                onChange={(e) => setSynthLoudnessRate(Number(e.target.value))}
              />
              <span className="text-xs text-[var(--color-muted)]">高</span>
            </div>
          </div>
          {audioUrl && (
            <div ref={synthResultRef} className="field">
              <label>合成结果</label>
              <audio
                controls
                src={audioUrl}
                className="w-full"
                onLoadedMetadata={onSynthAudioLoadedMetadata}
              />
              <a
                className="mt-2 inline-block text-sm font-medium text-[var(--color-primary)]"
                href={audioUrl}
                download={
                  synthSource === "official"
                    ? `tts-official-${officialSpeakerId || "voice"}.mp3`
                    : `tts-${synthTarget?.id || "voice"}.mp3`
                }
                onClick={() => void logSynthDownload()}
              >
                下载 MP3（请务必保存）
              </a>
              {!downloadLogged && (
                <p className="mt-1 text-xs text-amber-800">
                  尚未记录下载。关闭前请先下载，否则将无法再次获取本段音频。
                </p>
              )}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
