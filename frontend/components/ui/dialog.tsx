"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  children,
  title,
  description,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  maxWidth?: string;
}) {
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (open) setRender(true);
    else {
      const t = setTimeout(() => setRender(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!render) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        animation: open
          ? "dialog-overlay-in 180ms cubic-bezier(0.23, 1, 0.32, 1) forwards"
          : "dialog-overlay-in 180ms cubic-bezier(0.23, 1, 0.32, 1) reverse forwards",
      }}
    >
      <div
        className={cn(
          "relative w-full rounded-2xl border border-white/10 bg-[#15151a] p-6 shadow-2xl",
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: open
            ? "dialog-panel-in 220ms cubic-bezier(0.23, 1, 0.32, 1) forwards"
            : "dialog-panel-in 180ms cubic-bezier(0.23, 1, 0.32, 1) reverse forwards",
        }}
      >
        <button
          className="absolute right-4 top-4 text-zinc-500 transition hover:text-white"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        {title && (
          <p className="text-lg font-semibold tracking-tight">{title}</p>
        )}
        {description && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
        <div className={title || description ? "mt-6" : ""}>{children}</div>
      </div>
    </div>
  );
}
