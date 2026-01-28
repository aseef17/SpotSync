import { useState } from 'react';
import {
  Search,
  X,
  MapPin as MapIcon,
  LayoutList as ListIcon,
  SlidersHorizontal,
} from 'lucide-react';
import type { PlaceStatus } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';
import { themeColors } from '@/styles/colors';

import { CustomDropdown } from '@/components/ui/CustomDropdown';

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
  hideViewToggle?: boolean; // NEW
}

export const PlaceFilters: React.FC<PlaceFiltersProps> = ({
  filters,
  onFiltersChange,
  availableCategories,
  availableCuisines, // NEW
  customStatuses,
  totalPlaces,
  filteredCount,
  viewMode,
  onViewModeChange,
  hideViewToggle,
}) => {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const updateFilter = (key: keyof FilterOptions, value: FilterOptions[keyof FilterOptions]) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = !!(
    filters.searchQuery ||
    filters.status ||
    filters.category ||
    filters.cuisine || // NEW
    filters.openNow || // NEW
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
      className={`${themeColors.background.card} border-b ${themeColors.border.default} px-0 sm:px-4 py-4`}
    >
      {/* Mobile Component */}
      <div className="lg:hidden mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search places..."
            value={filters.searchQuery || ''}
            onChange={(e) => updateFilter('searchQuery', e.target.value || undefined)}
            className="w-full pl-10 pr-4 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>

        {/* Status & Category & Filter Button Row - Full Width Row */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <CustomDropdown
                value={filters.status || 'all'}
                options={allStatuses}
                onChange={(value) => updateFilter('status', value === 'all' ? undefined : value)}
                placeholder="All Statuses"
              />
            </div>
            <div className="flex-1 min-w-0">
              <CustomDropdown
                value={filters.category || ''}
                options={[
                  { value: '', label: 'All Categories' },
                  ...availableCategories.map((c) => ({ value: c, label: c })),
                ]}
                onChange={(value) => updateFilter('category', value || undefined)}
                placeholder="All Categories"
              />
            </div>
            <button
              onClick={() => setShowMobileFilters(true)}
              className={`flex items-center justify-center px-3 py-2 border light-border-default rounded-lg transition-colors shrink-0 ${hasActiveFilters
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'light-bg-card light-text-secondary hover:bg-blue-50 hover:text-blue-600'
                }`}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>

          {/* Direct Cuisine Filter on Mobile */}
          {filters.category?.toLowerCase().includes('restaurant') && availableCuisines.length > 0 && (
            <div className="w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <CustomDropdown
                value={filters.cuisine || ''}
                options={[
                  { value: '', label: 'All Cuisines' },
                  ...availableCuisines.map((c) => ({ value: c, label: c })),
                ]}
                onChange={(value) => updateFilter('cuisine', value || undefined)}
                placeholder="Any Cuisine"
              />
            </div>
          )}
        </div>

        {/* Mobile Filter Sheet */}
        {showMobileFilters && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => setShowMobileFilters(false)}
            />

            {/* Sheet */}
            <div
              className={`relative w-full max-w-lg transform transition-all ${themeColors.background.card} rounded-t-xl sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col`}
            >
              {/* Header */}
              <div
                className={`flex items-center justify-between px-4 py-3 border-b ${themeColors.border.default}`}
              >
                <h3 className={`text-lg font-semibold ${themeColors.text.primary}`}>Filters</h3>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className={`p-1 rounded-full ${themeColors.text.secondary} ${themeColors.button.icon}`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-6 overflow-y-auto">
                {/* Cuisine (if applicable) */}
                {filters.category?.toLowerCase().includes('restaurant') &&
                  availableCuisines.length > 0 && (
                    <div className="space-y-2">
                      <label className={`text-sm font-medium ${themeColors.text.secondary}`}>
                        Cuisine
                      </label>
                      <CustomDropdown
                        value={filters.cuisine || ''}
                        options={[
                          { value: '', label: 'Any Cuisine' },
                          ...availableCuisines.map((c) => ({ value: c, label: c })),
                        ]}
                        onChange={(value) => updateFilter('cuisine', value || undefined)}
                        placeholder="Any Cuisine"
                      />
                    </div>
                  )}

                {/* Price */}
                <div className="space-y-2">
                  <label className={`text-sm font-medium ${themeColors.text.secondary}`}>
                    Price Level
                  </label>
                  <div className="flex gap-2">
                    {['1', '2', '3', '4'].map((price) => (
                      <button
                        key={price}
                        onClick={() =>
                          updateFilter(
                            'priceLevel',
                            filters.priceLevel === parseInt(price) ? undefined : parseInt(price)
                          )
                        }
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${filters.priceLevel === parseInt(price)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : `light-border-default ${themeColors.text.primary} ${themeColors.button.icon}`
                          }`}
                      >
                        {Array(parseInt(price)).fill('$').join('')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating */}
                <div className="space-y-2">
                  <label className={`text-sm font-medium ${themeColors.text.secondary}`}>
                    Min Rating
                  </label>
                  <div className="flex gap-2">
                    {[3, 3.5, 4, 4.5].map((rating) => (
                      <button
                        key={rating}
                        onClick={() =>
                          updateFilter(
                            'minRating',
                            filters.minRating === rating ? undefined : rating
                          )
                        }
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${filters.minRating === rating
                          ? 'bg-blue-600 text-white border-blue-600'
                          : `light-border-default ${themeColors.text.primary} ${themeColors.button.icon}`
                          }`}
                      >
                        {rating}+
                      </button>
                    ))}
                  </div>
                </div>

                {/* Open Now */}
                <div className="flex items-center justify-between py-2">
                  <span className={`text-sm font-medium ${themeColors.text.primary}`}>
                    Open Now Only
                  </span>
                  <button
                    onClick={() => updateFilter('openNow', !filters.openNow ? true : undefined)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${filters.openNow ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${filters.openNow ? 'translate-x-6' : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className={`p-4 border-t ${themeColors.border.default} flex gap-3`}>
                <button
                  onClick={clearFilters}
                  className={`flex-1 py-2.5 rounded-lg border light-border-default ${themeColors.text.primary} font-medium ${themeColors.button.icon}`}
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Show {filteredCount} Places
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden lg:flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className={`absolute left-3 top-3 h-4 w-4 ${themeColors.text.secondary}`} />
            <input
              type="text"
              placeholder="Search places..."
              value={filters.searchQuery || ''}
              onChange={(e) => updateFilter('searchQuery', e.target.value || undefined)}
              className="w-full pl-9 pr-4 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <CustomDropdown
            value={filters.status || 'all'}
            options={allStatuses.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(value) =>
              updateFilter('status', value === 'all' ? undefined : (value as PlaceStatus))
            }
            placeholder="All Statuses"
          />

          {/* Category Filter */}
          <CustomDropdown
            value={filters.category || ''}
            options={[
              { value: '', label: 'All Categories' },
              ...availableCategories.map((c) => ({ value: c, label: c })),
            ]}
            onChange={(value) => updateFilter('category', value || undefined)}
            placeholder="All Categories"
          />

          {/* Cuisine Filter (NEW) - Only show when restaurant category selected */}
          {filters.category?.toLowerCase().includes('restaurant') &&
            availableCuisines.length > 0 && (
              <CustomDropdown
                value={filters.cuisine || ''}
                options={[
                  { value: '', label: 'All Cuisines' },
                  ...availableCuisines.map((c) => ({ value: c, label: c })),
                ]}
                onChange={(value) => updateFilter('cuisine', value || undefined)}
                placeholder="Any Cuisine"
              />
            )}

          {/* New Filters: Open Now, Rating, Price */}
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${themeColors.border.default} cursor-pointer ${themeColors.button.icon}`}
          >
            <input
              type="checkbox"
              checked={filters.openNow || false}
              onChange={(e) => updateFilter('openNow', e.target.checked || undefined)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className={`text-sm ${themeColors.text.secondary}`}>Open Now</span>
          </label>

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
            onChange={(value) => updateFilter('minRating', value ? parseFloat(value) : undefined)}
            placeholder="Min Rating"
          />

          <CustomDropdown
            value={filters.priceLevel?.toString() || ''}
            options={[
              { value: '', label: 'Any Price' },
              { value: '1', label: '$' },
              { value: '2', label: '$$' },
              { value: '3', label: '$$$' },
              { value: '4', label: '$$$$' },
            ]}
            onChange={(value) => updateFilter('priceLevel', value ? parseInt(value) : undefined)}
            placeholder="Any Price"
          />

        </div>
      </div>

      {/* Results Count & View Toggle */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        <div className={`text-sm ${themeColors.text.secondary} flex items-center gap-2`}>
          Showing {filteredCount} of {totalPlaces} places
          {hasActiveFilters && (
            <>
              <span className="text-blue-600 font-medium">
                ({Object.keys(filters).filter((key) => filters[key as keyof FilterOptions]).length}{' '}
                filter
                {Object.keys(filters).filter((key) => filters[key as keyof FilterOptions]).length ===
                  1
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

        {/* View Toggle - Hidden if hideViewToggle is true */}
        {!hideViewToggle && (
          <div className="flex rounded-lg overflow-hidden border light-border-default">
            <button
              onClick={() => onViewModeChange('list')}
              className={`flex items-center px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : `text-gray-600 dark:text-gray-400 ${themeColors.button.icon} bg-transparent`
                }`}
            >
              <ListIcon className="h-4 w-4 mr-2" />
              List
            </button>
            <button
              onClick={() => onViewModeChange('map')}
              className={`flex items-center px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'map'
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
  );
};
