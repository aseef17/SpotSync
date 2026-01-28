import React, { useState } from 'react';
import {
  linkWithPopup,
  GoogleAuthProvider,
  unlink,
  type User as FirebaseUser,
} from 'firebase/auth';
import { logger } from '@/utils/logger';

interface AccountLinkingProps {
  user: FirebaseUser;
  onAccountLinked: () => void;
}

export const AccountLinking: React.FC<AccountLinkingProps> = ({ user, onAccountLinked }) => {
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has Google provider linked
  const hasGoogleProvider = user.providerData.some(
    (provider) => provider.providerId === 'google.com'
  );

  const handleLinkGoogle = async () => {
    setLinking(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(user, provider);
      logger.info('Account linked successfully');
      onAccountLinked();
    } catch (err: unknown) {
      logger.error('Account linking failed:', err);
      if (err instanceof Error && 'code' in err) {
        if (err.code === 'auth/credential-already-in-use') {
          setError('This Google account is already linked to another user.');
        } else if (err.code === 'auth/provider-already-linked') {
          setError('This Google account is already linked to your account.');
        } else {
          setError('Failed to link Google account. Please try again.');
        }
      } else {
        setError('Failed to link Google account. Please try again.');
      }
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!hasGoogleProvider) return;

    // Don't allow unlinking if it's the only provider
    if (user.providerData.length === 1) {
      setError(
        'You cannot unlink your only sign-in method. Please add another sign-in method first.'
      );
      return;
    }

    setLinking(true);
    setError(null);

    try {
      await unlink(user, 'google.com');
      logger.info('Google account unlinked successfully');
      onAccountLinked();
    } catch (err: unknown) {
      logger.error('Account unlinking failed:', err);
      setError('Failed to unlink Google account. Please try again.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="light-bg-card rounded-lg shadow-sm border light-border-default p-6">
      <h3 className="text-lg font-medium light-text-primary mb-4">Account Linking</h3>

      <div className="space-y-4">
        {/* Current Providers */}
        <div>
          <h4 className="text-sm font-medium light-text-secondary mb-2">Current Sign-in Methods</h4>
          <div className="space-y-2">
            {user.providerData.map((provider) => (
              <div
                key={provider.providerId}
                className="flex items-center justify-between p-3 light-bg-app rounded-lg light-border-default"
              >
                <div className="flex items-center">
                  {provider.providerId === 'password' && (
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                    </div>
                  )}
                  {provider.providerId === 'google.com' && (
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium light-text-primary">
                      {provider.providerId === 'password' ? 'Email/Password' : 'Google'}
                    </div>
                    <div className="text-xs light-text-secondary">{provider.email}</div>
                  </div>
                </div>
                {provider.providerId === 'google.com' && user.providerData.length > 1 && (
                  <button
                    onClick={handleUnlinkGoogle}
                    disabled={linking}
                    className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                  >
                    Unlink
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Link Google Account */}
        {!hasGoogleProvider && (
          <div>
            <h4 className="text-sm font-medium light-text-secondary mb-2">
              Link Additional Sign-in Method
            </h4>
            <div className="p-4 border-2 border-dashed light-border-default rounded-lg">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 light-text-secondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                <div className="mt-2">
                  <button
                    onClick={handleLinkGoogle}
                    disabled={linking}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    {linking ? 'Linking...' : 'Link Google Account'}
                  </button>
                  <p className="mt-2 text-sm light-text-secondary">
                    Link your Google account to sign in with either email/password or Google
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
