import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Plus, Users, Settings, Eye, EyeOff, Trash2, Edit, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@/components/Elements/Theme/ThemeToggle';
import { ImportGoogleMapsModal } from '@/features/places/components/ImportGoogleMapsModal';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { CreateListModal } from '@/features/lists/components/CreateListModal';
import type { PlaceList } from '@/features/lists/types/list';
import { themeColors } from '@/styles/colors';
import { InvitationList } from '@/features/lists/components/InvitationList';
import { useLists } from '@/features/lists/hooks/useLists';
import { useToast } from '@/hooks/useToast';
import { ListIcon } from '@/features/lists/components/ListIcon';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { logger } from '@/utils/logger';
import { useDeferredAction } from '@/hooks/useDeferredAction';

export const Dashboard: React.FunctionComponent = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { lists, loading, creating, error, loadUserLists, createList, updateList, deleteList } =
    useLists(user?.id);

  const { permissionGranted, tokenSynced, notificationsDisabled } = useNotifications();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const [editingList, setEditingList] = useState<PlaceList | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Optimistic UI State
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, Partial<PlaceList>>>({});
  const [hiddenListIds, setHiddenListIds] = useState<Set<string>>(new Set());
  const [optimisticLists, setOptimisticLists] = useState<PlaceList[]>([]);
  const { trigger: triggerAction } = useDeferredAction();

  // Merge optimistic lists with real lists, apply updates, and filter hidden
  const displayedLists = useMemo(() => {
    const combined = [...optimisticLists, ...lists];
    // Deduplicate by clientId if available, falling back to id
    // Since 'lists' (real data) comes last, it will overwrite optimistic versions with the same clientId
    const unique = Array.from(new Map(combined.map((l) => [l.clientId || l.id, l])).values());
    return unique
      .filter((l) => !hiddenListIds.has(l.id))
      .map((l) => (pendingUpdates[l.id] ? { ...l, ...pendingUpdates[l.id] } : l));
  }, [lists, optimisticLists, hiddenListIds, pendingUpdates]);

  useEffect(() => {
    if (optimisticLists.length === 0) return;

    const realIds = new Set(lists.map((l) => l.id));
    const stillOptimistic = optimisticLists.filter((l) => !realIds.has(l.id));

    if (stillOptimistic.length !== optimisticLists.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticLists(stillOptimistic);
    }
  }, [lists, optimisticLists]);

  const resetForm = () => {
    setEditingList(null);
    setShowCreateForm(false);
  };

  const handleSaveList = async (data: {
    name: string;
    description: string;
    icon: string;
    color: string;
    iconSize: number;
    isPublic: boolean;
  }) => {
    if (!user) return;

    try {
      if (editingList) {
        // Optimistic Update
        const listId = editingList.id;
        setPendingUpdates((prev) => ({ ...prev, [listId]: data }));

        triggerAction(
          async () => {
            await updateList(listId, data, user.id);
          },
          {
            toastMessage: 'List updated',
            undoMessage: 'Reverted',
            onUndo: () => {
              setPendingUpdates((prev) => {
                const next = { ...prev };
                delete next[listId];
                return next;
              });
            },
            onError: (err) => {
              logger.error('Update failed', err);
              setPendingUpdates((prev) => {
                const next = { ...prev };
                delete next[listId];
                return next;
              });
            },
          }
        );
      } else {
        const tempId = `temp-${Date.now()}`;
        const clientId = tempId;

        const optimisticList: PlaceList = {
          id: tempId,
          clientId,
          ...data,
          ownerId: user.id,
          collaborators: [],
          collaboratorIds: [],
          places: [],
          customStatuses: [],
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setOptimisticLists((prev) => [optimisticList, ...prev]);

        triggerAction(
          async () => {
            const newListId = await createList({
              ...data,
              email: user.email,
              username: user.username,
              clientId,
            });

            // Replace temp ID with real ID in optimistic state
            // This ensures transitions are seamless if the user still sees it
            setOptimisticLists((prev) =>
              prev.map((l) => (l.id === tempId ? { ...l, id: newListId! } : l))
            );

            await loadUserLists({ silent: true });
          },
          {
            toastMessage: 'List created',
            undoMessage: 'Canceled',
            onUndo: () => {
              setOptimisticLists((prev) => prev.filter((l) => l.id !== tempId));
            },
            onError: (err) => {
              logger.error('Create failed', err);
              setOptimisticLists((prev) => prev.filter((l) => l.id !== tempId));
            },
          }
        );
      }
      resetForm();
    } catch (error) {
      toast.error(
        `Failed to save list: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateForm(true);
  };

  const openEditModal = (list: PlaceList) => {
    setEditingList(list);
    setShowCreateForm(true);
  };

  const confirmDeleteList = async () => {
    if (!showDeleteConfirm || !user) return;
    const listId = showDeleteConfirm;

    setHiddenListIds((prev) => {
      const next = new Set(prev);
      next.add(listId);
      return next;
    });
    setShowDeleteConfirm(null);

    triggerAction(
      async () => {
        await deleteList(listId);
      },
      {
        toastMessage: 'List deleted',
        undoMessage: 'Restored',
        onUndo: () => {
          setHiddenListIds((prev) => {
            const next = new Set(prev);
            next.delete(listId);
            return next;
          });
        },
      }
    );
  };

  const confirmSignOut = async () => {
    setSigningOut(true);
    await logout();
    setShowSignOutConfirm(false);
  };

  const handleImportSuccess = useCallback(() => {
    loadUserLists({ silent: true });
  }, [loadUserLists]);

  const existingListsData = useMemo(
    () => displayedLists.map((l) => ({ id: l.id, name: l.name })),
    [displayedLists]
  );

  const handleInvitationAccepted = useCallback(() => {
    loadUserLists({ silent: true });
  }, [loadUserLists]);

  return (
    <div className={`min-h-screen ${themeColors.background.app} transition-colors`}>
      <header
        className={`shadow-sm border-b ${themeColors.background.card} ${themeColors.border.default} transition-colors`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img src="/mappin-icon.svg" alt="Logo" className="h-10 w-10 mr-1" />
              <Link to="/" className={`text-2xl font-bold ${themeColors.text.primary}`}>
                Place Lists
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <div className="relative">
                <Link
                  to="/settings"
                  className={`p-2 rounded-full ${themeColors.text.secondary} ${themeColors.button.icon}`}
                  title="Settings"
                >
                  <Settings className="h-5 w-5" />
                </Link>
              </div>
              <button
                onClick={() => setShowSignOutConfirm(true)}
                className={`px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themeColors.button.secondary} transition-colors`}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          {permissionGranted && !tokenSynced && !notificationsDisabled && (
            <div className="mb-6 flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30 rounded-xl shadow-sm">
              <div className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse border-2 border-white dark:border-gray-900" />
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Syncing device... (Visit Settings to retry if this persists)
              </p>
            </div>
          )}
          <h2 className={`text-2xl font-bold ${themeColors.text.primary}`}>
            Welcome back, {user?.displayName || user?.username}!
          </h2>
          <p className={`mt-1 ${themeColors.text.secondary}`}>
            Manage your place lists and discover new locations.
          </p>
        </motion.div>

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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          <motion.button
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            onClick={openCreateModal}
            className={`${themeColors.background.card} rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow text-left`}
          >
            <div className="flex items-center">
              <div className="bg-blue-600 p-3 rounded-full shadow-sm">
                <Plus className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>
                  Create New List
                </h3>
                <p className={`${themeColors.text.secondary} text-sm`}>
                  Start a new collection of places
                </p>
              </div>
            </div>
          </motion.button>

          <motion.button
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            onClick={() => setShowImportModal(true)}
            className={`${themeColors.background.card} rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow text-left`}
          >
            <div className="flex items-center">
              <div className="bg-transparent h-12 w-12 rounded-lg flex items-center justify-center overflow-hidden">
                <img src="/mappin-icon.svg" alt="Map" className="h-12 w-12 object-contain" />
              </div>
              <div className="ml-4">
                <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>
                  Import from Maps
                </h3>
                <p className={`${themeColors.text.secondary} text-sm`}>Import your saved places</p>
              </div>
            </div>
          </motion.button>

          <motion.button
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            onClick={() => setShowInvitations(!showInvitations)}
            className={`${themeColors.background.card} rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow w-full text-left`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="bg-purple-600 p-3 rounded-full shadow-sm">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>Collaborate</h3>
                  <p className={`${themeColors.text.secondary} text-sm`}>
                    View pending invitations
                  </p>
                </div>
              </div>
            </div>
          </motion.button>
        </motion.div>

        <AnimatePresence>
          {showInvitations && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`${themeColors.background.card} rounded-lg shadow-sm border mb-8 overflow-hidden`}
            >
              <div className={`px-6 py-4 border-b ${themeColors.border.default}`}>
                <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>
                  Pending Invitations
                </h3>
                <p className={`${themeColors.text.secondary} text-sm`}>
                  Lists others have shared with you
                </p>
              </div>
              <div className="p-6">
                <InvitationList onInvitationAccepted={handleInvitationAccepted} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`${themeColors.background.card} rounded-lg shadow-sm border`}>
          <div className={`px-6 py-4 border-b ${themeColors.border.default}`}>
            <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>Your Lists</h3>
            <p className={`${themeColors.text.secondary} text-sm`}>
              Lists you've created or have access to
            </p>
          </div>
          <div className="p-6">
            {error ? (
              <div className="text-center py-12">
                <AlertCircle className={`mx-auto h-12 w-12 text-red-500`} />
                <h3 className={`mt-2 text-lg font-medium ${themeColors.text.primary}`}>
                  Error loading lists
                </h3>
                <p className={`mt-1 text-sm ${themeColors.text.secondary}`}>{error}</p>
                <button
                  onClick={() => loadUserLists()}
                  className={`mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themeColors.button.secondary} transition-colors`}
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="text-center py-12">
                <div
                  className={`animate-spin rounded-full h-8 w-8 border-b-2 ${themeColors.text.primary} mx-auto`}
                />
                <p className={`mt-2 text-sm ${themeColors.text.secondary}`}>Loading lists...</p>
              </div>
            ) : displayedLists.length === 0 ? (
              <div className="text-center py-12">
                <img src="/mappin-icon.svg" alt="Empty" className="mx-auto h-20 w-20 opacity-20" />
                <h3 className={`mt-2 text-sm font-medium ${themeColors.text.primary}`}>
                  No lists yet
                </h3>
                <p className={`mt-1 text-sm ${themeColors.text.secondary}`}>
                  Get started by creating your first place list.
                </p>
                <div className="mt-6">
                  <button
                    onClick={openCreateModal}
                    className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md ${themeColors.button.primary} transition-colors`}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Create your first list
                  </button>
                </div>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 },
                  },
                }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {displayedLists.map((list) => (
                  <motion.div
                    key={list.clientId || list.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link
                      to={list.id.startsWith('temp-') ? '#' : `/list/${list.id}`}
                      onClick={(e) => {
                        if (list.id.startsWith('temp-')) {
                          e.preventDefault();
                        }
                      }}
                      className={`${themeColors.background.card} border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer block h-full ${
                        list.id.startsWith('temp-') ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="mr-4 flex-shrink-0">
                          <ListIcon icon={list.icon} color={list.color} size={24} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className={`text-lg font-medium ${themeColors.text.primary}`}>
                              {list.name}
                            </h3>
                            {list.id.startsWith('temp-') && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">
                                Saving...
                              </span>
                            )}
                          </div>
                          {list.description && (
                            <p className={`text-sm ${themeColors.text.secondary} mt-1`}>
                              {list.description}
                            </p>
                          )}
                          <div className="flex items-center mt-2 space-x-4">
                            <span className={`text-sm ${themeColors.text.secondary}`}>
                              {list.places?.length || 0} places
                            </span>
                            <span
                              className={`flex items-center text-sm ${themeColors.text.secondary}`}
                            >
                              {list.isPublic ? (
                                <>
                                  <Eye className="h-4 w-4 mr-1" /> Public
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-4 w-4 mr-1" /> Private
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openEditModal(list);
                            }}
                            className={`p-1 ${themeColors.text.secondary} hover:${themeColors.text.primary}`}
                            title="Edit list"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowDeleteConfirm(list.id);
                            }}
                            className={`p-1 ${themeColors.text.secondary} hover:text-red-600`}
                            title="Delete list"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        <CreateListModal
          isOpen={showCreateForm}
          onClose={resetForm}
          onSave={handleSaveList}
          editingList={editingList}
          isLoading={creating}
          currentUserId={user?.id}
          onUpdate={() => loadUserLists({ silent: true })}
        />

        <ConfirmDialog
          isOpen={!!showDeleteConfirm}
          title="Delete List?"
          message="Are you sure you want to delete this list? This will remove all places in the list and cannot be undone."
          onConfirm={confirmDeleteList}
          onCancel={() => setShowDeleteConfirm(null)}
          confirmText="Delete"
          variant="danger"
        />

        <ConfirmDialog
          isOpen={showSignOutConfirm}
          title="Sign Out?"
          message="Are you sure you want to sign out?"
          onConfirm={confirmSignOut}
          onCancel={() => setShowSignOutConfirm(false)}
          confirmText="Sign Out"
          variant="info"
          isLoading={signingOut}
        />

        {showImportModal && (
          <ImportGoogleMapsModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            existingLists={existingListsData}
            onSuccess={handleImportSuccess}
          />
        )}
      </main>
    </div>
  );
};
