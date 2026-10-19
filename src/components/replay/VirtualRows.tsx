"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Minimal windowed list: only rows in view (plus overscan) are rendered, so
 * trade tables stay fast with tens of thousands of rows.
 */
export default function VirtualRows<T>({
  items,
  rowHeight,
  height,
  renderRow,
  header,
  empty,
  className,
}: {
  items: T[];
  rowHeight: number;
  height: number | string;
  renderRow: (item: T, index: number) => ReactNode;
  header?: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);
  const overscan = 8;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);

  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el && el.clientHeight && el.clientHeight !== viewport) setViewport(el.clientHeight);
      }}
      className={className}
      style={{ height, overflowY: "auto" }}
      onScroll={(e) => {
        setScrollTop(e.currentTarget.scrollTop);
        if (e.currentTarget.clientHeight !== viewport) setViewport(e.currentTarget.clientHeight);
      }}
    >
      {header}
      {items.length === 0 ? (
        empty
      ) : (
        <div style={{ height: items.length * rowHeight, position: "relative" }} role="rowgroup">
          {items.slice(start, end).map((item, k) => (
            <div key={start + k} style={{ position: "absolute", top: (start + k) * rowHeight, left: 0, right: 0, height: rowHeight }}>
              {renderRow(item, start + k)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
