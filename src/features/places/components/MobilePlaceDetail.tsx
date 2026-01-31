import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Star,
  MapPin,
  Phone,
  Globe,
  Clock,
  Navigation,
  Play,
  Share2,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronUp,
  Camera,
  Check,
  Utensils,
  Plus,
} from 'lucide-react';
import { themeColors } from '@/styles/colors';
import type { Place, PlaceStatus } from '@/features/places/types/place';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { formatCategoryName } from '@/constants/placeCategories';
import { calculateDistance } from '@/utils/geo';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { PlaceService } from '@/features/places/api/placeService';
import { useToast } from '@/hooks/useToast';
import { logger } from '@/utils/logger';
import { motion, AnimatePresence } from 'framer-motion';

const formatPrice = (level?: number) => {
  if (!level) return null;
  return '$'.repeat(Math.min(level, 4));
};

interface MobilePlaceDetailHeaderProps {
  place: Place;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
  onPlaceUpdated: (place?: Place) => void;
  currentUserId?: string;
  customStatuses?: string[];
  onAddExternalPlace?: (place: Partial<Place>) => void;
}

export const MobilePlaceDetailHeader: React.FunctionComponent<MobilePlaceDetailHeaderProps> = ({
  place,
  onClose,
  userLocation,
  onPlaceUpdated,
  currentUserId,
  customStatuses = [],
  onAddExternalPlace,
}) => {
  const { toast } = useToast();
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const handleDirections = () => {
    if (!place.location) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}&destination_place_id=${place.googlePlaceId}`;
    window.open(url, '_blank');
  };

  const handleStart = () => {
    handleDirections();
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: place.name,
          text: `Check out ${place.name}`,
          url: place.googleMapsUrl || window.location.href,
        })
        .catch((err) => logger.error('Share failed:', err));
    }
  };

  const handleStatusSelect = useCallback(
    async (newStatus: string) => {
      setIsStatusOpen(false);
      try {
        if (newStatus === 'custom') return;

        const isStandard = ['not_visited', 'visited', 'not_going'].includes(newStatus);
        const statusType = isStandard ? (newStatus as PlaceStatus) : 'custom';
        const customValue = isStandard ? undefined : newStatus;

        await PlaceService.updatePlaceStatus(place.id, statusType, currentUserId, customValue);
        const updatedPlace = await PlaceService.getPlace(place.id);
        if (updatedPlace) {
          onPlaceUpdated(updatedPlace);
        } else {
          onPlaceUpdated();
        }
        toast.success('Status updated');
      } catch (error) {
        logger.error('Failed to update status:', error);
        toast.error('Failed to update status');
      }
    },
    [place.id, currentUserId, onPlaceUpdated, toast, setIsStatusOpen]
  );

  const distance = useMemo(
    () =>
      userLocation && place.location
        ? calculateDistance(
            userLocation.lat,
            userLocation.lng,
            place.location.lat,
            place.location.lng
          )
        : null,
    [userLocation, place.location]
  );

  const statusOptions = useMemo(
    () => [
      { value: 'not_visited', label: 'Not Visited' },
      { value: 'visited', label: 'Visited' },
      { value: 'not_going', label: 'Not Going' },
      ...customStatuses.map((s) => ({ value: s, label: s })),
    ],
    [customStatuses]
  );

  const currentStatusValue = useMemo(
    () => (place.status === 'custom' ? place.customStatus : place.status),
    [place]
  );

  const currentLabel = useMemo(
    () => statusOptions.find((o) => o.value === currentStatusValue)?.label || 'Set Status',
    [currentStatusValue, statusOptions]
  );

  return (
    <motion.div
      key={place.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 pb-2"
    >
      {/* Top Row: Name + Close */}
      <div className="flex justify-between items-start">
        <div className="flex-1 mr-4">
          <h2 className={`text-xl font-bold ${themeColors.text.primary} line-clamp-2`}>
            {place.name}
          </h2>
          <div
            className={`flex flex-wrap items-center gap-1.5 text-sm ${themeColors.text.secondary} mt-1`}
          >
            <span className="flex items-center text-orange-500 font-medium">
              {place.rating || 'New'}
              <Star className="h-3 w-3 fill-current ml-0.5" />
            </span>
            {place.userRatingsTotal && <span>({place.userRatingsTotal})</span>}

            {place.category && (
              <>
                <span>·</span>
                <span className="capitalize">{formatCategoryName(place.category)}</span>
              </>
            )}

            {place.cuisines?.map((cuisine) => (
              <React.Fragment key={cuisine}>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Utensils className="h-3 w-3" />
                  {cuisine}
                </span>
              </React.Fragment>
            ))}

            {place.priceLevel && (
              <>
                <span>·</span>
                <span>{formatPrice(place.priceLevel)}</span>
              </>
            )}

            {distance && (
              <>
                <span>·</span>
                <span>{distance}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className={`p-2 rounded-full bg-gray-100 dark:bg-gray-800 ${themeColors.text.secondary}`}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Add to List Button for Previews */}
      {place.isPreview && (
        <button
          onClick={() => {
            onAddExternalPlace?.(place);
            onClose();
          }}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          Add to this list
        </button>
      )}

      {/* Action Buttons Row */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 items-center">
        <button
          onClick={() => {
            if (place.googleMapsUrl) {
              window.open(place.googleMapsUrl, '_blank');
            } else {
              const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.googlePlaceId}`;
              window.open(url, '_blank');
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border ${themeColors.border.default} ${themeColors.text.primary} text-sm font-medium whitespace-nowrap hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-transform`}
        >
          <Globe className="h-4 w-4" />
          View on Maps
        </button>

        {/* Custom Status Selector (Trigger) */}
        {!place.isPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsStatusOpen(true);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border ${themeColors.border.default} ${themeColors.text.primary} text-sm font-medium whitespace-nowrap hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
          >
            <Check className="h-4 w-4 text-green-600" />
            {currentLabel}
            <ChevronDown className="h-3 w-3 ml-1" />
          </button>
        )}

        <button
          onClick={handleDirections}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium whitespace-nowrap shadow-sm hover:bg-blue-700 active:scale-95 transition-transform"
        >
          <Navigation className="h-4 w-4 fill-current" />
          Directions
        </button>
        <button
          onClick={handleStart}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium whitespace-nowrap shadow-sm hover:bg-blue-700 active:scale-95 transition-transform"
        >
          <Play className="h-4 w-4 fill-current" />
          Start
        </button>
        {place.phoneNumber && (
          <a
            href={`tel:${place.phoneNumber}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border ${themeColors.border.default} ${themeColors.text.primary} text-sm font-medium whitespace-nowrap hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-transform`}
          >
            <Phone className="h-4 w-4" />
            Call
          </a>
        )}
        <button
          onClick={handleShare}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border ${themeColors.border.default} ${themeColors.text.primary} text-sm font-medium whitespace-nowrap hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-transform`}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>

        {/* Status Options Portal */}
        {isStatusOpen &&
          createPortal(
            <div className="fixed inset-0 z-[9999] isolate">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setIsStatusOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-900 rounded-t-2xl overflow-hidden border-t border-gray-200 dark:border-gray-800"
              >
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <h3 className={`text-center font-semibold ${themeColors.text.primary}`}>
                    Set Status
                  </h3>
                </div>
                <div className="p-2 space-y-1">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleStatusSelect(option.value)}
                      className={`w-full p-3 text-left rounded-lg flex items-center justify-between font-medium ${
                        option.value === currentStatusValue
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                          : `${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800`
                      }`}
                    >
                      {option.label}
                      {option.value === currentStatusValue && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
                <div className="p-2 pb-8">
                  <button
                    onClick={() => setIsStatusOpen(false)}
                    className={`w-full p-3 rounded-lg font-medium text-center ${themeColors.text.secondary} hover:bg-gray-100 dark:hover:bg-gray-800`}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>,
            document.body
          )}
      </div>
    </motion.div>
  );
};

