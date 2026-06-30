import React, { useState } from 'react';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import { themeColors, colors } from '@/styles/colors';
import { IconPicker } from '@/components/Elements/IconPicker/IconPicker';
import { ListCardIconPicker } from '@/features/lists/components/ListCardIconPicker';
import {
  DEFAULT_LIST_CARD_COLOR,
  DEFAULT_LIST_CARD_ICON,
} from '@/constants/mapIcons';
import { CollaboratorManager } from '@/features/lists/components/CollaboratorManager';
import type { PlaceList } from '@/features/lists/types/list';
import { LIST_NAME_MAX_LENGTH, LIST_DESCRIPTION_MAX_LENGTH } from '@/features/lists/types/list';
import { motion, AnimatePresence } from 'framer-motion';
import { useScrollLock } from '@/hooks/useScrollLock';

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    icon: string;
    color: string;
    iconSize: number;
    cardIcon: string;
    cardColor: string;
    isPublic: boolean;
  }) => Promise<void>;
  editingList?: PlaceList | null;
  isLoading?: boolean;
  currentUserId?: string;
  onUpdate?: () => void;
}

export const CreateListModal: React.FunctionComponent<CreateListModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingList,
  isLoading = false,
  currentUserId,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'team' | 'danger'>('details');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [listName, setListName] = useState(editingList?.name || '');
  const [listDescription, setListDescription] = useState(editingList?.description || '');
  const [listIcon, setListIcon] = useState(editingList?.icon || 'AUTO');
  const [listColor, setListColor] = useState(editingList?.color || 'AUTO');
  const [listIconSize, setListIconSize] = useState(editingList?.iconSize || 36);
  const [cardIcon, setCardIcon] = useState(editingList?.cardIcon || DEFAULT_LIST_CARD_ICON);
  const [cardColor, setCardColor] = useState(editingList?.cardColor || DEFAULT_LIST_CARD_COLOR);
  const [isPublic, setIsPublic] = useState(editingList?.isPublic || false);
  const [validationError, setValidationError] = useState('');
  const isListOwner = Boolean(
    editingList && currentUserId && editingList.ownerId === currentUserId
  );

  useScrollLock(isOpen);

  // Reset form when modal opens/closes or editingList changes
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab('details');
      setDeleteConfirmText('');
      setListName(editingList?.name || '');
      setListDescription(editingList?.description || '');
      setListIcon(editingList?.icon || 'AUTO');
      setListColor(editingList?.color || 'AUTO');
      setListIconSize(editingList?.iconSize || 36);
      setCardIcon(editingList?.cardIcon || DEFAULT_LIST_CARD_ICON);
      setCardColor(editingList?.cardColor || DEFAULT_LIST_CARD_COLOR);
      setIsPublic(editingList?.isPublic || false);
    }
  }, [isOpen, editingList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const trimmedName = listName.trim();
    const trimmedDescription = listDescription.trim();

    if (!trimmedName) {
      setValidationError('List name is required.');
      return;
    }
    if (trimmedName.length > LIST_NAME_MAX_LENGTH) {
      setValidationError(`List name must be ${LIST_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (trimmedDescription.length > LIST_DESCRIPTION_MAX_LENGTH) {
      setValidationError(`Description must be ${LIST_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
      return;
    }

    // Check if anything actually changed when editing
    if (editingList) {
      const hasChanges =
        listName !== editingList.name ||
        listDescription !== (editingList.description || '') ||
        listIcon !== editingList.icon ||
        listColor !== editingList.color ||
        listIconSize !== editingList.iconSize ||
        cardIcon !== (editingList.cardIcon || DEFAULT_LIST_CARD_ICON) ||
        cardColor !== (editingList.cardColor || DEFAULT_LIST_CARD_COLOR) ||
        isPublic !== editingList.isPublic;

      if (!hasChanges) {
        onClose();
        return;
      }
    }

    await onSave({
      name: trimmedName,
      description: trimmedDescription,
      icon: listIcon,
      color: listColor,
      iconSize: listIconSize,
      cardIcon,
      cardColor,
      isPublic,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
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
            className={`${themeColors.background.card} relative rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 transition-colors custom-scrollbar`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>
                {editingList ? 'Edit List' : 'Create New List'}
              </h3>
              <button
                onClick={onClose}
                className={`${themeColors.text.secondary} hover:${themeColors.text.primary}`}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tabs - only show when editing */}
            {editingList && (
              <div className="flex border-b light-border-default mb-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    activeTab === 'details'
                      ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                      : `${themeColors.text.secondary} hover:${themeColors.text.primary}`
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('team')}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    activeTab === 'team'
                      ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                      : `${themeColors.text.secondary} hover:${themeColors.text.primary}`
                  }`}
                >
                  Team
                </button>
                {isListOwner && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('danger')}
                    className={`px-4 py-2 font-medium text-sm transition-colors ${
                      activeTab === 'danger'
                        ? 'border-b-2 border-red-500 text-red-600 dark:text-red-400'
                        : `${themeColors.text.secondary} hover:${themeColors.text.primary}`
                    }`}
                  >
                    Danger Zone
                  </button>
                )}
              </div>
            )}

            {/* Details Tab */}
            {activeTab === 'details' && (
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  {validationError && (
                    <p className={`text-sm ${themeColors.text.error}`}>{validationError}</p>
                  )}
                  <div>
                    <label
                      htmlFor="listName"
                      className={`block text-sm font-medium ${themeColors.form.label}`}
                    >
                      List Name *
                    </label>
                    <input
                      type="text"
                      id="listName"
                      value={listName}
                      onChange={(e) => setListName(e.target.value)}
                      maxLength={LIST_NAME_MAX_LENGTH}
                      className="mt-1 w-full px-3 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Favorite Restaurants"
                      autoFocus
                      required
                    />
                    <p className={`mt-1 text-xs ${themeColors.text.secondary}`}>
                      {listName.length}/{LIST_NAME_MAX_LENGTH}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="listDescription"
                      className={`block text-sm font-medium ${themeColors.form.label}`}
                    >
                      Description (optional)
                    </label>
                    <textarea
                      id="listDescription"
                      value={listDescription}
                      onChange={(e) => setListDescription(e.target.value)}
                      maxLength={LIST_DESCRIPTION_MAX_LENGTH}
                      rows={3}
                      className="mt-1 w-full px-3 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Describe what this list is for..."
                    />
                    <p className={`mt-1 text-xs ${themeColors.text.secondary}`}>
                      {listDescription.length}/{LIST_DESCRIPTION_MAX_LENGTH}
                    </p>
                  </div>

                  <IconPicker
                    selectedIcon={listIcon}
                    selectedColor={listColor}
                    selectedSize={listIconSize}
                    onIconChange={setListIcon}
                    onColorChange={setListColor}
                    onSizeChange={setListIconSize}
                  />

                  <ListCardIconPicker
                    selectedIcon={cardIcon}
                    selectedColor={cardColor}
                    onIconChange={setCardIcon}
                    onColorChange={setCardColor}
                  />

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className={`h-4 w-4 text-${colors.primary[600]} focus:ring-${colors.primary[500]} border-${colors.gray[300]} dark:border-${colors.gray[600]} rounded`}
                    />
                    <label
                      htmlFor="isPublic"
                      className={`ml-2 block text-sm ${themeColors.form.label}`}
                    >
                      Make this list public (anyone can view it)
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    className={`px-4 py-2 border rounded-md shadow-sm text-sm font-medium ${themeColors.button.secondary} transition-colors`}
                  >
                    Cancel
                  </button>
                  <LoadingButton
                    type="submit"
                    isLoading={isLoading}
                    disabled={isLoading || !listName.trim()}
                    loadingText={editingList ? 'Saving...' : 'Creating...'}
                    variant="primary"
                  >
                    {editingList ? 'Save Changes' : 'Create List'}
                  </LoadingButton>
                </div>
              </form>
            )}

            {/* Team Tab */}
            {activeTab === 'team' && editingList && currentUserId && (
              <CollaboratorManager
                list={editingList}
                currentUserId={currentUserId}
                onUpdate={() => {
                  if (onUpdate) onUpdate();
                }}
              />
            )}

            {/* Danger Zone Tab */}
            {activeTab === 'danger' && editingList && isListOwner && (
              <div className="space-y-4">
                <div className="p-4 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-md">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-400 mb-2">
                    Delete this list
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                    Once you delete a list, there is no going back. Please be certain.
                  </p>
                  <label className="block text-sm font-medium text-red-800 dark:text-red-400 mb-1">
                    To confirm, type "<b>Delete {editingList.name}</b>" in the box below
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-red-300 dark:border-red-800 bg-white dark:bg-gray-800 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={`Delete ${editingList.name}`}
                  />
                  <div className="mt-4 flex justify-end">
                    <LoadingButton
                      type="button"
                      variant="danger"
                      isLoading={isDeleting}
                      disabled={deleteConfirmText !== `Delete ${editingList.name}` || isDeleting}
                      onClick={async () => {
                        setIsDeleting(true);
                        try {
                          const { ListService } = await import('@/features/lists/api/listService');
                          await ListService.deleteList(editingList.id);
                          window.location.href = '/';
                        } catch (error) {
                          console.error('Failed to delete list', error);
                          setIsDeleting(false);
                        }
                      }}
                      loadingText="Deleting..."
                    >
                      Delete this list
                    </LoadingButton>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
