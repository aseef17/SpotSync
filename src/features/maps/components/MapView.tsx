/// <reference types="google.maps" />
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  ExternalLink,
  Crosshair,
  Layers,
  X,
  Map as MapLayerIcon,
  Globe,
  Mountain,
  Train,
  Car,
  Bike,
  MapPin,
} from 'lucide-react';
import { getMapIconComponent } from '@/constants/mapIcons';
import { APIProvider, Map, AdvancedMarker, useMap, InfoWindow } from '@vis.gl/react-google-maps';
import type { Place } from '@/features/places/types/place';
import { getColorByName } from '@/constants/mapIcons';
import { getIconForCategory, getCategoryColor } from '@/constants/placeCategories';
import { useTheme } from '@/hooks/useTheme';
import { themeColors } from '@/styles/colors';
import { logger } from '@/utils/logger';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';

interface MapViewProps {
  places: Place[];
  onPlaceClick: (place: Place) => void;
  markerIcon?: string;
  markerColor?: string;
  markerSize?: number;
  className?: string;
  style?: React.CSSProperties;
  highlightedPlaceId?: string;
  previewPlace?: Place | null; // For showing a temporary marker for search preview
  onLayerMenuOpen?: (isOpen: boolean) => void;
  onAddExternalPlace?: (place: Partial<Place>) => void;
  onUserLocationUpdate?: (location: { lat: number; lng: number }) => void;
}

const defaultCenter = {
  lat: 40.7128,
  lng: -74.006,
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

const getPlaceCoords = (place: Place): { lat: number; lng: number } | null => {
  const lat = Number(place.lat ?? place.location?.lat);
  const lng = Number(place.lng ?? place.location?.lng);

  if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng };
  }
  return null;
};

const MapBoundsFitter: React.FunctionComponent<{
  places: Place[];
  highlightedPlaceId?: string;
  previewPlace?: Place | null;
}> = ({ places, highlightedPlaceId, previewPlace }) => {
  const map = useMap();
  const lastPlacesCount = useRef(0);
  const prevHighlightedRef = useRef(highlightedPlaceId);

  useEffect(() => {
    if (!map || places.length === 0) return;

    // Only auto-fit bounds if:
    // 1. The number of places has changed (e.g., loaded, added, removed, filtered)
    // 2. OR we just navigated BACK from a detail view (highlightedPlaceId cleared)
    const placesChanged = lastPlacesCount.current !== places.length;
    const justClearedHighlight = !!prevHighlightedRef.current && !highlightedPlaceId;

    if ((placesChanged || justClearedHighlight) && !highlightedPlaceId) {
      const timeoutId = setTimeout(() => {
        const bounds = new google.maps.LatLngBounds();
        let validPlaces = 0;

        places.forEach((place) => {
          const coords = getPlaceCoords(place);
          if (coords) {
            bounds.extend(coords);
            validPlaces++;
          }
        });

        if (validPlaces > 0) {
          map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
        }
      }, 100);

      lastPlacesCount.current = places.length;
      prevHighlightedRef.current = highlightedPlaceId;
      return () => clearTimeout(timeoutId);
    }

    lastPlacesCount.current = places.length;
    prevHighlightedRef.current = highlightedPlaceId;
  }, [map, places, highlightedPlaceId]);

  // Highlight/Select Pan Effect
  useEffect(() => {
    if (!map || !highlightedPlaceId) return;

    const place = places.find((p) => p.id === highlightedPlaceId);
    if (place) {
      const coords = getPlaceCoords(place);
      if (coords) {
        map.panTo(coords);
        map.setZoom(16); // "Zoomed a bit"
      }
    }
  }, [map, highlightedPlaceId, places]);

  // Preview place pan effect - pan to preview location when a preview is selected
  useEffect(() => {
    if (!map || !previewPlace) return;

    const coords = getPlaceCoords(previewPlace);
    if (coords) {
      map.panTo(coords);
      map.setZoom(16);
    }
  }, [map, previewPlace]);

  return null;
};

