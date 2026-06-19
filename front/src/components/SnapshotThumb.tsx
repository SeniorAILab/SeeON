"use client";

import { useState } from "react";
import Image from "next/image";

interface SnapshotThumbProps {
  alertId: string;
  snapshotKey: string | null | undefined;
  className?: string;
}

export function SnapshotThumb({ alertId, snapshotKey, className = "" }: SnapshotThumbProps) {
  const [errored, setErrored] = useState(false);

  if (!snapshotKey || errored) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-canvas border border-line ${className}`}
      >
        <svg
          className="h-5 w-5 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.562.659-1.249.659-1.991v-1.5a3 3 0 00-3-3h-6a3 3 0 00-3 3v1.5c0 .742.252 1.429.659 1.991"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <Image
        src={`/api/alerts/${alertId}/snapshot`}
        alt="낙상 스냅샷"
        fill
        className="object-cover"
        onError={() => setErrored(true)}
        unoptimized
      />
    </div>
  );
}
