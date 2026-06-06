import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Bell, LogOut, Save } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { ThemeToggle } from '@/components/Elements/Theme/ThemeToggle';
import { AccountLinking } from '@/features/auth/components/AccountLinking';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import { useProfile } from '@/features/auth/hooks/useProfile';
import { useToast } from '@/hooks/useToast';
import { useDeferredAction } from '@/hooks/useDeferredAction';

export const Settings: React.FunctionComponent = () => {
  const { user, firebaseUser, logout } = useAuth();
  const { toast } = useToast();
  const {
    permissionGranted,
    tokenSynced,
    notificationsDisabled,
    requestPermission,
    disableNotifications,
  } = useNotifications();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  const handleSaveProfile = async () => {
    // Check if values actually changed
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

  return (
    <div className={`min-h-screen light-bg-app transition-colors`}>
      <header className={`light-bg-card shadow-sm border light-border-default`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

      <main className="max-w-3xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Profile Settings Section */}
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

        {/* Notifications Section */}
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

              {/* Status indicator - only show when permission granted and not disabled */}
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

              {/* Show disabled message when user explicitly disabled notifications */}
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

        {/* Account Linking Section */}
        {firebaseUser && (
          <div className="space-y-6">
            <AccountLinking
              user={firebaseUser}
              onAccountLinked={() => {
                // Refresh will happen automatically when the modal re-renders
              }}
            />
          </div>
        )}

        {/* Account Actions */}
        <div className={`light-bg-card rounded-lg shadow-sm border light-border-default`}>
          <div className="px-6 py-4">
            <h2 className={`text-lg font-semibold light-text-primary mb-4`}>Account Actions</h2>
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </main>

      {/* Sign Out Confirmation */}
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
    </div>
  );
};
