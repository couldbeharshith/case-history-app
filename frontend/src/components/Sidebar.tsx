"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ChatListItem } from "../lib/types";
import { useSidebar } from "./SidebarProvider";

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
  const { open: mobileOpen, close: closeMobile } = useSidebar();

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const handleRename = async (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const newTitle = prompt("Rename case:", currentTitle);
    if (!newTitle || newTitle.trim() === currentTitle) return;
    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle.trim() } : c))
        );
      }
    } catch { /* ignore */ }
  };

  // 3-dot menu state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler as EventListener);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler as EventListener);
    };
  }, [menuOpenId]);

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
    <>
      {/* Mobile backdrop — always mounted, visibility via opacity */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={closeMobile}
      />

      <aside
        ref={sidebarRef}
        className={`
          relative h-screen flex flex-col shrink-0
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50
          max-md:transition-transform max-md:duration-300 max-md:ease-[cubic-bezier(0.16,1,0.3,1)]
          ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
        `}
        style={{
          width: isMobile ? 280 : currentWidth,
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
        <div className="flex items-center gap-1">
          {/* Close button — mobile only */}
          <button
            onClick={closeMobile}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer md:hidden"
            style={{ color: "var(--text-muted)" }}
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {/* Collapse button — desktop only */}
          <button
            onClick={toggleCollapse}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer hidden md:flex"
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
                    position: "relative",
                    zIndex: menuOpenId === chat.id ? 50 : "auto",
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
                  <div className="relative" ref={menuOpenId === chat.id ? menuRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === chat.id ? null : chat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all hover:bg-[var(--bg-elevated)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      title="Options"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                      </svg>
                    </button>
                    {menuOpenId === chat.id && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-xl py-1 shadow-xl animate-scale-in"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => { setMenuOpenId(null); handleRename(e, chat.id, chat.title); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer"
                          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Rename
                        </button>
                        <button
                          onClick={(e) => { setMenuOpenId(null); handleDelete(e, chat.id); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer"
                          style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!collapsed && (
        <div
          className="px-4 py-3 text-[10px] tracking-wide uppercase font-medium hidden md:block"
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

      {/* Resize handle — desktop only */}
      {!collapsed && (
        <div
          onMouseDown={startResizing}
          onDoubleClick={toggleCollapse}
          className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize group z-10 hidden md:block"
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
    </>
  );
}
