import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence to drastically reduce Firestore daily quota reads
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence unsupported in browser');
    }
  });
}

const provider = new GoogleAuthProvider();
// Force Google to show account selection prompt so user can choose alternative accounts
provider.setCustomParameters({
  prompt: 'select_account'
});
// Add required Google Sheets and Google Drive scopes
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');

// Flag to track sign-in state
let isSigningIn = false;
// Secure access token cache (memory + sessionStorage)
let cachedAccessToken: string | null = typeof window !== 'undefined' ? sessionStorage.getItem('google_access_token') : null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check redirect result on load
  getRedirectResult(auth).then(result => {
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        sessionStorage.setItem('google_access_token', credential.accessToken);
        sessionStorage.setItem('pea_session_active', 'true');
        if (auth.currentUser && onAuthSuccess) {
          onAuthSuccess(auth.currentUser, cachedAccessToken);
        }
      }
    }
  }).catch(err => {
    console.warn("getRedirectResult on load error:", err);
  });

  return onAuthStateChanged(auth, async (user: User | null) => {
    const isTabSessionActive = sessionStorage.getItem('pea_session_active') === 'true';

    if (user && isTabSessionActive) {
      if (!cachedAccessToken) {
        cachedAccessToken = sessionStorage.getItem('google_access_token');
      }
      if (!cachedAccessToken) {
        try {
          const result = await getRedirectResult(auth);
          if (result) {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
              cachedAccessToken = credential.accessToken;
              sessionStorage.setItem('google_access_token', credential.accessToken);
              sessionStorage.setItem('pea_session_active', 'true');
            }
          }
        } catch (e) {
          console.warn("Error getting redirect result in auth state change:", e);
        }
      }
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || '');
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem('google_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    sessionStorage.setItem('pea_session_active', 'true');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Access Token from Authentication');
    }
    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('google_access_token', credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    sessionStorage.removeItem('pea_session_active');
    if (error?.code === 'auth/popup-closed-by-user') {
      console.warn('Sign-in popup closed by user.');
      return null;
    }
    if (error?.code === 'auth/cancelled-popup-request') {
      console.warn('Sign-in popup cancelled by a subsequent request.');
      return null;
    }
    if (error?.code === 'auth/popup-blocked' || error?.message?.includes('popup') || error?.message?.includes('blocked')) {
      console.warn('Sign-in popup was blocked. Attempting redirect sign-in...');
      try {
        sessionStorage.setItem('pea_session_active', 'true');
        await signInWithRedirect(auth, provider);
        return null;
      } catch (redirectErr: any) {
        console.error("Redirect sign-in error:", redirectErr);
        throw new Error('Sign-in popup was blocked by your browser. Please click "Sign In with Redirect" below or open the app in a new tab.');
      }
    }
    if (error?.code === 'auth/unauthorized-domain') {
      throw new Error(`Domain not authorized. Please go to the Firebase Console -> project576-2f16f -> Authentication -> Settings -> Authorized Domains, and add the current domain.`);
    }
    if (error?.message?.includes('access_denied') || error?.code === 'auth/internal-error') {
      console.error('Google Auth Login Error:', error);
      throw new Error(`Google OAuth Access Denied. Your app is likely in "Testing" mode. Please go to Google Cloud Console -> APIs & Services -> OAuth consent screen, and either "Publish App" or add your email (${error?.customData?.email || 'your email'}) to the "Test users" list.`);
    }
    console.error('Google Auth Login Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const googleSignInWithRedirect = async (): Promise<void> => {
  isSigningIn = true;
  sessionStorage.setItem('pea_session_active', 'true');
  await signInWithRedirect(auth, provider);
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem('google_access_token');
  sessionStorage.removeItem('pea_session_active');
};
