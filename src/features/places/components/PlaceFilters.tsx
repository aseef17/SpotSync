import React, { useState } from 'react';
import {
  Search,
  MapPin as MapIcon,
  LayoutGrid,
  LayoutList as ListIcon,
  Sparkles,
  Loader2,
  Send,
  ArrowUpDown,
} from 'lucide-react';
import type { PlaceStatus } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';
import { themeColors } from '@/styles/colors';

import { CustomDropdown } from '@/components/Elements/Dropdown/CustomDropdown';
import { MultiSelectDropdown } from '@/components/Elements/Dropdown/MultiSelectDropdown';
import { MobileFilterSheet } from '@/features/places/components/MobileFilterSheet';

interface PlaceFiltersProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  availableCategories: string[];
  availableCuisines: string[]; // NEW
  customStatuses: string[];
  totalPlaces: number;
  filteredCount: number;
  viewMode: 'list' | 'map';
  onViewModeChange: (mode: 'list' | 'map') => void;
  hideViewToggle?: boolean;
  onAiSearch?: (query: string) => void;
  isAiMode?: boolean;
  onAiModeChange?: (isAiMode: boolean) => void;
  isAiLoading?: boolean;
  userLocation?: { lat: number; lng: number } | null;
  density?: 'comfortable' | 'compact';
  onDensityChange?: (density: 'comfortable' | 'compact') => void;
  isInSidebar?: boolean;
}

