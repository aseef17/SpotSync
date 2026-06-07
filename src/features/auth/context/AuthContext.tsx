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
  reload,
  updateProfile,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import type { User } from '@/features/auth/types/user';
import {
  AccountService,
  checkUsernameExistsRemote,
} from '@/features/auth/api/accountService';
import {
  REGISTRATION_HEARTBEAT_MS,
  beginRegistrationSession,
  clearRegistrationProgress,
  endRegistrationSession,
  isRegistrationInProgress,
  isUsernameOwnedByUid,
  shouldDeleteAuthUserOnRegistrationFailure,
  writeRegistrationProgress,
} from '@/features/auth/lib/registrationGuard';

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
  resetPassword: (email: string) => Promise<void>;
  requiresEmailVerification: boolean;
  refreshEmailVerificationStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

let registrationInFlightCount = 0;

const isRegistrationInFlight = (): boolean => registrationInFlightCount > 0;

const isEmailPasswordUser = (fbUser: FirebaseUser): boolean =>
  fbUser.providerData.some((provider) => provider.providerId === 'password');

const loadUserProfile = async (uid: string): Promise<User | null> => {
  try {
    const cached = await getDocFromCache(doc(db, 'users', uid));
    if (cached.exists()) {
      return cached.data() as User;
    }
  } catch {
    // Not in local cache yet.
  }

  if (!isBrowserOnline()) {
    return null;
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
  } catch (error) {
    logger.error('Failed to load user profile:', error);
  }

  return null;
};

const waitForUserProfile = async (
  uid: string,
  maxAttempts = 8,
  delayMs = 250,
  options?: { fromServer?: boolean }
): Promise<User | null> => {
  const readUserDoc = options?.fromServer
    ? (userRef: ReturnType<typeof doc>) => getDocFromServer(userRef)
    : (userRef: ReturnType<typeof doc>) => getDoc(userRef);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!options?.fromServer && !isBrowserOnline()) {
      return loadUserProfile(uid);
    }

    const userDoc = await readUserDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
};

