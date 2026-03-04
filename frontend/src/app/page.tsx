"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [cnr, setCnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cnr.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnr_num: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create chat");
      }

      const chat = await res.json();
      router.push(`/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-screen px-6 overflow-hidden">
      {/* Ambient background glow */}
      <div className="ambient-gradient absolute inset-0 pointer-events-none" />

      {/* Decorative grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Staggered entrance */}
        <div className="text-center mb-12 animate-fade-in-up">
          {/* Logo mark */}
          <div className="inline-flex items-center gap-2 mb-8">
            <div className="deco-line" />
            <span
              className="text-[11px] font-semibold tracking-[0.2em] uppercase"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
            >
              eCourts Intelligence
            </span>
            <div className="deco-line" style={{ transform: "scaleX(-1)" }} />
          </div>

          {/* Hero title */}
          <h1
            className="text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.95] mb-5"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Case
            <span style={{ color: "var(--accent)" }}>Flow</span>
          </h1>

          <p
            className="text-base md:text-lg font-light max-w-md mx-auto leading-relaxed"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          >
            AI-powered case summaries from the Indian eCourts system.
            <br />
            <span style={{ color: "var(--text-muted)" }}>
              Enter a CNR number to begin.
            </span>
          </p>
        </div>

        {/* Input card */}
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: "0.15s" }}
        >
          <form onSubmit={handleSubmit}>
            <div
              className="input-glow rounded-2xl transition-all duration-300 overflow-hidden"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                boxShadow: "0 4px 32px rgba(0,0,0,0.3), 0 0 0 1px var(--border)",
              }}
            >
              <div className="flex items-center px-5 py-1">
                <div className="shrink-0 mr-3" style={{ color: "var(--text-muted)" }}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={cnr}
                  onChange={(e) => setCnr(e.target.value.toUpperCase())}
                  placeholder="KABC0A00151620243"
                  className="flex-1 bg-transparent py-5 text-base outline-none placeholder:opacity-30 focus:outline-none"
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                  }}
                  disabled={loading}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  suppressHydrationWarning
                />
                <button
                  type="submit"
                  disabled={!cnr.trim() || loading}
                  className="shrink-0 ml-3 px-6 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    background: cnr.trim() && !loading ? "var(--accent)" : "var(--bg-elevated)",
                    color: cnr.trim() && !loading ? "var(--bg-primary)" : "var(--text-muted)",
                    fontFamily: "var(--font-display)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray="31.4 31.4"
                          strokeDashoffset="10"
                        />
                      </svg>
                      Searching...
                    </span>
                  ) : (
                    "Lookup →"
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="mt-4 px-4 py-3 rounded-xl text-sm text-center animate-fade-in-up"
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Bottom hints */}
        <div
          className="mt-10 flex items-center justify-center gap-6 animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Secure lookup
          </div>
          <div
            className="w-px h-3"
            style={{ background: "var(--border)" }}
          />
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Real-time streaming
          </div>
          <div
            className="w-px h-3"
            style={{ background: "var(--border)" }}
          />
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            AI summary
          </div>
        </div>
      </div>
    </div>
  );
}