export const PlaceFilters: React.FunctionComponent<PlaceFiltersProps> = ({
  filters,
  onFiltersChange,
  availableCategories,
  availableCuisines,
  customStatuses,
  totalPlaces,
  filteredCount,
  viewMode,
  onViewModeChange,
  hideViewToggle,
  onAiSearch,
  isAiMode = false,
  onAiModeChange,
  isAiLoading = false,
  userLocation,
  density,
  onDensityChange,
  isInSidebar = false,
}) => {
  const [activeMobileFilter, setActiveMobileFilter] = useState<
    'sort' | 'status' | 'category' | 'price' | 'rating' | 'cuisine' | null
  >(null);

  const [localSearchQuery, setLocalSearchQuery] = useState(filters.searchQuery || '');

  const [prevSearchQuery, setPrevSearchQuery] = useState(filters.searchQuery);

  if (filters.searchQuery !== prevSearchQuery) {
    setLocalSearchQuery(filters.searchQuery || '');
    setPrevSearchQuery(filters.searchQuery);
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearchQuery(value);

    if (!isAiMode) {
      onFiltersChange({
        ...filters,
        searchQuery: value,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isAiMode && onAiSearch) {
      e.preventDefault();
      onAiSearch(localSearchQuery);
    }
  };

  const updateFilter = (key: keyof FilterOptions, value: FilterOptions[keyof FilterOptions]) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
    if (isAiMode && onAiModeChange) {
      onAiModeChange(false);
    }
    setLocalSearchQuery('');
  };

  const hasActiveFilters = !!(
    filters.searchQuery ||
    filters.status ||
    filters.category ||
    filters.cuisine ||
    filters.openNow ||
    filters.minRating ||
    filters.maxRating ||
    filters.priceLevel
  );

  const allStatuses: { value: PlaceStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'not_visited', label: 'Not Visited' },
    { value: 'visited', label: 'Visited' },
    { value: 'not_going', label: 'Not Going' },
    ...customStatuses.map((status) => ({ value: 'custom' as PlaceStatus, label: status })),
  ];

  return (
    <div
      className={`${themeColors.background.card} border-b ${themeColors.border.default} ${
        isInSidebar ? 'px-2 py-3' : 'px-4 py-4'
      }`}
    >
      <div className="lg:hidden mb-4 space-y-3">
        <div className="relative flex gap-2">
          <div className="relative w-full group">
            <Search
              className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 z-10 ${isAiMode ? 'text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'text-gray-400'}`}
            />
            <input
              type="text"
              placeholder={isAiMode ? 'Ask your list (e.g. Best brunch)...' : 'Search places...'}
              value={isAiMode ? localSearchQuery : filters.searchQuery || ''}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              disabled={isAiLoading}
              className={`w-full pl-10 pr-10 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 transition-all ${
                isAiMode
                  ? 'border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.4),inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:ring-0 bg-white/90 dark:bg-gray-900/80 backdrop-blur-xl text-purple-900 dark:text-purple-100 placeholder:text-purple-400'
                  : 'light-border-default light-bg-card light-text-primary focus:ring-blue-500'
              }`}
            />
            {isAiMode && (
              <>
                <div className="absolute right-0 top-0 bottom-0 pointer-events-none rounded-md bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <button
                  onClick={() => onAiSearch && onAiSearch(localSearchQuery)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-md hover:bg-purple-100 dark:hover:bg-purple-800 text-purple-500 transition-colors"
                  disabled={isAiLoading}
                >
                  <Send className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {onAiModeChange && (
            <button
              onClick={() => onAiModeChange(!isAiMode)}
              disabled={isAiLoading}
              className={`p-2 aspect-square rounded-lg shadow-sm active:scale-95 transition-all ${
                isAiMode
                  ? 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white ring-2 ring-purple-200'
                  : 'bg-white dark:bg-gray-800 text-gray-400 border light-border-default hover:text-purple-500'
              }`}
            >
              {isAiLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles
                  className={`h-5 w-5 ${!isAiMode && 'group-hover:scale-110 transition-transform'}`}
                />
              )}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-1">
          <button
            onClick={() => setActiveMobileFilter('sort')}
            className={`p-2 rounded-full border flex-shrink-0 ${
              filters.sortBy
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
            }`}
          >
            <ArrowUpDown className="h-5 w-5" />
          </button>
          <button
            onClick={() => setActiveMobileFilter('status')}
            className={`px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              filters.status
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
            }`}
          >
            {(() => {
              if (!filters.status) return 'Status';
              if (filters.status === 'not_visited') return 'Not Visited';
              if (filters.status === 'visited') return 'Visited';
              if (filters.status === 'not_going') return 'Not Going';
              return filters.status;
            })()}
          </button>
          <button
            onClick={() => setActiveMobileFilter('category')}
            className={`px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              filters.category
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
            }`}
          >
            {Array.isArray(filters.category) && filters.category.length > 0
              ? `${filters.category.length} Categories`
              : typeof filters.category === 'string'
                ? filters.category
                : 'Category'}
          </button>
          <button
            onClick={() => setActiveMobileFilter('price')}
            className={`px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              filters.priceLevel && filters.priceLevel.length > 0
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
            }`}
          >
            {filters.priceLevel && filters.priceLevel.length > 0
              ? `${filters.priceLevel.length} Prices`
              : 'Price'}
          </button>

          {/* Rating Chip */}
          <button
            onClick={() => setActiveMobileFilter('rating')}
            className={`px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              filters.minRating
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
            }`}
          >
            {filters.minRating ? `${filters.minRating}+ Stars` : 'Rating'}
          </button>

          <button
            onClick={() => updateFilter('openNow', !filters.openNow ? true : undefined)}
            className={`px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              filters.openNow
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
            }`}
          >
            Open Now
          </button>

          {((Array.isArray(filters.category) &&
            filters.category.some((c) => c.toLowerCase().includes('restaurant'))) ||
            (typeof filters.category === 'string' &&
              filters.category.toLowerCase().includes('restaurant'))) &&
            availableCuisines.length > 0 && (
              <button
                onClick={() => setActiveMobileFilter('cuisine')}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 ${
                  filters.cuisine
                    ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                    : `${themeColors.background.card} ${themeColors.border.default} ${themeColors.text.secondary}`
                }`}
              >
                {filters.cuisine || 'Cuisine'}
              </button>
            )}

          <div className="flex-1" />
        </div>
      </div>

      <div
        className={`hidden lg:flex flex-col ${isInSidebar ? 'gap-4' : 'lg:flex-row lg:items-center lg:justify-between'} gap-4`}
      >
        <div className={`${isInSidebar ? 'w-full' : 'flex-1 max-w-md'} flex gap-2`}>
          <div className="relative flex-1 group">
            <Search
              className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 z-10 ${
                isAiMode
                  ? 'text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]'
                  : 'theme-text-secondary'
              }`}
            />
            <input
              type="text"
              placeholder={isAiMode ? 'Ask your list (e.g. Best brunch)...' : 'Search places...'}
              value={isAiMode ? localSearchQuery : filters.searchQuery || ''}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              disabled={isAiLoading}
              className={`w-full pl-10 pr-10 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 transition-all ${
                isAiMode
                  ? 'border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.4),inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:ring-0 bg-white/90 dark:bg-gray-900/80 backdrop-blur-xl text-purple-900 dark:text-purple-100 placeholder:text-purple-400'
                  : 'light-border-default light-bg-card light-text-primary focus:ring-blue-500'
              }`}
            />
            {isAiMode && (
              <>
                <div className="absolute right-0 top-0 bottom-0 pointer-events-none rounded-md bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <button
                  onClick={() => onAiSearch && onAiSearch(localSearchQuery)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-md hover:bg-purple-100 dark:hover:bg-purple-800 text-purple-500 transition-colors"
                  disabled={isAiLoading}
                >
                  <Send className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {onAiModeChange && (
            <button
              onClick={() => onAiModeChange(!isAiMode)}
              disabled={isAiLoading}
              className={`p-2 aspect-square rounded-lg shadow-sm active:scale-95 transition-all ${
                isAiMode
                  ? 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white ring-2 ring-purple-200'
                  : 'bg-white dark:bg-gray-800 text-gray-400 border light-border-default hover:text-purple-500'
              }`}
            >
              {isAiLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles
                  className={`h-5 w-5 ${!isAiMode && 'group-hover:scale-110 transition-transform'}`}
                />
              )}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CustomDropdown
            value={filters.status || 'all'}
            options={allStatuses.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(value: string) =>
              updateFilter('status', value === 'all' ? undefined : (value as PlaceStatus))
            }
            placeholder="All Statuses"
          />

          <MultiSelectDropdown
            value={
              Array.isArray(filters.category)
                ? filters.category
                : filters.category
                  ? [filters.category]
                  : []
            }
            options={[...availableCategories.map((c) => ({ value: c, label: c }))]}
            onChange={(value: string[]) =>
              updateFilter('category', value.length > 0 ? value : undefined)
            }
            placeholder="All Categories"
            className="w-48"
          />

          <CustomDropdown
            value={`${filters.sortBy || 'date'}-${filters.sortDirection || 'desc'}`}
            options={[
              { value: 'date-desc', label: 'Newest First' },
              { value: 'date-asc', label: 'Oldest First' },
              { value: 'rating-desc', label: 'Highest Rated' },
              { value: 'price-asc', label: 'Price: Low to High' },
              { value: 'price-desc', label: 'Price: High to Low' },
              { value: 'name-asc', label: 'Name (A-Z)' },
              { value: 'name-desc', label: 'Name (Z-A)' },
              ...(userLocation ? [{ value: 'distance-asc', label: 'Distance (Nearest)' }] : []),
            ]}
            onChange={(value: string) => {
              if (value === 'name-desc') {
                onFiltersChange({
                  ...filters,
                  sortBy: 'name-desc',
                  sortDirection: 'desc',
                });
                return;
              }
              const [sortBy, sortDirection] = value.split('-');
              onFiltersChange({
                ...filters,
                sortBy: sortBy as FilterOptions['sortBy'],
                sortDirection: sortDirection as FilterOptions['sortDirection'],
              });
            }}
            placeholder="Sort By"
            className="w-40"
          />

          {((Array.isArray(filters.category) &&
            filters.category.some((c) => c.toLowerCase().includes('restaurant'))) ||
            (typeof filters.category === 'string' &&
              filters.category.toLowerCase().includes('restaurant'))) &&
            availableCuisines.length > 0 && (
              <CustomDropdown
                value={filters.cuisine || ''}
                options={[
                  { value: '', label: 'All Cuisines' },
                  ...availableCuisines.map((c) => ({ value: c, label: c })),
                ]}
                onChange={(value: string) => updateFilter('cuisine', value || undefined)}
                placeholder="Any Cuisine"
              />
            )}

          <CustomDropdown
            value={filters.minRating?.toString() || ''}
            options={[
              { value: '', label: 'Min Rating' },
              { value: '1', label: '1+' },
              { value: '2', label: '2+' },
              { value: '3', label: '3+' },
              { value: '4', label: '4+' },
              { value: '4.5', label: '4.5+' },
            ]}
            onChange={(value: string) =>
              updateFilter('minRating', value ? parseFloat(value) : undefined)
            }
            placeholder="Min Rating"
          />

          <MultiSelectDropdown
            value={filters.priceLevel ? filters.priceLevel.map(String) : []}
            options={[
              { value: '0', label: 'Free' },
              { value: '1', label: '$' },
              { value: '2', label: '$$' },
              { value: '3', label: '$$$' },
              { value: '4', label: '$$$$' },
            ]}
            onChange={(values: string[]) =>
              updateFilter('priceLevel', values.length > 0 ? values.map(Number) : undefined)
            }
            placeholder="Any Price"
            className="w-48"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        <div className={`text-sm ${themeColors.text.secondary} flex items-center gap-2`}>
          Showing {filteredCount} of {totalPlaces} places
          {hasActiveFilters && (
            <>
              <span className="text-blue-600 font-medium">
                ({Object.keys(filters).filter((key) => filters[key as keyof FilterOptions]).length}{' '}
                filter
                {Object.keys(filters).filter((key) => filters[key as keyof FilterOptions])
                  .length === 1
                  ? ''
                  : 's'}{' '}
                applied
                <span className="mx-1">·</span>
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 uppercase tracking-wide transition-colors"
                  title="Clear all filters"
                >
                  Clear All
                </button>
                )
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          {density && onDensityChange && (
            <div className="flex items-center rounded-lg overflow-hidden border light-border-default">
              <button
                onClick={() => onDensityChange('comfortable')}
                className={`p-2 transition-colors ${
                  density === 'comfortable'
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : `text-gray-600 dark:text-gray-400 ${themeColors.button.icon} bg-transparent`
                }`}
                title="Comfortable View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDensityChange('compact')}
                className={`p-2 transition-colors ${
                  density === 'compact'
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : `text-gray-600 dark:text-gray-400 ${themeColors.button.icon} bg-transparent`
                }`}
                title="Compact View"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {!hideViewToggle && (
            <div className="flex rounded-lg overflow-hidden border light-border-default">
              <button
                onClick={() => onViewModeChange('list')}
                className={`flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : `text-gray-600 dark:text-gray-400 ${themeColors.button.icon} bg-transparent`
                }`}
              >
                <ListIcon className="h-4 w-4 mr-2" />
                List
              </button>
              <button
                onClick={() => onViewModeChange('map')}
                className={`flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'map'
                    ? 'bg-blue-600 text-white'
                    : `text-gray-600 dark:text-gray-400 ${themeColors.button.icon} bg-transparent`
                }`}
              >
                <MapIcon className="h-4 w-4 mr-2" />
                Map
              </button>
            </div>
          )}
        </div>
      </div>
      <MobileFilterSheet
        activeFilter={activeMobileFilter}
        onClose={() => setActiveMobileFilter(null)}
        filters={filters}
        onFiltersChange={onFiltersChange}
        updateFilter={updateFilter}
        availableCategories={availableCategories}
        customStatuses={customStatuses}
        userLocation={userLocation}
      />
    </div>
  );
};
