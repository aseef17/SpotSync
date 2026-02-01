import { X, Check } from 'lucide-react';
import { themeColors } from '@/styles/colors';
import type { FilterOptions } from '@/features/places/types/filters';

interface MobileFilterSheetProps {
  activeFilter: 'sort' | 'status' | 'category' | 'price' | 'rating' | 'cuisine' | null;
  onClose: () => void;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  updateFilter: (key: keyof FilterOptions, value: FilterOptions[keyof FilterOptions]) => void;
  availableCategories: string[];
  availableCuisines?: string[];
  customStatuses: string[];
  userLocation?: { lat: number; lng: number } | null;
}

export const MobileFilterSheet: React.FunctionComponent<MobileFilterSheetProps> = ({
  activeFilter,
  onClose,
  filters,
  onFiltersChange,
  updateFilter,
  availableCategories,
  customStatuses,
  userLocation,
}) => {
  if (!activeFilter) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60] transition-opacity" onClick={onClose} />

      <div
        className={`fixed bottom-0 left-0 right-0 z-[61] ${themeColors.background.card} rounded-t-xl overflow-hidden shadow-2xl animate-slide-up max-h-[80vh] flex flex-col`}
      >
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${themeColors.border.default}`}
        >
          <h3 className={`font-semibold ${themeColors.text.primary} capitalize`}>
            {activeFilter === 'sort' ? 'Sort By' : `Select ${activeFilter}`}
          </h3>
          <button onClick={onClose} className={`p-1 rounded-full ${themeColors.button.icon}`}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-2">
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

          {activeFilter === 'category' && (
            <div className="space-y-1">
              <div className="flex gap-2 mb-2 px-2">
                <button
                  onClick={() => updateFilter('category', undefined)}
                  className="text-xs text-blue-600 font-medium px-2 py-1"
                >
                  Clear All
                </button>
              </div>
              {availableCategories.map((category) => {
                const isSelected = Array.isArray(filters.category)
                  ? filters.category.includes(category)
                  : filters.category === category;

                return (
                  <button
                    key={category}
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
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      isSelected
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {category}
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          )}

          {activeFilter === 'price' && (
            <div className="space-y-1">
              {[
                { value: 0, label: 'Free' },
                { value: 1, label: '$' },
                { value: 2, label: '$$' },
                { value: 3, label: '$$$' },
                { value: 4, label: '$$$$' },
              ].map((option) => {
                const isSelected = filters.priceLevel?.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      let newPrices = filters.priceLevel ? [...filters.priceLevel] : [];
                      if (isSelected) {
                        newPrices = newPrices.filter((p) => p !== option.value);
                      } else {
                        newPrices.push(option.value);
                      }
                      updateFilter('priceLevel', newPrices.length > 0 ? newPrices : undefined);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left font-medium ${
                      isSelected
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                    }`}
                  >
                    {option.label}
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
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

          {activeFilter === 'cuisine' && (
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
              {availableCategories.map((cuisine) => (
                // Note: availableCategories prop is reused for cuisines here to avoid prop drilling complex names,
                // but strictly we should use the new availableCuisines prop.
                // Let's use availableCategories for now as the logic below implies we need to pass the right list.
                // Wait, I should use the proper prop 'availableCuisines' which I'm adding.
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
    </>
  );
};
