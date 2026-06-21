import React, { useState, useEffect } from 'react';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import {
  Edit3,
  MapPin,
  Star,
  DollarSign,
  Globe,
  Calendar,
  Clock,
  ChevronDown,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import {
  getPlaceMapsUrl,
  getTodayDayName,
  getTodayHoursText,
  getWebsiteHostname,
  isPlaceOpen,
  parseOpeningHourLine,
} from '@/features/places/utils/placeHelpers';
import { PlaceService } from '@/features/places/api/placeService';
import { logger } from '@/utils/logger';
import { ImageGalleryModal } from '@/features/places/components/ImageGalleryModal';
import { PlacePhotoGallery } from '@/features/places/components/PlacePhotoGallery';
import { useResolvedPlacePhotos } from '@/features/places/hooks/useResolvedPlacePhotos';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { Place } from '@/features/places/types/place';
import { useToast } from '@/hooks/useToast';
import { useDeferredAction } from '@/hooks/useDeferredAction';
import { PassportStampBadge } from '@/features/passport/components/PassportStampBadge';
import { PassportStampLabel } from '@/features/passport/components/PassportStampLabel';

export interface PlaceDetailsPaneProps {
  place: Place;
  onClose: () => void;
  onPlaceUpdated: (place?: Place) => void;
  onPlaceHidden: (id: string) => void;
  onPlaceRestored: (id: string) => void;
  className?: string;
  canDelete?: boolean;
  canEdit?: boolean;
  layout?: 'modal' | 'panel';
  isPassportList?: boolean;
}

const formatDate = (date: unknown): string => {
  try {
    if (!date) return 'Unknown date';
    if (typeof date === 'object' && date !== null && 'toDate' in date) {
      return (date as { toDate: () => Date }).toDate().toLocaleDateString();
    }
    if (date instanceof Date) {
      return date.toLocaleDateString();
    }
    if (typeof date === 'number') {
      return new Date(date).toLocaleDateString();
    }
    return new Date(String(date)).toLocaleDateString();
  } catch {
    return 'Invalid date';
  }
};

const DetailSection: React.FunctionComponent<{
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}> = ({ title, children, compact = false }) => (
  <section
    className={`light-border-default rounded-xl border bg-gray-50/30 dark:bg-gray-800/15 ${
      compact ? 'space-y-2.5 p-3' : 'space-y-3 p-4'
    }`}
  >
    <h3 className="text-[11px] font-semibold uppercase tracking-wider light-text-secondary">
      {title}
    </h3>
    {children}
  </section>
);

export const PlaceDetailsPane: React.FunctionComponent<PlaceDetailsPaneProps> = ({
  place,
  onClose,
  onPlaceUpdated,
  onPlaceHidden,
  onPlaceRestored,
  className = '',
  canDelete = false,
  canEdit = true,
  layout = 'modal',
  isPassportList = false,
}) => {
  const compact = layout === 'panel';
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState(place.notes || '');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isSyncingFromGoogle, setIsSyncingFromGoogle] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const mapsUrl = getPlaceMapsUrl(place);
  const isOpen = isPlaceOpen(place);
  const todayDayName = getTodayDayName();
  const todayHoursText = getTodayHoursText(place);

  const showPassportStamp = isPassportList && place.passportStampId;

  const photoRefs = place.photoUrls ?? [];
  const photoImages = useResolvedPlacePhotos(place.id, photoRefs, 800, 800);

  const hasServices = place.delivery || place.dineIn || place.takeout || place.reservable;
  const showStatusSection = place.businessStatus || place.openNow !== undefined || hasServices;

  useEffect(() => {
    setEditedNotes(place.notes || '');
    setIsEditing(false);
  }, [place.id, place.notes]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await PlaceService.updatePlace(place.id, { notes: editedNotes }, user?.id);
      setIsEditing(false);
      onPlaceUpdated();
    } catch (error) {
      logger.error('Failed to save notes:', error);
      toast.error('Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  const formatPriceLevel = (level?: number) => {
    if (!level) return '';
    return '$'.repeat(Math.min(level, 4));
  };

  const { trigger: triggerAction } = useDeferredAction();

  const handleDelete = async () => {
    if (!place.listId) return;

    const placeId = place.id;
    const listId = place.listId;
    const userId = user?.id;

    onPlaceHidden(placeId);
    setShowDeleteConfirm(false);
    onClose();

    triggerAction(
      async () => {
        await PlaceService.deletePlace(placeId, listId, userId);
      },
      {
        toastMessage: 'Place deleted',
        undoMessage: 'Restored',
        onUndo: () => {
          onPlaceRestored(placeId);
        },
        onError: (error) => {
          logger.error('Failed to delete place:', error);
        },
      }
    );
  };

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setShowGallery(true);
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
        user?.id
      );
      if (updated) {
        onPlaceUpdated(updated);
      } else {
        const cached = await placeRepository.getById(place.id);
        onPlaceUpdated(cached ?? undefined);
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

  const notesSection = (
    <DetailSection title="Notes" compact={compact}>
      <div className="flex items-center justify-end -mt-1 mb-1">
        {!isEditing && canEdit && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="light-text-secondary hover:light-text-primary flex items-center gap-1 text-xs"
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            placeholder="Add notes about this place..."
            className="light-bg-card light-text-primary light-border-default max-h-32 w-full overflow-y-auto rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={compact ? 3 : 4}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditedNotes(place.notes || '');
              }}
              className="px-3 py-1 text-sm light-text-secondary hover:light-text-primary"
            >
              Cancel
            </button>
            <LoadingButton
              onClick={handleSaveNotes}
              isLoading={saving}
              loadingText="Saving..."
              variant="primary"
              className="h-8 rounded px-3 py-1 text-sm"
            >
              Save
            </LoadingButton>
          </div>
        </div>
      ) : (
        <p className="text-sm light-text-primary whitespace-pre-wrap leading-relaxed">
          {place.notes || <span className="text-gray-400 italic">No notes added yet.</span>}
        </p>
      )}
    </DetailSection>
  );

  return (
    <div className={`light-bg-card flex h-full min-h-0 flex-col ${className}`}>
      <div
        className={`flex shrink-0 items-start gap-3 border-b light-border-default ${
          compact ? 'px-3 py-3' : 'px-5 py-4'
        }`}
      >
        <div className="min-w-0 flex-1">
          <h2
            className={`light-text-primary font-semibold leading-snug ${
              compact ? 'text-base' : 'truncate text-xl'
            }`}
          >
            {place.name}
          </h2>
          {showPassportStamp && (
            <PassportStampLabel stampId={place.passportStampId!} className="mt-1" />
          )}
        </div>
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

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar ${
          compact ? 'space-y-3 p-3' : 'space-y-5 p-5 sm:p-6'
        }`}
      >
        {photoRefs.length > 0 && (
          <PlacePhotoGallery
            key={`${place.id}-${photoRefs.length}`}
            placeId={place.id}
            photoRefs={photoRefs}
            placeName={place.name}
            compact={compact}
            onOpenFullscreen={openGallery}
          />
        )}

        {(place.rating || place.priceLevel || place.addedAt) && (
          <div
            className={`light-border-default flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-gray-50/30 px-3 py-2.5 dark:bg-gray-800/15 ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {place.rating && (
              <div className="flex items-center gap-1.5 light-text-secondary">
                <Star className="h-4 w-4 text-yellow-400" />
                <span>
                  {place.rating}
                  {place.userRatingsTotal && (
                    <span className="ml-1 opacity-75">({place.userRatingsTotal})</span>
                  )}
                </span>
              </div>
            )}
            {place.priceLevel && (
              <div className="flex items-center gap-1.5 light-text-secondary">
                <DollarSign className="h-4 w-4" />
                <span>{formatPriceLevel(place.priceLevel)}</span>
              </div>
            )}
            {place.addedAt && (
              <div className="flex items-center gap-1.5 light-text-secondary">
                <Calendar className="h-4 w-4" />
                <span>Added {formatDate(place.addedAt)}</span>
              </div>
            )}
          </div>
        )}

        <div className={compact ? 'space-y-3' : 'grid gap-4 lg:grid-cols-2'}>
          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <DetailSection title="Location" compact={compact}>
              {place.address && (
                <button
                  type="button"
                  onClick={() => {
                    if (mapsUrl) window.open(mapsUrl, '_blank');
                  }}
                  className="flex w-full items-start gap-2 text-left transition-opacity hover:opacity-80"
                >
                  <MapPin className="light-text-secondary mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium leading-snug text-blue-600 underline underline-offset-2 dark:text-blue-400">
                    {place.address}
                  </span>
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border light-border-default px-2.5 py-1.5 text-xs font-medium light-text-primary transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Globe className="h-3.5 w-3.5 text-blue-500" />
                    Maps
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                )}
                {place.website && (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border light-border-default px-2.5 py-1.5 text-xs font-medium text-blue-600 underline-offset-2 hover:bg-gray-50 dark:text-blue-400 dark:hover:bg-gray-800"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    {getWebsiteHostname(place.website)}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                )}
              </div>
            </DetailSection>

            {place.openingHours && place.openingHours.length > 0 && (
              <DetailSection title="Hours" compact={compact}>
                <button
                  type="button"
                  onClick={() => setHoursExpanded(!hoursExpanded)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <Clock className="light-text-secondary mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isOpen
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}
                        />
                        {isOpen ? 'Open' : 'Closed'}
                      </span>
                      <span className="text-sm light-text-secondary">
                        {todayDayName}
                        {todayHoursText && ` · ${todayHoursText}`}
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`light-text-secondary h-4 w-4 shrink-0 transition-transform ${hoursExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {hoursExpanded && (
                  <div className="space-y-0.5 border-t light-border-default pt-2.5">
                    {place.openingHours.map((hour: string, index: number) => {
                      const { day, hours } = parseOpeningHourLine(hour);
                      const isToday = day === todayDayName;

                      return (
                        <div
                          key={index}
                          className={`grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-lg px-2 py-1.5 text-sm ${
                            isToday
                              ? 'bg-blue-50/80 font-medium dark:bg-blue-900/25'
                              : 'light-text-secondary'
                          }`}
                        >
                          <span className={isToday ? 'light-text-primary' : undefined}>{day}</span>
                          <span
                            className={`text-right whitespace-nowrap tabular-nums ${isToday ? 'light-text-primary' : ''}`}
                          >
                            {hours}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </DetailSection>
            )}
          </div>

          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            {(place.category || (place.cuisines && place.cuisines.length > 0)) && (
              <DetailSection title="Type" compact={compact}>
                <div className="flex flex-wrap gap-1.5">
                  {place.category && (
                    <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {place.category}
                    </span>
                  )}
                  {place.cuisines?.map((cuisine) => (
                    <span
                      key={cuisine}
                      className="rounded-full border border-blue-200 bg-blue-50/80 px-2.5 py-1 text-xs font-semibold capitalize text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-100"
                    >
                      {cuisine}
                    </span>
                  ))}
                </div>
              </DetailSection>
            )}

            {showStatusSection && (
              <DetailSection title="Status & services" compact={compact}>
                <div className="flex flex-wrap gap-1.5">
                  {place.businessStatus && (
                    <span
                      className={`rounded-md border px-2 py-1 text-xs font-bold ${
                        place.businessStatus === 'OPERATIONAL'
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
                      }`}
                    >
                      {place.businessStatus === 'OPERATIONAL' ? 'Operational' : 'Not operational'}
                    </span>
                  )}
                  {place.openNow !== undefined && !place.businessStatus && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-xs font-medium light-text-secondary dark:border-gray-700 dark:bg-gray-800/50">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${place.openNow ? 'bg-green-500' : 'bg-red-500'}`}
                      />
                      {place.openNow ? 'Open now' : 'Closed now'}
                    </span>
                  )}
                  {place.delivery && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                      🚚 Delivery
                    </span>
                  )}
                  {place.dineIn && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                      🍽️ Dine-in
                    </span>
                  )}
                  {place.takeout && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                      📦 Takeout
                    </span>
                  )}
                  {place.reservable && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                      📅 Reservations
                    </span>
                  )}
                </div>
              </DetailSection>
            )}
          </div>
        </div>

        {compact && notesSection}
      </div>

      {!compact && (
        <div className="light-border-default shrink-0 border-t bg-gray-50/40 p-4 dark:bg-gray-900/20">
          {notesSection}
        </div>
      )}

      <div
        className={`light-border-default flex shrink-0 items-center justify-between gap-4 border-t bg-gray-50/40 dark:bg-gray-900/20 ${
          compact ? 'px-3 py-2.5' : 'p-4'
        }`}
      >
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
            >
              Delete Place
            </button>
          )}
          {canEdit && place.googlePlaceId && (
            <button
              type="button"
              onClick={() => void handleSyncFromGoogle()}
              disabled={isSyncingFromGoogle}
              className="light-border-default inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncingFromGoogle ? 'animate-spin' : ''}`} />
              {isSyncingFromGoogle ? 'Syncing...' : 'Sync from Google'}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="light-border-default ml-auto rounded-lg border bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          Back
        </button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Place?"
        message={`Are you sure you want to delete "${place.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Delete"
        variant="danger"
      />

      <ImageGalleryModal
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        images={photoImages}
        initialIndex={galleryIndex}
        placeName={place.name}
      />
    </div>
  );
};
