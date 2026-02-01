import React, { useState, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Plus, Users, ArrowLeft, Eye, EyeOff, MapIcon, X, Edit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { logger } from '@/utils/logger';
import { ListService } from '@/features/lists/api/listService';
import { PlaceService } from '@/features/places/api/placeService';
import { useAuth } from '@/features/auth/context/AuthContext';
import { PlaceSearchModal } from '@/features/places/components/PlaceSearchModal';
import { createPlaceFromGoogleDetails } from '@/features/places/utils/placeFactory';
import { PlaceDetailsModal } from '@/features/places/components/PlaceDetailsModal';
import { PlaceDetailsPane } from '@/features/places/components/PlaceDetailsPane';
import { PlaceCard } from '@/features/places/components/PlaceCard';
import { CompactPlaceCard } from '@/features/places/components/CompactPlaceCard';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { PlaceFilters } from '@/features/places/components/PlaceFilters';
import { useDeferredAction } from '@/hooks/useDeferredAction';
import type { Place } from '@/features/places/types/place';
import type { PlaceList } from '@/features/lists/types/list';
import { themeColors } from '@/styles/colors';
import { MapView } from '@/features/maps/components/MapView';
import { CollaboratorManager } from '@/features/lists/components/CollaboratorManager';
import { CreateListModal } from '@/features/lists/components/CreateListModal';
import { MobileListView } from '@/features/lists/components/MobileListView';
import { OptionsMenu } from '@/components/Elements/Menu/OptionsMenu';
import { FAB } from '@/components/Elements/Button/FAB';
import { useListDetails } from '@/features/lists/hooks/useListDetails';
import { usePlaceFilters } from '@/features/places/hooks/usePlaceFilters';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useToast } from '@/hooks/useToast';

