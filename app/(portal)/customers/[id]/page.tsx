"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { Modal } from "@/components/ui/Modal";
import {
  STAGE_LABELS,
  CUSTOMER_STATUS_OPTIONS,
  INTENT_LABELS,
  SENTIMENT_LABELS,
  MEDIA_KIND_LABELS,
  labelOf,
  type CustomerStatus,
  type OpportunityStage,
} from "@/types";
import { useUi } from "@/components/ui/Feedback";
import { StatusTag } from "@/components/ui/StatusTag";
import { FollowTypeTag } from "@/components/ui/FollowTypeTag";
import { DetailPageSkeleton } from "@/components/ui/Skeleton";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { IconButton } from "@/components/ui/IconButton";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { TagChip, TruncateWithDelayTip } from "@/components/ui/DelayedTooltip";
import {
  formatAudioDuration,
  taskDueUrgency,
  TASK_URGENCY_LABELS,
} from "@/lib/utils";
import { probeAudioDurationMs } from "@/lib/audio-duration";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { effectiveCrmRole } from "@/lib/role-access";
import { useAppRouter } from "@/hooks/useAppRouter";
import dynamic from "next/dynamic";

const ContextChat = dynamic(
  () => import("@/components/ai/ContextChat").then((m) => m.ContextChat),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center px-3 text-xs text-[var(--color-muted)]">
        AI 助手加载中…
      </div>
    ),
  }
);

