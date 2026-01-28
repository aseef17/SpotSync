import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users, Edit, Plus, Search } from 'lucide-react';
import { MapView } from '@/features/maps/components/MapView';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { MobileBottomSheet } from '@/components/ui/MobileBottomSheet';
import { PlaceFilters } from '@/features/places/components/PlaceFilters';
import { MobilePlaceCard } from '@/features/places/components/MobilePlaceCard';
import { MobilePlaceDetailHeader, MobilePlaceDetailContent } from '@/features/places/components/MobilePlaceDetail';
import { themeColors } from '@/styles/colors';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';
import { useAuth } from '@/features/auth/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useMapSearch } from '@/features/places/hooks/useMapSearch';
import { MapSearchOverlay } from '@/features/places/components/MapSearchOverlay';
import type { LegacyGooglePlace } from '@/features/places/api/googleMapsService';

interface MobileListViewProps {
    list: PlaceList;
    places: Place[];
    filteredPlaces: Place[];
    filters: FilterOptions;
    onFiltersChange: (filters: FilterOptions) => void;
    onPlaceClick: (place: Place) => void;
    selectedPlace: Place | null;
    onClearSelection: () => void;
    onPlaceUpdated: (place?: Place) => void;
    onEditList: () => void;
    onManageTeam: () => void;
    onAddPlaces: () => void;
    onAddExternalPlace: (place: Partial<Place>) => void;
    highlightedPlaceId?: string;
}

export const MobileListView: React.FC<MobileListViewProps> = ({
    list,
    places,
    filteredPlaces,
    filters,
    onFiltersChange,
    onPlaceClick,
    selectedPlace,
    onClearSelection,
    onPlaceUpdated,
    onEditList,
    onManageTeam,
    onAddPlaces,
    onAddExternalPlace,
    highlightedPlaceId,
}) => {
    const { user } = useAuth();
    const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | null>(null);

    const {
        isMapSearching,
        setIsMapSearching,
        mapSearchQuery,
        setMapSearchQuery,
        mapSearchResults,
        isSearchLoading,
        handleSelectSearchResult,
        clearSearch,
        debouncedMapSearchQuery
    } = useMapSearch({ listId: list.id, userLocation, currentUserId: user?.id });

    React.useEffect(() => {
        GoogleMapsService.getUserLocation().then(loc => {
            if (loc) setUserLocation(loc);
        });
    }, []);

    const onSelectSearchResult = async (result: LegacyGooglePlace) => {
        const existingPlace = places.find(p => p.googlePlaceId === result.place_id);

        if (existingPlace) {
            onPlaceClick(existingPlace);
            clearSearch();
            return;
        }

        const previewPlace = await handleSelectSearchResult(result);
        if (previewPlace) {
            onPlaceClick(previewPlace);
            clearSearch();
        }
    };

    const listHeader = (
        <div className="space-y-4">
            <div className="flex items-start justify-between">
                <Link to="/" className={`p-2 -ml-2 rounded-md ${themeColors.text.secondary}`}>
                    <ArrowLeft className="h-5 w-5" />
                </Link>

                <div className="flex-1 mx-3">
                    <h1 className={`text-xl font-semibold ${themeColors.text.primary} mb-1`}>
                        {list.name}
                    </h1>
                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${themeColors.text.secondary}`}>
                        <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {user?.username || 'User'} · Shared list · {places.length} places
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onEditList}
                        className={`p-2 rounded-full ${themeColors.text.secondary} hover:bg-gray-100 dark:hover:bg-gray-800`}
                    >
                        <Edit className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={onManageTeam}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors"
                >
                    <Users className="h-4 w-4" />
                    Invite collaborators
                </button>
                <button
                    onClick={onAddPlaces}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Add places
                </button>
            </div>
        </div>
    );

    const listContent = (
        <div className="space-y-4">
            {places.length > 0 && (
                <PlaceFilters
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                    availableCategories={[
                        ...new Set(places.map((p) => p.category).filter((c): c is string => Boolean(c))),
                    ]}
                    availableCuisines={[
                        ...new Set(places.flatMap((p) => p.cuisines || []).filter((c): c is string => Boolean(c))),
                    ]}
                    customStatuses={list.customStatuses}
                    totalPlaces={places.length}
                    filteredCount={filteredPlaces.length}
                    viewMode="list"
                    onViewModeChange={() => { }}
                    hideViewToggle={true}
                />
            )}

            <div className="space-y-3 pb-20">
                {filteredPlaces.length === 0 ? (
                    <div className="text-center py-12">
                        <p className={themeColors.text.secondary}>
                            {places.length === 0 ? 'No places yet' : 'No places match your filters'}
                        </p>
                    </div>
                ) : (
                    filteredPlaces.map((place) => (
                        <MobilePlaceCard
                            key={place.id}
                            place={place}
                            list={list}
                            userLocation={userLocation}
                            onClick={() => onPlaceClick(place)}
                        />
                    ))
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
        />
    ) : listHeader;

    const bodyContent = selectedPlace ? (
        <MobilePlaceDetailContent
            place={selectedPlace}
            onPlaceUpdated={onPlaceUpdated}
            onClose={onClearSelection}
            currentUserId={user?.id}
            onAddExternalPlace={onAddExternalPlace}
        />
    ) : listContent;

    const snapPoints = React.useMemo(() => [120, '40%', '90%'], []);
    const [forcedSnap, setForcedSnap] = React.useState<number | undefined>(undefined);

    return (
        <div className="h-[100dvh] w-full flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 z-0">
                <MapView
                    places={filteredPlaces}
                    onPlaceClick={onPlaceClick}
                    markerIcon={list.icon}
                    markerColor={list.color}
                    markerSize={list.iconSize}
                    highlightedPlaceId={highlightedPlaceId}
                    onLayerMenuOpen={(isOpen) => setForcedSnap(isOpen ? 0 : undefined)}
                    onAddExternalPlace={onAddExternalPlace}
                />
            </div>

            {!selectedPlace && (
                <div className="absolute top-4 left-4 z-10">
                    <button
                        onClick={() => setIsMapSearching(true)}
                        className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-lg border light-border-default text-gray-700 dark:text-gray-200 transition-transform active:scale-95"
                    >
                        <Search className="h-6 w-6" />
                    </button>
                </div>
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
                defaultSnap={1}
                snapIndex={forcedSnap}
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
