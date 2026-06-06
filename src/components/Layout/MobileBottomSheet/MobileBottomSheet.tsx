import React, { useState, useEffect, useRef, useCallback } from 'react';
import { themeColors } from '@/styles/colors';
import { motion } from 'framer-motion';

interface MobileBottomSheetProps {
  header: React.ReactNode;
  children: React.ReactNode;
  snapPoints?: (number | string)[]; // e.g. [120, '25%', '50%', '90%']
  defaultSnap?: number;
  snapIndex?: number; // Optional controlled snap index
  onHeightChange?: (height: number) => void; // Callback when height changes
}

export const MobileBottomSheet: React.FunctionComponent<MobileBottomSheetProps> = ({
  header,
  children,
  snapPoints = [120, '25%', '50%', '85%'],
  defaultSnap = 1,
  snapIndex,
  onHeightChange,
}) => {
  // Convert snap points to pixels
  const getPixelSnaps = useCallback(() => {
    const height = window.innerHeight;
    return snapPoints
      .map((p) => {
        if (typeof p === 'number') return p;
        if (typeof p === 'string' && p.endsWith('%')) {
          return (parseFloat(p) / 100) * height;
        }
        if (typeof p === 'string' && p.endsWith('px')) {
          return parseFloat(p);
        }
        return 0;
      })
      .sort((a, b) => a - b);
  }, [snapPoints]);

  const [, setResizeTick] = useState(0);

  // Update snaps on resize
  useEffect(() => {
    const handleResize = () => setResizeTick((tick) => tick + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const snaps = React.useMemo(() => {
    return getPixelSnaps();
  }, [getPixelSnaps]);

  const [currentHeight, setCurrentHeight] = useState(() => {
    const calculatedSnaps = getPixelSnaps();
    return calculatedSnaps[defaultSnap] || calculatedSnaps[0] || 0;
  });
  const [isDragging, setIsDragging] = useState(false);

  const isInitialized = useRef(false);

  // Sync currentHeight with snaps if it's still 0 (e.g. initial render)
  useEffect(() => {
    if (!isInitialized.current && snaps.length > 0) {
      // Use a timeout to move this out of the synchronous render path
      const timer = setTimeout(() => {
        setCurrentHeight(snaps[defaultSnap] || snaps[0]);
        isInitialized.current = true;
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [snaps, defaultSnap]);

  // Notify parent of height changes
  useEffect(() => {
    onHeightChange?.(currentHeight);
  }, [currentHeight, onHeightChange]);

  const [prevSnapIndex, setPrevSnapIndex] = useState<number | undefined>(snapIndex);

  // Handle controlled snap update during render to avoid useEffect warning
  if (snapIndex !== prevSnapIndex) {
    setPrevSnapIndex(snapIndex);
    if (snapIndex !== undefined && snaps.length > 0 && snaps[snapIndex] !== undefined) {
      setCurrentHeight(snaps[snapIndex]);
    }
  }

  // Drag Logic
  const startY = useRef<number>(0);
  const startHeight = useRef<number>(0);
  const lastY = useRef<number>(0);
  const velocity = useRef<number>(0);
  const lastTime = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Don't drag if clicking interactive elements
    const target = e.target;
    if (!(target instanceof Element)) return;

    const isInteractive = target.closest('button, a, input, select, textarea, [role="button"]');
    if (isInteractive) return;

    setIsDragging(true);
    startY.current = e.clientY;
    lastY.current = e.clientY;
    startHeight.current = currentHeight;
    lastTime.current = Date.now();
    document.body.style.userSelect = 'none';
    target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaY = startY.current - e.clientY;
    let newHeight = startHeight.current + deltaY;
    const min = snaps[0] || 0;
    const max = snaps[snaps.length - 1] || window.innerHeight;

    if (newHeight < min) newHeight = min + (newHeight - min) * 0.5;
    if (newHeight > max) newHeight = max + (newHeight - max) * 0.5;

    setCurrentHeight(newHeight);
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) velocity.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastTime.current = now;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    document.body.style.userSelect = '';
    if (e.target instanceof Element) {
      e.target.releasePointerCapture(e.pointerId);
    }

    const projectedHeight = currentHeight - velocity.current * 200;
    let closest = snaps[0];
    let minDiff = Math.abs(projectedHeight - closest);

    for (const snap of snaps) {
      const diff = Math.abs(projectedHeight - snap);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }
    setCurrentHeight(closest);
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[20px] ${themeColors.background.card} border-t ${themeColors.border.default} shadow-2xl overflow-hidden`}
      style={{
        height: `${currentHeight}px`,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        touchAction: 'none',
      }}
    >
      <div
        className="w-full flex-shrink-0 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="mx-auto w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 mt-4 mb-2 pointer-events-none" />
        <div className="px-4 pb-4 pointer-events-none">
          <div className="pointer-events-auto">{header}</div>
        </div>
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
            },
          },
        }}
        className="flex-1 overflow-y-auto px-4 pb-8 border-t border-transparent custom-scrollbar"
        id="mobile-bottom-sheet-scrollable"
      >
        {children}
      </motion.div>
    </motion.div>
  );
};
