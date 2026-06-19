export function EmptyState({
  message,
  className = "p-10",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-dashed border-line bg-surface ${className} text-pretty text-center text-sm text-muted`}
    >
      {message}
    </div>
  );
}