type NextStepItem = {
  id: string;
  kind: "task" | "stage" | "ai" | "opp" | "follow";
  title: string;
  detail?: string;
  tone: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function CustomerDetailPage() {
  const ui = useUi();
  const router = useAppRouter();
  const user = useSessionUser();
  const role = effectiveCrmRole(user);
  const canDeleteCustomer =
    role === "company_admin" || role === "sales_manager";
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detailSeed = pageCachePeek<{ data?: unknown }>(`/api/customers/${id}`);
  const [data, setData] = useState<any>(() => detailSeed?.data || null);
  const internalCustomerId = Number(data?.id || 0);

  useEffect(() => {
    const publicId = String(data?.public_id || "");
    if (publicId && id !== publicId) {
      window.history.replaceState(window.history.state, "", `/customers/${publicId}`);
    }
  }, [data?.public_id, id]);
  const [error, setError] = useState("");
  const [followOpen, setFollowOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [followType, setFollowType] = useState("call");
  const [followContent, setFollowContent] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [followTime, setFollowTime] = useState("09:00");
  const [oppTitle, setOppTitle] = useState("");
  const [oppStage, setOppStage] = useState("lead");
  const [oppDate, setOppDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [compView, setCompView] = useState<{
    name: string;
    id?: number;
    summary?: string | null;
    strengths?: string | null;
    weaknesses?: string | null;
    playbook?: string | null;
    inLibrary: boolean;
  } | null>(null);
  const [compLibrary, setCompLibrary] = useState<
    {
      id: number;
      name: string;
      summary: string | null;
      strengths: string | null;
      weaknesses: string | null;
      playbook: string | null;
    }[]
  >([]);
  const [editForm, setEditForm] = useState({
    company_name: "",
    name: "",
    phone: "",
    industry: "",
    source: "",
    status: "active" as CustomerStatus,
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState("call");
  const [uploadTranscript, setUploadTranscript] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDurationMs, setUploadDurationMs] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"form" | "review">("form");
  const [uploadMediaId, setUploadMediaId] = useState<number | null>(null);
  const [uploadDraft, setUploadDraft] = useState<Record<string, unknown> | null>(
    null
  );
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadPains, setUploadPains] = useState("");
  const [uploadComps, setUploadComps] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [editMedia, setEditMedia] = useState<{
    id: number;
    file_name: string;
    kind: string;
  } | null>(null);
  const [editMediaKind, setEditMediaKind] = useState("call");
  const [editMediaTranscript, setEditMediaTranscript] = useState("");
  const [editMediaPains, setEditMediaPains] = useState("");
  const [editMediaComps, setEditMediaComps] = useState("");
  const [editMediaReanalyze, setEditMediaReanalyze] = useState(false);
  const [editMediaPhase, setEditMediaPhase] = useState<"form" | "review">("form");
  const [editMediaDraft, setEditMediaDraft] = useState<Record<string, unknown> | null>(
    null
  );
  const [editMediaSummary, setEditMediaSummary] = useState("");
  const [editMediaSaving, setEditMediaSaving] = useState(false);
  const [editMediaLoading, setEditMediaLoading] = useState(false);
  const [aiBanner, setAiBanner] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState<string | null>(null);
  const [draftTick, setDraftTick] = useState(0);
  const [tasks, setTasks] = useState<
    {
      id: number;
      title: string;
      status: string;
      source: string;
      due_at: string | null;
      opportunity_id?: number | null;
      opportunity_title?: string | null;
      owner_name?: string | null;
    }[]
  >([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("18:00");
  const [taskOppId, setTaskOppId] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  async function load(opts?: { force?: boolean } | boolean) {
    const force = (typeof opts === "boolean" ? opts : opts?.force === true) || /^\d+$/.test(id);
    const url = `/api/customers/${id}`;
    const cached = pageCachePeek<{ data?: unknown }>(url);
    if (!force && cached?.data) {
      setData(cached.data);
      setError("");
      return;
    }
    if (cached?.data) setData(cached.data);
    const { res, json } = await pageCacheFetchJson<{ data?: unknown; error?: string }>(url, {
      force,
    });
    if (!res.ok) setError(json.error || "加载失败");
    else {
      setData(json.data);
      const publicId = String((json.data as { public_id?: string } | undefined)?.public_id || "");
      if (publicId && id !== publicId) {
        window.history.replaceState(window.history.state, "", `/customers/${publicId}`);
      }
    }
  }

  async function loadTasks() {
    const res = await fetch(`/api/tasks?customer_id=${internalCustomerId}`);
    const json = await res.json();
    if (res.ok) setTasks(json.data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (internalCustomerId) void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internalCustomerId]);

  useEffect(() => {
    if (!data?.customer) return;
    void (async () => {
      const res = await fetch("/api/competitors");
      const json = await res.json();
      if (res.ok) setCompLibrary(json.data || []);
    })();
  }, [data?.customer?.id]);

  function openCompetitorChip(name: string) {
    const lower = name.toLowerCase();
    const hit =
      compLibrary.find((c) => c.name.toLowerCase() === lower) ||
      compLibrary.find(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          lower.includes(c.name.toLowerCase())
      );
    if (hit) {
      setCompView({
        name: hit.name,
        id: hit.id,
        summary: hit.summary,
        strengths: hit.strengths,
        weaknesses: hit.weaknesses,
        playbook: hit.playbook,
        inLibrary: true,
      });
    } else {
      setCompView({ name, inLibrary: false });
    }
  }

  function openUpload() {
    setUploadKind("call");
    resetUploadModal();
    setRecognizing(false);
    setUploadOpen(true);
  }

  async function recognizeTranscript() {
    if (!uploadFile) {
      ui.error("请先上传录音文件");
      return;
    }
    setRecognizing(true);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      if (data?.customer?.name) {
        form.set("customer_name", String(data.customer.name));
      }
      const res = await fetch("/api/uploads/transcribe", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("语音识别失败", json.error || "请稍后重试或手动粘贴转写");
        return;
      }
      const text = String(json.data?.transcript || "").trim();
      if (!text) {
        ui.error("识别结果为空", "请换一段录音或手动粘贴转写");
        return;
      }
      setUploadTranscript(text);
      const asrDur = Number(json.data?.duration_ms);
      if (Number.isFinite(asrDur) && asrDur > 0) {
        setUploadDurationMs(Math.round(asrDur));
      } else if (uploadDurationMs == null) {
        const probed = await probeAudioDurationMs(uploadFile);
        if (probed) setUploadDurationMs(probed);
      }
      ui.success("识别完成", "请在下方文本框校对后再上传解析");
    } finally {
      setRecognizing(false);
    }
  }

  function resetUploadModal() {
    setUploadTranscript("");
    setUploadText("");
    setUploadFile(null);
    setUploadDurationMs(null);
    setUploadPhase("form");
    setUploadMediaId(null);
    setUploadDraft(null);
    setUploadSummary("");
    setUploadPains("");
    setUploadComps("");
    setUploadSaving(false);
  }

  function closeUploadModal() {
    if (uploading || recognizing || uploadSaving) return;
    const mediaId = uploadMediaId;
    const pending = uploadPhase === "review" && mediaId != null;
    setUploadOpen(false);
    resetUploadModal();
    if (pending) {
      void fetch(`/api/uploads/${mediaId}`, { method: "DELETE" }).then(() =>
        load({ force: true })
      );
    }
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (uploadPhase !== "form") return;
    if (uploadKind === "call" && !uploadFile) {
      ui.error("请上传通话录音文件");
      return;
    }
    if (uploadKind === "call" && !uploadTranscript.trim()) {
      ui.error("请先点击「识别转写」并校对文本，或手动粘贴转写");
      return;
    }
    if (uploadKind !== "call" && !uploadText.trim()) {
      ui.error("请粘贴微信聊天内容");
      return;
    }

    const ok = await ui.confirm({
      title: "确认上传并 AI 解析？",
      description: `将为本客户上传${
        uploadKind === "call" ? "通话录音" : "微信聊天"
      }，并生成痛点、竞品与待办。解析后请确认再保存。`,
      confirmText: "确认上传",
    });
    if (!ok) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", uploadKind);
      form.set("customer_id", String(id));
      form.set("analyze", "1");
      if (uploadKind === "call") {
        form.set("transcript", uploadTranscript);
        if (uploadFile) form.set("file", uploadFile);
        if (uploadDurationMs != null && uploadDurationMs > 0) {
          form.set("duration_ms", String(uploadDurationMs));
        }
      } else {
        form.set("text_content", uploadText.trim());
      }

      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        ui.error("上传解析失败", json.error || "解析失败，文件未保存");
        return;
      }

      const mediaId = Number(json.data?.media?.id || 0);
      const draft =
        json.data?.draft && typeof json.data.draft === "object"
          ? json.data.draft
          : {};
      const pains = Array.isArray(draft.pain_points)
        ? draft.pain_points.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];
      const comps = Array.isArray(draft.competitors)
        ? draft.competitors.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];

      setUploadMediaId(mediaId || null);
      setUploadDraft(draft as Record<string, unknown>);
      setUploadSummary(String(draft.summary || "").trim());
      setUploadPains(pains.join("\n"));
      setUploadComps(comps.join("\n"));
      setUploadPhase("review");
      ui.success("解析完成", "请确认痛点与竞品后点保存");
    } finally {
      setUploading(false);
    }
  }

  async function saveUploadReview() {
    if (!uploadMediaId) {
      closeUploadModal();
      return;
    }
    setUploadSaving(true);
    try {
      const res = await fetch(`/api/uploads/${uploadMediaId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            ...(uploadDraft || {}),
            summary: uploadSummary,
            pain_points: linesToList(uploadPains),
            competitors: linesToList(uploadComps),
          },
          summary: uploadSummary,
          pain_points: linesToList(uploadPains),
          competitors: linesToList(uploadComps),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("已保存", "洞察、痛点与竞品已写入");
      setUploadOpen(false);
      resetUploadModal();
      await load({ force: true });
      await loadTasks();
      setAiBanner("已纳入最近洞察 · 可问：客户顾虑是什么？");
      setDraftQuestion("根据刚解析的内容，客户主要顾虑是什么？下一步该怎么跟进？");
      setDraftTick((n) => n + 1);
    } finally {
      setUploadSaving(false);
    }
  }

  function askAboutInsight(ins: { kind?: string; summary?: string | null }) {
    const kindLabel = labelOf(MEDIA_KIND_LABELS, ins.kind, "洞察");
    const summary = String(ins.summary || "无摘要").slice(0, 80);
    setAiBanner(`基于这条${kindLabel}洞察追问`);
    setDraftQuestion(
      `根据这条${kindLabel}洞察（${summary}），下一步该怎么跟进？请给我具体话术。`
    );
    setDraftTick((n) => n + 1);
  }

  async function reanalyzeMedia(mediaId: number, fileName: string) {
    const ok = await ui.confirm({
      title: "确认重新解析？",
      description: `将对「${fileName}」再次运行 AI 解析。解析后请确认痛点与竞品再保存。`,
      confirmText: "重新解析",
    });
    if (!ok) return;
    setEditMediaSaving(true);
    try {
      const res = await fetch(`/api/uploads/${mediaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("解析失败", json.error);
        return;
      }
      const draft =
        json.data?.draft && typeof json.data.draft === "object"
          ? json.data.draft
          : {};
      const pains = Array.isArray(draft.pain_points)
        ? draft.pain_points.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];
      const comps = Array.isArray(draft.competitors)
        ? draft.competitors.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];
      setEditMedia({ id: mediaId, file_name: fileName, kind: "call" });
      setEditMediaDraft(draft as Record<string, unknown>);
      setEditMediaSummary(String(draft.summary || "").trim());
      setEditMediaPains(pains.join("\n"));
      setEditMediaComps(comps.join("\n"));
      setEditMediaReanalyze(true);
      setEditMediaPhase("review");
      ui.success("解析完成", "请确认痛点与竞品后点保存");
    } finally {
      setEditMediaSaving(false);
    }
  }

  function linesToList(text: string) {
    return text
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function resetEditMediaModal() {
    setEditMedia(null);
    setEditMediaPhase("form");
    setEditMediaDraft(null);
    setEditMediaSummary("");
    setEditMediaPains("");
    setEditMediaComps("");
    setEditMediaReanalyze(false);
    setEditMediaSaving(false);
  }

  function closeEditMediaModal() {
    if (editMediaSaving) return;
    resetEditMediaModal();
  }

  async function submitEditMedia() {
    if (!editMedia) return;
    if (editMediaPhase === "review") return;

    if (editMediaReanalyze) {
      const ok = await ui.confirm({
        title: "确认重新解析？",
        description: "将按当前文本重新解析，解析后请确认痛点与竞品再保存。",
        confirmText: "开始解析",
      });
      if (!ok) return;

      setEditMediaSaving(true);
      try {
        const res = await fetch(`/api/uploads/${editMedia.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: internalCustomerId,
            transcript: editMediaTranscript,
            reanalyze: true,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("解析失败", json.error);
          return;
        }
        const draft =
          json.data?.draft && typeof json.data.draft === "object"
            ? json.data.draft
            : {};
        const pains = Array.isArray(draft.pain_points)
          ? draft.pain_points.map((x: unknown) => String(x || "").trim()).filter(Boolean)
          : [];
        const comps = Array.isArray(draft.competitors)
          ? draft.competitors
              .map((x: unknown) => String(x || "").trim())
              .filter(Boolean)
          : [];
        setEditMediaDraft(draft as Record<string, unknown>);
        setEditMediaSummary(String(draft.summary || "").trim());
        setEditMediaPains(pains.join("\n"));
        setEditMediaComps(comps.join("\n"));
        setEditMediaPhase("review");
        ui.success("解析完成", "请确认痛点与竞品后点保存");
      } finally {
        setEditMediaSaving(false);
      }
      return;
    }

    const ok = await ui.confirm({
      title: "确认保存解析记录？",
      description: "将保存对文本与痛点/竞品的修改。",
      confirmText: "保存",
    });
    if (!ok) return;

    setEditMediaSaving(true);
    try {
      const res = await fetch(`/api/uploads/${editMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: internalCustomerId,
          transcript: editMediaTranscript,
          pain_points: linesToList(editMediaPains),
          competitors: linesToList(editMediaComps),
          reanalyze: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("解析记录已保存");
      resetEditMediaModal();
      await load({ force: true });
    } finally {
      setEditMediaSaving(false);
    }
  }

  async function saveEditMediaReview() {
    if (!editMedia) {
      closeEditMediaModal();
      return;
    }
    setEditMediaSaving(true);
    try {
      const res = await fetch(`/api/uploads/${editMedia.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            ...(editMediaDraft || {}),
            summary: editMediaSummary,
            pain_points: linesToList(editMediaPains),
            competitors: linesToList(editMediaComps),
          },
          summary: editMediaSummary,
          pain_points: linesToList(editMediaPains),
          competitors: linesToList(editMediaComps),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("已保存", "洞察、痛点与竞品已写入");
      resetEditMediaModal();
      await load({ force: true });
      await loadTasks();
      setAiBanner("已纳入最近洞察 · 可问：客户顾虑是什么？");
      setDraftQuestion("根据刚解析的内容，客户主要顾虑是什么？下一步该怎么跟进？");
      setDraftTick((n) => n + 1);
    } finally {
      setEditMediaSaving(false);
    }
  }

  function openEdit() {
    if (!data) return;
    setEditForm({
      company_name: data.company_name || "",
      name: data.name || "",
      phone: data.phone || "",
      industry: data.industry || "",
      source: data.source || "",
      status: (data.status as CustomerStatus) || "active",
    });
    setEditOpen(true);
  }

  function openDelete() {
    setDeletePassword("");
    setDeleteOpen(true);
  }

  async function confirmDeleteCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!deletePassword) {
      ui.error("请输入登录密码");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("删除失败", json.error || "请稍后重试");
        return;
      }
      setDeleteOpen(false);
      setDeletePassword("");
      ui.success("客户已删除");
      router.replace("/customers");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.company_name.trim()) {
      ui.error("请填写客户公司");
      return;
    }
    if (!editForm.name.trim()) {
      ui.error("请填写客户名");
      return;
    }
    const ok = await ui.confirm({
      title: "确认修改客户？",
      description: `将更新为「${editForm.company_name} / ${editForm.name}」。`,
      confirmText: "确认修改",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("修改失败", json.error);
        return;
      }
      ui.success("客户已更新");
      setEditOpen(false);
      await load({ force: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function addFollow(e: React.FormEvent) {
    e.preventDefault();
    if (!followContent.trim()) {
      ui.error("请填写跟进内容");
      return;
    }
    const ok = await ui.confirm({
      title: "确认添加跟进？",
      description: "跟进记录将写入客户时间线，并刷新最近跟进时间。",
      confirmText: "确认添加",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: internalCustomerId,
          type: followType,
          content: followContent,
          date: followDate || undefined,
          time: followTime || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("跟进失败", json.error);
        return;
      }
      setFollowContent("");
      setFollowOpen(false);
      ui.success("跟进已添加");
      await load({ force: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function addOpp(e: React.FormEvent) {
    e.preventDefault();
    const stageLabel =
      STAGE_LABELS[oppStage as keyof typeof STAGE_LABELS] || oppStage;
    const ok = await ui.confirm({
      title: "确认创建商机？",
      description: `将创建商机「${oppTitle}」，初始阶段为「${stageLabel}」。`,
      confirmText: "确认创建",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: internalCustomerId,
          title: oppTitle,
          stage: oppStage,
          expected_close_date: oppDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("创建商机失败", json.error);
        return;
      }
      setOppTitle("");
      setOppOpen(false);
      ui.success("商机已创建", oppTitle);
      await load({ force: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) {
      ui.error("请填写标题");
      return;
    }
    setTaskSubmitting(true);
    try {
      const due_at = taskDate ? `${taskDate}T${taskTime || "18:00"}:00` : null;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: internalCustomerId,
          opportunity_id: taskOppId ? Number(taskOppId) : null,
          title: taskTitle.trim(),
          due_at,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("创建待办失败", json.error);
        return;
      }
      ui.success("待办已创建", taskTitle.trim());
      setTaskOpen(false);
      setTaskTitle("");
      setTaskDate("");
      setTaskTime("18:00");
      setTaskOppId("");
      await loadTasks();
    } finally {
      setTaskSubmitting(false);
    }
  }

  async function markTaskDone(t: { id: number; title: string }) {
    const ok = await ui.confirm({
      title: "确认完成待办？",
      description: `将「${t.title}」标记为已完成。`,
      confirmText: "确认完成",
    });
    if (!ok) return;
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, status: "done" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) ui.error("操作失败", json.error);
    else {
      ui.success("待办已完成");
      await loadTasks();
    }
  }

  async function deleteTask(t: { id: number; title: string }) {
    const ok = await ui.confirm({
      title: "确认删除待办？",
      description: `将永久删除「${t.title}」。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/tasks?id=${t.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) ui.error("删除失败", json.error);
    else {
      ui.success("待办已删除");
      await loadTasks();
    }
  }

  const nextSteps = useMemo((): NextStepItem[] => {
    if (!data) return [];
    const items: NextStepItem[] = [];

    const pendingTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
    const urgentTasks = pendingTasks
      .map((t) => ({ t, urgency: taskDueUrgency(t.due_at, t.status) }))
      .filter((x) => x.urgency === "overdue" || x.urgency === "urgent")
      .sort((a, b) => (a.urgency === "overdue" ? -1 : 1) - (b.urgency === "overdue" ? -1 : 1));

    for (const { t, urgency } of urgentTasks.slice(0, 2)) {
      items.push({
        id: `task-${t.id}`,
        kind: "task",
        title: t.title,
        detail: `${TASK_URGENCY_LABELS[urgency]}${
          t.due_at ? ` · ${new Date(t.due_at).toLocaleString("zh-CN", { hour12: false })}` : ""
        }`,
        tone:
          urgency === "overdue"
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : "border-amber-200 bg-amber-50 text-amber-900",
        actionLabel: "完成",
        onAction: () => void markTaskDone(t),
      });
    }

    const opps = Array.isArray(data.opportunities) ? data.opportunities : [];
    for (const o of opps) {
      if (!o?.stage_suggestion_json?.stage) continue;
      if (o.stage === "won" || o.stage === "lost") continue;
      const suggested = String(o.stage_suggestion_json.stage);
      items.push({
        id: `stage-${o.id}`,
        kind: "stage",
        title: o.title,
        detail: `AI 建议推进到「${
          STAGE_LABELS[suggested as OpportunityStage] || suggested
        }」${
          o.stage_suggestion_json.reason
            ? ` · ${String(o.stage_suggestion_json.reason).slice(0, 40)}`
            : ""
        }`,
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
        actionLabel: "看商机",
        onAction: () => {
          document.getElementById("customer-opps")?.scrollIntoView({ behavior: "smooth" });
        },
      });
      if (items.length >= 4) break;
    }

    if (items.length < 4) {
      const profileActions = Array.isArray(data.profile_json?.next_actions)
        ? data.profile_json.next_actions
        : [];
      let insightActions: string[] = [];
      const rawInsight = data.insights?.[0]?.result_json;
      const insightObj =
        typeof rawInsight === "string"
          ? (() => {
              try {
                return JSON.parse(rawInsight) as { next_actions?: string[] };
              } catch {
                return null;
              }
            })()
          : (rawInsight as { next_actions?: string[] } | null);
      if (Array.isArray(insightObj?.next_actions)) insightActions = insightObj.next_actions;
      const nextAction = String(profileActions[0] || insightActions[0] || "").trim();
      if (nextAction) {
        items.push({
          id: "ai-next",
          kind: "ai",
          title: nextAction,
          detail: "来自客户画像 / 最近解析",
          tone: "border-sky-200 bg-sky-50 text-sky-900",
          actionLabel: "建待办",
          onAction: () => {
            setTaskTitle(nextAction.slice(0, 80));
            setTaskDate("");
            setTaskTime("18:00");
            setTaskOppId("");
            setTaskOpen(true);
          },
        });
      }
    }

    if (items.length < 4) {
      const openOpp = opps.find(
        (o: { stage?: string }) => o.stage && o.stage !== "won" && o.stage !== "lost"
      );
      if (openOpp) {
        items.push({
          id: `opp-${openOpp.id}`,
          kind: "opp",
          title: openOpp.title,
          detail: `进行中 · ${
            STAGE_LABELS[openOpp.stage as OpportunityStage] || openOpp.stage
          }${
            openOpp.expected_close_date
              ? ` · 预计 ${openOpp.expected_close_date}`
              : ""
          }`,
          tone: "border-slate-200 bg-slate-50 text-slate-800",
          actionLabel: "看商机",
          onAction: () => {
            document.getElementById("customer-opps")?.scrollIntoView({ behavior: "smooth" });
          },
        });
      }
    }

    if (items.length < 3) {
      const lastFollow = (data.follow_ups || [])[0] as
        | { followed_at?: string; content?: string | null }
        | undefined;
      if (lastFollow?.followed_at) {
        const days = Math.floor(
          (Date.now() - new Date(lastFollow.followed_at).getTime()) / 86400000
        );
        if (days >= 3) {
          items.push({
            id: "follow-stale",
            kind: "follow",
            title: `已 ${days} 天未跟进`,
            detail: lastFollow.content
              ? String(lastFollow.content).slice(0, 48)
              : "建议补充跟进记录",
            tone: "border-amber-200 bg-amber-50/80 text-amber-900",
            actionLabel: "写跟进",
            onAction: () => setFollowOpen(true),
          });
        }
      } else if (!(data.follow_ups || []).length) {
        items.push({
          id: "follow-empty",
          kind: "follow",
          title: "尚无跟进记录",
          detail: "记录首次沟通，便于后续协作",
          tone: "border-slate-200 bg-white text-slate-800",
          actionLabel: "写跟进",
          onAction: () => setFollowOpen(true),
        });
      }
    }

    return items.slice(0, 4);
    // markTaskDone is stable enough via closure; omit from deps to avoid churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tasks]);

  if (!data && !error) {
    return <DetailPageSkeleton />;
  }
  if (error && !data) {
    return <div className="text-red-600">{error}</div>;
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-clip">
      {/* 英雄区：身份 + 元信息网格 + 操作 */}
      <header className="customer-hero p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight sm:text-[1.75rem]">
                {data.company_name || data.name}
              </h1>
              <StatusTag kind="customer" value={data.status} />
              <StatusTag kind="pool" value={data.pool_status || "private"} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              联系人 <span className="font-medium text-[var(--color-text)]">{data.name || "—"}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button onClick={openEdit}>
              修改客户
            </Button>
            {data.pool_status !== "public" && (
              <Button
                onClick={async () => {
                  const ok = await ui.confirm({
                    title: "确认放入公海？",
                    description: `「${data.company_name || data.name}」将取消负责人并进入公海，其他销售可领取。`,
                    confirmText: "放入公海",
                    danger: true,
                  });
                  if (!ok) return;
                  const res = await fetch("/api/pool", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "release", customer_id: internalCustomerId }),
                  });
                  const json = await res.json();
                  if (!res.ok) ui.error("放入公海失败", json.error);
                  else {
                    ui.success("已放入公海");
                    await load({ force: true });
                  }
                }}
              >
                放入公海
              </Button>
            )}
            {data.pool_status === "public" && (
              <Button
                onClick={async () => {
                  const ok = await ui.confirm({
                    title: "确认领取客户？",
                    description: `将「${data.company_name || data.name}」领取到你的私海。`,
                    confirmText: "确认领取",
                  });
                  if (!ok) return;
                  const res = await fetch("/api/pool", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "claim", customer_id: internalCustomerId }),
                  });
                  const json = await res.json();
                  if (!res.ok) ui.error("领取失败", json.error);
                  else {
                    ui.success("领取成功");
                    await load({ force: true });
                  }
                }}
              >
                领取到私海
              </Button>
            )}
            {canDeleteCustomer && (
              <Button variant="danger" onClick={openDelete}>
                删除客户
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                document
                  .getElementById("customer-ai-assistant")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              AI 助手
            </Button>
          </div>
        </div>

        <div className="customer-meta-grid mt-5 border-t border-[var(--color-border)]/80 pt-4">
          <div className="customer-meta-item">
            <div className="label">手机</div>
            <div className="value">{data.phone || "—"}</div>
          </div>
          <div className="customer-meta-item">
            <div className="label">行业</div>
            <div className="value">{data.industry || "—"}</div>
          </div>
          <div className="customer-meta-item">
            <div className="label">负责人</div>
            <div className="value">{data.owner_name || "—"}</div>
          </div>
          <div className="customer-meta-item">
            <div className="label">来源</div>
            <div className="value">{data.source || "—"}</div>
          </div>
        </div>

        {/* 客户画像并入英雄区 */}
        <div className="mt-5 border-t border-[var(--color-border)]/80 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
              客户画像
            </h2>
          </div>
          {data.profile_json && Object.keys(data.profile_json).length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
                <div className="flex shrink-0 flex-wrap gap-2">
                  <div className="rounded-lg bg-[#eff6ff]/80 px-3 py-2 min-w-[4.75rem]">
                    <div className="text-[10px] font-semibold text-[var(--color-muted)]">意向</div>
                    <div className="mt-0.5 text-sm font-semibold text-[var(--color-accent)]">
                      {labelOf(INTENT_LABELS, data.profile_json.intent)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/70 px-3 py-2 min-w-[4.75rem] ring-1 ring-[var(--color-border)]">
                    <div className="text-[10px] font-semibold text-[var(--color-muted)]">情感</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      {labelOf(SENTIMENT_LABELS, data.profile_json.sentiment)}
                    </div>
                  </div>
                  {data.profile_json.stage_suggestion && (
                    <div className="rounded-lg bg-white/70 px-3 py-2 min-w-[4.75rem] ring-1 ring-[var(--color-border)]">
                      <div className="text-[10px] font-semibold text-[var(--color-muted)]">
                        阶段建议
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {labelOf(
                          STAGE_LABELS,
                          data.profile_json.stage_suggestion,
                          String(data.profile_json.stage_suggestion)
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {(() => {
                  const profileActions = Array.isArray(data.profile_json.next_actions)
                    ? data.profile_json.next_actions
                    : [];
                  let insightActions: string[] = [];
                  const rawInsight = data.insights?.[0]?.result_json;
                  const insightObj =
                    typeof rawInsight === "string"
                      ? (() => {
                          try {
                            return JSON.parse(rawInsight) as {
                              next_actions?: string[];
                            };
                          } catch {
                            return null;
                          }
                        })()
                      : (rawInsight as { next_actions?: string[] } | null);
                  if (Array.isArray(insightObj?.next_actions)) {
                    insightActions = insightObj.next_actions;
                  }
                  const nextAction = String(
                    profileActions[0] || insightActions[0] || ""
                  ).trim();
                  const lastFollow = (data.follow_ups || [])[0] as
                    | {
                        followed_at?: string;
                        content?: string | null;
                        type?: string | null;
                      }
                    | undefined;
                  if (!nextAction && !lastFollow) return null;
                  return (
                    <div className="min-w-0 flex-1 space-y-2 text-xs lg:border-l lg:border-[var(--color-border)]/70 lg:pl-4">
                      {nextAction && (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                            下一步
                          </div>
                          <p className="mt-0.5 line-clamp-2 leading-relaxed text-[var(--color-muted)]">
                            {nextAction}
                          </p>
                        </div>
                      )}
                      {lastFollow && (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                            最近跟进
                          </div>
                          <p className="mt-0.5 text-[var(--color-muted)]">
                            {lastFollow.followed_at
                              ? new Date(lastFollow.followed_at).toLocaleString("zh-CN", {
                                  hour12: false,
                                })
                              : "—"}
                            {lastFollow.content
                              ? ` · ${String(lastFollow.content).slice(0, 48)}${
                                  String(lastFollow.content).length > 48 ? "…" : ""
                                }`
                              : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {(Array.isArray(data.profile_json.pain_points) &&
                data.profile_json.pain_points.length > 0) ||
              (Array.isArray(data.profile_json.competitors) &&
                data.profile_json.competitors.length > 0) ? (
                <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                  {Array.isArray(data.profile_json.pain_points) &&
                    data.profile_json.pain_points.length > 0 && (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="shrink-0 text-[10px] font-semibold text-[var(--color-muted)]">
                          痛点
                        </span>
                        {data.profile_json.pain_points.map((p: string) => (
                          <TagChip key={p} text={p} tone="neutral" maxWidthClass="max-w-[10rem]" />
                        ))}
                      </div>
                    )}
                  {Array.isArray(data.profile_json.competitors) &&
                    data.profile_json.competitors.length > 0 && (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="shrink-0 text-[10px] font-semibold text-[var(--color-muted)]">
                          竞品
                        </span>
                        {data.profile_json.competitors.map((p: string) => (
                          <TruncateWithDelayTip
                            key={p}
                            text={p}
                            delayMs={280}
                            placement="up"
                            tabIndex={0}
                            role="button"
                            title="查看竞品资料"
                            className="inline-block max-w-[10rem] cursor-pointer rounded-md bg-amber-50/90 px-2 py-0.5 text-xs leading-none text-amber-800 ring-1 ring-amber-200/80 outline-none transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/35"
                            onClick={() => openCompetitorChip(p)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openCompetitorChip(p);
                              }
                            }}
                          />
                        ))}
                      </div>
                    )}
                </div>
              ) : null}

              {(data.insights || []).length > 0 && (
                <div className="space-y-2 border-t border-[var(--color-border)]/60 pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    最近洞察
                  </div>
                  <ul className="space-y-1.5">
                    {(data.insights || []).slice(0, 3).map((ins: any) => (
                      <li
                        key={ins.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 line-clamp-2 text-[var(--color-muted)]">
                          {labelOf(MEDIA_KIND_LABELS, ins.kind)}：{ins.summary || "无摘要"}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-[var(--color-accent)] hover:underline"
                          onClick={() => askAboutInsight(ins)}
                        >
                          基于这条追问
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              暂无画像。点击「上传并解析」上传通话或微信记录后，这里会自动汇总意向与痛点。
            </p>
          )}
        </div>

        {nextSteps.length > 0 && (
          <div className="mt-5 border-t border-[var(--color-border)]/80 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
                下一步
              </h2>
              <span className="text-[11px] text-[var(--color-muted)]">
                待办 / AI 建议 / 跟进节奏
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {nextSteps.map((step) => (
                <li
                  key={step.id}
                  className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2.5 ${step.tone}`}
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-sm font-medium leading-snug">
                      {step.title}
                    </div>
                    {step.detail ? (
                      <div className="mt-0.5 line-clamp-2 text-[11px] opacity-80">
                        {step.detail}
                      </div>
                    ) : null}
                  </div>
                  {step.actionLabel && step.onAction ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!shrink-0 !px-2 !py-1 !text-xs"
                      onClick={step.onAction}
                    >
                      {step.actionLabel}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* 工作台：左栏解析+商机+跟进，右栏 AI */}
      <div className="customer-workbench">
        <div className="flex flex-col gap-4">
          <section className="surface p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">解析记录</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  共 {(data.media_assets || []).length} 条
                </p>
              </div>
              <Button
                variant="secondary"
                className="min-h-8 px-2.5 text-xs"
                onClick={openUpload}
              >
                上传并解析
              </Button>
            </div>
            {(data.media_assets || []).length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                暂无解析记录。上传通话或微信后会显示在这里。
              </p>
            ) : (
              <ul className="space-y-2">
                {(data.media_assets || []).slice(0, 8).map((m: any) => {
                  const pains = Array.isArray(m.pain_points)
                    ? m.pain_points.map((x: unknown) => String(x || "").trim()).filter(Boolean)
                    : [];
                  const comps = Array.isArray(m.competitors)
                    ? m.competitors.map((x: unknown) => String(x || "").trim()).filter(Boolean)
                    : [];
                  return (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-slate-50/60 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {labelOf(MEDIA_KIND_LABELS, m.kind)} · {m.file_name}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {new Date(m.created_at).toLocaleString("zh-CN")}
                        {m.kind === "call" && m.duration_ms
                          ? ` · 时长 ${formatAudioDuration(m.duration_ms)}`
                          : ""}
                      </div>
                      {(pains.length > 0 || comps.length > 0) && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {pains.length > 0 && (
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold text-[var(--color-muted)]">
                                痛点
                              </span>
                              {pains.map((p: string) => (
                                <TagChip key={p} text={p} tone="amber" maxWidthClass="max-w-[8rem]" />
                              ))}
                            </div>
                          )}
                          {comps.length > 0 && (
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold text-[var(--color-muted)]">
                                竞品
                              </span>
                              {comps.map((p: string) => (
                                <TagChip key={p} text={p} tone="rose" maxWidthClass="max-w-[8rem]" />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusTag kind="media" value={m.status} />
                      {m.status !== "analyzed" && (
                        <Button
                          variant="secondary"
                          className="min-h-8 px-2.5 text-xs"
                          onClick={() => void reanalyzeMedia(m.id, m.file_name)}
                        >
                          重新解析
                        </Button>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section id="customer-opps" className="surface scroll-mt-20 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">商机</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  共 {(data.opportunities || []).length} 个
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setOppTitle("");
                  setOppStage("lead");
                  setOppDate("");
                  setOppOpen(true);
                }}
              >
                创建商机
              </Button>
            </div>
            {(data.opportunities || []).length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">暂无商机</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {(data.opportunities || []).map((o: any) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-slate-50/60 px-3 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{o.title}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusTag kind="stage" value={o.stage} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">待办</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  共 {tasks.length} 条 · 跟进此客户相关事项
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setTaskTitle("");
                  setTaskDate("");
                  setTaskTime("18:00");
                  setTaskOppId("");
                  setTaskOpen(true);
                }}
              >
                新建待办
              </Button>
            </div>
            {tasks.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">暂无待办</p>
            ) : (
              <ScrollArea className="max-h-96 overscroll-contain pr-1 sm:max-h-[30rem]">
                <ul className="space-y-2">
                  {tasks.slice(0, 12).map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-slate-50/60 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t.title}
                        {t.source === "ai" && (
                          <span className="ml-2 text-xs text-[var(--color-accent)]">AI</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                        <StatusTag kind="task" value={t.status} />
                        {t.opportunity_title ? (
                          <span className="min-w-0 max-w-full truncate">
                            商机 {t.opportunity_title}
                          </span>
                        ) : null}
                        {t.owner_name ? <span>{t.owner_name}</span> : null}
                        <span>
                          {t.due_at
                            ? new Date(t.due_at).toLocaleString("zh-CN")
                            : "无截止"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {t.status !== "done" && (
                        <IconButton
                          icon="check"
                          label="完成"
                          variant="secondary"
                          onClick={() => void markTaskDone(t)}
                        />
                      )}
                      <IconButton
                        icon="trash"
                        label="删除"
                        variant="danger"
                        onClick={() => void deleteTask(t)}
                      />
                    </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </section>

          <section className="surface p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">跟进时间线</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  共 {(data.follow_ups || []).length} 条记录
                </p>
              </div>
              <Button
                onClick={() => {
                  setFollowContent("");
                  setFollowOpen(true);
                }}
              >
                添加跟进
              </Button>
            </div>

            {(data.follow_ups || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-slate-50/80 px-4 py-10 text-center">
                <p className="text-sm text-[var(--color-muted)]">还没有跟进记录</p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={() => {
                    setFollowContent("");
                    setFollowOpen(true);
                  }}
                >
                  写下第一条跟进
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-96 overscroll-contain pr-1 sm:max-h-[30rem]">
                <ul className="follow-timeline">
                  {(data.follow_ups || []).map((f: any) => (
                    <li key={f.id} className="follow-timeline-item">
                      <div className="follow-timeline-body">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
                        <FollowTypeTag type={f.type} />
                        <span>{f.owner_name}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={f.followed_at}>
                          {new Date(f.followed_at).toLocaleString("zh-CN")}
                        </time>
                      </div>
                      <div className="mt-2 break-words text-sm leading-relaxed whitespace-pre-wrap">
                        {f.content}
                      </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </section>
        </div>

        <aside
          id="customer-ai-assistant"
          className="customer-rail flex min-h-[20rem] max-w-full scroll-mt-20 flex-col p-3 md:min-h-[28rem]"
        >
          <div className="customer-rail-title mb-2 shrink-0 px-1">
            <span>AI 助手</span>
          </div>
          <ContextChat
            customerId={internalCustomerId}
            title="问一句"
            description=""
            compact
            embedded
            framed={false}
            className="min-h-0 w-full min-w-0 flex-1"
            emptyHint="可先点「上传并解析」补充通话/微信，再问跟进策略、话术或风险点。"
            bannerHint={aiBanner}
            onDismissBanner={() => setAiBanner(null)}
            draftQuestion={draftQuestion}
            draftTick={draftTick}
            onDraftConsumed={() => setDraftQuestion(null)}
          />
        </aside>
      </div>

      <Modal
        open={compView != null}
        title={compView ? `竞品 · ${compView.name}` : "竞品"}
        description={
          compView?.inLibrary
            ? "来自竞品库的应对资料"
            : "画像中提到该竞品，但竞品库尚无匹配记录"
        }
        onClose={() => setCompView(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCompView(null)}>
              关闭
            </Button>
            <Button
              type="button"
              onClick={() => {
                window.location.href = "/competitors";
              }}
            >
              打开竞品库
            </Button>
          </>
        }
      >
        {compView?.inLibrary ? (
          <div className="space-y-3 text-sm">
            {compView.summary ? (
              <div>
                <div className="text-xs font-semibold text-[var(--color-muted)]">简介</div>
                <p className="mt-1">{compView.summary}</p>
              </div>
            ) : null}
            {compView.strengths ? (
              <div>
                <div className="text-xs font-semibold text-[var(--color-muted)]">优势</div>
                <p className="mt-1 whitespace-pre-wrap">{compView.strengths}</p>
              </div>
            ) : null}
            {compView.weaknesses ? (
              <div>
                <div className="text-xs font-semibold text-[var(--color-muted)]">劣势</div>
                <p className="mt-1 whitespace-pre-wrap">{compView.weaknesses}</p>
              </div>
            ) : null}
            {compView.playbook ? (
              <div>
                <div className="text-xs font-semibold text-[var(--color-muted)]">应对话术</div>
                <p className="mt-1 whitespace-pre-wrap">{compView.playbook}</p>
              </div>
            ) : null}
            {!compView.summary &&
            !compView.strengths &&
            !compView.weaknesses &&
            !compView.playbook ? (
              <p className="text-[var(--color-muted)]">
                竞品库中已有该条目，但尚未填写简介/优劣势/话术。
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            可在竞品库中添加「{compView?.name}」并维护话术，之后 AI
            助手也会自动带上这些资料。
          </p>
        )}
      </Modal>

      <Modal
        open={uploadOpen}
        title={uploadPhase === "review" ? "确认解析结果" : "上传并 AI 解析"}
        description={
          uploadPhase === "review"
            ? "当前仅为预览，点「确认保存」后才会写入痛点、竞品与待办"
            : "为本客户上传通话或微信内容，解析后确认再保存"
        }
        onClose={closeUploadModal}
        closeOnOverlay={!uploading && !recognizing && !uploadSaving && uploadPhase === "form"}
        size="lg"
        footer={
          uploadPhase === "review" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={uploadSaving}
                onClick={closeUploadModal}
              >
                放弃
              </Button>
              <Button
                type="button"
                disabled={uploadSaving || !uploadMediaId}
                onClick={() => void saveUploadReview()}
              >
                {uploadSaving ? "保存中…" : "确认保存"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={uploading || recognizing}
                onClick={closeUploadModal}
              >
                取消
              </Button>
              {uploadKind === "call" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!uploadFile || uploading || recognizing}
                  onClick={() => void recognizeTranscript()}
                >
                  {recognizing ? "识别中…" : "识别转写"}
                </Button>
              )}
              <Button
                type="submit"
                form="customer-upload-form"
                disabled={
                  uploading ||
                  recognizing ||
                  (uploadKind === "call" && !uploadTranscript.trim())
                }
              >
                {uploading ? "上传解析中…" : "上传并解析"}
              </Button>
            </>
          )
        }
      >
        {uploadPhase === "review" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {uploadSummary ? (
              <div className="field sm:col-span-2">
                <label>摘要</label>
                <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm leading-6 text-[var(--color-text)]">
                  {uploadSummary}
                </div>
              </div>
            ) : null}
            <div className="field">
              <label>痛点（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={uploadPains}
                onChange={(e) => setUploadPains(e.target.value)}
                placeholder="例如：价格敏感"
              />
            </div>
            <div className="field">
              <label>竞品（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={uploadComps}
                onChange={(e) => setUploadComps(e.target.value)}
                placeholder="例如：某竞品名"
              />
            </div>
          </div>
        ) : (
          <form
            id="customer-upload-form"
            onSubmit={submitUpload}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div className="field sm:col-span-2">
              <label>类型</label>
              <Select
                value={uploadKind}
                onChange={setUploadKind}
                options={[
                  { value: "call", label: "通话录音" },
                  { value: "wechat", label: "微信聊天" },
                ]}
              />
            </div>
            {uploadKind === "call" ? (
              <>
                <div className="field sm:col-span-2">
                  <label>录音文件</label>
                  <FileDropzone
                    accept="audio/*,.mp3,.wav,.m4a,.aac"
                    value={uploadFile}
                    onFile={(f) => {
                      setUploadFile(f);
                      setUploadTranscript("");
                      setUploadDurationMs(null);
                      if (f) {
                        void probeAudioDurationMs(f).then((ms) => {
                          if (ms) setUploadDurationMs(ms);
                        });
                      }
                    }}
                    label="点击或拖入录音文件"
                    hint="支持 mp3 / wav / m4a / aac"
                  />
                </div>
                <div className="field sm:col-span-2">
                  <label>
                    转写文本（请先识别或粘贴，校对后再上传）
                    {uploadDurationMs != null && uploadDurationMs > 0
                      ? ` · 时长 ${formatAudioDuration(uploadDurationMs)}`
                      : ""}
                  </label>
                  <textarea
                    className="input textarea"
                    rows={10}
                    value={uploadTranscript}
                    onChange={(e) => setUploadTranscript(e.target.value)}
                    placeholder="点击「识别转写」后文本会出现在这里，请校对销售/客户对话后再点「上传并解析」…"
                  />
                </div>
              </>
            ) : (
              <div className="field sm:col-span-2">
                <label>聊天内容</label>
                <textarea
                  className="input textarea min-h-40"
                  rows={12}
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                  placeholder="在微信中复制聊天记录，直接粘贴到这里…"
                  autoFocus
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  微信里长按/多选消息 → 复制 → 粘贴到上方（仅支持粘贴）
                </p>
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(editMedia)}
        title={editMediaPhase === "review" ? "确认解析结果" : "编辑解析记录"}
        description={
          editMediaPhase === "review"
            ? "当前仅为预览，点「确认保存」后才会写入痛点、竞品与待办"
            : "可修改文本内容与痛点/竞品"
        }
        onClose={closeEditMediaModal}
        closeOnOverlay={!editMediaSaving && editMediaPhase === "form"}
        size="lg"
        footer={
          editMediaPhase === "review" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={editMediaSaving}
                onClick={closeEditMediaModal}
              >
                放弃
              </Button>
              <Button
                type="button"
                disabled={editMediaSaving || !editMedia}
                onClick={() => void saveEditMediaReview()}
              >
                {editMediaSaving ? "保存中…" : "确认保存"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={editMediaSaving}
                onClick={closeEditMediaModal}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={editMediaSaving || editMediaLoading}
                onClick={() => void submitEditMedia()}
              >
                {editMediaSaving
                  ? editMediaReanalyze
                    ? "解析中…"
                    : "保存中…"
                  : editMediaReanalyze
                    ? "保存并重新解析"
                    : "保存"}
              </Button>
            </>
          )
        }
      >
        {editMedia && editMediaPhase === "review" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editMediaSummary ? (
              <div className="field sm:col-span-2">
                <label>摘要</label>
                <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm leading-6 text-[var(--color-text)]">
                  {editMediaSummary}
                </div>
              </div>
            ) : null}
            <div className="field">
              <label>痛点（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={editMediaPains}
                onChange={(e) => setEditMediaPains(e.target.value)}
                placeholder="例如：价格敏感"
              />
            </div>
            <div className="field">
              <label>竞品（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={editMediaComps}
                onChange={(e) => setEditMediaComps(e.target.value)}
                placeholder="例如：某竞品名"
              />
            </div>
          </div>
        ) : editMedia ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editMediaLoading && (
              <p className="sm:col-span-2 text-sm text-[var(--color-muted)]">加载详情…</p>
            )}
            <div className="field sm:col-span-2">
              <label>类型</label>
              <div className="input flex items-center bg-slate-50 text-[var(--color-muted)]">
                {labelOf(MEDIA_KIND_LABELS, editMediaKind, editMediaKind === "wechat" ? "微信" : "通话")}
                {editMedia.file_name ? (
                  <span className="ml-2 truncate">· {editMedia.file_name}</span>
                ) : null}
              </div>
            </div>
            <div className="field sm:col-span-2">
              <label>{editMediaKind === "call" ? "转写文本" : "聊天文本"}</label>
              <textarea
                className="input textarea"
                rows={8}
                value={editMediaTranscript}
                onChange={(e) => setEditMediaTranscript(e.target.value)}
                placeholder="解析用的正文内容"
              />
            </div>
            {!editMediaReanalyze && (
              <>
                <div className="field">
                  <label>痛点（每行一条）</label>
                  <textarea
                    className="input textarea"
                    rows={4}
                    value={editMediaPains}
                    onChange={(e) => setEditMediaPains(e.target.value)}
                    placeholder="例如：价格敏感"
                  />
                </div>
                <div className="field">
                  <label>竞品（每行一条）</label>
                  <textarea
                    className="input textarea"
                    rows={4}
                    value={editMediaComps}
                    onChange={(e) => setEditMediaComps(e.target.value)}
                    placeholder="例如：某竞品名"
                  />
                </div>
              </>
            )}
            <label className="sm:col-span-2 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={editMediaReanalyze}
                onChange={(e) => setEditMediaReanalyze(e.target.checked)}
              />
              <span>
                保存后重新解析
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  会先解析出痛点与竞品预览，确认后才写入；可能覆盖既有洞察
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={followOpen}
        title="添加跟进"
        description="写入客户时间线并刷新最近跟进时间"
        onClose={() => setFollowOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFollowOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="follow-create-form" disabled={submitting}>
              {submitting ? "提交中…" : "添加跟进"}
            </Button>
          </>
        }
      >
        <form id="follow-create-form" onSubmit={addFollow} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field">
            <label>跟进方式</label>
            <Select
              value={followType}
              onChange={setFollowType}
              options={[
                { value: "call", label: "电话" },
                { value: "wechat", label: "微信" },
                { value: "visit", label: "拜访" },
                { value: "email", label: "邮件" },
              ]}
            />
          </div>
          <div className="field">
            <label>日期</label>
            <DatePicker value={followDate} onChange={setFollowDate} />
          </div>
          <div className="field">
            <label>时间</label>
            <TimePicker value={followTime} onChange={setFollowTime} />
          </div>
          <div className="field sm:col-span-2">
            <label>内容</label>
            <textarea
              className="input textarea"
              value={followContent}
              onChange={(e) => setFollowContent(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title="删除客户"
        description="此操作不可恢复，请确认后输入登录密码"
        onClose={() => {
          if (deleting) return;
          setDeleteOpen(false);
          setDeletePassword("");
        }}
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={deleting}
              onClick={() => {
                setDeleteOpen(false);
                setDeletePassword("");
              }}
            >
              取消
            </Button>
            <Button
              type="submit"
              form="customer-delete-form"
              variant="danger"
              disabled={deleting || !deletePassword}
            >
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </>
        }
      >
        <form
          id="customer-delete-form"
          className="space-y-4"
          onSubmit={(e) => void confirmDeleteCustomer(e)}
        >
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            将永久删除「{data?.company_name || data?.name || "该客户"}」，并连带清除联系人、商机、报价、跟进、待办、解析记录等相关数据，且不可恢复。
          </div>
          <div className="field">
            <label>登录密码</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="输入当前账号密码以确认"
              required
            />
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              多次密码错误将暂时锁定删除操作，请勿试探密码。
            </p>
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        title="修改客户"
        description="更新客户公司、客户名等基础信息"
        onClose={() => setEditOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="customer-edit-form" disabled={submitting}>
              {submitting ? "保存中…" : "保存修改"}
            </Button>
          </>
        }
      >
        <form
          id="customer-edit-form"
          onSubmit={saveCustomer}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="field">
            <label>客户公司</label>
            <input
              className="input"
              value={editForm.company_name}
              onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>客户名</label>
            <input
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>手机号</label>
            <input
              className="input"
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>行业</label>
            <input
              className="input"
              value={editForm.industry}
              onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>来源</label>
            <Select
              value={editForm.source}
              onChange={(v) => setEditForm((f) => ({ ...f, source: v }))}
              placeholder="选择来源"
              options={[
                { value: "", label: "未选择" },
                { value: "线上咨询", label: "线上咨询" },
                { value: "转介绍", label: "转介绍" },
                { value: "展会", label: "展会" },
                { value: "电话拓客", label: "电话拓客" },
              ]}
            />
          </div>
          <div className="field">
            <label>状态</label>
            <Select
              value={editForm.status}
              onChange={(v) => setEditForm((f) => ({ ...f, status: v as CustomerStatus }))}
              options={CUSTOMER_STATUS_OPTIONS}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={oppOpen}
        title="创建商机"
        onClose={() => setOppOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOppOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="opp-create-form" disabled={submitting}>
              {submitting ? "创建中…" : "创建商机"}
            </Button>
          </>
        }
      >
        <form id="opp-create-form" onSubmit={addOpp} className="space-y-3">
          <div className="field">
            <label>商机标题</label>
            <input
              className="input"
              value={oppTitle}
              onChange={(e) => setOppTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>阶段</label>
            <Select
              value={oppStage}
              onChange={setOppStage}
              options={Object.entries(STAGE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>
          <div className="field">
            <label>预计成交日</label>
            <DatePicker value={oppDate} onChange={setOppDate} placeholder="预计成交日" />
          </div>
        </form>
      </Modal>

      <Modal
        open={taskOpen}
        title="新建待办"
        description="待办将关联当前客户；可选关联本客户下的商机"
        onClose={() => setTaskOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setTaskOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="customer-task-form" disabled={taskSubmitting}>
              {taskSubmitting ? "创建中…" : "创建待办"}
            </Button>
          </>
        }
      >
        <form id="customer-task-form" onSubmit={addTask} className="space-y-3">
          <div className="field">
            <label>标题</label>
            <input
              className="input"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>关联商机（可选）</label>
            <Select
              value={taskOppId}
              onChange={setTaskOppId}
              options={[
                { value: "", label: "不关联商机" },
                ...((data?.opportunities || []) as { id: number; title: string }[]).map(
                  (o) => ({ value: String(o.id), label: o.title })
                ),
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>截止日期</label>
              <DatePicker value={taskDate} onChange={setTaskDate} />
            </div>
            <div className="field">
              <label>截止时间</label>
              <TimePicker value={taskTime} onChange={setTaskTime} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
