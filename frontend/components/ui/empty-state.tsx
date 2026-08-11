import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[.08] bg-white/[.015] px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[.04] text-zinc-500">
        {icon}
      </span>
      <p className="mt-5 text-lg font-medium">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
          {description}
        </p>
      )}
      {children && <div className="mt-6">{children}</div>}
      {actionLabel && actionHref && !children && (
        <Link href={actionHref} className="mt-6">
          <Button size="sm">{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionHref && !children && (
        <Button size="sm" className="mt-6" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
