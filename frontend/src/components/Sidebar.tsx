"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { announceChatUpdate, subscribeToChatUpdates } from "../lib/chat-updates";
import type { ChatListItem } from "../lib/types";
import { useSidebar } from "./SidebarProvider";

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 272;
const COLLAPSED_WIDTH = 56;

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const daysAgo = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));

  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Sidebar() {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [search, setSearch] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { open: mobileOpen, close: closeMobile } = useSidebar();

  const terms = search.trim().toLowerCase().split(/\s+/);
  const visibleCases = chats.filter((chat) => {
    const text = `${chat.title} ${chat.cnr_num}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((first, second) =>
    Number(Boolean(second.pinned)) - Number(Boolean(first.pinned))
    || second.updated_at - first.updated_at
  );

  useEffect(() => subscribeToChatUpdates((entry) => {
    setChats((current) => [entry, ...current.filter((chat) => chat.id !== entry.id)]);
  }), []);

  useEffect(() => {
    const request = new AbortController();
    fetch("/api/chats", { signal: request.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((entries: ChatListItem[]) => {
        setHistoryError("");
        setChats(entries);
      })
      .catch(() => {
        if (!request.signal.aborted) setHistoryError("Couldn’t load case history.");
      });
    return () => request.abort();
  }, [pathname]);

  useEffect(() => {
    if (!isResizing) return;

    function handleMouseMove(event: MouseEvent) {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX)));
    }
    function handleMouseUp() {
      setIsResizing(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  useEffect(() => {
    if (!mobileOpen || !window.matchMedia("(max-width: 767px)").matches) return;
    const opener = document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!menuOpenId) return;

    function handleOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpenId(null);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePress);
    return () => document.removeEventListener("pointerdown", handleOutsidePress);
  }, [menuOpenId]);

  function toggleCollapse() {
    setMenuOpenId(null);
    setCollapsed((wasCollapsed) => !wasCollapsed);
  }

  async function handleDelete(id: string) {
    setHistoryError("");
    try {
      const response = await fetch(`/api/chats/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setChats((previous) => previous.filter((chat) => chat.id !== id));
    } catch {
      setHistoryError("Couldn’t delete this case. Try again.");
    }
  }

  async function updateCase(id: string, changes: { title?: string; pinned?: boolean }) {
    setHistoryError("");
    try {
      const response = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error();
      const updated: ChatListItem = await response.json();
      announceChatUpdate(updated);
    } catch {
      setHistoryError("Couldn’t update this case. Try again.");
    }
  }

  function handleRename(id: string, currentTitle: string) {
    const title = prompt("Rename case:", currentTitle)?.trim();
    if (title && title !== currentTitle) void updateCase(id, { title });
  }

  function closeMenu() {
    menuRef.current?.querySelector("button")?.focus();
    setMenuOpenId(null);
  }

  function closeSidebar() {
    setMenuOpenId(null);
    closeMobile();
  }

  return (
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[4px] transition-opacity duration-300 md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeSidebar}
      />

      <aside
        id="case-sidebar"
        aria-label="Case history"
        className="case-sidebar relative flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50"
        data-open={mobileOpen}
        data-collapsed={collapsed}
        data-resizing={isResizing}
        style={{ "--sidebar-width": `${collapsed ? COLLAPSED_WIDTH : width}px` } as CSSProperties}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (menuOpenId) closeMenu();
          else if (mobileOpen) closeSidebar();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
          <Link href="/" className="sidebar-expanded flex min-w-0 flex-1 items-center gap-2.5" onClick={closeSidebar}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-xs font-extrabold text-[var(--bg-primary)] [font-family:var(--font-display)]">
              CF
            </span>
            <span className="truncate text-sm font-bold tracking-tight [font-family:var(--font-display)]">
              CaseFlow
            </span>
          </Link>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeSidebar}
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] md:hidden"
            aria-label="Close case history"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] md:grid"
            aria-label={collapsed ? "Expand case history" : "Collapse case history"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-history"
          >
            <svg aria-hidden="true" data-collapse-icon width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m11 17-5-5 5-5m7 10-5-5 5-5" />
            </svg>
          </button>
        </header>

        <nav id="sidebar-history" aria-label="Lookups" className="sidebar-expanded flex min-h-0 flex-1 flex-col">
          <div className="px-3 pt-3">
            <Link
              href="/"
              onClick={closeSidebar}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border-accent)] bg-[var(--accent-glow)] px-3 py-2.5 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:border-[var(--accent-dim)] hover:text-[var(--accent-hover)] [font-family:var(--font-display)]"
            >
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New lookup
            </Link>
          </div>

          <h2 className="px-4 pt-6 pb-2 text-xs font-semibold text-[var(--text-secondary)]">Case history</h2>
          {chats.length > 0 && (
            <div className="case-history-search mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5">
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="shrink-0 text-[var(--text-muted)]">
                <circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" />
              </svg>
              <input
                type="search"
                aria-label="Search cases by title or CNR"
                placeholder="Search cases"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-base placeholder:text-[var(--text-muted)] md:text-[13px]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && search) {
                    event.stopPropagation();
                    setSearch("");
                  }
                }}
              />
            </div>
          )}
          {historyError && <p role="alert" className="mx-4 mb-2 text-xs text-[#fca5a5]">{historyError}</p>}
          <div className="flex-1 overflow-y-auto px-2 py-1">
            {chats.length === 0 ? (
              <p className="px-2 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                Your lookups will appear here.
              </p>
            ) : visibleCases.length === 0 ? (
              <p role="status" className="px-2 py-2 text-xs text-[var(--text-secondary)]">
                No cases match your search.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {visibleCases.map((chat) => {
                  const active = pathname === `/chat/${chat.id}`;
                  const menuOpen = menuOpenId === chat.id;
                  const menuId = `case-actions-${chat.id}`;
                  const hasNamedTitle = chat.title !== `Case ${chat.cnr_num}`;

                  return (
                    <li
                      key={chat.id}
                      data-active={active}
                      className={`case-history-row group relative rounded-lg border-l-2 border-transparent ${
                        menuOpen ? "z-10" : ""
                      }`}
                    >
                      <Link
                        href={`/chat/${chat.id}`}
                        onClick={closeSidebar}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-lg py-2.5 pr-10 pl-3 text-[13px] ${
                          active ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <p className="flex items-center gap-1.5">
                          {chat.pinned && (
                            <svg role="img" aria-label="Pinned" className="shrink-0 text-[var(--accent)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 3H8l1 6-3 3v2h12v-2l-3-3 1-6Zm-4 11v7" />
                            </svg>
                          )}
                          <span className="truncate">{chat.title}</span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-normal text-[var(--text-secondary)]">
                          {hasNamedTitle && <span className="[font-family:var(--font-mono)]">{chat.cnr_num}</span>}
                          <span>{formatDate(chat.updated_at)}</span>
                        </p>
                      </Link>
                      <div className="case-history-options" ref={menuOpen ? menuRef : undefined}>
                        <button
                          type="button"
                          aria-label={`Options for ${chat.title}`}
                          aria-expanded={menuOpen}
                          aria-controls={menuOpen ? menuId : undefined}
                          onClick={() => setMenuOpenId(menuOpen ? null : chat.id)}
                          className="case-history-trigger grid h-7 w-7 cursor-pointer place-items-center rounded-md text-[var(--text-secondary)] transition-[opacity,background-color] hover:bg-[var(--bg-elevated)]"
                        >
                          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
                          </svg>
                        </button>
                        {menuOpen && (
                          <div
                            id={menuId}
                            className="case-history-menu absolute right-0 top-full mt-1 min-w-32 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-xl"
                          >
                            <button
                              type="button"
                              className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)]"
                              onClick={() => { closeMenu(); handleRename(chat.id, chat.title); }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)]"
                              onClick={() => { closeMenu(); void updateCase(chat.id, { pinned: !chat.pinned }); }}
                            >
                              {chat.pinned ? "Unpin case" : "Pin case"}
                            </button>
                            <button
                              type="button"
                              className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-[#fca5a5] transition-colors hover:bg-[var(--bg-tertiary)]"
                              onClick={() => { closeMenu(); void handleDelete(chat.id); }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </nav>

        <p className="sidebar-expanded hidden border-t border-[var(--border)] px-4 py-4 text-[11px] text-[var(--text-secondary)] md:block">
          Indian eCourts case summaries
        </p>

        <div
          onMouseDown={(event) => { event.preventDefault(); setIsResizing(true); }}
          onDoubleClick={toggleCollapse}
          data-resize-handle
          className="absolute inset-y-0 -right-0.5 z-10 hidden w-1 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent)] md:block"
        />
      </aside>
    </>
  );
}
