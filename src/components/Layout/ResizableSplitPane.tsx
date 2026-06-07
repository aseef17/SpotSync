import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizableSplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
  className?: string;
  storageKey?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readStoredPercent = (key: string | undefined, fallback: number): number => {
  if (!key || typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;
  const parsed = Number.parseFloat(stored);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const ResizableSplitPane: React.FunctionComponent<ResizableSplitPaneProps> = ({
  left,
  right,
  defaultLeftPercent = 28,
  minLeftPercent = 15,
  maxLeftPercent = 50,
  className = '',
  storageKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(() =>
    readStoredPercent(storageKey, defaultLeftPercent)
  );
  const [isDragging, setIsDragging] = useState(false);

  const updateWidthFromClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const next = (clientX - rect.left) / rect.width;
      const clamped = clamp(next * 100, minLeftPercent, maxLeftPercent);
      setLeftPercent(clamped);
      if (storageKey) {
        window.localStorage.setItem(storageKey, String(clamped));
      }
    },
    [maxLeftPercent, minLeftPercent, storageKey]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      updateWidthFromClientX(event.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateWidthFromClientX]);

  return (
    <div ref={containerRef} className={`flex h-full w-full min-h-0 ${className}`}>
      <div className="min-w-0 overflow-hidden" style={{ width: `${leftPercent}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuenow={Math.round(leftPercent)}
        className={`group relative z-10 h-full w-px shrink-0 cursor-col-resize transition-colors ${
          isDragging
            ? 'bg-blue-500 dark:bg-blue-400'
            : `bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-400 dark:group-hover:bg-blue-500`
        }`}
        onMouseDown={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
      >
        <span aria-hidden className="absolute inset-y-0 -left-2 -right-2 w-5" />
        <span
          className={`pointer-events-none absolute left-1/2 top-1/2 flex h-7 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border transition-all ${
            isDragging
              ? 'border-blue-400 bg-blue-500 text-white shadow-sm dark:border-blue-500 dark:bg-blue-600'
              : `border-gray-300/80 bg-gray-100/90 text-gray-400 group-hover:border-blue-200 group-hover:bg-white group-hover:text-blue-500 group-hover:shadow-sm dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-500 dark:group-hover:border-blue-800 dark:group-hover:bg-gray-900 dark:group-hover:text-blue-400`
          }`}
        >
          <GripVertical className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">{right}</div>
    </div>
  );
};
