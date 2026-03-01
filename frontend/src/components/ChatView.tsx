"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Chat } from "../lib/types";

interface ChatViewProps {
  chatId: string;
}

export default function ChatView({ chatId }: ChatViewProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [streamText, setStreamText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  }, [streamText, chat?.messages]);

  // Start streaming
  const startStream = useCallback(async () => {
    if (hasStarted || isStreaming) return;
    setHasStarted(true);
    setIsStreaming(true);
    setError(null);
    setStreamText("");

    try {
      const res = await fetch(`/api/chats/${chatId}/stream`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `Backend error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setStreamText(accumulated);
      }

      const updatedChat = await fetch(`/api/chats/${chatId}`).then((r) =>
        r.json()
      );
      setChat(updatedChat);
      setStreamText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setIsStreaming(false);
    }
  }, [chatId, hasStarted, isStreaming]);

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
          <div className="relative">
            <div
              className="w-10 h-10 rounded-xl animate-shimmer"
            />
          </div>
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

  const assistantMessages = chat.messages.filter((m) => m.role === "assistant");
  const displayContent =
    streamText ||
    (assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1].content
      : "");

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header
        className="h-[56px] shrink-0 flex items-center justify-between px-6"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          {isStreaming && (
            <div
              className="w-2 h-2 rounded-full animate-glow"
              style={{ background: "var(--accent)" }}
            />
          )}
          <h1
            className="text-sm font-bold tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-primary)",
            }}
          >
            {chat.title}
          </h1>
          {isStreaming && (
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{
                background: "var(--accent-glow)",
                color: "var(--accent)",
                fontFamily: "var(--font-body)",
              }}
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
        <div className="max-w-3xl mx-auto px-6 py-10">
          {/* User message */}
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
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  You
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
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
          <div
            className="mb-10 animate-fade-in-up"
            style={{ animationDelay: "0.1s" }}
          >
            <div
              className="h-px w-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--border), transparent)",
              }}
            />
          </div>

          {/* Assistant response */}
          {(displayContent || isStreaming) && (
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: "0.2s" }}
            >
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
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      CaseFlow
                    </p>
                    {isStreaming && (
                      <span className="inline-flex gap-1 ml-1">
                        <span
                          className="streaming-dot inline-block w-1 h-1 rounded-full"
                          style={{ background: "var(--accent)" }}
                        />
                        <span
                          className="streaming-dot inline-block w-1 h-1 rounded-full"
                          style={{ background: "var(--accent)" }}
                        />
                        <span
                          className="streaming-dot inline-block w-1 h-1 rounded-full"
                          style={{ background: "var(--accent)" }}
                        />
                      </span>
                    )}
                  </div>

                  {displayContent ? (
                    <div className="markdown-body text-[14px]">
                      <ReactMarkdown>{displayContent}</ReactMarkdown>
                    </div>
                  ) : (
                    isStreaming && (
                      <div className="space-y-4 py-3">
                        <div
                          className="h-4 rounded-lg animate-shimmer"
                          style={{ width: "90%" }}
                        />
                        <div
                          className="h-4 rounded-lg animate-shimmer"
                          style={{ width: "75%", animationDelay: "0.15s" }}
                        />
                        <div
                          className="h-4 rounded-lg animate-shimmer"
                          style={{ width: "60%", animationDelay: "0.3s" }}
                        />
                        <div
                          className="h-4 rounded-lg animate-shimmer"
                          style={{ width: "45%", animationDelay: "0.45s" }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="mt-8 rounded-xl overflow-hidden animate-fade-in-up"
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.12)",
              }}
            >
              <div className="px-5 py-4 flex items-start gap-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p
                    className="text-sm font-semibold mb-0.5"
                    style={{
                      color: "var(--danger)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    Request failed
                  </p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
