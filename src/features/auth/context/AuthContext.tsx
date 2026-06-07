import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { logger } from '@/utils/logger';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  deleteUser,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  updateProfile,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/features/auth/types/user';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string,
    displayName: string
  ) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  connectGoogleMaps: () => Promise<string>; // Returns OAuth access token
  googleMapsConnected: boolean;
  logout: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REGISTRATION_IN_PROGRESS_KEY = 'spotsync_registration_in_progress';
const REGISTRATION_STALE_MS = 60_000;
let registrationInFlight = false;

interface RegistrationProgress {
  uid: string;
  startedAt: number;
}

const isEmailPasswordUser = (fbUser: FirebaseUser): boolean =>
  fbUser.providerData.some((provider) => provider.providerId === 'password');

const setRegistrationInProgress = (uid: string): void => {
  const payload: RegistrationProgress = { uid, startedAt: Date.now() };
  sessionStorage.setItem(REGISTRATION_IN_PROGRESS_KEY, JSON.stringify(payload));
};

const clearRegistrationInProgress = (): void => {
  sessionStorage.removeItem(REGISTRATION_IN_PROGRESS_KEY);
};

const isRegistrationInProgress = (uid: string): boolean => {
  const raw = sessionStorage.getItem(REGISTRATION_IN_PROGRESS_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as RegistrationProgress;
    if (parsed.uid !== uid && parsed.uid !== 'pending') return false;
    return Date.now() - parsed.startedAt < REGISTRATION_STALE_MS;
  } catch {
    // Legacy flag from a crashed registration in a previous page load — treat as stale.
    return false;
  }
};

const waitForUserProfile = async (
  uid: string,
  maxAttempts = 8,
  delayMs = 250
): Promise<User | null> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
};

const buildDefaultUsername = (fbUser: FirebaseUser): string => {
  const emailPrefix = (fbUser.email || '').split('@')[0].toLowerCase().trim();
  return emailPrefix || `user_${fbUser.uid.slice(0, 8)}`;
};

const claimUsernameForUser = async (
  fbUser: FirebaseUser,
  preferredUsername: string
): Promise<string> => {
  const fallbackUsername = `${preferredUsername}_${fbUser.uid.slice(-6)}`;
  const finalFallbackUsername = `user_${fbUser.uid.slice(0, 12)}`;
  const candidates = Array.from(
    new Set([preferredUsername, fallbackUsername, finalFallbackUsername])
  );

  return runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', fbUser.uid);
    const existingUser = await transaction.get(userRef);
    if (existingUser.exists()) {
      return (existingUser.data() as User).username;
    }

    let claimedUsername: string | null = null;
    for (const candidate of candidates) {
      const usernameRef = doc(db, 'usernames', candidate);
      const usernameDoc = await transaction.get(usernameRef);
      if (!usernameDoc.exists()) {
        claimedUsername = candidate;
        transaction.set(usernameRef, { uid: fbUser.uid });
        break;
      }
    }

    if (!claimedUsername) {
      throw new Error('Unable to provision username');
    }

    const newUser: User = {
      id: fbUser.uid,
      username: claimedUsername,
      email: fbUser.email || '',
      displayName: fbUser.displayName || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    transaction.set(userRef, newUser);
    return claimedUsername;
  });
};

// Note: eslint-disable is required here for React Fast Refresh to work correctly
// The useAuth hook must be exported separately from the provider component
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleMapsConnected, setGoogleMapsConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        // Fetch or create user document in Firestore
        const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as User);
        } else if (isEmailPasswordUser(fbUser)) {
          // Email/password registration creates the Firestore profile in register().
          // Wait for that transaction before recovering orphaned auth-only accounts.
          const registrationInProgress = isRegistrationInProgress(fbUser.uid);
          const profile = await waitForUserProfile(
            fbUser.uid,
            registrationInProgress ? 12 : 2,
            registrationInProgress ? 250 : 0
          );

          if (profile) {
            setUser(profile);
          } else if (!registrationInFlight) {
            // Profile never appeared and register() is not running on this page — clear any
            // stale session flag and recover orphaned auth-only accounts (e.g. tab crash).
            clearRegistrationInProgress();
            await claimUsernameForUser(fbUser, buildDefaultUsername(fbUser));
            const provisionedUserDoc = await getDoc(doc(db, 'users', fbUser.uid));
            if (provisionedUserDoc.exists()) {
              setUser(provisionedUserDoc.data() as User);
            }
          }
        } else {
          await claimUsernameForUser(fbUser, buildDefaultUsername(fbUser));
          const provisionedUserDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (provisionedUserDoc.exists()) {
            setUser(provisionedUserDoc.data() as User);
          }
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const register = useCallback(
    async (email: string, password: string, username: string, displayName: string) => {
      registrationInFlight = true;
      setRegistrationInProgress('pending');

      let userCredential: UserCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        setRegistrationInProgress(userCredential.user.uid);
        await updateProfile(userCredential.user, { displayName });

        const normalizedUsername = username.toLowerCase().trim();
        const newUser: User = {
          id: userCredential.user.uid,
          username: normalizedUsername,
          email,
          displayName,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        try {
          await runTransaction(db, async (transaction) => {
            const usernameRef = doc(db, 'usernames', normalizedUsername);
            const usernameDoc = await transaction.get(usernameRef);

            if (usernameDoc.exists()) {
              throw new Error('Username is not available');
            }

            transaction.set(doc(db, 'users', userCredential.user.uid), newUser);
            transaction.set(usernameRef, { uid: userCredential.user.uid });
          });
        } catch (error) {
          try {
            await deleteUser(userCredential.user);
          } catch (deleteError) {
            logger.error('Failed to roll back auth user after registration failure:', deleteError);
            await signOut(auth);
          }
          throw error;
        }

        const createdUserDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (createdUserDoc.exists()) {
          setUser(createdUserDoc.data() as User);
        }

        await sendEmailVerification(userCredential.user);
      } finally {
        registrationInFlight = false;
        clearRegistrationInProgress();
      }
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const sendVerificationEmail = useCallback(async () => {
    if (firebaseUser && !firebaseUser.emailVerified) {
      await sendEmailVerification(firebaseUser);
    }
  }, [firebaseUser]);

  const connectGoogleMaps = useCallback(async (): Promise<string> => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (credential?.accessToken) {
        if (user) {
          await setDoc(
            doc(db, 'users', user.id),
            {
              googleAccessToken: credential.accessToken,
              googleTokenExpiry: Date.now() + 3600000,
            },
            { merge: true }
          );
        }
        setGoogleMapsConnected(true);
        return credential.accessToken;
      }
      throw new Error('Failed to obtain access token');
    } catch (error) {
      logger.error('Error connecting Google:', error);
      throw error;
    }
  }, [user]);

  const value: AuthContextType = React.useMemo(
    () => ({
      user,
      firebaseUser,
      loading,
      login,
      register,
      loginWithGoogle,
      connectGoogleMaps,
      googleMapsConnected,
      logout,
      sendVerificationEmail,
    }),
    [
      user,
      firebaseUser,
      loading,
      login,
      register,
      loginWithGoogle,
      connectGoogleMaps,
      googleMapsConnected,
      logout,
      sendVerificationEmail,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
