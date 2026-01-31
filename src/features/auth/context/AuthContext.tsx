import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { logger } from '@/utils/logger';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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
        } else {
          // Create new user document
          const newUser: User = {
            id: fbUser.uid,
            username: fbUser.email || '',
            email: fbUser.email || '',
            displayName: fbUser.displayName || '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(doc(db, 'users', fbUser.uid), newUser);

          // Also sync with usernames collection
          const normalizedUsername = newUser.username.toLowerCase().trim();
          await setDoc(doc(db, 'usernames', normalizedUsername), {
            uid: fbUser.uid,
          });

          setUser(newUser);
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });

      // Create user document
      const newUser: User = {
        id: userCredential.user.uid,
        username,
        email,
        displayName,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create user document
      await setDoc(doc(db, 'users', userCredential.user.uid), newUser);

      // Create username mapping for availability checks
      const normalizedUsername = username.toLowerCase().trim();
      await setDoc(doc(db, 'usernames', normalizedUsername), {
        uid: userCredential.user.uid,
      });

      await sendEmailVerification(userCredential.user);
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
