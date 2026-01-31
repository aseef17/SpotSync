import React, { useState, useEffect } from 'react';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import { Edit3, MapPin, Star, DollarSign, Globe, Calendar, X, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlaceService } from '@/features/places/api/placeService';
import { logger } from '@/utils/logger';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { ImageGalleryModal } from '@/features/places/components/ImageGalleryModal';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { Place } from '@/features/places/types/place';
import { useToast } from '@/hooks/useToast';
import { useDeferredAction } from '@/hooks/useDeferredAction';

interface PlaceDetailsModalProps {
  place: Place;
  isOpen: boolean;
  onClose: () => void;
  onPlaceUpdated: () => void;
  onPlaceHidden: (id: string) => void;
  onPlaceRestored: (id: string) => void;
  listOwnerId?: string;
  userPermission?: 'owner' | 'editor' | 'viewer';
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

const getImageUrl = (photoReference: string): string => {
  if (photoReference.startsWith('http')) {
    return photoReference;
  }
  if (photoReference && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return GoogleMapsService.getPhotoUrl(photoReference, 400);
  }
  return '';
};

export const PlaceDetailsModal: React.FunctionComponent<PlaceDetailsModalProps> = ({
  place,
  isOpen,
  onClose,
  onPlaceUpdated,
  onPlaceHidden,
  onPlaceRestored,
  userPermission,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState(place.notes || '');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const canDelete = user && (user.id === place.addedBy || userPermission === 'owner');

  useEffect(() => {
    if (isOpen) {
      setEditedNotes(place.notes || '');
      setIsEditing(false);
    }
  }, [isOpen, place.notes]);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-0 sm:p-4 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="light-bg-card relative rounded-none sm:rounded-lg w-full h-full sm:w-auto sm:h-auto sm:max-w-4xl sm:max-h-[90vh] overflow-hidden border-0 sm:border light-border-default flex flex-col shadow-xl"
          >
            <div className="flex items-center justify-between p-6 border-b light-border-default flex-shrink-0">
              <h2 className="text-xl font-semibold light-text-primary">{place.name}</h2>
              <button onClick={onClose} className="light-text-secondary hover:light-text-primary">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.1,
                    },
                  },
                }}
                className="p-6 space-y-6"
              >
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="grid grid-cols-1 gap-4"
                >
                  {place.photoUrls && place.photoUrls.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium light-text-secondary mb-2">
                        Place Photos
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 relative">
                        {place.photoUrls.slice(0, 4).map((photoUrl: string, index: number) => {
                          const imageUrl = getImageUrl(photoUrl);
                          return imageUrl ? (
                            <div
                              key={index}
                              className="relative group cursor-pointer"
                              onClick={() => {
                                setGalleryIndex(index);
                                setShowGallery(true);
                              }}
                            >
                              <img
                                src={imageUrl}
                                alt={`${place.name} photo ${index + 1}`}
                                className="w-full h-24 object-cover rounded-lg transition-opacity hover:opacity-90"
                              />
                              {index === 3 && (place.photoUrls?.length || 0) > 4 && (
                                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                                  <span className="text-white font-medium text-sm">
                                    +{(place.photoUrls?.length || 0) - 4} more
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : null;
                        })}
                      </div>
                      <button
                        onClick={() => {
                          setGalleryIndex(0);
                          setShowGallery(true);
                        }}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Maximize2 className="h-3 w-3" />
                        View all {place.photoUrls.length} photos
                      </button>
                    </div>
                  )}
                </motion.div>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium light-text-secondary mb-1">Address</h3>
                      <div className="flex items-start">
                        <MapPin className="h-4 w-4 light-text-secondary mt-0.5 mr-2 flex-shrink-0" />
                        <p className="text-sm light-text-secondary">{place.address}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6">
                      {place.rating && (
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-400 mr-1" />
                          <span className="text-sm light-text-secondary">
                            {place.rating}
                            {place.userRatingsTotal && (
                              <span className="ml-1 text-xs opacity-75">
                                ({place.userRatingsTotal})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {place.priceLevel && (
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 light-text-secondary mr-1" />
                          <span className="text-sm light-text-secondary">
                            {formatPriceLevel(place.priceLevel)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {place.category && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                          {place.category}
                        </span>
                      )}
                      {place.cuisines?.map((cuisine) => (
                        <span
                          key={cuisine}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 capitalize"
                        >
                          {cuisine}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center space-x-4 text-sm light-text-secondary">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        Added {formatDate(place.addedAt)}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      {place.googleMapsUrl ? (
                        <a
                          href={place.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 border light-border-default rounded-md text-sm font-medium light-text-primary hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
                        >
                          <Globe className="h-4 w-4 mr-2 text-blue-500" />
                          View on Maps
                        </a>
                      ) : (
                        <button
                          onClick={() => {
                            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.googlePlaceId}`;
                            window.open(url, '_blank');
                          }}
                          className="inline-flex items-center px-4 py-2 border light-border-default rounded-md text-sm font-medium light-text-primary hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
                        >
                          <Globe className="h-4 w-4 mr-2 text-blue-500" />
                          View on Maps
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {place.cuisines && place.cuisines.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {place.cuisines.map((cuisine) => (
                          <span
                            key={cuisine}
                            className="px-3 py-1 bg-purple-100/80 text-black border border-purple-200 dark:bg-purple-900/40 dark:text-white dark:border-purple-800 rounded-full text-xs font-bold capitalize"
                          >
                            {cuisine}
                          </span>
                        ))}
                      </div>
                    )}

                    {(place.businessStatus || place.openNow !== undefined) && (
                      <div className="flex items-center gap-4">
                        {place.businessStatus && (
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              place.businessStatus === 'OPERATIONAL'
                                ? 'bg-green-100/80 text-black border border-green-200 dark:bg-green-900/40 dark:text-white dark:border-green-800'
                                : 'bg-red-100/80 text-black border border-red-200 dark:bg-red-900/40 dark:text-white dark:border-red-800'
                            }`}
                          >
                            {place.businessStatus === 'OPERATIONAL' ? '✓ Open' : '✗ Closed'}
                          </span>
                        )}
                        {place.openNow !== undefined && (
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                place.openNow ? 'bg-green-500' : 'bg-red-500'
                              }`}
                            />
                            <span className="text-sm light-text-secondary">
                              {place.openNow ? 'Open now' : 'Closed now'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {(place.delivery || place.dineIn || place.takeout || place.reservable) && (
                      <div className="flex flex-wrap gap-2">
                        {place.delivery && (
                          <span className="px-2 py-1 bg-green-100/80 text-black border border-green-200 dark:bg-green-900/40 dark:text-white dark:border-green-800 text-xs rounded font-bold">
                            🚚 Delivery
                          </span>
                        )}
                        {place.dineIn && (
                          <span className="px-2 py-1 bg-blue-100/80 text-black border border-blue-200 dark:bg-blue-900/40 dark:text-white dark:border-blue-800 text-xs rounded font-bold">
                            🍽️ Dine-in
                          </span>
                        )}
                        {place.takeout && (
                          <span className="px-2 py-1 bg-purple-100/80 text-black border border-purple-200 dark:bg-purple-900/40 dark:text-white dark:border-purple-800 text-xs rounded font-bold">
                            📦 Takeout
                          </span>
                        )}
                        {place.reservable && (
                          <span className="px-2 py-1 bg-orange-100/80 text-black border border-orange-200 dark:bg-orange-900/40 dark:text-white dark:border-orange-800 text-xs rounded font-bold">
                            📅 Reservations
                          </span>
                        )}
                      </div>
                    )}

                    {place.openingHours && place.openingHours.length > 0 && (
                      <div className="space-y-2">
                        <button
                          onClick={() => setHoursExpanded(!hoursExpanded)}
                          className="flex items-center justify-between w-full text-sm font-medium light-text-secondary hover:light-text-primary"
                        >
                          <span>Hours</span>
                          <svg
                            className={`w-4 h-4 transition-transform ${hoursExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <ul className="text-sm light-text-secondary space-y-0.5">
                          {hoursExpanded ? (
                            place.openingHours.map((hours: string, index: number) => (
                              <li key={index}>{hours}</li>
                            ))
                          ) : (
                            <li>{place.openingHours[new Date().getDay()]}</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium light-text-secondary">Notes</h3>
                    {!isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="light-text-secondary hover:light-text-primary"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedNotes}
                        onChange={(e) => setEditedNotes(e.target.value)}
                        placeholder="Add notes about this place..."
                        className="w-full px-3 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                      />
                      <div className="flex justify-end space-x-2">
                        <button
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
                          className="px-3 py-1 text-sm rounded h-8"
                        >
                          Save
                        </LoadingButton>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm light-text-secondary">
                      {place.notes || 'No notes added yet.'}
                    </p>
                  )}
                </motion.div>
              </motion.div>
            </div>

            <div className="p-2 sm:p-4 border-t light-border-default flex justify-between items-center gap-4 flex-shrink-0">
              {canDelete && (
                <LoadingButton
                  onClick={() => setShowDeleteConfirm(true)}
                  loadingText="Deleting..."
                  variant="ghost"
                  className="px-3 sm:px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium whitespace-nowrap text-sm sm:text-base"
                >
                  Delete Place
                </LoadingButton>
              )}
              <button
                onClick={onClose}
                className="ml-auto px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium text-sm sm:text-base"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
        images={
          place.photoUrls?.map((url) => getImageUrl(url)).filter((url): url is string => !!url) ||
          []
        }
        initialIndex={galleryIndex}
        placeName={place.name}
      />
    </AnimatePresence>
  );
};
