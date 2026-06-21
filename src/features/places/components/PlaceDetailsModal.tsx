import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Place } from '@/features/places/types/place';
import { PlaceDetailsPane } from './PlaceDetailsPane';
import { useScrollLock } from '@/hooks/useScrollLock';
import { themeColors } from '@/styles/colors';

interface PlaceDetailsModalProps {
  place: Place;
  isOpen: boolean;
  onClose: () => void;
  onPlaceUpdated: (place?: Place) => void;
  onPlaceHidden: (id: string) => void;
  onPlaceRestored: (id: string) => void;
  canDelete?: boolean;
  canEdit?: boolean;
  isPassportList?: boolean;
}

export const PlaceDetailsModal: React.FunctionComponent<PlaceDetailsModalProps> = ({
  place,
  isOpen,
  onClose,
  onPlaceUpdated,
  onPlaceHidden,
  onPlaceRestored,
  canDelete,
  canEdit,
  isPassportList = false,
}) => {
  useScrollLock(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          key="place-details-modal"
          className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4"
        >
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
            className="light-bg-card relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none border-0 shadow-xl sm:h-[92vh] sm:max-h-[92vh] sm:w-full sm:max-w-4xl sm:rounded-xl sm:border light-border-default"
            onClick={(e) => e.stopPropagation()}
          >
            <PlaceDetailsPane
              place={place}
              onClose={onClose}
              onPlaceUpdated={onPlaceUpdated}
              onPlaceHidden={onPlaceHidden}
              onPlaceRestored={onPlaceRestored}
              canDelete={canDelete}
              canEdit={canEdit}
              isPassportList={isPassportList}
              layout="modal"
              className="h-full w-full"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