const LocationButton = ({
  onLocationUpdate,
  userLocation,
}: {
  onLocationUpdate?: (location: { lat: number; lng: number }) => void;
  userLocation?: { lat: number; lng: number } | null;
}) => {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [showPermissionError, setShowPermissionError] = useState(false);

  const handleLocate = () => {
    if (!map) return;

    // Fast path: if we already have the location, just pan to it
    if (userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
      onLocationUpdate?.(userLocation);
      return;
    }

    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          map.panTo(pos);
          map.setZoom(15);
          setLoading(false);
          onLocationUpdate?.(pos);
        },
        (error) => {
          setLoading(false);
          if (error.code === error.PERMISSION_DENIED) {
            setShowPermissionError(true);
          } else {
            logger.warn('Geolocation error:', error);
          }
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleLocate}
        className={`absolute bottom-36 right-4 bg-white dark:bg-gray-800 p-3 rounded-full shadow-md z-10 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none ${themeColors.text.primary} transition-colors`}
        aria-label="Current Location"
        style={{ zIndex: 5 }}
      >
        <Crosshair className={`h-6 w-6 ${loading ? 'animate-spin' : ''}`} />
      </button>

      {createPortal(
        <ConfirmDialog
          isOpen={showPermissionError}
          title="Location Access Denied"
          message="Location access is denied. Please enable location services for this site in your browser settings to use this feature."
          confirmText="OK"
          onConfirm={() => setShowPermissionError(false)}
          onCancel={() => setShowPermissionError(false)}
          variant="warning"
          cancelText=""
        />,
        document.body
      )}
    </>
  );
};