export const ListView: React.FunctionComponent = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { list, places, loading, error, loadListData, updatePlace, updateList } =
    useListDetails(listId);
  const isMobile = useIsMobile();

  const [showAddPlacesModal, setShowAddPlacesModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showPlaceDetails, setShowPlaceDetails] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [hiddenPlaceIds, setHiddenPlaceIds] = useState<Set<string>>(new Set());
  const [optimisticPlaces, setOptimisticPlaces] = useState<Place[]>([]);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<typeof list>>(null);
  const { trigger: triggerAction } = useDeferredAction();
  const { toast } = useToast();
  const [isAiMode, setIsAiMode] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiMatchedIds, setAiMatchedIds] = useState<string[] | null>(null);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Permission denied or error
        }
      );
    }
  }, []);

  const displayedList = React.useMemo(() => {
    if (!list) return null;
    if (pendingUpdate) return { ...list, ...pendingUpdate };
    return list;
  }, [list, pendingUpdate]);

  const handleUpdateList = async (data: Partial<PlaceList>) => {
    if (!list || !user) return;

    setPendingUpdate(data);

    triggerAction(
      async () => {
        await updateList(list.id, data, user.id);
      },
      {
        toastMessage: 'List updated',
        undoMessage: 'Reverted',
        onUndo: () => {
          setPendingUpdate(null);
        },
        onError: (err) => {
          logger.error('Update failed', err);
          setPendingUpdate(null);
        },
      }
    );
  };

  const getCanDelete = (place: Place): boolean => {
    if (!user) return false;
    return user.id === place.addedBy || user.id === list?.ownerId;
  };

  const visiblePlaces = React.useMemo(() => {
    const all = [...optimisticPlaces, ...places];
    // Deduplicate by clientId if available, falling back to id
    // Since 'places' (real data) comes last, it will overwrite optimistic versions with the same clientId
    const unique = Array.from(new Map(all.map((p) => [p.clientId || p.id, p])).values());
    return unique.filter((p) => !hiddenPlaceIds.has(p.id));
  }, [places, optimisticPlaces, hiddenPlaceIds]);

  useEffect(() => {
    if (optimisticPlaces.length === 0) return;

    const realIds = new Set(places.map((p) => p.id));
    const stillOptimistic = optimisticPlaces.filter((p) => !realIds.has(p.id));

    if (stillOptimistic.length !== optimisticPlaces.length) {
      setOptimisticPlaces(stillOptimistic);
    }
  }, [places, optimisticPlaces]);

  const handlePlaceAdded = useCallback((place: Place) => {
    setOptimisticPlaces((prev) => [place, ...prev]);
  }, []);

  const handleUndoAdd = useCallback((tempId: string) => {
    setOptimisticPlaces((prev) => prev.filter((p) => p.id !== tempId));
  }, []);

  const handleReplacePlaceId = useCallback((tempId: string, realId: string) => {
    setOptimisticPlaces((prev) => prev.map((p) => (p.id === tempId ? { ...p, id: realId } : p)));
  }, []);

  const handlePlaceHidden = useCallback((placeId: string) => {
    setHiddenPlaceIds((prev) => new Set([...prev, placeId]));
  }, []);

  const handlePlaceRestored = useCallback((placeId: string) => {
    setHiddenPlaceIds((prev) => {
      const next = new Set(prev);
      next.delete(placeId);
      return next;
    });
  }, []);

  const { filters, setFilters, filteredPlaces, viewMode, setViewMode } = usePlaceFilters(
    visiblePlaces,
    userLocation
  );

  // Base set of places for filter calculations (Dropdown options)
  const aiMatchedPlaces = React.useMemo(() => {
    if (aiMatchedIds === null) return null;
    return visiblePlaces.filter((p) => aiMatchedIds.includes(p.id));
  }, [visiblePlaces, aiMatchedIds]);

  const basePlaces = aiMatchedPlaces || visiblePlaces;

  // Final list to show: Intersection of (Standard Filters) AND (AI Matches)
  const effectiveFilteredPlaces = React.useMemo(() => {
    if (aiMatchedIds === null) return filteredPlaces;

    // If AI is active, we want to apply standard filters (like Open Now) ON TOP of AI results
    return filteredPlaces.filter((p) => aiMatchedIds.includes(p.id));
  }, [filteredPlaces, aiMatchedIds]);

  const handleAiSearchSubmit = async (query: string) => {
    if (!query.trim()) return;

    setIsAiSearching(true);

    try {
      const result = await PlaceService.askList(listId!, query);
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

  const handleAiModeChange = (enabled: boolean) => {
    setIsAiMode(enabled);
    if (!enabled) {
      setAiMatchedIds(null); // Auto-clear filter when exiting AI mode
    }
  };

  // Sync selectedPlace with places array - if a preview place is now in the list, use the saved version
  useEffect(() => {
    if (selectedPlace && selectedPlace.isPreview && places.length > 0) {
      // Normalize IDs for comparison (handle both old format places/ChIJ... and new format ChIJ...)
      const normalizeId = (id: string | undefined) => id?.replace(/^places\//, '') || '';
      const selectedId = normalizeId(selectedPlace.googlePlaceId);

      const savedPlace = places.find(
        (p) => normalizeId(p.googlePlaceId) === selectedId || p.id === selectedPlace.id
      );
      if (savedPlace) {
        // Replace preview with saved version (which doesn't have isPreview)
        setSelectedPlace(savedPlace);
      }
    }
  }, [places, selectedPlace]);

  // Optimized callback - updates single place instead of reloading all
  const handlePlaceUpdated = useCallback(
    (place?: Place) => {
      if (place?.id) {
        updatePlace(place.id);
        // Update selectedPlace if it's the one that was updated
        setSelectedPlace((prev) => (prev?.id === place.id ? { ...prev, ...place } : prev));
      } else {
        loadListData(true).then(() => {
          // After full reload, try to find the selected place in the new list to update its data
          setSelectedPlace((prev) => {
            if (!prev) return null;
            return prev;
          });
        });
      }
    },
    [updatePlace, loadListData]
  );

  const handleAddExternalPlace = useCallback(
    async (placeData: Partial<Place>) => {
      if (!listId || !user) return;

      try {
        // Fetch full details to get all fields that might be missing from the search result
        const fullDetails = await GoogleMapsService.getPlaceDetails(placeData.googlePlaceId!);

        if (!fullDetails) {
          throw new Error('Failed to fetch place details');
        }

        // Use factory for consistent creation
        const tempId = `temp-${Date.now()}`;
        const clientId = tempId;

        // Clean placeData of temporary/preview artifacts
        const { id: _pid, isPreview: _prev, clientId: _cid, ...cleanOverrides } = placeData;
        void _pid;
        void _prev;
        void _cid;

        const optimisticPlace = createPlaceFromGoogleDetails(
          fullDetails,
          listId!,
          user.id || 'anonymous',
          {
            ...cleanOverrides,
            id: tempId,
            clientId,
            status: 'not_visited',
            addedAt: new Date(),
            updatedAt: new Date(),
          }
        );

        handlePlaceAdded(optimisticPlace);
        setSelectedPlace(null); // Close detail view immediately

        triggerAction(
          async () => {
            // Strip temporary ID for creation
            const { id: _tempId, ...newPlaceProps } = optimisticPlace;
            void _tempId;
            const newPlace = newPlaceProps as Omit<Place, 'id'>;

            const realId = await PlaceService.createPlace(listId, newPlace);

            // Replace temp ID with real ID in optimistic state
            setOptimisticPlaces((prev) =>
              prev.map((p) => (p.id === tempId ? { ...p, id: realId } : p))
            );

            handlePlaceUpdated();
          },
          {
            toastMessage: 'Place added',
            undoMessage: 'Canceled',
            onUndo: () => {
              handleUndoAdd(tempId);
            },
            onError: (err) => {
              logger.error('Failed to add external place:', err);
              handleUndoAdd(tempId);
            },
          }
        );
      } catch (err) {
        logger.error('Failed to add external place:', err);
      }
    },
    [listId, user, handlePlaceAdded, handleUndoAdd, triggerAction, handlePlaceUpdated]
  );

  if (loading) {
    return (
      <div className={`min-h-screen ${themeColors.background.app}`}>
        <header
          className={`shadow-sm border-b ${themeColors.background.card} ${themeColors.border.default}`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <Link
                to="/"
                className={`p-2 rounded-md ${themeColors.text.secondary} hover:${themeColors.text.primary} mr-2`}
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div
                className={`animate-pulse ${themeColors.background.card} h-6 w-48 rounded`}
              ></div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div
            className={`animate-pulse ${themeColors.background.card} rounded-lg shadow-sm border p-6`}
          >
            <div className="space-y-4">
              <div className={`${themeColors.background.app} h-8 w-64 rounded`}></div>
              <div className={`${themeColors.background.app} h-4 w-96 rounded`}></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`${themeColors.background.app} h-48 rounded`}></div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !list || !displayedList) {
    return (
      <div className={`min-h-screen ${themeColors.background.app}`}>
        <header
          className={`shadow-sm border-b ${themeColors.background.card} ${themeColors.border.default}`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <Link
                to="/"
                className={`p-2 rounded-md ${themeColors.text.secondary} hover:${themeColors.text.primary} mr-2`}
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className={`text-xl font-semibold ${themeColors.text.primary}`}>
                List Not Found
              </h1>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className={`${themeColors.background.card} rounded-lg shadow-sm border p-6`}>
            <div className="text-center py-12">
              <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>List Not Found</h3>
              <p className={`${themeColors.text.secondary} mt-2`}>
                {error || "The list you're looking for doesn't exist."}
              </p>
              <Link
                to="/"
                className={`mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themeColors.button.primary} transition-colors`}
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isMobile && list) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="mobile-list-view"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full"
        >
          <MobileListView
            list={displayedList}
            places={visiblePlaces}
            filteredPlaces={filteredPlaces}
            filters={filters}
            onFiltersChange={setFilters}
            onPlaceClick={(place) => {
              setSelectedPlace(place);
            }}
            selectedPlace={selectedPlace}
            onClearSelection={() => setSelectedPlace(null)}
            onPlaceUpdated={handlePlaceUpdated}
            onEditList={() => setShowEditList(true)}
            onAddExternalPlace={handleAddExternalPlace}
            onPlaceHidden={handlePlaceHidden}
            onPlaceRestored={handlePlaceRestored}
            highlightedPlaceId={selectedPlace?.id}
          />

          {/* Shared modals for mobile */}
          <PlaceSearchModal
            isOpen={showAddPlacesModal}
            onClose={() => setShowAddPlacesModal(false)}
            onPlaceAdded={handlePlaceAdded}
            onUndoAdd={handleUndoAdd}
            onPlaceUpdated={handlePlaceUpdated}
            onReplaceId={handleReplacePlaceId}
            listId={list.id}
          />

          {showCollaborators && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="light-bg-card rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto border light-border-default">
                <div className="sticky top-0 light-bg-card border-b light-border-default p-4 flex items-center justify-between z-10">
                  <h2 className="text-lg font-semibold light-text-primary">Manage Team</h2>
                  <button
                    onClick={() => setShowCollaborators(false)}
                    className="light-text-secondary hover:light-text-primary"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <CollaboratorManager
                  list={list}
                  currentUserId={user?.id || ''}
                  onUpdate={() => {
                    loadListData();
                    setShowCollaborators(false);
                  }}
                />
              </div>
            </div>
          )}

          {showEditList && list && (
            <CreateListModal
              isOpen={showEditList}
              onClose={() => setShowEditList(false)}
              editingList={list}
              onSave={async (data) => {
                await handleUpdateList(data);
                setShowEditList(false);
              }}
              currentUserId={user?.id}
              onUpdate={loadListData}
            />
          )}

          {deletingListId && (
            <ConfirmDialog
              isOpen={!!deletingListId}
              onCancel={() => setDeletingListId(null)}
              onConfirm={async () => {
                await ListService.deleteList(deletingListId);
                window.location.href = '/';
              }}
              title="Delete List"
              message="Are you sure you want to delete this list? This action cannot be undone."
              confirmText="Delete"
            />
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  const handlePlaceClick = (place: Place) => {
    setSelectedPlace(place);
    setShowPlaceDetails(true);
  };

  const handleBackToList = () => {
    setShowPlaceDetails(false);
    setSelectedPlace(null);
  };

  return (
    <div
      className={`w-full ${themeColors.background.app} relative flex flex-col ${!isMobile && viewMode === 'map' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
    >
      {isAiMode && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-purple-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-50 animate-pulse" />
          <div className="absolute top-[-100px] right-0 w-[800px] h-[600px] bg-indigo-500/20 blur-[100px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-50" />
        </div>
      )}

      <header
        className={`shadow-sm border-b ${themeColors.background.card} ${themeColors.border.default} relative z-10 shrink-0`}
      >
        <div className="w-full px-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-4">
            <div className="flex items-center min-w-0">
              <Link
                to="/"
                className={`p-2 rounded-md ${themeColors.text.secondary} hover:${themeColors.text.primary} mr-2 flex-shrink-0`}
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className={`text-xl font-semibold ${themeColors.text.primary} truncate`}>
                  {displayedList.name}
                </h1>
                <div
                  className={`flex flex-wrap items-center mt-1 gap-x-4 gap-y-1 text-sm ${themeColors.text.secondary}`}
                >
                  <span className="flex items-center">
                    <span className="flex items-center">
                      {effectiveFilteredPlaces.length} of {places.length} places
                    </span>
                  </span>
                  <span className="flex items-center">
                    {displayedList.isPublic ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        Public
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4 mr-1" />
                        Private
                      </>
                    )}
                  </span>
                  <span className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {displayedList.collaborators.length}{' '}
                    {displayedList.collaborators.length === 1 ? 'collaborator' : 'collaborators'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <OptionsMenu
                  options={[
                    {
                      label: 'Edit List',
                      icon: <Edit className="h-5 w-5" />,
                      onClick: () => setShowEditList(true),
                    },
                    {
                      label: 'Delete List',
                      icon: <X className="h-5 w-5" />,
                      onClick: () => setDeletingListId(list.id),
                      variant: 'danger',
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        className={`flex-1 relative w-full ${
          !isMobile && viewMode === 'map'
            ? 'flex overflow-hidden'
            : 'max-w-7xl mx-auto w-full py-6 px-4 sm:px-6 lg:px-8'
        }`}
      >
        <div
          className={`
            ${
              !isMobile && viewMode === 'map'
                ? 'w-1/3 min-w-[400px] border-r light-border-default bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar flex flex-col z-20 shadow-xl'
                : 'w-full'
            }
        `}
        >
          {!isMobile && viewMode === 'map' && showPlaceDetails && selectedPlace ? (
            <div className="h-full flex flex-col">
              <PlaceDetailsPane
                place={selectedPlace}
                onClose={handleBackToList}
                onPlaceUpdated={handlePlaceUpdated}
                onPlaceHidden={(id) => {
                  setHiddenPlaceIds((prev) => {
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                  });
                  handleBackToList();
                }}
                onPlaceRestored={handlePlaceRestored}
                canDelete={getCanDelete(selectedPlace)}
                className="border-none shadow-none"
              />
            </div>
          ) : (
            <div className={`${!isMobile && viewMode === 'map' ? 'px-2 pt-2 pb-20' : ''}`}>
              {displayedList.description && (
                <div className="mb-6">
                  <p className={`${themeColors.text.secondary}`}>{displayedList.description}</p>
                </div>
              )}

              {places.length > 0 && (
                <PlaceFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  availableCategories={[
                    ...new Set(
                      basePlaces.map((p) => p.category).filter((c): c is string => Boolean(c))
                    ),
                  ]}
                  availableCuisines={[
                    ...new Set(
                      basePlaces
                        .flatMap((p) => p.cuisines || [])
                        .filter((c): c is string => Boolean(c))
                    ),
                  ]}
                  customStatuses={displayedList.customStatuses}
                  totalPlaces={basePlaces.length}
                  filteredCount={effectiveFilteredPlaces.length}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  onAiSearch={handleAiSearchSubmit}
                  isAiMode={isAiMode}
                  onAiModeChange={handleAiModeChange}
                  isAiLoading={isAiSearching}
                  userLocation={userLocation}
                  density={density}
                  onDensityChange={setDensity}
                  isInSidebar={!isMobile && viewMode === 'map'}
                />
              )}

              {places.length === 0 ? (
                <div className={`${themeColors.background.card} rounded-lg shadow-sm border p-12`}>
                  <div className="text-center">
                    <MapIcon className={`mx-auto h-12 w-12 ${themeColors.text.secondary}`} />
                    <h3 className={`mt-2 text-lg font-medium ${themeColors.text.primary}`}>
                      No places yet
                    </h3>
                    <p className={`mt-1 ${themeColors.text.secondary}`}>
                      Get started by adding some places to your list.
                    </p>
                    <button
                      onClick={() => setShowAddPlacesModal(true)}
                      className={`mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themeColors.button.primary} transition-colors`}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Place
                    </button>
                  </div>
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
                  className={`
                       ${
                         density === 'compact'
                           ? 'flex flex-col gap-3'
                           : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                       }
                       ${!isMobile && viewMode === 'map' ? '!grid-cols-1 !gap-4' : ''}
                    `}
                >
                  {effectiveFilteredPlaces.map((place) =>
                    density === 'compact' ? (
                      <CompactPlaceCard
                        key={place.id}
                        place={place}
                        list={list}
                        onClick={() => handlePlaceClick(place)}
                        onStatusChange={() => updatePlace(place.id)}
                        layout
                      />
                    ) : (
                      <PlaceCard
                        key={place.id}
                        place={place}
                        list={list}
                        onClick={() => handlePlaceClick(place)}
                        onStatusChange={() => updatePlace(place.id)}
                        layout
                        density={density}
                      />
                    )
                  )}
                </motion.div>
              )}
            </div>
          )}
        </div>

        {!isMobile && viewMode === 'map' && (
          <div className="flex-1 relative h-full">
            <div className="absolute inset-0">
              <MapView
                places={effectiveFilteredPlaces}
                onPlaceClick={handlePlaceClick}
                markerIcon={displayedList?.icon}
                markerColor={displayedList?.color}
                markerSize={displayedList?.iconSize}
                highlightedPlaceId={selectedPlace?.id}
                onUserLocationUpdate={setUserLocation}
              />
            </div>
            <div className="absolute bottom-8 right-8 z-10">
              <FAB onClick={() => setShowAddPlacesModal(true)} label="Add Places" />
            </div>
          </div>
        )}
      </main>

      {!(!isMobile && viewMode === 'map') && (
        <FAB onClick={() => setShowAddPlacesModal(true)} label="Add Places" />
      )}

      <PlaceSearchModal
        isOpen={showAddPlacesModal}
        onClose={() => setShowAddPlacesModal(false)}
        listId={listId!}
        onPlaceAdded={handlePlaceAdded}
        onUndoAdd={handleUndoAdd}
      />

      {selectedPlace && !(!isMobile && viewMode === 'map') && (
        <PlaceDetailsModal
          place={selectedPlace}
          isOpen={showPlaceDetails}
          onClose={() => {
            setShowPlaceDetails(false);
            setSelectedPlace(null);
          }}
          onPlaceUpdated={handlePlaceUpdated}
          onPlaceHidden={(id) => {
            setHiddenPlaceIds((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            setShowPlaceDetails(false);
            setSelectedPlace(null);
          }}
          onPlaceRestored={handlePlaceRestored}
          canDelete={getCanDelete(selectedPlace)}
        />
      )}

      {showCollaborators && list && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <motion.div
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            className={`light-bg-card ${
              isMobile ? 'rounded-t-3xl h-[92vh]' : 'rounded-xl max-w-2xl max-h-[85vh]'
            } w-full overflow-y-auto border light-border-default shadow-2xl flex flex-col`}
          >
            <div className="sticky top-0 light-bg-card border-b light-border-default p-5 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold light-text-primary">Manage Team</h2>
              <button
                onClick={() => setShowCollaborators(false)}
                className="p-2 rounded-full light-text-secondary hover:light-text-primary hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CollaboratorManager
                list={list}
                currentUserId={user?.id || ''}
                onUpdate={() => {
                  loadListData();
                }}
              />
            </div>
          </motion.div>
        </div>
      )}

      {showEditList && list && (
        <CreateListModal
          isOpen={showEditList}
          onClose={() => setShowEditList(false)}
          editingList={list}
          onSave={async (data) => {
            setPendingUpdate(data);
            setShowEditList(false);

            triggerAction(
              async () => {
                await ListService.updateList(list.id, data, user?.id);
                loadListData();
                setPendingUpdate(null);
              },
              {
                toastMessage: 'List updated',
                undoMessage: 'Reverted',
                onUndo: () => {
                  setPendingUpdate(null);
                },
                onError: (err) => {
                  logger.error('Update list failed', err);
                  loadListData();
                },
              }
            );
          }}
          currentUserId={user?.id}
          onUpdate={loadListData}
        />
      )}

      {deletingListId && (
        <ConfirmDialog
          isOpen={!!deletingListId}
          onCancel={() => setDeletingListId(null)}
          onConfirm={async () => {
            const listId = deletingListId;
            navigate('/');
            triggerAction(
              async () => {
                await ListService.deleteList(listId);
              },
              {
                toastMessage: 'List deleted',
                undoMessage: 'Restored',
                onUndo: () => {
                  navigate(`/list/${listId}`);
                },
              }
            );
          }}
          title="Delete List"
          message="Are you sure you want to delete this list? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
        />
      )}
    </div>
  );
};