interface MobilePlaceDetailContentProps {
  place: Place;
  onPlaceUpdated: (place?: Place) => void;
  onClose: () => void;
  currentUserId?: string;
  onAddExternalPlace?: (place: Partial<Place>) => void;
}

export const MobilePlaceDetailContent: React.FunctionComponent<MobilePlaceDetailContentProps> = ({
  place,
  onPlaceUpdated,
  onClose,
  currentUserId,
  onAddExternalPlace,
}) => {
  const { toast } = useToast();
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState(place.notes || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [isHoursExpanded, setIsHoursExpanded] = useState(false);

  // Filter out duplicates
  const photos = Array.from(new Set(place.photoUrls || []));

  const isOwner = currentUserId && (place.addedBy === currentUserId || place.listId);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await PlaceService.updatePlace(place.id, { notes: editedNotes }, currentUserId);
      setIsEditingNotes(false);
      const updatedPlace = await PlaceService.getPlace(place.id);
      if (updatedPlace) {
        onPlaceUpdated(updatedPlace);
      } else {
        onPlaceUpdated();
      }
      toast.success('Notes updated');
    } catch (error) {
      logger.error('Failed to save notes:', error);
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    if (!place.listId) return;
    setDeleting(true);
    try {
      await PlaceService.deletePlace(place.id, place.listId, currentUserId);
      setShowDeleteConfirm(false);
      onClose();
      onPlaceUpdated();
      toast.success('Place deleted');
    } catch (error) {
      logger.error('Failed to delete place:', error);
      toast.error('Failed to delete place');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      key={place.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-6 pb-20"
    >
      {/* Photos Section */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className={`text-sm font-semibold ${themeColors.text.primary}`}>Photos</h3>
        </div>

        {photos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {photos.map((photo, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-60 h-40 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-sm relative group"
              >
                <img
                  src={GoogleMapsService.getPhotoUrl(photo, 400)}
                  alt={`Place photo ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Camera className="h-8 w-8 mb-2 opacity-50" />
            <span className="text-sm">No photos yet</span>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="space-y-4">
        {/* Address */}
        <div className="flex items-start gap-3">
          <MapPin className={`h-5 w-5 ${themeColors.text.secondary} mt-0.5 shrink-0`} />
          <span className={`text-sm ${themeColors.text.secondary} select-all`}>
            {place.address}
          </span>
        </div>

        {/* Hours Accordion */}
        {place.openingHours && place.openingHours.length > 0 && (
          <div className="flex items-start gap-3">
            <Clock className={`h-5 w-5 ${themeColors.text.secondary} mt-0.5 shrink-0`} />
            <div className="flex-1">
              <button
                onClick={() => setIsHoursExpanded(!isHoursExpanded)}
                className="flex items-center gap-2 text-sm w-full text-left"
              >
                <span
                  className={
                    place.openNow ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
                  }
                >
                  {place.openNow ? 'Open' : 'Closed'}
                </span>
                <span className={`${themeColors.text.secondary}`}>
                  · {place.openingHours[(new Date().getDay() + 6) % 7].split(':')[0]}
                </span>
                {isHoursExpanded ? (
                  <ChevronUp className="h-4 w-4 ml-auto" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-auto" />
                )}
              </button>

              <AnimatePresence>
                {isHoursExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div
                      className={`mt-2 space-y-1 text-sm ${themeColors.text.secondary} border-l-2 border-gray-200 dark:border-gray-700 pl-3 ml-0.5`}
                    >
                      {place.openingHours.map((hour, idx) => {
                        const parts = hour.split(': ');
                        const day = parts[0];
                        const time = parts.slice(1).join(': ');
                        const isToday = idx === (new Date().getDay() + 6) % 7;

                        return (
                          <div
                            key={idx}
                            className={`grid grid-cols-[100px_1fr] ${isToday ? `font-medium ${themeColors.text.primary}` : ''}`}
                          >
                            <span>{day}</span>
                            <span>{time}</span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Website */}
        {place.website && (
          <div className="flex items-center gap-3">
            <Globe className={`h-5 w-5 ${themeColors.text.secondary} shrink-0`} />
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline truncate"
            >
              {new URL(place.website).hostname.replace('www.', '')}
            </a>
          </div>
        )}
      </div>

      <hr className={`${themeColors.border.default}`} />

      {/* Notes Section */}
      {!place.isPreview && (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${themeColors.text.primary}`}>Notes</h3>
              {!isEditingNotes && (
                <button
                  onClick={() => setIsEditingNotes(true)}
                  className={`p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${themeColors.text.secondary}`}
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  className={`w-full p-3 rounded-lg border ${themeColors.border.default} ${themeColors.background.app} ${themeColors.text.primary} text-sm focus:ring-2 focus:ring-blue-500 outline-none`}
                  rows={3}
                  placeholder="Add a note..."
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditingNotes(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border ${themeColors.border.default} ${themeColors.text.secondary}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-sm ${themeColors.text.secondary} italic`}>
                {place.notes || 'No notes yet.'}
              </p>
            )}
          </div>
          <hr className={`${themeColors.border.default}`} />
        </>
      )}

      {/* Footer Actions */}
      <div className="pt-2">
        {place.isPreview ? (
          <button
            onClick={() => {
              onAddExternalPlace?.(place);
              onClose();
            }}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus className="h-4 w-4" />
            Add to list
          </button>
        ) : (
          isOwner && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-lg text-red-600 bg-red-50 dark:bg-red-900/10 font-medium text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove from list
            </button>
          )
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Remove Place?"
        message="Are you sure you want to remove this place from the list?"
        confirmText="Remove"
        variant="danger"
        isLoading={deleting}
      />
    </motion.div>
  );
};