const MapLayersControl: React.FunctionComponent<{ onOpenChange?: (isOpen: boolean) => void }> = ({
  onOpenChange,
}) => {
  const map = useMap();
  const [isOpen, setIsOpen] = useState(false);
  const [mapType, setMapType] = useState('roadmap');
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());

  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);
  const bikeLayerRef = useRef<google.maps.BicyclingLayer | null>(null);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapType);
  }, [map, mapType]);

  useEffect(() => {
    if (!map) return;

    if (activeLayers.has('traffic')) {
      if (!trafficLayerRef.current) trafficLayerRef.current = new google.maps.TrafficLayer();
      trafficLayerRef.current.setMap(map);
    } else {
      trafficLayerRef.current?.setMap(null);
    }

    if (activeLayers.has('transit')) {
      if (!transitLayerRef.current) transitLayerRef.current = new google.maps.TransitLayer();
      transitLayerRef.current.setMap(map);
    } else {
      transitLayerRef.current?.setMap(null);
    }

    if (activeLayers.has('bicycling')) {
      if (!bikeLayerRef.current) bikeLayerRef.current = new google.maps.BicyclingLayer();
      bikeLayerRef.current.setMap(map);
    } else {
      bikeLayerRef.current?.setMap(null);
    }
  }, [map, activeLayers]);

  const toggleLayer = (layer: string) => {
    const next = new Set(activeLayers);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    setActiveLayers(next);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`absolute top-4 right-4 mt-[env(safe-area-inset-top)] bg-white dark:bg-gray-800 p-3 rounded-lg shadow-md z-10 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none ${themeColors.text.primary} transition-colors`}
        aria-label="Map Layers"
      >
        <Layers className="h-6 w-6" />
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] isolate">
            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-xl border-t border-gray-200 dark:border-gray-800 animate-in slide-in-from-bottom duration-300">
              <div className="p-4 space-y-6 pb-8">
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-semibold ${themeColors.text.primary}`}>Map type</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className={`p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${themeColors.text.secondary}`}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex gap-4">
                  {[
                    { id: 'roadmap', label: 'Default', icon: MapLayerIcon },
                    { id: 'satellite', label: 'Satellite', icon: Globe },
                    { id: 'terrain', label: 'Terrain', icon: Mountain },
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setMapType(type.id)}
                      className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        mapType === type.id
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                          : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <type.icon className="h-8 w-8" />
                      <span className="text-sm font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <h4 className={`text-sm font-medium ${themeColors.text.secondary} mb-3`}>
                    Map details
                  </h4>
                  <div className="flex gap-4">
                    {[
                      { id: 'transit', label: 'Transit', icon: Train },
                      { id: 'traffic', label: 'Traffic', icon: Car },
                      { id: 'bicycling', label: 'Biking', icon: Bike },
                    ].map((layer) => (
                      <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                          activeLayers.has(layer.id)
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                            : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <layer.icon className="h-8 w-8" />
                        <span className="text-sm font-medium">{layer.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

// Internal component that uses map context
const MapContent: React.FunctionComponent<MapViewProps> = ({
  places,
  onPlaceClick,
  markerIcon,
  markerColor,
  markerSize,
  highlightedPlaceId,
  previewPlace,
  onLayerMenuOpen,
  onAddExternalPlace,
  onUserLocationUpdate,
}) => {
  const { theme } = useTheme();
  const [zoom, setZoom] = useState(12);
  const [selectedPoi, setSelectedPoi] = useState<{
    placeId: string;
    name: string;
    location: google.maps.LatLng;
  } | null>(null);

  const map = useMap();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const placesRef = useRef(places);
  const onPlaceClickRef = useRef(onPlaceClick);
  const lastLocationPushRef = useRef(0);

  placesRef.current = places;
  onPlaceClickRef.current = onPlaceClick;

  // Throttled location tracking — avoids re-rendering the full tree on every GPS tick
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastLocationPushRef.current < 30_000) return;
        lastLocationPushRef.current = now;

        const newPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(newPos);
        onUserLocationUpdate?.(newPos);
      },
      (error) => {
        logger.warn('User location tracking error:', error);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [onUserLocationUpdate]);

  useEffect(() => {
    if (!map) return;

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if ('placeId' in e && e.placeId) {
        const normalizeId = (id: string | undefined) => id?.replace(/^places\//, '') || '';
        const poiId = normalizeId(e.placeId as string);

        const existingPlace = placesRef.current.find(
          (p) => normalizeId(p.googlePlaceId) === poiId
        );
        if (existingPlace) {
          onPlaceClickRef.current(existingPlace);
          return;
        }

        setSelectedPoi({
          placeId: e.placeId as string,
          name: (e as { name?: string }).name || 'Place',
          location: e.latLng!,
        });
      }
    });

    return () => {
      google.maps.event.removeListener(clickListener);
    };
  }, [map]);

  // Calculate center using robust coord helper
  const center = React.useMemo(() => {
    const validCoords = places
      .map(getPlaceCoords)
      .filter((c): c is { lat: number; lng: number } => !!c);

    if (validCoords.length === 0) return defaultCenter;

    return {
      lat: validCoords.reduce((sum, p) => sum + p.lat, 0) / validCoords.length,
      lng: validCoords.reduce((sum, p) => sum + p.lng, 0) / validCoords.length,
    };
  }, [places]);

  return (
    <Map
      defaultCenter={center}
      defaultZoom={places.length > 0 ? 12 : 10}
      mapId={GOOGLE_MAPS_MAP_ID}
      style={{ width: '100%', height: '100%' }}
      gestureHandling={'greedy'}
      disableDefaultUI={true}
      zoomControl={false}
      streetViewControl={false}
      mapTypeControl={false}
      fullscreenControl={false}
      onZoomChanged={(ev) => setZoom(ev.detail.zoom)}
      colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
      onClick={() => setSelectedPoi(null)}
      clickableIcons={false}
    >
      {selectedPoi && (
        <InfoWindow
          position={selectedPoi.location}
          onCloseClick={() => setSelectedPoi(null)}
          headerDisabled={true}
        >
          <div className="p-1 min-w-[200px]">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white pr-6">
                {selectedPoi.name}
              </h3>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onAddExternalPlace) {
                    onAddExternalPlace({
                      googlePlaceId: selectedPoi.placeId,
                      name: selectedPoi.name,
                      location: {
                        lat: selectedPoi.location.lat(),
                        lng: selectedPoi.location.lng(),
                      },
                      status: 'not_visited',
                    });
                  }
                  setSelectedPoi(null);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors shadow-sm"
              >
                <Plus className="h-3 w-3" />
                Add to List
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPoi.name)}&query_place_id=${selectedPoi.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md text-xs font-medium transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                View on Maps
              </a>
            </div>
          </div>
        </InfoWindow>
      )}
      {places.map((place) => {
        const coords = getPlaceCoords(place);
        if (!coords) return null;

        const isHighlighted = place.id === highlightedPlaceId;
        let size = markerSize || 36;
        if (isHighlighted) size = 48;

        const iconSizeNum = Math.round(size * 0.5);
        const isAutoIcon = !markerIcon || markerIcon === 'AUTO' || markerIcon === 'MapPin';
        const isAutoColor = !markerColor || markerColor === 'AUTO';

        const iconName =
          isAutoIcon && place.category
            ? getIconForCategory(place.category)
            : markerIcon !== 'AUTO'
              ? markerIcon
              : 'MapPin';

        const colorName = isHighlighted
          ? 'Red'
          : isAutoColor && place.category
            ? getCategoryColor(place.category)
            : markerColor !== 'AUTO'
              ? markerColor
              : 'Blue';

        const PlaceIcon = getMapIconComponent(iconName || 'MapPin');
        const placeColorObj = getColorByName(colorName || 'Blue');

        return (
          <AdvancedMarker
            key={place.id}
            position={coords}
            onClick={() => onPlaceClick(place)}
            collisionBehavior="OPTIONAL_AND_HIDES_LOWER_PRIORITY"
            style={{ overflow: 'visible' }}
            zIndex={isHighlighted ? 999 : undefined}
          >
            <div className="relative flex flex-col items-center group">
              <div
                className={`rounded-full flex items-center justify-center shadow-md border-2 ${themeColors.map.markerBorder} ${placeColorObj.bg} text-white transition-transform ${isHighlighted ? 'scale-110 ring-4 ring-white ring-opacity-50' : 'group-hover:scale-110'}`}
                style={{ width: size, height: size }}
              >
                <PlaceIcon size={iconSizeNum} strokeWidth={2.5} />
              </div>

              {(zoom >= 14 || isHighlighted) && (
                <div
                  className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded shadow text-xs font-medium whitespace-nowrap pointer-events-none z-50 ${themeColors.map.label} ${isHighlighted ? 'font-bold text-sm' : ''}`}
                >
                  {place.name}
                </div>
              )}
            </div>
          </AdvancedMarker>
        );
      })}

      {previewPlace &&
        (() => {
          const coords = getPlaceCoords(previewPlace);
          if (!coords) return null;
          return (
            <AdvancedMarker
              key={`preview-${previewPlace.id}`}
              position={coords}
              onClick={() => onPlaceClick(previewPlace)}
              style={{ overflow: 'visible' }}
              zIndex={1000}
            >
              <div className="relative flex flex-col items-center animate-bounce">
                <div
                  className="rounded-full flex items-center justify-center shadow-lg border-2 border-white bg-blue-600 text-white"
                  style={{ width: 48, height: 48 }}
                >
                  <MapPin size={24} strokeWidth={2.5} />
                </div>
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded shadow text-xs font-bold whitespace-nowrap pointer-events-none z-50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  {previewPlace.name}
                </div>
              </div>
            </AdvancedMarker>
          );
        })()}

      {userLocation && (
        <AdvancedMarker
          key="user-location"
          position={userLocation}
          collisionBehavior="OPTIONAL_AND_HIDES_LOWER_PRIORITY"
          zIndex={100}
        >
          <div className="relative flex items-center justify-center">
            {/* Pulsing outer ring */}
            <div className="absolute w-8 h-8 bg-blue-500 rounded-full animate-ping opacity-25" />
            {/* Main blue dot */}
            <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <div className="w-4 h-4 bg-blue-500 rounded-full border border-white" />
            </div>
          </div>
        </AdvancedMarker>
      )}

      <MapBoundsFitter
        places={places}
        highlightedPlaceId={highlightedPlaceId}
        previewPlace={previewPlace}
      />
      <LocationButton onLocationUpdate={onUserLocationUpdate} userLocation={userLocation} />
      <MapLayersControl onOpenChange={onLayerMenuOpen} />
    </Map>
  );
};

export const MapView: React.FunctionComponent<MapViewProps> = (props) => {
  const { className = '', style = {} } = props;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex items-center justify-center h-96 text-center p-4">
        <p className="text-red-600 font-medium">Missing Google Maps API Key.</p>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`} style={style}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <MapContent {...props} />
      </APIProvider>
    </div>
  );
};
