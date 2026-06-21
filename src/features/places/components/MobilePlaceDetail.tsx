import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
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
  RefreshCw,
} from 'lucide-react';
import { themeColors } from '@/styles/colors';
import type { Place, PlaceStatus } from '@/features/places/types/place';
import { CachedPlacePhoto } from '@/features/places/components/CachedPlacePhoto';
import { formatCategoryName } from '@/constants/placeCategories';
import { calculateDistance } from '@/utils/geo';
import {
  getPlaceMapsUrl,
  getTodayDayName,
  getTodayHoursText,
  getWebsiteHostname,
  isPlaceOpen,
  parseOpeningHourLine,
} from '@/features/places/utils/placeHelpers';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { PlaceService } from '@/features/places/api/placeService';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import { useToast } from '@/hooks/useToast';
import { useDeferredAction } from '@/hooks/useDeferredAction';
import { logger } from '@/utils/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { PassportStampBadge } from '@/features/passport/components/PassportStampBadge';
import { PassportStampLabel } from '@/features/passport/components/PassportStampLabel';

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
  canEdit?: boolean;
  isPassportList?: boolean;
}

export const MobilePlaceDetailHeader: React.FunctionComponent<MobilePlaceDetailHeaderProps> = ({
  place,
  onClose,
  userLocation,
  onPlaceUpdated,
  currentUserId,
  customStatuses = [],
  onAddExternalPlace,
  canEdit = false,
  isPassportList = false,
}) => {
  const showPassportStamp = isPassportList && place.passportStampId;
  const { toast } = useToast();
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isSyncingFromGoogle, setIsSyncingFromGoogle] = useState(false);

  const handleDirections = () => {
    if (!place.location) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}&destination_place_id=${place.googlePlaceId}`;
    window.open(url, '_blank');
  };

  const handleStart = () => {
    handleDirections();
  };

  const handleSyncFromGoogle = async () => {
    if (!place.googlePlaceId) {
      toast.error('This place has no Google Place ID.');
      return;
    }

    setIsSyncingFromGoogle(true);
    toast.info('Syncing place from Google...');
    try {
      const { place: updated, photoFailures } = await PlaceService.syncPlaceFromGoogle(
        place.id,
        currentUserId
      );
      if (updated) {
        onPlaceUpdated(updated);
      } else {
        onPlaceUpdated();
      }
      if (photoFailures > 0) {
        toast.warning('Place details updated, but some photos could not be synced.');
      } else {
        toast.success('Place synced from Google.');
      }
    } catch (error) {
      logger.error('Failed to sync place from Google:', error);
      toast.error('Failed to sync place from Google.');
    } finally {
      setIsSyncingFromGoogle(false);
    }
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
        const updatedPlace = await placeRepository.getById(place.id);
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
      {/* Top Row: Back + Name */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onClose}
          className={`shrink-0 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 ${themeColors.text.secondary} hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors`}
          aria-label="Back to list"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h2
              className={`text-xl font-bold ${themeColors.text.primary} line-clamp-2 flex-1 min-w-0`}
            >
              {place.name}
            </h2>
            {showPassportStamp && (
              <PassportStampBadge
                stampId={place.passportStampId!}
                status={place.status}
                size="md"
                interactive
                placeName={place.name}
                className="shrink-0 ring-2 ring-white dark:ring-gray-900 rounded-full bg-white/90 dark:bg-gray-900/90"
              />
            )}
          </div>
          {showPassportStamp && (
            <PassportStampLabel stampId={place.passportStampId!} className="mt-0.5" />
          )}
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
      </div>

      {/* Add to List Button for Previews */}
      {place.isPreview && (
        <button
          onClick={() => {
            onAddExternalPlace?.(place);
            // Let user stay on current view - don't close automatically
          }}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          Add to this list
        </button>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDirections}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-transform"
          >
            <Navigation className="h-4 w-4 fill-current" />
            Directions
          </button>
          <button
            onClick={handleStart}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-transform"
          >
            <Play className="h-4 w-4 fill-current" />
            Start
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {place.phoneNumber && (
            <a
              href={`tel:${place.phoneNumber}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${themeColors.border.default} ${themeColors.text.primary} text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
          )}
          <button
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${themeColors.border.default} ${themeColors.text.primary} text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          {canEdit && !place.isPreview && place.googlePlaceId && (
            <button
              type="button"
              onClick={() => void handleSyncFromGoogle()}
              disabled={isSyncingFromGoogle}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${themeColors.border.default} ${themeColors.text.primary} text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingFromGoogle ? 'animate-spin' : ''}`} />
              {isSyncingFromGoogle ? 'Syncing...' : 'Sync'}
            </button>
          )}
          {!place.isPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsStatusOpen(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${themeColors.border.default} ${themeColors.text.primary} text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
            >
              <Check className="h-3.5 w-3.5 text-green-600" />
              {currentLabel}
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
          {getPlaceMapsUrl(place) && (
            <button
              type="button"
              onClick={() => {
                const url = getPlaceMapsUrl(place);
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${themeColors.border.default} ${themeColors.text.primary} text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
            >
              <Globe className="h-3.5 w-3.5" />
              Maps
            </button>
          )}
        </div>

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
                  {statusOptions
                    .filter((option) => option.value !== currentStatusValue)
                    .map((option) => (
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
  onPlaceHidden?: (placeId: string) => void;
  onPlaceRestored?: (placeId: string) => void;
}

export const MobilePlaceDetailContent: React.FunctionComponent<MobilePlaceDetailContentProps> = ({
  place,
  onPlaceUpdated,
  onClose,
  currentUserId,
  onAddExternalPlace,
  onPlaceHidden,
  onPlaceRestored,
}) => {
  const { toast } = useToast();
  const { trigger: triggerAction } = useDeferredAction();
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState(place.notes || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [isHoursExpanded, setIsHoursExpanded] = useState(false);

  const mapsUrl = getPlaceMapsUrl(place);
  const openNow = isPlaceOpen(place);
  const todayDayName = getTodayDayName();
  const todayHoursText = getTodayHoursText(place);

  // Filter out duplicates
  const photos = Array.from(new Set(place.photoUrls || []));

  const isOwner = currentUserId && (place.addedBy === currentUserId || place.listId);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await PlaceService.updatePlace(place.id, { notes: editedNotes }, currentUserId);
      setIsEditingNotes(false);
      const updatedPlace = await placeRepository.getById(place.id);
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

  const handleDelete = () => {
    if (!place.listId || !onPlaceHidden || !onPlaceRestored) return;

    const placeId = place.id;
    const listId = place.listId;

    // Optimistic deletion
    onPlaceHidden(placeId);
    setShowDeleteConfirm(false);
    onClose();

    triggerAction(
      async () => {
        // If it's a temporary ID, we only need to remove it from optimistic UI
        if (!placeId.startsWith('temp-')) {
          await PlaceService.deletePlace(placeId, listId, currentUserId);
        }
      },
      {
        toastMessage: placeId.startsWith('temp-') ? 'Addition canceled' : 'Place deleted',
        undoMessage: 'Restored',
        onUndo: () => {
          onPlaceRestored(placeId);
        },
        onError: (error: unknown) => {
          logger.error('Failed to delete place:', error);
          onPlaceRestored(placeId);
        },
      }
    );
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
                <CachedPlacePhoto
                  placeId={place.id}
                  photoRef={photo}
                  photoIndex={i}
                  alt={`Place photo ${i + 1}`}
                  maxWidth={400}
                  maxHeight={400}
                  className="w-full h-full object-cover"
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
        {place.address && (
          <div className="flex items-start gap-3">
            <MapPin className={`h-5 w-5 ${themeColors.text.secondary} mt-0.5 shrink-0`} />
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm ${themeColors.text.secondary} underline decoration-blue-500/40 underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400`}
              >
                {place.address}
              </a>
            ) : (
              <span className={`text-sm ${themeColors.text.secondary}`}>{place.address}</span>
            )}
          </div>
        )}

        {/* Hours */}
        {place.openingHours && place.openingHours.length > 0 && (
          <div
            className={`rounded-xl border ${themeColors.border.default} ${themeColors.background.app} p-3`}
          >
            <button
              type="button"
              onClick={() => setIsHoursExpanded(!isHoursExpanded)}
              className="flex w-full items-center gap-2 text-left"
            >
              <Clock className={`h-4 w-4 ${themeColors.text.secondary} shrink-0`} />
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  openNow
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {openNow ? 'Open now' : 'Closed'}
              </span>
              {todayHoursText && (
                <span className={`text-sm ${themeColors.text.secondary} truncate`}>
                  {todayHoursText}
                </span>
              )}
              {isHoursExpanded ? (
                <ChevronUp className={`ml-auto h-4 w-4 ${themeColors.text.secondary}`} />
              ) : (
                <ChevronDown className={`ml-auto h-4 w-4 ${themeColors.text.secondary}`} />
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
                  <div className={`mt-3 space-y-1 border-t pt-3 ${themeColors.border.default}`}>
                    {place.openingHours.map((line) => {
                      const { day, hours } = parseOpeningHourLine(line);
                      const isToday = day === todayDayName;
                      return (
                        <div
                          key={line}
                          className={`grid grid-cols-[7rem_1fr] gap-2 text-sm ${
                            isToday
                              ? `font-medium ${themeColors.text.primary}`
                              : themeColors.text.secondary
                          }`}
                        >
                          <span>{day}</span>
                          <span>{hours || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
              className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 truncate"
            >
              {getWebsiteHostname(place.website)}
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
      />
    </motion.div>
  );
};
