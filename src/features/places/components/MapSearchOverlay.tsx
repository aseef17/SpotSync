import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, X, Loader2, MapPin, Star } from 'lucide-react';
import { getCategoryDisplayText } from '@/features/places/utils/placeHelpers';
import type { LegacyGooglePlace } from '@/features/places/api/googleMapsService';

interface MapSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: LegacyGooglePlace[];
  isSearchLoading: boolean;
  onSelectResult: (result: LegacyGooglePlace) => void;
  debouncedQuery: string;
}

export const MapSearchOverlay: React.FC<MapSearchOverlayProps> = ({
  isOpen,
  onClose,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  isSearchLoading,
  onSelectResult,
  debouncedQuery,
}) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 z-[100] bg-white dark:bg-gray-900 flex flex-col"
    >
      <div className="p-4 flex items-center gap-3 border-b light-border-default">
        <button onClick={onClose} className="p-2 -ml-2 text-gray-500">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search for a place..."
            className="w-full pl-10 pr-10 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isSearchLoading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Searching...</span>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="divide-y light-border-default">
            {searchResults.map((result) => (
              <button
                key={result.place_id}
                onClick={() => onSelectResult(result)}
                className="w-full p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                    {result.name}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {result.formatted_address}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {result.rating && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500 fill-current" />
                        {result.rating}
                      </span>
                    )}
                    <span>{getCategoryDisplayText(result)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery.length >= 3 ? (
          <div className="p-12 text-center text-gray-500">
            {isSearchLoading || searchQuery !== debouncedQuery ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span>Searching...</span>
              </div>
            ) : (
              <span>No places found for "{searchQuery}"</span>
            )}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-400 italic">
            Enter 3+ characters to search...
          </div>
        )}
      </div>
    </motion.div>
  );
};
