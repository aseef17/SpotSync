import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { themeColors } from '@/styles/colors';

export const VerifyEmail: React.FunctionComponent = () => {
  const { firebaseUser, sendVerificationEmail, logout, refreshEmailVerificationStatus } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleCheckVerified = async () => {
    setChecking(true);
    setError('');
    try {
      const verified = await refreshEmailVerificationStatus();
      if (!verified) {
        setError('Email not verified yet. Check your inbox and try again.');
      }
    } catch {
      setError('Could not refresh verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    setSending(true);
    setError('');
    try {
      await sendVerificationEmail();
      setSent(true);
    } catch {
      setError('Failed to send verification email. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center ${themeColors.background.app} px-4`}
    >
      <div className="max-w-md w-full">
        <div
          className={`${themeColors.background.card} py-8 px-6 shadow-lg rounded-lg text-center border ${themeColors.border.default}`}
        >
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-white" />
          </div>
          <h2 className={`text-2xl font-bold ${themeColors.text.primary} mb-2`}>
            Verify your email
          </h2>
          <p className={`${themeColors.text.secondary} mb-6`}>
            We sent a verification link to{' '}
            <span className="font-medium">{firebaseUser?.email}</span>. Please verify your email
            before using SpotSync.
          </p>

          {error && (
            <div className="mb-4 text-sm text-red-600 dark:text-red-400 text-left">{error}</div>
          )}
          {sent && (
            <div className="mb-4 text-sm text-green-600 dark:text-green-400">
              Verification email sent. Check your inbox.
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={sending}
            className="w-full flex justify-center items-center gap-2 py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 mb-4"
          >
            <RefreshCw className={`h-4 w-4 ${sending ? 'animate-spin' : ''}`} />
            {sending ? 'Sending...' : 'Resend verification email'}
          </button>

          <p className={`text-sm ${themeColors.text.secondary} mb-4`}>
            Already verified?{' '}
            <button
              onClick={handleCheckVerified}
              disabled={checking}
              className="text-blue-600 hover:text-blue-500 font-medium disabled:opacity-50"
            >
              {checking ? 'Checking...' : 'Refresh verification status'}
            </button>
          </p>

          <div className="flex flex-col gap-2 text-sm">
            <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
              Back to sign in
            </Link>
            <button
              onClick={() => logout()}
              className={`${themeColors.text.secondary} hover:${themeColors.text.primary}`}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
