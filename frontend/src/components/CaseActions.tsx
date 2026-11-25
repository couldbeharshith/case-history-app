"use client";

import { useEffect, useState } from "react";
import type { Chat, ChatMessage } from "../lib/types";

function downloadBrief(chat: Chat, summary: ChatMessage) {
  const title = chat.title.replace(/\s+/g, " ").replace(/[\\\[\]#*_<>]/g, "\\$&");
  const reference = chat.cnr_num.replace(/[`\r\n]/g, "");
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(summary.timestamp);

  const content = [
    `# ${title}`,
    "",
    `CNR: \`${reference}\`  `,
    `Summary created: ${date}  `,
    "Source: Indian eCourts",
    "",
    "---",
    "",
    summary.content,
    "",
  ].join("\n");

  const file = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  const safeReference = reference.replace(/[^a-zA-Z0-9_-]/g, "");
  link.href = url;
  link.download = safeReference ? `CaseFlow-${safeReference}.md` : "CaseFlow-case-brief.md";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CaseActions({ chat, summary }: { chat: Chat; summary?: ChatMessage }) {
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(""), 2400);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(chat.cnr_num);
      setCopyStatus("CNR copied");
    } catch {
      setCopyStatus("Couldn’t copy CNR");
    }
  }

  return (
    <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
      <span className="sr-only" role="status">{copyStatus}</span>
      <button
        aria-label="Copy CNR"
        type="button"
        title={copyStatus || "Copy CNR"}
        className="case-action"
        onClick={copyReference}
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {copyStatus === "CNR copied"
            ? <path className="copy-check" d="m5 12 4 4L19 6" />
            : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 5H6a1 1 0 0 0-1 1v9" /></>}
        </svg>
        <span className="hidden font-mono lg:inline">{copyStatus || chat.cnr_num}</span>
      </button>
      {summary && (
        <button
          aria-label="Download case brief"
          type="button"
          title="Download case brief"
          className="case-action ui-appear"
          onClick={() => downloadBrief(chat, summary)}
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m-4-4 4 4 4-4M5 16v3h14v-3" />
          </svg>
          <span className="hidden sm:inline">Download brief</span>
        </button>
      )}
    </div>
  );
}
