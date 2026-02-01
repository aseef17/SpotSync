import React, { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Star, DollarSign, Plus, X, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { PlaceService } from '@/features/places/api/placeService';
import { extractCuisines } from '@/constants/placeCategories';
import { createPlaceFromGoogleDetails } from '@/features/places/utils/placeFactory';
import { getCategoryDisplayText } from '@/features/places/utils/placeHelpers';
import { useAuth } from '@/features/auth/context/AuthContext';
import { themeColors, colors } from '@/styles/colors';
import { logger } from '@/utils/logger';
import { useDeferredAction } from '@/hooks/useDeferredAction';
import type { Place } from '@/features/places/types/place';
import { omit } from '@/utils/objects';

// Simplified interface for Google Places search results
interface PlaceSearchResult {
  place_id: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  price_level?: number;
  types?: string[];
  category?: string;
  cuisines?: string[];
}

interface PlaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId: string;
  onPlaceAdded: (place: Place) => void;
  onUndoAdd?: (placeId: string) => void;
  onPlaceUpdated?: () => void;
  onReplaceId?: (tempId: string, realId: string) => void;
}

export const PlaceSearchModal: React.FunctionComponent<PlaceSearchModalProps> = ({
  isOpen,
  onClose,
  listId,
  onPlaceAdded,
  onUndoAdd,
  onPlaceUpdated,
  onReplaceId,
}) => {
  const { user } = useAuth();
  const { trigger: triggerAction } = useDeferredAction();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [addingPlace, setAddingPlace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Initialize Google Maps when modal opens
      GoogleMapsService.initialize().catch((err) => {
        logger.error('Failed to initialize Google Maps:', err);
        setError(
          `Failed to load Google Maps. ${
            err instanceof Error ? err.message : 'Please check your API key and restrictions.'
          }`
        );
      });
    }
  }, [isOpen]);

  // Debounced search effect
  useEffect(() => {
    if (searchQuery.length < 5) {
      setDebouncedQuery('');
      setSearchResults([]);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setIsDebouncing(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!debouncedQuery.trim()) return; // Use debouncedQuery for actual search

      setLoading(true);
      setError(null);
      setSearchResults([]);

      try {
        // Try to get user's location for better search results
        const userLocation = await GoogleMapsService.getUserLocation();

        const results = await GoogleMapsService.searchPlaces(
          debouncedQuery.trim(),
          userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined
        );

        // Populate cuisines for search results
        const resultsWithCuisines = results.map((r) => ({
          ...r,
          cuisines: r.types ? extractCuisines(r.types) : [],
        }));

        setSearchResults(resultsWithCuisines);
      } catch (err) {
        setError(
          `Failed to search places: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      } finally {
        setLoading(false);
      }
    },
    [debouncedQuery]
  );

  // Trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length >= 5) {
      handleSearch();
    }
  }, [debouncedQuery, handleSearch]);

  const handleAddPlace = async (googlePlace: PlaceSearchResult, keepOpen = false) => {
    setAddingPlace(googlePlace.place_id);
    setError(null);

    if (!user) {
      setError('You must be logged in to add places.');
      setAddingPlace(null);
      return;
    }

    try {
      // Fetch complete place details (includes delivery, dineIn, etc.)
      const fullDetails = await GoogleMapsService.getPlaceDetails(googlePlace.place_id);

      if (!fullDetails) {
        setError('Failed to fetch complete place details.');
        setAddingPlace(null);
        return;
      }

      // Create temporary place for optimistic UI
      const tempId = `temp-${Date.now()}`;
      // Use tempId as stable clientId for React keys -> ensures no unmounting when ID changes
      const clientId = tempId;

      const newPlaceData = createPlaceFromGoogleDetails(
        fullDetails,
        listId,
        user.id || 'anonymous',
        {
          id: tempId,
          clientId,
          addedBy: user.id || 'anonymous',
          addedAt: new Date(),
          updatedAt: new Date(),
        }
      );

      onPlaceAdded(newPlaceData);
      onClose();

      triggerAction(
        async () => {
          // Strip IDs and timestamps for creation
          const placePayload = omit(newPlaceData, ['id', 'addedAt', 'updatedAt']);

          const realId = await PlaceService.createPlace(listId, placePayload);

          onReplaceId?.(tempId, realId);

          onPlaceUpdated?.();
        },
        {
          toastMessage: 'Place added',
          undoMessage: 'Canceled',
          onUndo: () => {
            onUndoAdd?.(tempId);
          },
          onError: (err) => {
            logger.error('Failed to add place:', err);
            onUndoAdd?.(tempId);
          },
        }
      );

      if (!keepOpen) {
        // Close modal if user clicked "Save"
        setSearchResults([]); // Clear search results
        setSearchQuery(''); // Clear search query
        setDebouncedQuery(''); // Clear debounced query
        onClose();
      } else {
        // Keep modal open but clear this specific result
        setSearchResults(searchResults.filter((p) => p.place_id !== googlePlace.place_id));
      }
    } catch (err) {
      setError(`Failed to add place: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAddingPlace(null);
    }
  };

  const formatPriceLevel = (level?: number) => {
    if (!level) return '';
    return '$'.repeat(Math.min(level, 4));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`absolute inset-0 ${themeColors.background.modalOverlay}`}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`${themeColors.background.card} relative rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden border ${themeColors.border.default} shadow-xl`}
          >
            <div
              className={`flex items-center justify-between p-6 border-b ${themeColors.border.default}`}
            >
              <h2 className={`text-xl font-semibold ${themeColors.text.primary}`}>
                Add Places to List
              </h2>
              <button
                onClick={onClose}
                className={`${themeColors.text.secondary} hover:${themeColors.text.primary}`}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {/* Search Form */}
              <form onSubmit={handleSearch} className="mb-6">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search
                      className={`absolute left-3 top-3 h-5 w-5 ${themeColors.text.secondary}`}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for restaurants, attractions, cafes..."
                      className="w-full pl-10 pr-4 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !searchQuery.trim()}
                    className={`px-6 py-2 rounded-lg ${themeColors.button.primary} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                  >
                    {loading ? <Loader className="h-5 w-5 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </form>

              {/* Error Message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`mb-4 px-4 py-3 rounded border ${themeColors.form.errorBox}`}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Search Results */}
              <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {loading || isDebouncing ? (
                  <div className="text-center py-8">
                    <Loader
                      className={`h-8 w-8 animate-spin mx-auto ${themeColors.text.secondary}`}
                    />
                    <p className={`mt-2 ${themeColors.text.secondary}`}>
                      {isDebouncing ? 'Typing...' : 'Searching for places...'}
                    </p>
                  </div>
                ) : searchQuery.length > 0 && searchQuery.length < 5 ? (
                  <div className="text-center py-8">
                    <MapPin className={`h-12 w-12 ${themeColors.text.secondary} mx-auto`} />
                    <p className={`mt-2 ${themeColors.text.secondary}`}>
                      Type at least 5 characters to search for places...
                    </p>
                  </div>
                ) : searchResults.length === 0 && debouncedQuery ? (
                  <div className="text-center py-8">
                    <MapPin className={`h-12 w-12 ${themeColors.text.secondary} mx-auto`} />
                    <p className={`mt-2 ${themeColors.text.secondary}`}>
                      No places found. Try a different search term.
                    </p>
                  </div>
                ) : (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.05,
                        },
                      },
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    {searchResults.map((place) => (
                      <motion.div
                        key={place.place_id}
                        variants={{
                          hidden: { opacity: 0, x: -10 },
                          visible: { opacity: 1, x: 0 },
                        }}
                        className={`border ${themeColors.border.default} rounded-lg p-4 hover:border-${colors.primary[400]} transition-colors`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className={`font-medium ${themeColors.text.primary} mb-1`}>
                              {place.name}
                            </h3>
                            <p className={`text-sm ${themeColors.text.secondary} mb-2`}>
                              {place.formatted_address}
                            </p>

                            <div
                              className={`flex items-center space-x-4 text-sm ${themeColors.text.secondary}`}
                            >
                              {place.rating && (
                                <div className="flex items-center">
                                  <Star className="h-4 w-4 text-yellow-400 mr-1" />
                                  <span>{place.rating}</span>
                                </div>
                              )}
                              {place.price_level && (
                                <div className="flex items-center">
                                  <DollarSign className="h-4 w-4 mr-1" />
                                  <span>{formatPriceLevel(place.price_level)}</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-2 flex items-center flex-wrap gap-2">
                              {/* Display standardized category/cuisine string */}
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${themeColors.text.secondary} bg-gray-50 dark:bg-gray-800 border ${themeColors.border.default}`}
                              >
                                {getCategoryDisplayText(place)}
                              </span>
                            </div>
                          </div>

                          <div className="ml-4 flex flex-col gap-2">
                            <button
                              onClick={() => handleAddPlace(place, false)}
                              disabled={addingPlace === place.place_id}
                              className={`flex items-center px-3 py-2 text-sm rounded-lg ${themeColors.button.primary} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                            >
                              {addingPlace === place.place_id ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-1" />
                                  Save
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleAddPlace(place, true)}
                              disabled={addingPlace === place.place_id}
                              className={`flex items-center px-3 py-2 text-sm rounded-lg border ${themeColors.border.default} ${themeColors.text.primary} hover:${themeColors.background.app} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                            >
                              {addingPlace === place.place_id ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-1" />
                                  Save & Add
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
