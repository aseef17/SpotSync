import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Bell,
  LogOut,
  Save,
  AlertTriangle,
  RefreshCw,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { AccountService, getCallableErrorMessage } from '@/features/auth/api/accountService';
import { logger } from '@/utils/logger';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { ThemeToggle } from '@/components/Elements/Theme/ThemeToggle';
import { AccountLinking } from '@/features/auth/components/AccountLinking';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import { useProfile } from '@/features/auth/hooks/useProfile';
import { useToast } from '@/hooks/useToast';
import { useDeferredAction } from '@/hooks/useDeferredAction';
import { readUserProfileFromCache } from '@/features/auth/api/userProfileBootstrap';
import { useInitialCacheHydrationScope } from '@/hooks/useInitialCacheHydrationScope';
import { usePendingSyncCount } from '@/hooks/usePendingSyncCount';
import { retryPendingSync } from '@/utils/retryConnection';

const DELETE_ACCOUNT_PHRASE = 'Delete my SpotSync account';

export const Settings: React.FunctionComponent = () => {
  const { user, firebaseUser, logout, loading: authLoading } = useAuth();
  const profileUid = firebaseUser?.uid;
  const [profileCacheProbe, setProfileCacheProbe] = useState<{
    uid: string;
    hadCache: boolean;
  } | null>(null);

  useEffect(() => {
    if (!profileUid) {
      return;
    }

    let cancelled = false;
    void readUserProfileFromCache(profileUid).then((profile) => {
      if (!cancelled) {
        setProfileCacheProbe({ uid: profileUid, hadCache: !!profile });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profileUid]);

  const hadProfileCacheInitially =
    profileUid && profileCacheProbe?.uid === profileUid ? profileCacheProbe.hadCache : null;

  useInitialCacheHydrationScope('settings', {
    isLoading: authLoading || !user,
    hasContent: !!user,
    hadCacheInitially: hadProfileCacheInitially,
  });
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    permissionGranted,
    tokenSynced,
    notificationsDisabled,
    requestPermission,
    disableNotifications,
  } = useNotifications();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [syncingChanges, setSyncingChanges] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const pendingSyncCount = usePendingSyncCount();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const {
    displayName,
    setDisplayName,
    username,
    setUsername,
    usernameAvailable,
    checkingUsername,
    saveProfile,
  } = useProfile();

  const { trigger: triggerAction } = useDeferredAction();

  const handleSyncChanges = async () => {
    setSyncingChanges(true);
    setSyncStatusMessage(null);
    try {
      const attempt = await retryPendingSync();
      setSyncStatusMessage(attempt.message);
    } catch {
      setSyncStatusMessage('Sync failed unexpectedly. Please try again.');
    } finally {
      setSyncingChanges(false);
    }
  };

  const handleSaveProfile = async () => {
    if (user && displayName === user.displayName && username === user.username) {
      toast.info('No changes to save');
      return;
    }

    const previousDisplayName = user?.displayName;
    const previousUsername = user?.username;

    triggerAction(
      async () => {
        await saveProfile();
      },
      {
        toastMessage: 'Profile updated successfully',
        undoMessage: 'Reverted',
        onUndo: () => {
          if (previousDisplayName) setDisplayName(previousDisplayName);
          if (previousUsername) setUsername(previousUsername);
        },
        onError: () => {
          if (previousDisplayName) setDisplayName(previousDisplayName);
          if (previousUsername) setUsername(previousUsername);
        },
      }
    );
  };

  const isToggledOn = !notificationsDisabled && (tokenSynced || permissionGranted);

  const handleToggleNotifications = async () => {
    if (isToggledOn) {
      await disableNotifications();
      toast.success('Notifications disabled');
    } else {
      const granted = await requestPermission();
      if (granted) {
        new Notification('Place Lists App', {
          body: 'Notifications enabled! You will receive updates about your collaboration activities.',
          icon: '/mappin-icon.svg',
        });
      }
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await AccountService.deleteAccount();
      setShowDeleteAccountConfirm(false);
      setDeleteConfirmText('');
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      logger.error('Account deletion failed:', error);
      toast.error(getCallableErrorMessage(error, 'Failed to delete account. Please try again.'));
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className={`min-h-screen light-bg-app transition-colors`}>
      <header className={`light-bg-card shadow-sm border light-border-default`}>
        <div className="w-full px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link
                to="/"
                className={`p-2 rounded-md light-text-secondary hover:light-text-primary mr-2 transition-colors`}
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className={`text-xl font-semibold light-text-primary`}>Settings</h1>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="w-full py-6 px-4 space-y-6">
        <div className={`light-bg-card rounded-lg shadow-sm border light-border-default`}>
          <div className="px-6 py-4 border-b light-border-default">
            <div className="flex items-center">
              <User className={`h-5 w-5 light-text-secondary mr-3`} />
              <h2 className={`text-lg font-semibold light-text-primary`}>Profile Settings</h2>
            </div>
            <p className={`mt-1 text-sm light-text-secondary`}>Update your profile information</p>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <label className={`block text-sm font-medium light-text-secondary mb-1`}>Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border light-border-default bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-md shadow-sm cursor-not-allowed"
              />
              <p className={`mt-1 text-xs light-text-secondary`}>Email cannot be changed</p>
            </div>

            <div>
              <label className={`block text-sm font-medium light-text-secondary mb-1`}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border light-border-default light-bg-card light-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your display name"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium light-text-secondary mb-1`}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-4 py-2 light-form-input rounded-lg border light-border-default focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Your username"
              />
              {username && username !== user?.username && username.length >= 3 && (
                <p className="mt-1 text-sm flex items-center gap-1">
                  {checkingUsername ? (
                    <span className="text-gray-500">Checking availability...</span>
                  ) : usernameAvailable === true ? (
                    <span className="text-green-600 dark:text-green-400">
                      ✓ Username is available
                    </span>
                  ) : usernameAvailable === false ? (
                    <span className="text-red-600 dark:text-red-400">
                      ✗ Username is already taken
                    </span>
                  ) : null}
                </p>
              )}
            </div>

            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                className={`inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors`}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </button>
            </div>
          </div>
        </div>

        <div className={`light-bg-card rounded-lg shadow-sm border light-border-default`}>
          <div className="px-6 py-4 border-b light-border-default">
            <div className="flex items-center">
              <Bell className={`h-5 w-5 light-text-secondary mr-3`} />
              <h2 className={`text-lg font-semibold light-text-primary`}>Notifications</h2>
            </div>
            <p className={`mt-1 text-sm light-text-secondary`}>
              Manage your notification preferences
            </p>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div className="border-b light-border-default pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-sm font-medium light-text-primary`}>
                    Browser Notifications
                  </h3>
                  <p className={`text-xs light-text-secondary mt-1`}>
                    Receive notifications about list updates and collaborator activities
                  </p>
                </div>
                <div>
                  <button
                    onClick={handleToggleNotifications}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isToggledOn ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    role="switch"
                    aria-checked={isToggledOn}
                    title={
                      isToggledOn
                        ? 'Click to disable notifications'
                        : 'Click to enable notifications'
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isToggledOn ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {permissionGranted && !notificationsDisabled && (
                <div className="mt-3 flex items-center gap-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${tokenSynced ? 'bg-green-500' : 'bg-yellow-500'}`}
                  />
                  <span
                    className={`text-sm ${tokenSynced ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}
                  >
                    {tokenSynced
                      ? 'Device synced with notification service'
                      : 'Syncing device... (Click Enable if this persists)'}
                  </span>
                </div>
              )}

              {notificationsDisabled && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Notifications disabled
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`light-bg-card rounded-lg shadow-sm border light-border-default`}>
          <div className="px-6 py-4 border-b light-border-default">
            <div className="flex items-center">
              <CloudUpload className={`h-5 w-5 light-text-secondary mr-3`} />
              <h2 className={`text-lg font-semibold light-text-primary`}>Sync</h2>
            </div>
            <p className={`mt-1 text-sm light-text-secondary`}>
              Push local changes (like visited places) to the cloud
            </p>
          </div>

          <div className="px-6 py-4 space-y-3">
            <p className={`text-sm light-text-secondary`}>
              {pendingSyncCount > 0
                ? `${pendingSyncCount} change${pendingSyncCount === 1 ? '' : 's'} waiting to sync.`
                : 'No pending changes in the sync queue. Tap Sync to recover visited statuses saved only on this device.'}
            </p>
            {syncStatusMessage && (
              <p className="text-sm text-amber-800 dark:text-amber-300">{syncStatusMessage}</p>
            )}
            <button
              type="button"
              onClick={() => void handleSyncChanges()}
              disabled={syncingChanges}
              className="inline-flex items-center rounded-lg border light-border-default px-4 py-2 text-sm font-medium light-text-primary transition-colors hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncingChanges ? 'animate-spin' : ''}`} />
              {syncingChanges ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        </div>

        {firebaseUser && (
          <AccountLinking
            user={firebaseUser}
            onAccountLinked={() => {
              // Refresh will happen automatically when the modal re-renders
            }}
          />
        )}

        <div className="light-bg-card rounded-lg shadow-sm border border-red-200 dark:border-red-900">
          <div className="px-6 py-4 border-b border-red-200 dark:border-red-900">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3" />
              <h2 className="text-lg font-semibold text-red-800 dark:text-red-400">Danger Zone</h2>
            </div>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              Permanently delete your account and all lists you own
            </p>
          </div>
          <div className="px-6 py-4">
            <div className="p-4 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-md">
              <h4 className="text-sm font-medium text-red-800 dark:text-red-400 mb-2">
                Delete your SpotSync account
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                This will delete your profile, remove your Firebase account, and delete any lists
                you own. Lists where you are only a collaborator will not be deleted.
              </p>
              <label className="block text-sm font-medium text-red-800 dark:text-red-400 mb-1">
                To confirm, type &quot;<b>{DELETE_ACCOUNT_PHRASE}</b>&quot; in the box below
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-3 py-2 border border-red-300 dark:border-red-800 bg-white dark:bg-gray-800 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder={DELETE_ACCOUNT_PHRASE}
              />
              <div className="mt-4 flex justify-end">
                <LoadingButton
                  type="button"
                  variant="danger"
                  disabled={deleteConfirmText !== DELETE_ACCOUNT_PHRASE || deletingAccount}
                  onClick={() => setShowDeleteAccountConfirm(true)}
                >
                  Delete Account
                </LoadingButton>
              </div>
            </div>
          </div>
        </div>

        <div className={`light-bg-card rounded-lg shadow-sm border light-border-default`}>
          <div className="px-6 py-4">
            <h2 className={`text-lg font-semibold light-text-primary mb-4`}>Account Actions</h2>
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 border light-border-default light-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={showSignOutConfirm}
        title="Sign Out?"
        message="Are you sure you want to sign out?"
        onConfirm={async () => {
          setSigningOut(true);
          await logout();
          setSigningOut(false);
          setShowSignOutConfirm(false);
        }}
        onCancel={() => setShowSignOutConfirm(false)}
        confirmText="Sign Out"
        variant="danger"
        isLoading={signingOut}
      />

      <ConfirmDialog
        isOpen={showDeleteAccountConfirm}
        title="Delete your account?"
        message="This action is permanent and cannot be undone. Your owned lists and account data will be deleted."
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          if (deletingAccount) return;
          setShowDeleteAccountConfirm(false);
        }}
        confirmText="Delete Account"
        variant="danger"
        isLoading={deletingAccount}
      />
    </div>
  );
};
