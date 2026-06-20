import { cn } from "@/lib/utils";
import type { Floor } from "@/types";

export function FloorTabs({
  floors,
  value,
  onChange,
}: {
  floors: Floor[];
  value: string; // "ALL" | floorId
  onChange: (v: string) => void;
}) {
  const tabs = [{ id: "ALL", name: "전체 층" }, ...floors];
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
            value === t.id
              ? "bg-ink text-white"
              : "bg-white text-ink-soft border border-border hover:bg-gray-50"
          )}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
