'use client';

import Link from 'next/link';
import { Flame, Scale } from 'lucide-react';

export function MarqueeTicker({
  items,
}: {
  items: Array<{ id: string; publicId: string; title: string; toxicity: number | null }>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden border-y border-rule bg-sunk/80 py-1.5 text-[11px] hud">
      <div className="flex animate-marquee whitespace-nowrap gap-8 items-center">
        {/* Repeat list twice for seamless marquee loop */}
        {[...items, ...items].map((item, idx) => (
          <Link
            key={`${item.id}-${idx}`}
            href={`/case/${item.publicId}`}
            className="inline-flex items-center gap-2 text-ink-muted hover:text-verdict-red transition-colors"
          >
            <span className="font-bold text-ink">{item.publicId}:</span>
            <span className="truncate max-w-xs">{item.title}</span>
            {item.toxicity !== null && item.toxicity >= 60 && (
              <span className="text-heat font-bold inline-flex items-center gap-1">
                <Flame className="size-3" /> {item.toxicity}/100
              </span>
            )}
            <span className="text-rule-strong ml-4">•</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
