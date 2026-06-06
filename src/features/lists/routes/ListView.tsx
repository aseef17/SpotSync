import React, { useState, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Users,
  ArrowLeft,
  Eye,
  EyeOff,
  MapIcon,
  X,
  Edit,
  Share2,
  RefreshCw,
} from 'lucide-react';
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

  const { list, places, loading, error, updateList } = useListDetails(listId);
  const isMobile = useIsMobile();

  const [showAddPlacesModal, setShowAddPlacesModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showPlaceDetails, setShowPlaceDetails] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [hiddenPlaceIds, setHiddenPlaceIds] = useState<Set<string>>(new Set());
  const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);
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

  const currentUserRole = displayedList?.collaborators.find(
    (c) => c.userId === user?.id
  )?.permission;
  const isOwner = user?.id === displayedList?.ownerId || currentUserRole === 'owner';
  const canEditList = isOwner || currentUserRole === 'editor';
  const isSavedList = user?.savedLists?.includes(displayedList?.id || '');
  const isMember = !!currentUserRole || isOwner;

  const handleUpdateList = async (data: Partial<PlaceList>) => {
    if (!list || !user || !canEditList) return;

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
    if (canEditList) return true; // Editors and owners can delete any place
    return user.id === place.addedBy;
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

  // With real-time listeners, place data auto-updates via onSnapshot.
  // This callback only needs to sync the selectedPlace panel.
  const handlePlaceUpdated = useCallback((place?: Place) => {
    if (place?.id) {
      setSelectedPlace((prev) => (prev?.id === place.id ? { ...prev, ...place } : prev));
    }
  }, []);

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

  const handlePlaceClick = useCallback((place: Place) => {
    setSelectedPlace(place);
    setShowPlaceDetails(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setShowPlaceDetails(false);
    setSelectedPlace(null);
  }, []);

  if (loading) {
    return (
      <div className={`min-h-screen ${themeColors.background.app}`}>
        <header
          className={`shadow-sm border-b ${themeColors.background.card} ${themeColors.border.default}`}
        >
          <div className="w-full px-4 sm:px-6 lg:px-12">
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
        <main className="w-full py-6 px-4 sm:px-6 lg:px-12">
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
          <div className="w-full px-4 sm:px-6 lg:px-12">
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
        <main className="w-full py-6 px-4 sm:px-6 lg:px-12">
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
            canEditList={canEditList}
          />

          {/* Shared modals for mobile */}
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
              onUpdate={undefined}
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

  return (
    <div
      className={`w-full ${themeColors.background.app} relative overflow-hidden ${!isMobile && viewMode === 'map' ? 'h-screen' : 'min-h-screen flex flex-col'}`}
    >
      {/* Background Map - Full Bleed */}
      {!isMobile && viewMode === 'map' && (
        <div className="absolute inset-0 z-0">
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
      )}
      {/* Foreground Container */}
      <div
        className={`relative z-10 flex flex-col pointer-events-none w-full h-full ${!isMobile && viewMode === 'map' ? '' : 'bg-white dark:bg-gray-900'}`}
      >
        {/* Floating Sidebar (Desktop Map) or Standard Layout (Otherwise) */}
        <div
          className={`pointer-events-auto flex flex-col ${!isMobile && viewMode === 'map' ? `w-[420px] h-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl border-r ${themeColors.border.default}` : 'w-full flex-1'}`}
        >
          {isAiMode && (
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-purple-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-50 animate-pulse" />
              <div className="absolute top-[-100px] right-0 w-[800px] h-[600px] bg-indigo-500/20 blur-[100px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-50" />
            </div>
          )}

          <header
            className={`shadow-sm border-b ${themeColors.border.default} shrink-0 ${!isMobile && viewMode === 'map' ? 'bg-transparent' : themeColors.background.card}`}
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
                        <button
                          onClick={() => {
                            if (!canEditList) {
                              toast.error('You do not have permission to manage collaborators.');
                              return;
                            }
                            setShowCollaborators(true);
                          }}
                          className="flex items-center hover:underline focus:outline-none"
                        >
                          <Users className="h-4 w-4 mr-1" />
                          {displayedList.collaborators.length}{' '}
                          {displayedList.collaborators.length === 1
                            ? 'collaborator'
                            : 'collaborators'}
                        </button>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {displayedList.isPublic && user && !isMember && !isSavedList && (
                      <button
                        onClick={async () => {
                          try {
                            const { UserService } = await import('@/features/auth/api/userService');
                            await UserService.saveListToProfile(user.id, displayedList.id);
                            toast.success('List saved to your homepage!');
                            // Optimistically update the user context or reload
                            window.location.reload();
                          } catch {
                            toast.error('Failed to save list.');
                          }
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md ${themeColors.button.primary} transition-colors whitespace-nowrap`}
                      >
                        Save to Homepage
                      </button>
                    )}
                    {displayedList.isPublic && user && isSavedList && (
                      <button
                        onClick={async () => {
                          try {
                            const { UserService } = await import('@/features/auth/api/userService');
                            await UserService.removeListFromProfile(user.id, displayedList.id);
                            toast.success('List removed from your homepage.');
                            window.location.reload();
                          } catch {
                            toast.error('Failed to remove list.');
                          }
                        }}
                        className={`px-3 py-1.5 text-sm font-medium border rounded-md ${themeColors.button.secondary} transition-colors whitespace-nowrap`}
                      >
                        Remove from Homepage
                      </button>
                    )}
                    <OptionsMenu
                      options={[
                        {
                          label: 'Share List',
                          icon: <Share2 className="h-5 w-5" />,
                          onClick: () => {
                            if (!displayedList.isPublic) {
                              toast.error('Please make the list public before sharing.');
                              if (canEditList) setShowEditList(true);
                              return;
                            }
                            navigator.clipboard.writeText(window.location.href);
                            toast.success('Link copied to clipboard!');
                          },
                        },
                        ...(canEditList
                          ? [
                              {
                                label: isSyncingPhotos ? 'Syncing Photos...' : 'Sync Photos',
                                icon: (
                                  <RefreshCw
                                    className={`h-5 w-5 ${isSyncingPhotos ? 'animate-spin' : ''}`}
                                  />
                                ),
                                onClick: async () => {
                                  setIsSyncingPhotos(true);
                                  toast.info('Syncing photos in the background...');
                                  try {
                                    await PlaceService.syncListPhotos(list.id);
                                    toast.success('Photos synced successfully!');
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
                                onClick: () => setShowEditList(true),
                              },
                            ]
                          : []),
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
                ? 'overflow-y-auto custom-scrollbar flex flex-col'
                : 'w-full px-4 sm:px-6 lg:px-12 py-6'
            }`}
          >
            <div className="w-full h-full flex flex-col">
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
                <div
                  className={`${!isMobile && viewMode === 'map' ? 'px-2 pt-2 pb-20 h-full flex flex-col' : ''}`}
                >
                  {!isMobile && viewMode === 'map' && showAddPlacesModal ? (
                    <div className="flex-1 min-h-0 w-full h-full relative">
                      <PlaceSearchModal
                        isOpen={showAddPlacesModal}
                        onClose={() => setShowAddPlacesModal(false)}
                        listId={list.id}
                        onPlaceAdded={handlePlaceAdded}
                        onUndoAdd={(tempId) =>
                          setHiddenPlaceIds((prev) => new Set([...prev, tempId]))
                        }
                        onPlaceUpdated={handlePlaceUpdated}
                        onReplaceId={handleReplacePlaceId}
                        inline={true}
                      />
                    </div>
                  ) : (
                    <>
                      {displayedList.description && (
                        <div className="mb-6">
                          <p className={`${themeColors.text.secondary}`}>
                            {displayedList.description}
                          </p>
                        </div>
                      )}

                      {places.length > 0 && (
                        <PlaceFilters
                          filters={filters}
                          onFiltersChange={setFilters}
                          availableCategories={availableCategories}
                          availableCuisines={availableCuisines}
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
                        <div
                          className={`${themeColors.background.card} rounded-lg shadow-sm border p-12`}
                        >
                          <div className="text-center">
                            <MapIcon
                              className={`mx-auto h-12 w-12 ${themeColors.text.secondary}`}
                            />
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
                                <motion.div
                                  key={`${place.id}-compact-${viewMode}`}
                                  layoutId={`card-${place.id}`}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <CompactPlaceCard
                                    place={place}
                                    list={list}
                                    onClick={handlePlaceClick}
                                    onStatusChange={() => {}}
                                    layout
                                  />
                                </motion.div>
                              ) : (
                                <motion.div
                                  key={`${place.id}-comfortable-${viewMode}`}
                                  layoutId={`card-${place.id}`}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <PlaceCard
                                    place={place}
                                    list={list}
                                    onClick={handlePlaceClick}
                                    onStatusChange={() => {}}
                                    layout
                                    density={density}
                                  />
                                </motion.div>
                              )
                            )}
                          </motion.div>
                        </AnimatePresence>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>{' '}
        {/* End floating sidebar */}
      </div>{' '}
      {/* End foreground container */}
      {canEditList && !isMobile && viewMode === 'map' && (
        <div className="absolute bottom-8 right-8 z-20 pointer-events-auto">
          <FAB onClick={() => setShowAddPlacesModal(true)} label="Add Places" />
        </div>
      )}
      {canEditList && !(!isMobile && viewMode === 'map') && (
        <FAB onClick={() => setShowAddPlacesModal(true)} label="Add Places" />
      )}
      {canEditList && !(!isMobile && viewMode === 'map') && (
        <PlaceSearchModal
          isOpen={showAddPlacesModal}
          onClose={() => setShowAddPlacesModal(false)}
          listId={list.id}
          onPlaceAdded={handlePlaceAdded}
          onUndoAdd={handleUndoAdd}
          onPlaceUpdated={handlePlaceUpdated}
          onReplaceId={handleReplacePlaceId}
        />
      )}
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
          canEdit={canEditList}
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
              <CollaboratorManager list={list} currentUserId={user?.id || ''} onUpdate={() => {}} />
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
                },
              }
            );
          }}
          currentUserId={user?.id}
          onUpdate={undefined}
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
