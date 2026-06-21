import React, { useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Edit,
  Search,
  X,
  Sparkles,
  Info,
  MapPin as MapIcon,
  Share2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { MapView } from '@/features/maps/components/MapView';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { PlaceService } from '@/features/places/api/placeService';
import { useToast } from '@/hooks/useToast';
import { MobileBottomSheet } from '@/components/Layout/MobileBottomSheet/MobileBottomSheet';
import { PlaceFilters } from '@/features/places/components/PlaceFilters';
import { OptionsMenu } from '@/components/Elements/Menu/OptionsMenu';
import { logger } from '@/utils/logger';
import { MobilePlaceCard } from '@/features/places/components/MobilePlaceCard';
import {
  MobilePlaceDetailHeader,
  MobilePlaceDetailContent,
} from '@/features/places/components/MobilePlaceDetail';
import { themeColors } from '@/styles/colors';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';
import { useAuth } from '@/features/auth/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useMapSearch } from '@/features/places/hooks/useMapSearch';
import { MapSearchOverlay } from '@/features/places/components/MapSearchOverlay';
import type { LegacyGooglePlace } from '@/features/places/api/googleMapsService';
import { buildAskListPlacesSummary } from '@/features/places/utils/askListPlacesSummary';
import { PassportProgressBanner } from '@/features/passport/components/PassportProgressBanner';
import { PassportInfoModal } from '@/features/passport/components/PassportInfoModal';
import {
  computePassportProgress,
  getAvailablePassportCategories,
  getAvailablePassportStamps,
  isPassportList,
} from '@/features/passport/utils/passportList';

interface MobileListViewProps {
  list: PlaceList;
  places: Place[];
  placesLoading?: boolean;
  filteredPlaces: Place[];
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onPlaceClick: (place: Place) => void;
  selectedPlace: Place | null;
  onClearSelection: () => void;
  onPlaceUpdated: (place?: Place) => void;
  onEditList: () => void;
  onAddExternalPlace: (place: Partial<Place>) => void;
  highlightedPlaceId?: string;
  onPlaceHidden?: (placeId: string) => void;
  onPlaceRestored?: (placeId: string) => void;
  canEditList?: boolean;
  hasMorePlaces?: boolean;
  loadingMore?: boolean;
  onLoadMorePlaces?: () => void | Promise<void>;
}

const ScrollRestorer = ({ scrollPos }: { scrollPos: number }) => {
  useLayoutEffect(() => {
    const el = document.getElementById('mobile-bottom-sheet-scrollable');
    if (el) {
      // requestAnimationFrame ensures the element is ready/layout is settled
      requestAnimationFrame(() => {
        el.scrollTop = scrollPos;
      });
    }
  }, [scrollPos]);
  return null;
};

export const MobileListView: React.FunctionComponent<MobileListViewProps> = ({
  list,
  places,
  placesLoading = false,
  filteredPlaces,
  filters,
  onFiltersChange,
  onPlaceClick,
  selectedPlace,
  onClearSelection,
  onPlaceUpdated,
  onEditList,
  onAddExternalPlace,
  highlightedPlaceId,
  onPlaceHidden,
  onPlaceRestored,
  canEditList = true,
  hasMorePlaces = false,
  loadingMore = false,
  onLoadMorePlaces,
}) => {
  const { user } = useAuth();
  const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | null>(null);

  const { toast } = useToast();
  const [isAiMode, setIsAiMode] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiMatchedIds, setAiMatchedIds] = useState<string[] | null>(null);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(120);
  const [listScrollPos, setListScrollPos] = useState(0);
  const [showListInfo, setShowListInfo] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);

  // Defer Google Maps until idle — list UI paints first on mobile
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setMapMounted(true), { timeout: 2000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setMapMounted(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Auto-collapse filters on scroll
  useEffect(() => {
    const el = document.getElementById('mobile-bottom-sheet-scrollable');
    if (!el) return;

    const handleScroll = () => {
      // Collapse if scrolled down more than 20px
      if (el.scrollTop > 20 && !isFiltersCollapsed) {
        setIsFiltersCollapsed(true);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isFiltersCollapsed]);

  // Reset scroll to top when a place is selected (opening details)
  useEffect(() => {
    if (selectedPlace) {
      const el = document.getElementById('mobile-bottom-sheet-scrollable');
      if (el) {
        el.scrollTop = 0;
      }
    }
  }, [selectedPlace]);

  const saveListScroll = useCallback(() => {
    const el = document.getElementById('mobile-bottom-sheet-scrollable');
    if (el) setListScrollPos(el.scrollTop);
  }, []);

  const handlePlaceClickWithScroll = useCallback(
    (place: Place) => {
      saveListScroll();
      onPlaceClick(place);
    },
    [saveListScroll, onPlaceClick]
  );

  const aiMatchedPlaces = React.useMemo(() => {
    if (aiMatchedIds === null) return null;
    return places.filter((p) => aiMatchedIds.includes(p.id));
  }, [places, aiMatchedIds]);

  const basePlaces = aiMatchedPlaces || places;

  const { availableCategories, availableCuisines } = React.useMemo(() => {
    return {
      availableCategories: [
        ...new Set(basePlaces.map((p) => p.category).filter((c): c is string => Boolean(c))),
      ],
      availableCuisines: [
        ...new Set(
          basePlaces.flatMap((p) => p.cuisines || []).filter((c): c is string => Boolean(c))
        ),
      ],
    };
  }, [basePlaces]);

  const passportMode = isPassportList(list);
  const availablePassportStamps = React.useMemo(
    () => (passportMode ? getAvailablePassportStamps(basePlaces) : []),
    [passportMode, basePlaces]
  );
  const availablePassportCategories = React.useMemo(
    () => (passportMode ? getAvailablePassportCategories(basePlaces) : []),
    [passportMode, basePlaces]
  );
  const passportProgress = React.useMemo(
    () => (passportMode ? computePassportProgress(places) : null),
    [passportMode, places]
  );
  const [showPassportInfo, setShowPassportInfo] = useState(false);

  const effectiveFilteredPlaces = React.useMemo(() => {
    if (aiMatchedIds === null) return filteredPlaces;

    return filteredPlaces.filter((p) => aiMatchedIds.includes(p.id));
  }, [filteredPlaces, aiMatchedIds]);

  const handleAiSearchSubmit = async (query: string) => {
    if (!query.trim()) return;

    setIsAiSearching(true);

    try {
      const result = await PlaceService.askList(
        list.id,
        query,
        buildAskListPlacesSummary(places, hasMorePlaces)
      );
      if (result.placeIds.length > 0) {
        setAiMatchedIds(result.placeIds);
        toast.success(`Found ${result.placeIds.length} matches!`);
      } else {
        toast.error('No matches found for that query.');
      }
    } catch (error) {
      logger.error('Ai search failed:', error);
      toast.error('Failed to ask AI.');
    } finally {
      setIsAiSearching(false);
    }
  };

  const clearAiFilter = () => {
    setAiMatchedIds(null);
    setIsAiMode(false);
  };

  const handleAiModeChange = (enabled: boolean) => {
    setIsAiMode(enabled);
    if (!enabled) {
      setAiMatchedIds(null);
    }
  };

  const {
    isMapSearching,
    setIsMapSearching,
    mapSearchQuery,
    setMapSearchQuery,
    mapSearchResults,
    isSearchLoading,
    handleSelectSearchResult,
    clearSearch,
    debouncedMapSearchQuery,
  } = useMapSearch({ listId: list.id, userLocation, currentUserId: user?.id });

  useEffect(() => {
    if (isMapSearching) setMapMounted(true);
  }, [isMapSearching]);

  React.useEffect(() => {
    GoogleMapsService.getUserLocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, []);

  const onSelectSearchResult = async (result: LegacyGooglePlace) => {
    // Normalize IDs for comparison (handle both old format places/ChIJ... and new format ChIJ...)
    const normalizeId = (id: string | undefined) => id?.replace(/^places\//, '') || '';
    const resultId = normalizeId(result.place_id);

    let existingPlace = places.find((p) => normalizeId(p.googlePlaceId) === resultId);

    // Only skip if we are absolutely sure it's the same place and NOT in a "force preview" context
    // But if the user is searching, they might want to see the "Add" button if it's not truly in the list yet
    if (existingPlace) {
      saveListScroll();
      onPlaceClick(existingPlace);
      clearSearch();
      return;
    }

    const previewPlace = await handleSelectSearchResult(result);

    if (previewPlace) {
      // 3. Check again with the definitive googlePlaceId from details
      const canonicalId = normalizeId(previewPlace.googlePlaceId);
      existingPlace = places.find((p) => normalizeId(p.googlePlaceId) === canonicalId);

      saveListScroll();
      if (existingPlace) {
        // It was an alias! Use the existing place instead of the preview
        onPlaceClick(existingPlace);
      } else {
        // It's genuinely new
        onPlaceClick(previewPlace);
      }
      clearSearch();
    }
  };

  const listHeader = (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <Link to="/" className={`p-2 -ml-2 rounded-md ${themeColors.text.secondary}`}>
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex-1 mx-3">
          <h1 className={`text-xl font-semibold ${themeColors.text.primary} mb-1`}>{list.name}</h1>
          <div className="flex items-center gap-1">{/* Metadata row removed as per request */}</div>
        </div>

        <div className="flex items-center gap-1">
          <OptionsMenu
            options={[
              {
                label: 'List Info',
                icon: <Info className="h-5 w-5" />,
                onClick: () => setShowListInfo(true),
              },
              {
                label: 'Share List',
                icon: <Share2 className="h-5 w-5" />,
                onClick: () => {
                  if (!list.isPublic) {
                    toast.error('Please make the list public before sharing.');
                    if (canEditList) onEditList();
                    return;
                  }
                  navigator.clipboard.writeText(window.location.href);
                  toast.success('Link copied to clipboard!');
                },
              },
              ...(canEditList && places.length > 0
                ? [
                    {
                      label: isSyncingPhotos ? 'Syncing Photos...' : 'Sync Photos',
                      icon: (
                        <RefreshCw className={`h-5 w-5 ${isSyncingPhotos ? 'animate-spin' : ''}`} />
                      ),
                      onClick: async () => {
                        if (!user?.id) return;
                        setIsSyncingPhotos(true);
                        toast.info('Syncing photos in the background...');
                        try {
                          const syncResult = await PlaceService.syncListPhotos(list.id, user.id);
                          if (syncResult.photoFailures > 0 || syncResult.placePersistFailures > 0) {
                            toast.warning(
                              `Photo sync finished with issues: ${syncResult.placesUpdated}/${syncResult.placesProcessed} places updated, ${syncResult.photoFailures} photo failures.`
                            );
                          } else {
                            toast.success(
                              `Photos synced for ${syncResult.placesUpdated} of ${syncResult.placesProcessed} places.`
                            );
                          }
                        } catch {
                          toast.error('Failed to sync photos.');
                        } finally {
                          setIsSyncingPhotos(false);
                        }
                      },
                    },
                    {
                      label: 'Edit List',
                      icon: <Edit className="h-5 w-5" />,
                      onClick: onEditList,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {(places.length > 0 || effectiveFilteredPlaces.length > 0) && (
        <>
          {passportMode && passportProgress && (
            <PassportProgressBanner
              progress={passportProgress}
              onInfoClick={() => setShowPassportInfo(true)}
            />
          )}
          <PlaceFilters
            filters={filters}
            onFiltersChange={onFiltersChange}
            availableCategories={availableCategories}
            availableCuisines={availableCuisines}
            isPassportList={passportMode}
            availablePassportStamps={availablePassportStamps}
            availablePassportCategories={availablePassportCategories}
            customStatuses={list.customStatuses}
          totalPlaces={basePlaces.length}
          filteredCount={effectiveFilteredPlaces.length}
          viewMode="list"
          onViewModeChange={() => {}}
          hideViewToggle={true}
          onAiSearch={handleAiSearchSubmit}
          isAiMode={isAiMode}
          onAiModeChange={handleAiModeChange}
          isAiLoading={isAiSearching}
          isCollapsed={isFiltersCollapsed}
          onToggleCollapse={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
        />
        </>
      )}

      <PassportInfoModal
        isOpen={showPassportInfo}
        onClose={() => setShowPassportInfo(false)}
        config={list.passportConfig}
      />

      {/* List Info Modal */}
      {showListInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-sm ${themeColors.background.card} rounded-xl shadow-xl overflow-hidden`}
          >
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className={`font-semibold ${themeColors.text.primary}`}>List Details</h3>
              <button
                onClick={() => setShowListInfo(false)}
                className={`p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${themeColors.text.secondary}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className={`text-xs ${themeColors.text.secondary}`}>Owner</p>
                  <p className={`font-medium ${themeColors.text.primary}`}>
                    {user?.email || 'Unknown'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-full ${
                    list.collaborators && list.collaborators.length > 0
                      ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {list.collaborators && list.collaborators.length > 0 ? (
                    <Share2 className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className={`text-xs ${themeColors.text.secondary}`}>Type</p>
                  <p className={`font-medium ${themeColors.text.primary}`}>
                    {list.collaborators && list.collaborators.length > 0
                      ? 'Shared List'
                      : 'Private List'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600">
                  <MapIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className={`text-xs ${themeColors.text.secondary}`}>Places</p>
                  <p className={`font-medium ${themeColors.text.primary}`}>
                    {places.length} places
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const listContent = (
    <div className="space-y-3">
      <ScrollRestorer scrollPos={listScrollPos} />

      <div className="pb-20">
        {effectiveFilteredPlaces.length === 0 && !(placesLoading && places.length === 0) ? (
          <div className="text-center py-12">
            <p className={themeColors.text.secondary}>
              {places.length === 0 ? 'No places yet' : 'No places match your filters'}
            </p>
          </div>
        ) : effectiveFilteredPlaces.length > 0 ? (
          <AnimatePresence mode="popLayout">
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
              className="space-y-1"
            >
              {effectiveFilteredPlaces.map((place) => (
                <motion.div
                  key={place.clientId || place.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <MobilePlaceCard
                    place={place}
                    list={list}
                    userLocation={userLocation}
                    onClick={handlePlaceClickWithScroll}
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        ) : null}
        {hasMorePlaces && aiMatchedIds === null && onLoadMorePlaces && (
          <div className="flex justify-center pt-4 pb-2">
            <button
              type="button"
              onClick={() => void onLoadMorePlaces()}
              disabled={loadingMore}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more places'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const headerContent = selectedPlace ? (
    <MobilePlaceDetailHeader
      place={selectedPlace}
      onClose={onClearSelection}
      userLocation={userLocation}
      onPlaceUpdated={onPlaceUpdated}
      currentUserId={user?.id}
      customStatuses={list.customStatuses}
      onAddExternalPlace={onAddExternalPlace}
      canEdit={canEditList}
      isPassportList={passportMode}
    />
  ) : (
    listHeader
  );

  const bodyContent = selectedPlace ? (
    <MobilePlaceDetailContent
      place={selectedPlace}
      onPlaceUpdated={onPlaceUpdated}
      onClose={onClearSelection}
      currentUserId={user?.id}
      onAddExternalPlace={onAddExternalPlace}
      onPlaceHidden={onPlaceHidden}
      onPlaceRestored={onPlaceRestored}
    />
  ) : (
    listContent
  );

  const snapPoints = React.useMemo(() => [140, '50%', '95%'], []);
  const [forcedSnap, setForcedSnap] = React.useState<number | undefined>(undefined);
  const isMapAreaLoading = !mapMounted || (placesLoading && places.length === 0);
  const bottomSheetSnapIndex = forcedSnap ?? (isMapAreaLoading ? 0 : undefined);

  return (
    <div
      className={`fixed inset-0 w-full h-[100dvh] flex flex-col ${themeColors.background.app} overflow-hidden`}
    >
      {/* AI Mode Highlight Border */}
      {isAiMode && (
        <div className="absolute inset-0 z-[9999] pointer-events-none shadow-[inset_0_0_80px_rgba(168,85,247,0.4)] transition-all duration-300" />
      )}

      <div className="absolute inset-0 z-0 overflow-hidden">
        {mapMounted ? (
          <MapView
            places={effectiveFilteredPlaces}
            onPlaceClick={onPlaceClick}
            markerIcon={list.icon}
            markerColor={list.color}
            markerSize={list.iconSize}
            highlightedPlaceId={highlightedPlaceId}
            previewPlace={(() => {
              if (!selectedPlace?.isPreview) return null;
              const normalizeId = (id: string | undefined) => id?.replace(/^places\//, '') || '';
              const selectedId = normalizeId(selectedPlace?.googlePlaceId);
              const existsInList = places.some(
                (p) => normalizeId(p.googlePlaceId) === selectedId || p.id === selectedPlace?.id
              );
              return existsInList ? null : selectedPlace;
            })()}
            onLayerMenuOpen={(isOpen) => setForcedSnap(isOpen ? 0 : undefined)}
            onAddExternalPlace={onAddExternalPlace}
            onUserLocationUpdate={setUserLocation}
          />
        ) : (
          <div className={`w-full h-full ${themeColors.background.app}`} />
        )}
      </div>

      {!selectedPlace && (
        <>
          <div className="absolute top-4 inset-x-4 z-10">
            <button
              onClick={() => setIsMapSearching(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 transition-transform active:scale-[0.98] mt-[env(safe-area-inset-top)]"
            >
              <Search className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              <span className="flex-1 text-left text-[15px]">Search here</span>
            </button>
          </div>

          {aiMatchedIds !== null && (
            <div
              className="absolute left-1/2 transform -translate-x-1/2 z-20 w-auto transition-all duration-300"
              style={{ bottom: bottomSheetHeight + 20 }}
            >
              <button
                onClick={clearAiFilter}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-xl flex items-center gap-3 active:scale-95 transition-all animate-in slide-in-from-bottom-4 fade-in"
              >
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold">Clear AI Filter ({aiMatchedIds.length})</span>
                <X className="h-4 w-4 opacity-75" />
              </button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        <MapSearchOverlay
          isOpen={isMapSearching}
          onClose={clearSearch}
          searchQuery={mapSearchQuery}
          onSearchQueryChange={setMapSearchQuery}
          searchResults={mapSearchResults}
          isSearchLoading={isSearchLoading}
          onSelectResult={onSelectSearchResult}
          debouncedQuery={debouncedMapSearchQuery}
        />
      </AnimatePresence>

      <MobileBottomSheet
        header={
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedPlace ? 'detail-header' : 'list-header'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {headerContent}
            </motion.div>
          </AnimatePresence>
        }
        snapPoints={snapPoints}
        defaultSnap={isMapAreaLoading ? 0 : 1}
        snapIndex={bottomSheetSnapIndex}
        onHeightChange={setBottomSheetHeight}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedPlace ? 'detail-content' : 'list-content'}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            {bodyContent}
          </motion.div>
        </AnimatePresence>
      </MobileBottomSheet>
    </div>
  );
};