// registrationInFlightCount is per-tab; localStorage is shared. Poll until the other
// tab clears its flag or the heartbeat goes stale before running orphan recovery.
// Do not cap this with a wall-clock deadline: register() heartbeats refresh startedAt,
// so an active signup can outlive any fixed wait and orphan recovery would race it.
const waitForCrossTabRegistration = async (uid: string): Promise<User | null> => {
  while (isRegistrationInProgress(uid)) {
    const profile = await waitForUserProfile(uid, 1, 0, { fromServer: true });
    if (profile) {
      return profile;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return waitForUserProfile(uid, 4, 250, { fromServer: true });
};

const buildDefaultUsername = (fbUser: FirebaseUser): string => {
  const emailPrefix = (fbUser.email || '').split('@')[0].toLowerCase().trim();
  return emailPrefix || `user_${fbUser.uid.slice(0, 8)}`;
};

const buildFallbackUserFromAuth = (fbUser: FirebaseUser): User => ({
  id: fbUser.uid,
  username: buildDefaultUsername(fbUser),
  email: fbUser.email || '',
  displayName: fbUser.displayName || '',
  createdAt: new Date(),
  updatedAt: new Date(),
});

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

      const ownerUid = usernameDoc.data()?.uid as string | undefined;
      if (ownerUid === fbUser.uid) {
        claimedUsername = candidate;
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
  const [authUserVersion, setAuthUserVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (fbUser) {
          setFirebaseUser(fbUser);

          let profile = await loadUserProfile(fbUser.uid);
          if (profile) {
            setUser(profile);
          } else if (isEmailPasswordUser(fbUser)) {
            // Email/password registration creates the Firestore profile in register().
            // Wait for that transaction before recovering orphaned auth-only accounts.
            const registrationInProgress = isRegistrationInProgress(fbUser.uid);
            profile = await waitForUserProfile(
              fbUser.uid,
              registrationInProgress ? 12 : 2,
              registrationInProgress ? 250 : 0
            );

            if (profile) {
              setUser(profile);
            } else if (!isBrowserOnline()) {
              setUser(buildFallbackUserFromAuth(fbUser));
            } else if (!isRegistrationInFlight()) {
              // Heartbeat in another tab can refresh the flag after a stale read — keep waiting
              // until register() finishes so we do not race orphan recovery, but do not stop early
              // if the flag is refreshed between waitForCrossTabRegistration and this check.
              while (isRegistrationInProgress(fbUser.uid)) {
                profile = await waitForCrossTabRegistration(fbUser.uid);
                if (profile) {
                  break;
                }
              }

              if (profile) {
                setUser(profile);
              } else if (isRegistrationInProgress(fbUser.uid)) {
                // Another tab is still heartbeating register(); keep waiting instead of racing recovery.
                profile = await waitForCrossTabRegistration(fbUser.uid);
                if (profile) {
                  setUser(profile);
                }
              } else {
                // Profile never appeared and register() is not running on this page — clear any
                // stale registration flag and recover orphaned auth-only accounts (e.g. tab crash).
                clearRegistrationProgress(fbUser.uid);
                await claimUsernameForUser(fbUser, buildDefaultUsername(fbUser));
                const provisionedUserDoc = await getDocFromServer(doc(db, 'users', fbUser.uid));
                if (provisionedUserDoc.exists()) {
                  setUser(provisionedUserDoc.data() as User);
                } else {
                  setUser(buildFallbackUserFromAuth(fbUser));
                }
              }
            }
          } else if (!isBrowserOnline()) {
            setUser(buildFallbackUserFromAuth(fbUser));
          } else {
            await claimUsernameForUser(fbUser, buildDefaultUsername(fbUser));
            const provisionedUserDoc = await getDocFromServer(doc(db, 'users', fbUser.uid));
            if (provisionedUserDoc.exists()) {
              setUser(provisionedUserDoc.data() as User);
            } else {
              setUser(buildFallbackUserFromAuth(fbUser));
            }
          }
        } else {
          setFirebaseUser(null);
          setUser(null);
        }
      } catch (error) {
        logger.error('Auth state handler failed:', error);
        if (fbUser) {
          setUser(buildFallbackUserFromAuth(fbUser));
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);
      throw new Error('EMAIL_NOT_VERIFIED');
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, username: string, displayName: string) => {
      registrationInFlightCount++;
      beginRegistrationSession();
      writeRegistrationProgress('pending');

      // Refresh the cross-tab registration flag while register() is still running so a second
      // tab does not treat a slow signup as stale and run orphan recovery in parallel.
      let heartbeatUid = 'pending';
      const heartbeat = window.setInterval(() => {
        writeRegistrationProgress(heartbeatUid);
      }, REGISTRATION_HEARTBEAT_MS);

      let userCredential: UserCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        heartbeatUid = userCredential.user.uid;
        writeRegistrationProgress(userCredential.user.uid);
        await updateProfile(userCredential.user, { displayName });

        const normalizedUsername = username.toLowerCase().trim();
        if (await checkUsernameExistsRemote(normalizedUsername)) {
          throw new Error('Username is not available');
        }

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
            const userRef = doc(db, 'users', userCredential.user.uid);
            const usernameRef = doc(db, 'usernames', normalizedUsername);
            const usernameDoc = await transaction.get(usernameRef);

            if (usernameDoc.exists()) {
              const usernameOwnerUid = usernameDoc.data()?.uid as string | undefined;
              if (usernameOwnerUid === userCredential.user.uid) {
                const userDoc = await transaction.get(userRef);
                if (userDoc.exists()) {
                  // Orphan recovery may have already provisioned this account in another tab.
                  transaction.update(userRef, {
                    displayName,
                    email,
                    updatedAt: new Date(),
                  });
                  return;
                }

                // Username already reserved for this uid; complete the missing profile.
                transaction.set(userRef, newUser);
                return;
              }
              throw new Error('Username is not available');
            }

            transaction.set(userRef, newUser);
            transaction.set(usernameRef, { uid: userCredential.user.uid });
          });
        } catch (error) {
          const userRef = doc(db, 'users', userCredential.user.uid);
          const usernameRef = doc(db, 'usernames', normalizedUsername);
          // Persistent cache may still show "no profile" after cross-tab orphan recovery.
          const [userDoc, usernameDoc] = await Promise.all([
            getDocFromServer(userRef),
            getDocFromServer(usernameRef),
          ]);
          const usernameOwnerUid = usernameDoc.data()?.uid as string | undefined;
          const rollbackOptions = {
            userProfileExists: userDoc.exists(),
            usernameExists: usernameDoc.exists(),
            usernameOwnerUid,
            registeringUid: userCredential.user.uid,
          };

          if (!shouldDeleteAuthUserOnRegistrationFailure(rollbackOptions)) {
            if (userDoc.exists()) {
              setUser(userDoc.data() as User);
              await sendEmailVerification(userCredential.user);
              return;
            }

            if (
              usernameDoc.exists() &&
              isUsernameOwnedByUid(usernameOwnerUid, userCredential.user.uid)
            ) {
              await claimUsernameForUser(userCredential.user, normalizedUsername);
              const provisionedUserDoc = await getDocFromServer(userRef);
              if (provisionedUserDoc.exists()) {
                setUser(provisionedUserDoc.data() as User);
                await sendEmailVerification(userCredential.user);
                return;
              }
            }
          }

          if (shouldDeleteAuthUserOnRegistrationFailure(rollbackOptions)) {
            try {
              await deleteUser(userCredential.user);
            } catch (deleteError) {
              logger.error(
                'Failed to roll back auth user after registration failure:',
                deleteError
              );
              await signOut(auth);
            }
          }
          throw error;
        }

        const createdUserDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (createdUserDoc.exists()) {
          setUser(createdUserDoc.data() as User);
        }

        await sendEmailVerification(userCredential.user);
      } finally {
        window.clearInterval(heartbeat);
        const completedUid = heartbeatUid;
        registrationInFlightCount--;
        const remainingSessions = endRegistrationSession();
        // Only drop this registration's uid key; keep pending while another register() is in flight.
        if (completedUid !== 'pending') {
          clearRegistrationProgress(completedUid);
        }
        if (registrationInFlightCount === 0 && remainingSessions === 0) {
          clearRegistrationProgress();
        }
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

  const resetPassword = useCallback(async (email: string) => {
    await AccountService.resetPassword(email);
  }, []);

  const refreshEmailVerificationStatus = useCallback(async (): Promise<boolean> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    await reload(currentUser);
    setFirebaseUser(auth.currentUser);
    setAuthUserVersion((version) => version + 1);
    return Boolean(auth.currentUser?.emailVerified);
  }, []);

  const requiresEmailVerification = React.useMemo(() => {
    if (!firebaseUser) return false;
    void authUserVersion;
    return isEmailPasswordUser(firebaseUser) && !firebaseUser.emailVerified;
  }, [firebaseUser, authUserVersion]);

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
      resetPassword,
      requiresEmailVerification,
      refreshEmailVerificationStatus,
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
      resetPassword,
      requiresEmailVerification,
      refreshEmailVerificationStatus,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
