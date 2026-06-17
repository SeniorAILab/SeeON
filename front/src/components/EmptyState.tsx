export function EmptyState({
  message,
  className = "p-10",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-white/10 ${className} text-center text-sm text-slate-500`}
    >
      {message}
    </div>
  );
}
