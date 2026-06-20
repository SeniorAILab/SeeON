export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-gray-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
