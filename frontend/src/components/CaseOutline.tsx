"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export default function CaseOutline({ summaryRef }: {
  summaryRef: RefObject<HTMLDivElement | null>;
}) {
  const [sections, setSections] = useState<HTMLElement[] | null>(null);
  const controlRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const open = sections !== null;

  useEffect(() => {
    if (!open) return;
    function handleOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setSections(null);
      }
    }
    document.addEventListener("pointerdown", handleOutsidePress);
    return () => document.removeEventListener("pointerdown", handleOutsidePress);
  }, [open]);

  function toggleOutline() {
    if (open) {
      setSections(null);
      return;
    }
    const headings = summaryRef.current?.querySelectorAll<HTMLElement>(
      ".markdown-body :is(h1, h2, h3, h4)"
    );
    setSections(headings ? [...headings].filter((heading) => heading.textContent.trim()) : []);
  }

  function jumpTo(heading: HTMLElement) {
    setSections(null);
    heading.tabIndex = -1;
    heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
    heading.focus({ preventScroll: true });
    const viewport = heading.closest<HTMLElement>("[data-case-viewport]");
    if (!viewport) return;

    const inset = Number.parseFloat(getComputedStyle(heading).scrollMarginTop);
    viewport.scrollTo({
      top: viewport.scrollTop + heading.getBoundingClientRect().top - viewport.getBoundingClientRect().top - inset,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.stopPropagation();
        setSections(null);
        controlRef.current?.focus();
      }}
    >
      <button
        ref={controlRef}
        className="case-action"
        type="button"
        onClick={toggleOutline}
        aria-label="Case outline"
        aria-expanded={open}
        aria-controls={open ? "case-outline" : undefined}
        title="Case outline"
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
        <span className="hidden lg:inline">Outline</span>
      </button>

      {sections && (
        <nav
          id="case-outline"
          aria-label="Summary sections"
          className="case-outline-panel absolute end-0 top-full z-10 mt-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1.5 shadow-2xl"
        >
          {sections.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--text-secondary)]">This summary has no section headings.</p>
          ) : (
            <ol>
              {sections.map((heading, index) => (
                <li key={index}>
                  <button
                    className={`block w-full cursor-pointer rounded-md py-2 pe-3 text-start text-xs leading-relaxed transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] ${
                      heading.matches("h3, h4") ? "ps-6 text-[var(--text-secondary)]" : "ps-3 text-[var(--text-primary)]"
                    }`}
                    type="button"
                    onClick={() => jumpTo(heading)}
                  >
                    {heading.textContent}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </nav>
      )}
    </div>
  );
}
