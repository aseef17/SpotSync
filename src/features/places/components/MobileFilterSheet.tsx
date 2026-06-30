import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { themeColors } from '@/styles/colors';
import type { FilterOptions } from '@/features/places/types/filters';
import { motion, AnimatePresence } from 'framer-motion';
import { PASSPORT_STAMP_BY_ID } from '@/features/passport/constants/stamps';

interface MobileFilterSheetProps {
  activeFilter: 'sort' | 'status' | 'category' | 'price' | 'rating' | 'cuisine' | null;
  onClose: () => void;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  updateFilter: (key: keyof FilterOptions, value: FilterOptions[keyof FilterOptions]) => void;
  availableCategories: string[];
  availableCuisines?: string[];
  isPassportList?: boolean;
  availablePassportStamps?: string[];
  availablePassportCategories?: string[];
  customStatuses: string[];
  userLocation?: { lat: number; lng: number } | null;
}

const DISMISS_DRAG_RATIO = 0.5;

function MobileFilterSheetPanel({
  activeFilter,
  onClose,
  filters,
  onFiltersChange,
  updateFilter,
  availableCategories,
  availableCuisines = [],
  isPassportList = false,
  availablePassportStamps = [],
  availablePassportCategories = [],
  customStatuses,
  userLocation,
}: MobileFilterSheetProps & { activeFilter: NonNullable<MobileFilterSheetProps['activeFilter']> }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [measuredSheetHeight, setMeasuredSheetHeight] = useState(0);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartOffset = useRef(0);

  const setDragOffset = (next: number) => {
    dragYRef.current = next;
    setDragY(next);
  };

  const measureSheetHeight = useCallback(() => {
    const height = sheetRef.current?.offsetHeight ?? 0;
    if (height > 0) {
      setMeasuredSheetHeight(height);
    }
    return height;
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      measureSheetHeight();
    });
    return () => cancelAnimationFrame(frame);
  }, [measureSheetHeight]);

  const handleDragPointerDown = (e: React.PointerEvent) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button')) return;

    measureSheetHeight();
    setIsDragging(true);
    isDraggingRef.current = true;
    dragStartY.current = e.clientY;
    dragStartOffset.current = dragYRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleDragPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const next = Math.max(0, dragStartOffset.current + (e.clientY - dragStartY.current));
    setDragOffset(next);
    e.stopPropagation();
  };

  const finishDrag = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    setIsDragging(false);
    isDraggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const height = measureSheetHeight() || measuredSheetHeight || window.innerHeight * 0.85;
    if (dragYRef.current > height * DISMISS_DRAG_RATIO) {
      onClose();
      return;
    }

    setDragOffset(0);
    e.stopPropagation();
  };

  const sheetTitle =
    activeFilter === 'sort'
      ? 'Sort By'
      : isPassportList && activeFilter === 'category'
        ? 'Select Stamp'
        : isPassportList && activeFilter === 'cuisine'
          ? 'Select Venue Type'
          : `Select ${activeFilter}`;

  const sheetHeight = measuredSheetHeight || window.innerHeight * 0.85;
  const mapDimAlpha = 0.5 * Math.max(0, 1 - dragY / sheetHeight);

  return (
    <>
      {/* Dim the map only — sits below the list bottom sheet (z-50) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: isDragging ? 0 : 0.2 }}
        className="fixed inset-0 z-40 pointer-events-none"
        style={{ backgroundColor: `rgba(0, 0, 0, ${mapDimAlpha})` }}
      />

      {/* Transparent tap target — list sheet stays visible through this layer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: isDragging ? 0 : 0.2 }}
        className="fixed inset-0 z-[60] touch-none"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <motion.div
        ref={sheetRef}
        initial={{ y: '100%' }}
        animate={{ y: dragY }}
        exit={{ y: '100%' }}
        transition={
          isDragging
            ? { duration: 0 }
            : dragY > 0
              ? { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }
              : { type: 'spring', damping: 25, stiffness: 200 }
        }
        className={`fixed bottom-0 left-0 right-0 z-[61] ${themeColors.background.card} rounded-t-xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col pb-[env(safe-area-inset-bottom)]`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div
            className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div className="w-full pt-3 pb-1 flex justify-center">
              <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 pointer-events-none" />
            </div>

            <div
              className={`flex items-center justify-between px-4 py-2 border-b ${themeColors.border.default}`}
            >
              <h3 className={`font-semibold ${themeColors.text.primary} capitalize`}>
                {sheetTitle}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className={`p-1 rounded-full ${themeColors.button.icon}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 flex-1 min-h-0">
            {activeFilter === 'sort' && (
              <div className="space-y-1">
                {[
                  { value: 'date-desc', label: 'Newest First' },
                  { value: 'rating-desc', label: 'Highest Rated' },
                  { value: 'price-asc', label: 'Price: Low to High' },
                  { value: 'price-desc', label: 'Price: High to Low' },
                  { value: 'name-asc', label: 'Name (A-Z)' },
                  { value: 'name-desc', label: 'Name (Z-A)' },
                  ...(userLocation ? [{ value: 'distance-asc', label: 'Distance (Nearest)' }] : []),
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      const [sortBy, sortDirection] = option.value.split('-');
                      onFiltersChange({
                        ...filters,
                        sortBy: sortBy as FilterOptions['sortBy'],
                        sortDirection: sortDirection as FilterOptions['sortDirection'],
                      });
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      `${filters.sortBy || 'date'}-${filters.sortDirection || 'desc'}` ===
                      option.value
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {option.label}
                    {`${filters.sortBy || 'date'}-${filters.sortDirection || 'desc'}` ===
                      option.value && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {activeFilter === 'status' && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    updateFilter('status', undefined);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                    !filters.status
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                  }`}
                >
                  All Statuses
                  {!filters.status && <Check className="h-4 w-4" />}
                </button>
                {[
                  { value: 'not_visited', label: 'Not Visited' },
                  { value: 'visited', label: 'Visited' },
                  { value: 'not_going', label: 'Not Going' },
                  ...customStatuses.map((s) => ({ value: s, label: s })),
                ].map((status) => (
                  <button
                    key={status.value}
                    onClick={() => {
                      updateFilter('status', status.value);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      filters.status === status.value
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {status.label}
                    {filters.status === status.value && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {activeFilter === 'category' && isPassportList && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => updateFilter('passportStamp', availablePassportStamps)}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 px-2 py-1"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => updateFilter('passportStamp', undefined)}
                    className={`text-sm font-medium ${themeColors.text.secondary} hover:text-red-500 px-2 py-1`}
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1 py-1">
                  {availablePassportStamps.map((stampId) => {
                    const isSelected = Array.isArray(filters.passportStamp)
                      ? filters.passportStamp.includes(stampId)
                      : filters.passportStamp === stampId;

                    return (
                      <button
                        key={stampId}
                        onClick={() => {
                          let next: string[] = [];
                          if (Array.isArray(filters.passportStamp)) {
                            next = [...filters.passportStamp];
                          } else if (filters.passportStamp) {
                            next = [filters.passportStamp];
                          }
                          if (isSelected) {
                            next = next.filter((id) => id !== stampId);
                          } else {
                            next.push(stampId);
                          }
                          updateFilter('passportStamp', next.length > 0 ? next : undefined);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                          isSelected
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                            : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                        }`}
                      >
                        {PASSPORT_STAMP_BY_ID[stampId]?.name ?? stampId}
                        {isSelected && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeFilter === 'category' && !isPassportList && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between p-2 border-b ${themeColors.border.default}">
                  <button
                    onClick={() => updateFilter('category', availableCategories)}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 px-2 py-1"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => updateFilter('category', undefined)}
                    className={`text-sm font-medium ${themeColors.text.secondary} hover:text-red-500 px-2 py-1`}
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1 py-1">
                  {availableCategories.map((category) => {
                    const isSelected = Array.isArray(filters.category)
                      ? filters.category.includes(category)
                      : filters.category === category;

                    return (
                      <div
                        key={category}
                        className={`group w-full flex items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative ${
                          isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <button
                          onClick={() => {
                            let newCats: string[] = [];
                            if (Array.isArray(filters.category)) {
                              newCats = [...filters.category];
                            } else if (filters.category) {
                              newCats = [filters.category];
                            }

                            if (isSelected) {
                              newCats = newCats.filter((c) => c !== category);
                            } else {
                              newCats.push(category);
                            }
                            updateFilter('category', newCats.length > 0 ? newCats : undefined);
                          }}
                          className="flex-1 flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <div
                            className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : `${themeColors.border.default} bg-transparent`
                            }`}
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </div>
                          <span
                            className={`text-sm font-medium ${themeColors.text.primary} truncate`}
                          >
                            {category}
                          </span>
                        </button>

                        {/* Only button */}
                        <div className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateFilter('category', [category]);
                            }}
                            className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-medium hover:bg-blue-200 dark:hover:bg-blue-800 shadow-sm"
                          >
                            Only
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeFilter === 'price' && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between p-2 border-b ${themeColors.border.default}">
                  <button
                    onClick={() => updateFilter('priceLevel', [0, 1, 2, 3, 4])}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 px-2 py-1"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => updateFilter('priceLevel', undefined)}
                    className={`text-sm font-medium ${themeColors.text.secondary} hover:text-red-500 px-2 py-1`}
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1 py-1">
                  {[
                    { value: 0, label: 'Free' },
                    { value: 1, label: '$' },
                    { value: 2, label: '$$' },
                    { value: 3, label: '$$$' },
                    { value: 4, label: '$$$$' },
                  ].map((option) => {
                    const isSelected = filters.priceLevel?.includes(option.value);
                    return (
                      <div
                        key={option.value}
                        className={`group w-full flex items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative ${
                          isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <button
                          onClick={() => {
                            let newPrices = filters.priceLevel ? [...filters.priceLevel] : [];
                            if (isSelected) {
                              newPrices = newPrices.filter((p) => p !== option.value);
                            } else {
                              newPrices.push(option.value);
                            }
                            updateFilter(
                              'priceLevel',
                              newPrices.length > 0 ? newPrices : undefined
                            );
                          }}
                          className="flex-1 flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <div
                            className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : `${themeColors.border.default} bg-transparent`
                            }`}
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </div>
                          <span
                            className={`text-sm font-medium ${themeColors.text.primary} truncate`}
                          >
                            {option.label}
                          </span>
                        </button>

                        {/* Only button */}
                        <div className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateFilter('priceLevel', [option.value]);
                            }}
                            className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-medium hover:bg-blue-200 dark:hover:bg-blue-800 shadow-sm"
                          >
                            Only
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeFilter === 'rating' && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    updateFilter('minRating', undefined);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                    !filters.minRating
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                  }`}
                >
                  Any Rating
                  {!filters.minRating && <Check className="h-4 w-4" />}
                </button>
                {[3, 3.5, 4, 4.5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => {
                      updateFilter('minRating', rating);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      filters.minRating === rating
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {rating}+ Stars
                    {filters.minRating === rating && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {activeFilter === 'cuisine' && isPassportList && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    updateFilter('passportCategory', undefined);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                    !filters.passportCategory
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                  }`}
                >
                  All Venue Types
                  {!filters.passportCategory && <Check className="h-4 w-4" />}
                </button>
                {availablePassportCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      updateFilter('passportCategory', category);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      filters.passportCategory === category
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {category}
                    {filters.passportCategory === category && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {activeFilter === 'cuisine' && !isPassportList && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    updateFilter('cuisine', undefined);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                    !filters.cuisine
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                  }`}
                >
                  All Cuisines
                  {!filters.cuisine && <Check className="h-4 w-4" />}
                </button>
                {availableCuisines.map((cuisine) => (
                  <button
                    key={cuisine}
                    onClick={() => {
                      updateFilter('cuisine', cuisine);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      filters.cuisine === cuisine
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {cuisine}
                    {filters.cuisine === cuisine && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

export const MobileFilterSheet: React.FunctionComponent<MobileFilterSheetProps> = (props) => {
  return (
    <AnimatePresence>
      {props.activeFilter ? (
        <MobileFilterSheetPanel
          key={props.activeFilter}
          {...props}
          activeFilter={props.activeFilter}
        />
      ) : null}
    </AnimatePresence>
  );
};
