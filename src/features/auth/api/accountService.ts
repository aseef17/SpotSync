import { httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, functions } from '@/lib/firebase';
import { logger } from '@/utils/logger';

const DELETE_ACCOUNT_TIMEOUT_MS = 540_000;

export function getCallableErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const firebaseError = error as { code?: string; message?: string };
    if (firebaseError.code === 'functions/deadline-exceeded') {
      return 'Account deletion timed out. Please try again in a moment.';
    }
    if (firebaseError.code === 'functions/unavailable') {
      return 'Delete service is temporarily unavailable. Please try again.';
    }
    if (firebaseError.code === 'functions/not-found') {
      return 'Account deletion is not available yet. Please try again after the latest deploy.';
    }
    if (firebaseError.message) {
      return firebaseError.message;
    }
  }
  return fallback;
}

export class AccountService {
  static async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email.trim());
  }

  static async deleteAccount(): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be signed in to delete your account.');
    }

    await currentUser.getIdToken(true);

    const deleteAccountFn = httpsCallable<void, { success: boolean }>(functions, 'deleteAccount', {
      timeout: DELETE_ACCOUNT_TIMEOUT_MS,
    });

    logger.info('Starting account deletion via deleteAccount callable');
    const result = await deleteAccountFn();

    if (!result.data?.success) {
      throw new Error('Account deletion did not complete successfully.');
    }
  }
}

export async function checkUsernameExistsRemote(username: string): Promise<boolean> {
  try {
    const checkFn = httpsCallable<{ username: string }, { exists: boolean }>(
      functions,
      'checkUsernameExists'
    );
    const result = await checkFn({ username });
    return result.data.exists;
  } catch (error) {
    logger.error('Remote username check failed:', error);
    throw error;
  }
}
