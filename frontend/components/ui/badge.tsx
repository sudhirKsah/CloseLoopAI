import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const styles: Record<Variant, string> = {
  default: "bg-white/[.06] text-zinc-400",
  success: "bg-emerald-300/10 text-emerald-300",
  warning: "bg-amber-300/10 text-amber-200",
  danger: "bg-rose-400/10 text-rose-300",
  info: "bg-sky-400/10 text-sky-300",
};

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
