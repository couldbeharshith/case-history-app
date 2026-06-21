"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

interface SidebarCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const Ctx = createContext<SidebarCtx>({ open: false, toggle: () => {}, close: () => {} });

export const useSidebar = () => useContext(Ctx);

export default function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const toggle = useCallback(() => setOpen((p) => !p), []);
  const close = useCallback(() => setOpen(false), []);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ── Swipe-from-left-edge to open sidebar ──────────────────────────────
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const EDGE_ZONE = 30; // px from left edge
    const MIN_SWIPE = 50; // px horizontal movement to trigger

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX <= EDGE_ZONE && !open) {
        touchStartX.current = t.clientX;
        touchStartY.current = t.clientY;
      } else {
        touchStartX.current = null;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX.current;
      const dy = Math.abs(t.clientY - touchStartY.current);
      // Horizontal swipe with more horizontal than vertical movement
      if (dx > MIN_SWIPE && dx > dy) {
        setOpen(true);
      }
      touchStartX.current = null;
      touchStartY.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [open]);

  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}
