"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Chat } from "../lib/types";
import { useSidebar } from "./SidebarProvider";

// ── SSE event types (mirrors backend SSEventType) ──────────────────────────
interface SSEvent {
  type: "text_chunk" | "summary_log" | "manual_input_request";
  content: string | null;
  metadata: Record<string, string> | null;
}

// ── SSE parser helper ──────────────────────────────────────────────────────
function parseSSEChunk(
  buffer: string,
  onEvent: (evt: SSEvent) => void
): string {
  let idx: number;
  while ((idx = buffer.indexOf("\n\n")) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    if (line.startsWith("data: ")) {
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* ignore malformed */
      }
    }
  }
  return buffer;
}

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
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
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
    <span className="inline-flex gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="streaming-dot inline-block w-1 h-1 rounded-full" style={{ background: "var(--accent)" }} />
      ))}
    </span>
  );
}

// ── Spinner icon ───────────────────────────────────────────────────────────
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
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
    <div className="flex flex-col gap-2 py-3">
      {steps.map((step, i) => {
        const isCurrent = step === currentStep;
        return (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              {isCurrent ? <Spinner size={14} /> : <CheckIcon />}
            </div>
            <span
              className="text-[13px]"
              style={{
                color: isCurrent ? "var(--text-primary)" : "var(--text-muted)",
                fontFamily: "var(--font-body)",
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Captcha Modal ──────────────────────────────────────────────────────────
function CaptchaModal({
  captchaImg,
  errorMsg,
  onSubmit,
}: {
  captchaImg: string;
  errorMsg?: string;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 6) {
      onSubmit(trimmed);
      setValue("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div
        className="rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-2xl animate-fade-in-up"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-base font-bold mb-4" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
          Solve Captcha (lowercase only)
        </h3>

        {errorMsg && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)" }}>
            {errorMsg}
          </p>
        )}

        <div className="flex justify-center mb-4 rounded-lg overflow-hidden" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
          <img src={`data:image/png;base64,${captchaImg}`} alt="captcha" className="h-16 object-contain" />
        </div>

        <input
          ref={inputRef}
          type="text"
          maxLength={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Enter 6 characters"
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
          disabled={value.trim().length !== 6}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
          style={{
            background: value.trim().length === 6 ? "var(--accent)" : "var(--bg-elevated)",
            color: value.trim().length === 6 ? "var(--bg-primary)" : "var(--text-muted)",
            cursor: value.trim().length === 6 ? "pointer" : "not-allowed",
            fontFamily: "var(--font-display)",
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

// ── District / PS Modal ────────────────────────────────────────────────────
function DistrictPsModal({ policeStation, onSubmit }: { policeStation?: string | null; onSubmit: (district: string, ps: string) => void }) {
  const [allPs, setAllPs] = useState<Record<string, string[]> | null>(null);
  const [district, setDistrict] = useState("");
  const [ps, setPs] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/chats/all-ps")
      .then((r) => r.json())
      .then((data) => {
        setAllPs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const districts = allPs ? Object.keys(allPs).sort() : [];
  const stations = allPs && district ? allPs[district]?.sort() ?? [] : [];

  const handleSubmit = () => {
    if (district && ps) onSubmit(district, ps);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div
        className="rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-2xl animate-fade-in-up"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-base font-bold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
          Select Police Station
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          Choose the district and police station for FIR retrieval
        </p>

        {policeStation && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl" style={{ background: "var(--accent-glow)", border: "1px solid var(--border-accent)" }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>eCourts PS:</span>
            <span className="text-sm font-semibold" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{policeStation}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
        ) : (
          <>
            <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>District</label>
            <select
              value={district}
              onChange={(e) => { setDistrict(e.target.value); setPs(""); }}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-4 appearance-none"
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

            <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Police Station</label>
            <select
              value={ps}
              onChange={(e) => setPs(e.target.value)}
              disabled={!district}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-5 appearance-none"
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
              disabled={!district || !ps}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                background: district && ps ? "var(--accent)" : "var(--bg-elevated)",
                color: district && ps ? "var(--bg-primary)" : "var(--text-muted)",
                cursor: district && ps ? "pointer" : "not-allowed",
                fontFamily: "var(--font-display)",
              }}
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { toggle: toggleSidebar } = useSidebar();

  // Scroll tracking for scroll buttons
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromTop = el.scrollTop;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollTop(distFromTop > 150);
    setShowScrollBottom(distFromBottom > 150);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  // Re-evaluate scroll buttons after content loads/changes (runs AFTER auto-scroll)
  useEffect(() => {
    const t = setTimeout(handleScroll, 250);
    return () => clearTimeout(t);
  }, [chat?.messages, streamText, followUpStreamText, logSteps, handleScroll]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      // Immediately re-check scroll button visibility
      handleScroll();
    }
  }, [streamText, followUpStreamText, chat?.messages, logSteps, handleScroll]);

  // Load chat data
  useEffect(() => {
    fetch(`/api/chats/${chatId}`)
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
      .catch(() => router.push("/"));
  }, [chatId, router]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText, followUpStreamText, chat?.messages, logSteps]);

  // ── Handle a single SSE event (summary flow) ──────────────────────────
  const handleSSEvent = useCallback(
    (evt: SSEvent) => {
      switch (evt.type) {
        case "summary_log": {
          const msg = evt.content ?? "";
          if (msg.startsWith("Error:")) {
            setError(msg);
            return;
          }
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
          if (meta.type === "solve_captcha") {
            setCaptchaModal({ img: meta.captcha_img, error: meta.error });
          } else if (meta.type === "district_ps") {
            setDistrictPsHint(meta.police_station || null);
            setShowDistrictPsModal(true);
          }
          break;
        }
        case "text_chunk": {
          // First text chunk means "Generating case summary" step is done
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
    setHasStarted(true);
    setIsStreaming(true);
    setError(null);
    setStreamText("");
    setLogSteps([]);
    setCurrentStep((prev) => (prev === null ? prev : null));

    try {
      const res = await fetch(`/api/chats/${chatId}/stream`, { method: "POST" });
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
        buffer = parseSSEChunk(buffer, handleSSEvent);
      }

      // Re-fetch saved chat
      const updatedChat = await fetch(`/api/chats/${chatId}`).then((r) => r.json());
      setChat(updatedChat);
      setStreamText("");
      setLogSteps([]);
      setCurrentStep((prev) => (prev === null ? prev : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }, [chatId, hasStarted, isStreaming, handleSSEvent]);

  // ── Follow-up message stream (SSE) ────────────────────────────────────
  const sendFollowUp = useCallback(async () => {
    const question = inputValue.trim();
    if (!question || isFollowingUp || isStreaming) return;

    setInputValue("");
    setIsFollowingUp(true);
    setFollowUpStreamText("");

    setChat((prev) =>
      prev ? { ...prev, messages: [...prev.messages, { role: "user", content: question, timestamp: Date.now() }] } : prev
    );

    try {
      const res = await fetch(`/api/chats/${chatId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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
        buffer = parseSSEChunk(buffer, (evt) => {
          if (evt.type === "text_chunk") {
            setFollowUpStreamText((prev) => prev + (evt.content ?? ""));
          }
        });
      }

      const updatedChat = await fetch(`/api/chats/${chatId}`).then((r) => r.json());
      setChat(updatedChat);
      setFollowUpStreamText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsFollowingUp(false);
    }
  }, [chatId, inputValue, isFollowingUp, isStreaming]);

  // ── Manual input handlers ─────────────────────────────────────────────
  const submitCaptcha = useCallback(async (text: string) => {
    setCaptchaModal(null);
    try {
      await fetch(`/api/chats/${chatId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captcha_text: text }),
      });
    } catch {
      setError("Failed to submit captcha");
    }
  }, [chatId]);

  const submitDistrictPs = useCallback(async (district: string, ps: string) => {
    setShowDistrictPsModal(false);
    try {
      await fetch(`/api/chats/${chatId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, ps }),
      });
    } catch {
      setError("Failed to submit selection");
    }
  }, [chatId]);

  // Auto-start stream
  useEffect(() => {
    if (chat && chat.messages.length === 0 && !hasStarted) {
      startStream();
    }
  }, [chat, hasStarted, startStream]);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <div className="w-10 h-10 rounded-xl animate-shimmer" />
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            Loading case...
          </span>
        </div>
      </div>
    );
  }

  const conversationMessages = chat.messages.slice(1);
  const summaryDone = !isStreaming && conversationMessages.length > 0;
  const busyStreaming = isStreaming || isFollowingUp;

  return (
    <div className="flex flex-col h-screen relative">
      {/* Modals */}
      {captchaModal && <CaptchaModal captchaImg={captchaModal.img} errorMsg={captchaModal.error} onSubmit={submitCaptcha} />}
      {showDistrictPsModal && <DistrictPsModal policeStation={districtPsHint} onSubmit={submitDistrictPs} />}

      {/* Floating header pills */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="flex items-center justify-between px-3 md:px-5 pt-3 md:pt-4">
          {/* Left pill: hamburger + title */}
          <div
            className="pointer-events-auto flex items-center gap-2 pl-1 pr-3 md:pl-3 md:pr-4 py-1.5 md:py-2 rounded-full shadow-lg"
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
            <h1 className="text-[13px] font-bold tracking-tight truncate max-w-[180px] md:max-w-none" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
              {chat.title}
            </h1>
            {busyStreaming && (
              <span
                className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-md shrink-0"
                style={{ background: "var(--accent-glow)", color: "var(--accent)", fontFamily: "var(--font-body)" }}
              >
                Live
              </span>
            )}
          </div>
          {/* Right pill: CNR badge */}
          <div
            className="pointer-events-auto px-2.5 md:px-3 py-1.5 md:py-2 rounded-full shadow-lg hidden sm:block"
            style={{
              background: "rgba(17, 17, 17, 0.85)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--border-accent)",
            }}
          >
            <span
              className="text-[10px] md:text-xs font-medium"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.03em",
              }}
            >
              {chat.cnr_num}
            </span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-16 md:pt-20 pb-36 md:pb-40">

          {/* Initial user message */}
          <div className="animate-fade-in-up mb-8 md:mb-10">
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
          <div className="mb-8 md:mb-10 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }} />
          </div>

          {/* Progress log steps (during summary generation) */}
          {isStreaming && logSteps.length > 0 && !streamText && (
            <div className="animate-fade-in-up mb-8 md:mb-10" style={{ animationDelay: "0.15s" }}>
              <div className="flex items-center gap-2.5 mb-2">
                <div
                  className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-[11px] font-extrabold shrink-0"
                  style={{ background: "var(--accent)", color: "var(--bg-primary)", fontFamily: "var(--font-display)" }}
                >
                  CF
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  CaseFlow
                </p>
                <StreamingDots />
              </div>
              <ProgressSteps steps={logSteps} currentStep={currentStep} />
            </div>
          )}

          {/* Initial summary streaming (after text_chunk starts) */}
          {(isStreaming && streamText) && (
            <div className="animate-fade-in-up mb-8 md:mb-10" style={{ animationDelay: "0.2s" }}>
              {logSteps.length > 0 && (
                <div className="mb-6">
                  <ProgressSteps steps={logSteps} currentStep={null} />
                </div>
              )}
              <AssistantBubble content={streamText} isStreaming={isStreaming} />
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
              <div key={idx} className="animate-fade-in-up mb-8 md:mb-10">
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
            <div className="animate-fade-in-up mb-8 md:mb-10">
              <AssistantBubble content={followUpStreamText} isStreaming={true} />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="mt-6 md:mt-8 rounded-xl overflow-hidden animate-fade-in-up"
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
          onClick={scrollToTop}
          className={`scroll-btn rounded-full flex items-center justify-center cursor-pointer ${showScrollTop ? "scroll-btn-visible" : ""}`}
          style={{ background: "var(--bg-secondary)", color: "var(--text-muted)", boxShadow: showScrollTop ? "0 2px 10px rgba(0,0,0,0.4)" : "none" }}
          aria-label="Scroll to top"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          onClick={scrollToBottom}
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
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <div
              className="flex items-end gap-2 md:gap-3 rounded-2xl px-3 md:px-4 py-2.5 md:py-3 shadow-2xl"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                boxShadow: "0 -8px 32px rgba(0,0,0,0.4), 0 0 0 1px var(--border)",
                backdropFilter: "blur(12px)",
              }}
            >
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
