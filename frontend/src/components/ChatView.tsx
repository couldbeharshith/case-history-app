"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Chat } from "../lib/types";

// ── Copy button ────────────────────────────────────────────────────────────────
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

// ── Streaming dots ─────────────────────────────────────────────────────────────
function StreamingDots() {
  return (
    <span className="inline-flex gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="streaming-dot inline-block w-1 h-1 rounded-full"
          style={{ background: "var(--accent)" }}
        />
      ))}
    </span>
  );
}

// ── Assistant bubble ───────────────────────────────────────────────────────────
function AssistantBubble({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5"
        style={{
          background: "var(--accent)",
          color: "var(--bg-primary)",
          fontFamily: "var(--font-display)",
        }}
      >
        CF
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
          >
            CaseFlow
          </p>
          {isStreaming && <StreamingDots />}
        </div>

        {content ? (
          <div className="markdown-body text-[14px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          isStreaming && (
            <div className="space-y-4 py-3">
              {[90, 75, 60, 45].map((w, i) => (
                <div
                  key={i}
                  className="h-4 rounded-lg animate-shimmer"
                  style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )
        )}

        {!isStreaming && content && (
          <div className="mt-2">
            <CopyButton text={content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── User bubble ────────────────────────────────────────────────────────────────
function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
          fontFamily: "var(--font-display)",
        }}
      >
        U
      </div>
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-1.5"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
        >
          You
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {content}
        </p>
        <div className="mt-2">
          <CopyButton text={content} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

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
  }, [streamText, followUpStreamText, chat?.messages]);

  // Initial summary stream
  const startStream = useCallback(async () => {
    if (hasStarted || isStreaming) return;
    setHasStarted(true);
    setIsStreaming(true);
    setError(null);
    setStreamText("");

    try {
      const res = await fetch(`/api/chats/${chatId}/stream`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `Backend error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamText(accumulated);
      }

      const updatedChat = await fetch(`/api/chats/${chatId}`).then((r) => r.json());
      setChat(updatedChat);
      setStreamText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }, [chatId, hasStarted, isStreaming]);

  // Follow-up message stream
  const sendFollowUp = useCallback(async () => {
    const question = inputValue.trim();
    if (!question || isFollowingUp || isStreaming) return;

    setInputValue("");
    setIsFollowingUp(true);
    setFollowUpStreamText("");

    // Optimistic: add user message to local state
    setChat((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, { role: "user", content: question, timestamp: Date.now() }] }
        : prev
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
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setFollowUpStreamText(accumulated);
      }

      // Re-fetch to get the fully saved state
      const updatedChat = await fetch(`/api/chats/${chatId}`).then((r) => r.json());
      setChat(updatedChat);
      setFollowUpStreamText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsFollowingUp(false);
    }
  }, [chatId, inputValue, isFollowingUp, isStreaming]);

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
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
          >
            Loading case...
          </span>
        </div>
      </div>
    );
  }

  // Messages after the initial "Generate summary" user message
  const conversationMessages = chat.messages.slice(1);
  const summaryDone = !isStreaming && conversationMessages.length > 0;
  const busyStreaming = isStreaming || isFollowingUp;

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header
        className="h-[56px] shrink-0 flex items-center justify-between px-6"
        style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          {busyStreaming && (
            <div className="w-2 h-2 rounded-full animate-glow" style={{ background: "var(--accent)" }} />
          )}
          <h1
            className="text-sm font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            {chat.title}
          </h1>
          {busyStreaming && (
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ background: "var(--accent-glow)", color: "var(--accent)", fontFamily: "var(--font-body)" }}
            >
              Live
            </span>
          )}
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
            border: "1px solid var(--border)",
          }}
        >
          {chat.cnr_num}
        </span>
      </header>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10 pb-6">

          {/* Initial user message */}
          <div className="animate-fade-in-up mb-10">
            <div className="flex items-start gap-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-display)",
                }}
              >
                U
              </div>
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  You
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Generate case summary for{" "}
                  <span
                    className="font-semibold px-1.5 py-0.5 rounded-md"
                    style={{
                      color: "var(--accent)",
                      fontFamily: "var(--font-mono)",
                      background: "var(--accent-glow)",
                      fontSize: "0.85em",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {chat.cnr_num}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="mb-10 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            <div
              className="h-px w-full"
              style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
            />
          </div>

          {/* Initial summary streaming (before it's saved) */}
          {(isStreaming || (streamText && !summaryDone)) && (
            <div className="animate-fade-in-up mb-10" style={{ animationDelay: "0.2s" }}>
              <AssistantBubble content={streamText} isStreaming={isStreaming} />
            </div>
          )}

          {/* All persisted messages after the initial user message */}
          {conversationMessages.map((msg, idx) => {
            // Skip the last assistant message if we're currently streaming a follow-up
            // (it will show as the live followUpStreamText bubble below)
            const isLastAssistant =
              isFollowingUp &&
              idx === conversationMessages.length - 1 &&
              msg.role === "assistant";
            if (isLastAssistant) return null;

            return (
              <div key={idx} className="animate-fade-in-up mb-10">
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
            <div className="animate-fade-in-up mb-10">
              <AssistantBubble content={followUpStreamText} isStreaming={true} />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="mt-8 rounded-xl overflow-hidden animate-fade-in-up"
              style={{ background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.12)" }}
            >
              <div className="px-5 py-4 flex items-start gap-3">
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

      {/* Follow-up input bar — shown once the initial summary is done */}
      {summaryDone && (
        <div
          className="shrink-0 px-6 py-4"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="max-w-3xl mx-auto">
            <div
              className="flex items-end gap-3 rounded-xl px-4 py-3"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendFollowUp();
                  }
                }}
                placeholder="Ask a follow-up question about this case…"
                disabled={busyStreaming}
                className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
                style={{
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  caretColor: "var(--accent)",
                  minHeight: "24px",
                  maxHeight: "160px",
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
            <p
              className="text-[11px] mt-2 text-center"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
            >
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
