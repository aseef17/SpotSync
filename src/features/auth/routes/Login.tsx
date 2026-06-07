import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { logger } from '@/utils/logger';
import { themeColors } from '@/styles/colors';

export const Login: React.FunctionComponent = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const { login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      logger.error('Login error:', err);
      if (err instanceof Error && err.message === 'EMAIL_NOT_VERIFIED') {
        setError(
          'Please verify your email before signing in. We sent you a new verification link.'
        );
      } else {
        setError('Failed to sign in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      await resetPassword(resetEmail || email);
      setResetSent(true);
      setInfo('Password reset email sent. Check your inbox.');
    } catch (err) {
      logger.error('Reset password error:', err);
      setError('Failed to send reset email. Please check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      logger.error('Google login error:', err);
      setError('Failed to sign in with Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center ${themeColors.background.app} px-4 transition-colors`}
    >
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-transparent rounded-lg flex items-center justify-center overflow-hidden">
            <img src="/mappin-icon.svg" alt="Place Lists" className="h-12 w-12 object-contain" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">Welcome back</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in to your account to manage your place lists
          </p>
        </div>

        <div
          className={`${themeColors.background.card} py-8 px-6 shadow-lg rounded-lg transition-colors`}
        >
          {error && (
            <div className="mb-4 bg-white dark:bg-gray-800 border-l-4 border-red-500 shadow-sm p-4 text-sm text-gray-900 dark:text-gray-100">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 bg-white dark:bg-gray-800 border-l-4 border-green-500 shadow-sm p-4 text-sm text-gray-900 dark:text-gray-100">
              {info}
            </div>
          )}

          {showResetPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <p className={`text-sm ${themeColors.text.secondary}`}>
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <div>
                <label
                  htmlFor="resetEmail"
                  className={`block text-sm font-medium ${themeColors.form.label}`}
                >
                  Email address
                </label>
                <input
                  id="resetEmail"
                  name="resetEmail"
                  type="email"
                  autoComplete="email"
                  required
                  value={resetEmail || email}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className={`mt-1 block w-full px-3 py-2 ${themeColors.form.input} rounded-md shadow-sm focus:outline-none transition-colors`}
                />
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={loading || resetSent}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPassword(false);
                    setResetSent(false);
                    setInfo('');
                    setError('');
                  }}
                  className={`text-sm ${themeColors.text.secondary} hover:${themeColors.text.primary}`}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className={`block text-sm font-medium ${themeColors.form.label}`}
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1 block w-full px-3 py-2 ${themeColors.form.input} rounded-md shadow-sm focus:outline-none transition-colors`}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className={`block text-sm font-medium ${themeColors.form.label}`}
                >
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`block w-full px-3 py-2 pr-10 ${themeColors.form.input} rounded-md shadow-sm focus:outline-none transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetPassword(true);
                      setResetEmail(email);
                      setError('');
                      setInfo('');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
          )}

          {!showResetPassword && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    Or continue with
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign in with Google
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/register"
              className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
            >
              Don't have an account? Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
