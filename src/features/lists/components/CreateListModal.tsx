import React, { useState } from 'react';
import { LoadingButton } from '@/components/ui/LoadingButton';
import { themeColors, colors } from '@/styles/colors';
import { IconPicker } from '@/components/ui/IconPicker';
import { CollaboratorManager } from '@/features/lists/components/CollaboratorManager';
import type { PlaceList } from '@/features/lists/types/list';
import { motion, AnimatePresence } from 'framer-motion';

interface CreateListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        name: string;
        description: string;
        icon: string;
        color: string;
        iconSize: number;
        isPublic: boolean;
    }) => Promise<void>;
    editingList?: PlaceList | null;
    isLoading?: boolean;
    currentUserId?: string;
    onUpdate?: () => void;
}

export const CreateListModal: React.FC<CreateListModalProps> = ({
    isOpen,
    onClose,
    onSave,
    editingList,
    isLoading = false,
    currentUserId,
    onUpdate,
}) => {
    const [activeTab, setActiveTab] = useState<'details' | 'team'>('details');
    const [listName, setListName] = useState(editingList?.name || '');
    const [listDescription, setListDescription] = useState(editingList?.description || '');
    const [listIcon, setListIcon] = useState(editingList?.icon || 'AUTO');
    const [listColor, setListColor] = useState(editingList?.color || 'AUTO');
    const [listIconSize, setListIconSize] = useState(editingList?.iconSize || 36);
    const [isPublic, setIsPublic] = useState(editingList?.isPublic || false);

    // Reset form when modal opens/closes or editingList changes
    React.useEffect(() => {
        if (isOpen) {
            setActiveTab('details');
            setListName(editingList?.name || '');
            setListDescription(editingList?.description || '');
            setListIcon(editingList?.icon || 'AUTO');
            setListColor(editingList?.color || 'AUTO');
            setListIconSize(editingList?.iconSize || 36);
            setIsPublic(editingList?.isPublic || false);
        }
    }, [isOpen, editingList]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({
            name: listName,
            description: listDescription,
            icon: listIcon,
            color: listColor,
            iconSize: listIconSize,
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
                        className={`${themeColors.background.card} relative rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 transition-colors custom-scrollbar`}
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
                                    className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'details'
                                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                        : `${themeColors.text.secondary} hover:${themeColors.text.primary}`
                                        }`}
                                >
                                    Details
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('team')}
                                    className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'team'
                                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                        : `${themeColors.text.secondary} hover:${themeColors.text.primary}`
                                        }`}
                                >
                                    Team
                                </button>
                            </div>
                        )}

                        {/* Details Tab */}
                        {activeTab === 'details' && (
                            <form onSubmit={handleSubmit}>
                                <div className="space-y-4">
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
                                            className="mt-1 w-full px-3 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g., Favorite Restaurants"
                                            autoFocus
                                            required
                                        />
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
                                            rows={3}
                                            className="mt-1 w-full px-3 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Describe what this list is for..."
                                        />
                                    </div>

                                    <IconPicker
                                        selectedIcon={listIcon}
                                        selectedColor={listColor}
                                        selectedSize={listIconSize}
                                        onIconChange={setListIcon}
                                        onColorChange={setListColor}
                                        onSizeChange={setListIconSize}
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
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
