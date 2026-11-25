"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readEvents, streamError, type CaseStreamEvent } from "../lib/case-stream";
import { announceChatUpdate, subscribeToChatUpdates } from "../lib/chat-updates";
import type { Chat, ChatMessage } from "../lib/types";
import { useSidebar } from "./SidebarProvider";
import CaseActions from "./CaseActions";

// ── Copy button ────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      title="Copy to clipboard"
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-150 cursor-pointer"
      style={{
        color: copied ? "var(--accent)" : "var(--text-muted)",
        background: copied ? "var(--accent-glow)" : "transparent",
        border: "1px solid",
        borderColor: copied ? "var(--border-accent)" : "transparent",
        fontFamily: "var(--font-body)",
      }}
    >
      <span className="sr-only" role="status">{copied ? "Copied to clipboard" : ""}</span>
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline className="copy-check" points="20 6 9 17 4 12" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          Copy
        </>
      )}
    </button>
  );
}

// ── Streaming dots ─────────────────────────────────────────────────────────
function StreamingDots() {
  return (
    <span className="inline-flex gap-1 ml-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="streaming-dot inline-block w-1 h-1 rounded-full" style={{ background: "var(--accent)" }} />
      ))}
    </span>
  );
}

// ── Spinner icon ───────────────────────────────────────────────────────────
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ── Check icon ─────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Progress log steps ─────────────────────────────────────────────────────
function ProgressSteps({ steps, currentStep }: { steps: string[]; currentStep: string | null }) {
  return (
    <ol className="case-progress flex flex-col gap-2 py-3">
      {steps.map((step, i) => {
        const isCurrent = i === steps.length - 1 && step === currentStep;
        return (
          <li key={i} className="flex items-center gap-2.5" aria-current={isCurrent ? "step" : undefined}>
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              {isCurrent ? <Spinner size={14} /> : <CheckIcon />}
            </div>
            <span
              className="progress-label text-[13px]"
              style={{
                color: isCurrent ? "var(--text-primary)" : "var(--text-secondary)",
                fontFamily: "var(--font-body)",
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CaseDialog({ titleId, children }: { titleId: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="case-dialog p-5 sm:p-6"
      onCancel={(event) => event.preventDefault()}
    >
      {children}
    </dialog>
  );
}

// ── Captcha Modal ──────────────────────────────────────────────────────────
function CaptchaModal({
  captchaImg,
  errorMsg,
  submitting,
  onSubmit,
}: {
  captchaImg: string;
  errorMsg?: string;
  submitting: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!submitting && trimmed.length === 6) onSubmit(trimmed);
  };

  return (
    <CaseDialog titleId="captcha-title">
      <h3 id="captcha-title" className="text-base font-bold mb-4" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
        Complete the CAPTCHA
      </h3>

      {errorMsg && (
        <p role="alert" className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)" }}>
          {errorMsg}
        </p>
      )}

      <div className="flex justify-center mb-4 rounded-lg overflow-hidden" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
        <Image unoptimized src={`data:image/png;base64,${captchaImg}`} alt="Captcha challenge" width={240} height={64} className="h-16 w-auto object-contain" />
      </div>

      <input
        type="text"
        maxLength={6}
        disabled={submitting}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        aria-label="Captcha text"
        placeholder="Enter 6 lowercase characters"
        className="w-full px-4 py-2.5 rounded-xl text-sm font-mono tracking-widest text-center outline-none mb-4"
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          caretColor: "var(--accent)",
          fontFamily: "var(--font-mono)",
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={submitting || value.trim().length !== 6}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
        style={{
          background: value.trim().length === 6 ? "var(--accent)" : "var(--bg-elevated)",
          color: value.trim().length === 6 ? "var(--bg-primary)" : "var(--text-muted)",
          cursor: value.trim().length === 6 ? "pointer" : "not-allowed",
          fontFamily: "var(--font-display)",
        }}
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </CaseDialog>
  );
}

// ── District / PS Modal ────────────────────────────────────────────────────
function DistrictPsModal({ policeStation, errorMsg, submitting, onSubmit }: {
  policeStation?: string | null;
  errorMsg?: string;
  submitting: boolean;
  onSubmit: (district: string, ps: string) => void;
}) {
  const [allPs, setAllPs] = useState<Record<string, string[]> | null>(null);
  const [district, setDistrict] = useState("");
  const [ps, setPs] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    fetch("/api/chats/all-ps", { signal: request.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data: Record<string, string[]>) => setAllPs(data))
      .catch(() => {
        if (!request.signal.aborted) setCatalogError(true);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [catalogAttempt]);

  const districts = allPs ? Object.keys(allPs).sort() : [];
  const stations = allPs && district ? allPs[district]?.toSorted() ?? [] : [];

  const handleSubmit = () => {
    if (!submitting && district && ps) onSubmit(district, ps);
  };

  return (
    <CaseDialog titleId="station-title">
      <h3 id="station-title" className="text-base font-bold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
        Select a police station
      </h3>
      <p className="text-xs mb-4" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
        Choose the district and police station to look up the FIR.
      </p>

      {policeStation && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl" style={{ background: "var(--accent-glow)", border: "1px solid var(--border-accent)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Station listed on eCourts</span>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{policeStation}</span>
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="mb-3 rounded-lg px-3 py-2 text-xs text-[#fca5a5]">
          {errorMsg}
        </p>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-8" role="status" aria-label="Loading police stations"><Spinner size={20} /></div>
      ) : catalogError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-[#fca5a5]">Couldn’t load the police stations.</p>
          <button
            type="button"
            className="rounded-lg bg-[var(--accent-glow)] px-3 py-2 text-sm font-semibold text-[var(--accent)]"
            onClick={() => {
              setCatalogError(false);
              setLoading(true);
              setCatalogAttempt((attempt) => attempt + 1);
            }}
          >
            Reload police stations
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="case-district" className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>District</label>
          <select
            id="case-district"
            disabled={submitting}
            value={district}
            onChange={(e) => { setDistrict(e.target.value); setPs(""); }}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-4"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body)",
            }}
          >
            <option value="">Select district…</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <label htmlFor="case-station" className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Police station</label>
          <select
            id="case-station"
            value={ps}
            onChange={(e) => setPs(e.target.value)}
            disabled={submitting || !district}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-5"
            style={{
              background: "var(--bg-tertiary)",
              color: district ? "var(--text-primary)" : "var(--text-muted)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body)",
            }}
          >
            <option value="">Select police station…</option>
            {stations.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            onClick={handleSubmit}
            disabled={submitting || !district || !ps}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
            style={{
              background: district && ps ? "var(--accent)" : "var(--bg-elevated)",
              color: district && ps ? "var(--bg-primary)" : "var(--text-muted)",
              cursor: district && ps ? "pointer" : "not-allowed",
              fontFamily: "var(--font-display)",
            }}
          >
            {submitting ? "Submitting…" : "Continue"}
          </button>
        </>
      )}
    </CaseDialog>
  );
}

// ── Assistant bubble ───────────────────────────────────────────────────────
function AssistantBubble({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  return (
    <div>
      {/* Header row: avatar + label */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-[11px] font-extrabold shrink-0"
          style={{ background: "var(--accent)", color: "var(--bg-primary)", fontFamily: "var(--font-display)" }}
        >
          CF
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          CaseFlow
        </p>
        {isStreaming && <StreamingDots />}
      </div>
      {/* Content — full width */}
      {content ? (
        <div className="markdown-body text-[14px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        isStreaming && (
          <div className="space-y-4 py-3">
            {[90, 75, 60, 45].map((w, i) => (
              <div key={i} className="h-4 rounded-lg animate-shimmer" style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )
      )}
      {!isStreaming && content && (
        <div className="mt-2"><CopyButton text={content} /></div>
      )}
    </div>
  );
}

// ── User bubble ────────────────────────────────────────────────────────────
function UserBubble({ content }: { content: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <div
          className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-[11px] font-bold shrink-0"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)", border: "1px solid var(--border)", fontFamily: "var(--font-display)" }}
        >
          U
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>You</p>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{content}</p>
      <div className="mt-2"><CopyButton text={content} /></div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface ChatViewProps {
  chatId: string;
}

export default function ChatView({ chatId }: ChatViewProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [streamText, setStreamText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  // Follow-up state
  const [inputValue, setInputValue] = useState("");
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const [followUpStreamText, setFollowUpStreamText] = useState("");

  // SSE progress state
  const [logSteps, setLogSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  // Modal state
  const [captchaModal, setCaptchaModal] = useState<{ img: string; error?: string } | null>(null);
  const [showDistrictPsModal, setShowDistrictPsModal] = useState(false);
  const [districtPsHint, setDistrictPsHint] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string>();
  const [submittingManualInput, setSubmittingManualInput] = useState(false);

  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebar();

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const hasChat = chat !== null;

  function updateScrollButtons(element: HTMLDivElement) {
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setShowScrollTop(element.scrollTop > 150);
    setShowScrollBottom(distanceFromBottom > 150);
  }

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
    updateScrollButtons(element);
  }

  function scrollToEdge(edge: "top" | "bottom") {
    const element = scrollRef.current;
    if (!element) return;
    followLatest.current = edge === "bottom";
    element.scrollTo({
      top: edge === "top" ? 0 : element.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  useEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || !content) return;

    const observer = new ResizeObserver(() => {
      if (followLatest.current) element.scrollTop = element.scrollHeight;
      updateScrollButtons(element);
    });

    observer.observe(element);
    observer.observe(content);
    return () => observer.disconnect();
  }, [hasChat]);

  useEffect(() => subscribeToChatUpdates((entry) => {
    if (entry.id === chatId) {
      setChat((current) => current && current.title !== entry.title
        ? { ...current, title: entry.title }
        : current
      );
    }
  }), [chatId]);

  // Load chat data
  useEffect(() => {
    const request = new AbortController();
    fetch(`/api/chats/${chatId}`, { signal: request.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Chat not found");
        return r.json();
      })
      .then((data: Chat) => {
        setChat(data);
        if (data.messages.some((m) => m.role === "assistant")) {
          setHasStarted(true);
        }
      })
      .catch(() => {
        if (!request.signal.aborted) router.push("/");
      });
    return () => request.abort();
  }, [chatId, router]);

  // ── Handle a single SSE event (summary flow) ──────────────────────────
  const handleSSEvent = useCallback(
    (evt: CaseStreamEvent) => {
      switch (evt.type) {
        case "summary_log": {
          const msg = evt.content ?? "";
          setCurrentStep(msg);
          setLogSteps((prev) => {
            // Replace duplicate current step or append
            if (prev.length > 0 && prev[prev.length - 1] === msg) return prev;
            return [...prev, msg];
          });
          break;
        }
        case "manual_input_request": {
          const meta = evt.metadata;
          if (!meta) break;
          setManualError(undefined);
          if (meta.type === "solve_captcha") {
            setCaptchaModal({ img: meta.captcha_img, error: meta.error });
          } else if (meta.type === "district_ps") {
            setDistrictPsHint(meta.police_station || null);
            setShowDistrictPsModal(true);
          }
          break;
        }
        case "text_chunk": {
          setShowDistrictPsModal(false);
          setCurrentStep((prev) => (prev === null ? prev : null));
          setStreamText((prev) => prev + (evt.content ?? ""));
          break;
        }
      }
    },
    []
  );

  // ── Initial summary stream (SSE) ─────────────────────────────────────
  const startStream = useCallback(async () => {
    if (hasStarted || isStreaming) return;
    const request = new AbortController();
    activeRequest.current = request;
    setHasStarted(true);
    setIsStreaming(true);
    setError(null);
    setStreamText("");
    setLogSteps([]);
    setCurrentStep((prev) => (prev === null ? prev : null));

    try {
      const res = await fetch(`/api/chats/${chatId}/stream`, {
        method: "POST", signal: request.signal,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `Backend error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = readEvents(buffer, (event) => {
          const message = streamError(event);
          if (message) throw new Error(message);
          handleSSEvent(event);
        });
      }

      // Re-fetch saved chat
      const response = await fetch(`/api/chats/${chatId}`, { signal: request.signal });
      if (!response.ok) throw new Error("Couldn’t reload the saved case.");
      const updatedChat: Chat = await response.json();
      setChat(updatedChat);
      announceChatUpdate(updatedChat);
      setStreamText("");
      setLogSteps([]);
      setCurrentStep((prev) => (prev === null ? prev : null));
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStreamText("");
    } finally {
      request.abort();
      if (activeRequest.current === request) activeRequest.current = null;
      setCaptchaModal(null);
      setShowDistrictPsModal(false);
      setIsStreaming(false);
    }
  }, [chatId, hasStarted, isStreaming, handleSSEvent]);

  // ── Follow-up message stream (SSE) ────────────────────────────────────
  const sendFollowUp = useCallback(async () => {
    const question = inputValue.trim();
    if (!question || isFollowingUp || isStreaming) return;

    const request = new AbortController();
    activeRequest.current = request;
    followLatest.current = true;
    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsFollowingUp(true);
    setFollowUpStreamText("");

    setError(null);
    const pendingMessage: ChatMessage = { role: "user", content: question, timestamp: Date.now() };
    setChat((previous) => previous
      ? { ...previous, messages: [...previous.messages, pendingMessage] }
      : previous
    );

    try {
      const res = await fetch(`/api/chats/${chatId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: request.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `Backend error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = readEvents(buffer, (evt) => {
          const message = streamError(evt);
          if (message) throw new Error(message);
          if (evt.type === "text_chunk") {
            setFollowUpStreamText((prev) => prev + (evt.content ?? ""));
          }
        });
      }

      const response = await fetch(`/api/chats/${chatId}`, { signal: request.signal });
      if (!response.ok) throw new Error("Couldn’t reload the saved case.");
      const updatedChat: Chat = await response.json();
      setChat(updatedChat);
      announceChatUpdate(updatedChat);
      setFollowUpStreamText("");
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setInputValue(question);
      setFollowUpStreamText("");
      setChat((previous) => previous
        ? { ...previous, messages: previous.messages.filter((message) => message !== pendingMessage) }
        : previous
      );
    } finally {
      request.abort();
      if (activeRequest.current === request) activeRequest.current = null;
      setIsFollowingUp(false);
    }
  }, [chatId, inputValue, isFollowingUp, isStreaming]);

  async function sendManualInput(values: Record<string, string>, onAccepted: () => void) {
    const request = activeRequest.current;
    if (!request || submittingManualInput) return;
    setSubmittingManualInput(true);
    setManualError(undefined);

    try {
      const response = await fetch(`/api/chats/${chatId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        signal: request.signal,
      });
      if (!response.ok) throw new Error();
      onAccepted();
    } catch {
      if (!request.signal.aborted) setManualError("Couldn’t submit your input. Try again.");
    } finally {
      setSubmittingManualInput(false);
    }
  }

  // Auto-start stream
  useEffect(() => {
    if (chat && !chat.messages.some((message) => message.role === "assistant") && !hasStarted) {
      startStream();
    }
  }, [chat, hasStarted, startStream]);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4" role="status">
          <div className="w-10 h-10 rounded-xl animate-shimmer" />
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            Loading case...
          </span>
        </div>
      </div>
    );
  }

  const conversationMessages = chat.messages.slice(1);
  const summary = chat.messages.find((message) => message.role === "assistant");
  const summaryDone = !isStreaming && Boolean(summary);
  const busyStreaming = isStreaming || isFollowingUp;

  return (
    <div className="flex h-full flex-col relative">
      {/* Modals */}
      {captchaModal && (
        <CaptchaModal
          key={captchaModal.img}
          captchaImg={captchaModal.img}
          errorMsg={manualError || captchaModal.error}
          submitting={submittingManualInput}
          onSubmit={(captchaText) => void sendManualInput(
            { captcha_text: captchaText },
            () => setCaptchaModal((current) => current === captchaModal ? null : current),
          )}
        />
      )}
      {showDistrictPsModal && (
        <DistrictPsModal
          policeStation={districtPsHint}
          errorMsg={manualError}
          submitting={submittingManualInput}
          onSubmit={(district, ps) => void sendManualInput(
            { district, ps },
            () => setShowDistrictPsModal(false),
          )}
        />
      )}

      {/* Floating header pills */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="flex items-center justify-between gap-2 px-3 md:px-5 pt-3 md:pt-4">
          {/* Left pill: hamburger + title */}
          <div
            className="pointer-events-auto flex min-w-0 items-center gap-2 pl-1 pr-3 md:pl-3 md:pr-4 py-1.5 md:py-2 rounded-full shadow-lg"
            style={{
              background: "rgba(17, 17, 17, 0.85)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Hamburger — mobile only */}
            <button
              onClick={toggleSidebar}
              aria-label="Case history"
              aria-expanded={sidebarOpen}
              aria-controls="case-sidebar"
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer md:hidden shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            {busyStreaming && (
              <div className="w-1.5 h-1.5 rounded-full animate-glow shrink-0" style={{ background: "var(--accent)" }} />
            )}
            <h1 className="min-w-0 truncate text-[13px] font-bold tracking-tight"
              title={chat.title} style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
              {chat.title}
            </h1>
            {busyStreaming && (
              <span
                role="status"
                className="ui-appear text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                style={{ background: "var(--accent-glow)", color: "var(--accent)", fontFamily: "var(--font-body)" }}
              >
                Live
              </span>
            )}
          </div>
          <CaseActions chat={chat} summary={summaryDone ? summary : undefined} />
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div ref={contentRef} className="max-w-3xl mx-auto px-4 md:px-6 pt-16 md:pt-20 pb-36 md:pb-40">

          {/* Initial user message */}
          <div className="mb-8 md:mb-10">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div
                className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-[11px] font-bold shrink-0"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)", border: "1px solid var(--border)", fontFamily: "var(--font-display)" }}
              >
                U
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                You
              </p>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Generate case summary for{" "}
              <span
                className="font-semibold px-1.5 py-0.5 rounded-md"
                style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", background: "var(--accent-glow)", fontSize: "0.85em", letterSpacing: "0.03em" }}
              >
                {chat.cnr_num}
              </span>
            </p>
          </div>

          {/* Separator */}
          <div className="mb-8 md:mb-10">
            <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }} />
          </div>

          <span className="sr-only" role="status">{isStreaming ? currentStep : ""}</span>
          {isStreaming && (logSteps.length > 0 || streamText) && (
            <div className="mb-8 md:mb-10">
              {!streamText && (
                <div className="ui-appear flex items-center gap-2.5 mb-2">
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-[11px] font-extrabold shrink-0" style={{ background: "var(--accent)", color: "var(--bg-primary)", fontFamily: "var(--font-display)" }}>
                    CF
                  </div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    CaseFlow
                  </p>
                  <StreamingDots />
                </div>
              )}
              {logSteps.length > 0 && <ProgressSteps steps={logSteps} currentStep={currentStep} />}
              {streamText && (
                <div className="mt-4">
                  <AssistantBubble content={streamText} isStreaming />
                </div>
              )}
            </div>
          )}

          {/* All persisted messages after the initial user message */}
          {conversationMessages.map((msg, idx) => {
            const isLastAssistant =
              isFollowingUp &&
              idx === conversationMessages.length - 1 &&
              msg.role === "assistant";
            if (isLastAssistant) return null;

            return (
              <div key={idx} className="mb-8 md:mb-10">
                {msg.role === "assistant" ? (
                  <AssistantBubble content={msg.content} />
                ) : (
                  <UserBubble content={msg.content} />
                )}
              </div>
            );
          })}

          {/* Live follow-up stream */}
          {isFollowingUp && (
            <div className="ui-appear mb-8 md:mb-10">
              <AssistantBubble content={followUpStreamText} isStreaming={true} />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="ui-appear mt-6 md:mt-8 rounded-xl overflow-hidden"
              role="alert"
              style={{ background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.12)" }}
            >
              <div className="px-4 md:px-5 py-3 md:py-4 flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--danger)", fontFamily: "var(--font-display)" }}>
                    Request failed
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scroll buttons — stacked bottom-right */}
      <div className="absolute right-3 md:right-5 bottom-20 md:bottom-24 z-10 flex flex-col items-center gap-1.5">
        <button
          onClick={() => scrollToEdge("top")}
          tabIndex={showScrollTop ? 0 : -1}
          className={`scroll-btn rounded-full flex items-center justify-center cursor-pointer ${showScrollTop ? "scroll-btn-visible" : ""}`}
          style={{ background: "var(--bg-secondary)", color: "var(--text-muted)", boxShadow: showScrollTop ? "0 2px 10px rgba(0,0,0,0.4)" : "none" }}
          aria-label="Scroll to top"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          onClick={() => scrollToEdge("bottom")}
          tabIndex={showScrollBottom ? 0 : -1}
          className={`scroll-btn rounded-full flex items-center justify-center cursor-pointer ${showScrollBottom ? "scroll-btn-visible" : ""}`}
          style={{ background: "var(--bg-secondary)", color: "var(--text-muted)", boxShadow: showScrollBottom ? "0 2px 10px rgba(0,0,0,0.4)" : "none" }}
          aria-label="Scroll to bottom"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Floating follow-up input — shown once the initial summary is done */}
      {summaryDone && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none pb-4 md:pb-5 px-3 md:px-6">
          <div className="ui-appear max-w-3xl mx-auto pointer-events-auto">
            <div className="composer-field flex items-end gap-2 md:gap-3 rounded-2xl px-3 md:px-4 py-2.5 md:py-3">
              <textarea
                ref={inputRef}
                rows={1}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendFollowUp();
                  }
                }}
                aria-label="Ask a follow-up"
                placeholder="Ask a follow-up…"
                disabled={busyStreaming}
                className="flex-1 bg-transparent resize-none outline-none focus:outline-none text-sm leading-relaxed"
                style={{
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  caretColor: "var(--accent)",
                  minHeight: "24px",
                  maxHeight: "120px",
                  overflow: "hidden",
                }}
              />
              <button
                onClick={sendFollowUp}
                aria-label="Send follow-up"
                disabled={busyStreaming || !inputValue.trim()}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
                style={{
                  background: busyStreaming || !inputValue.trim() ? "var(--bg-elevated)" : "var(--accent)",
                  color: busyStreaming || !inputValue.trim() ? "var(--text-muted)" : "var(--bg-primary)",
                  cursor: busyStreaming || !inputValue.trim() ? "not-allowed" : "pointer",
                }}
              >
                {isFollowingUp ? (
                  <Spinner size={14} />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
