"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ChatListItem } from "../lib/types";

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 272;
const COLLAPSED_WIDTH = 56;

export default function Sidebar() {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const widthBeforeCollapse = useRef(DEFAULT_WIDTH);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/chats")
      .then((r) => r.json())
      .then(setChats)
      .catch(() => {});
  }, [pathname]);

  // ── Drag-to-resize logic ──────────────────────────────────────────────
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  // ── Collapse / expand ─────────────────────────────────────────────────
  const toggleCollapse = () => {
    if (collapsed) {
      setCollapsed(false);
      setWidth(widthBeforeCollapse.current);
    } else {
      widthBeforeCollapse.current = width;
      setCollapsed(true);
    }
  };

  const activeChatId = pathname.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    setChats((prev) => prev.filter((c) => c.id !== id));
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const currentWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <aside
      ref={sidebarRef}
      className="relative h-screen flex flex-col shrink-0"
      style={{
        width: currentWidth,
        transition: isResizing ? "none" : "width 0.3s cubic-bezier(0.16,1,0.3,1)",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 h-[56px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold transition-transform group-hover:scale-105"
              style={{
                background: "var(--accent)",
                color: "var(--bg-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              CF
            </div>
            <span
              className="text-sm font-bold tracking-tight"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              CaseFlow
            </span>
          </Link>
        )}
        <button
          onClick={toggleCollapse}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
      </div>

      {/* New Lookup button */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1">
          <Link
            href="/"
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110"
            style={{
              background: "var(--accent-glow)",
              color: "var(--accent)",
              border: "1px solid var(--border-accent)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.01em",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Lookup
          </Link>
        </div>
      )}

      {/* Chat list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center py-10 px-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p
                className="text-xs text-center leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                No cases yet.
                <br />
                Start your first lookup.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {chats.map((chat, i) => (
                <Link
                  key={chat.id}
                  href={`/chat/${chat.id}`}
                  className="animate-slide-in group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-150"
                  style={{
                    animationDelay: `${i * 0.04}s`,
                    background:
                      activeChatId === chat.id
                        ? "var(--bg-tertiary)"
                        : "transparent",
                    color:
                      activeChatId === chat.id
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    borderLeft:
                      activeChatId === chat.id
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate text-[13px]"
                      style={{
                        fontWeight: activeChatId === chat.id ? 600 : 400,
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {chat.title}
                    </p>
                    <p
                      className="text-[10px] mt-0.5 font-medium"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                      }}
                    >
                      {formatDate(chat.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, chat.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all hover:bg-[var(--bg-elevated)] cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                    title="Delete"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!collapsed && (
        <div
          className="px-4 py-3 text-[10px] tracking-wide uppercase font-medium"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            letterSpacing: "0.08em",
          }}
        >
          eCourts Intelligence Tool
        </div>
      )}

      {/* Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={startResizing}
          onDoubleClick={toggleCollapse}
          className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize group z-10"
          style={{ transform: "translateX(50%)" }}
        >
          <div
            className="absolute top-0 right-[2px] w-[1px] h-full transition-colors duration-150"
            style={{
              background: isResizing ? "var(--accent)" : "transparent",
            }}
          />
          <div
            className="absolute top-0 right-[2px] w-[1px] h-full transition-colors duration-150 group-hover:!bg-[var(--accent)]"
            style={{ background: "transparent" }}
          />
        </div>
      )}
    </aside>
  );
}
