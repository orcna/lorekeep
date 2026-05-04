import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider, 
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence, // Tarayıcı kapandığında siler
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { createLocalUser, getCurrentUserNickname } from './localStorage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DB_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

const USER_ID_KEY = 'lorekeep_user_id';
const CURRENT_USER_KEY = 'lorekeep_current_user'; // Entegrasyon mühürü
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * 🛡️ PERSISTENCE_SHIELD: Remember Me seçimine göre oturum tipini ayarlar.
 */
export async function setupAuthPersistence(remember: boolean) {
  const mode = remember ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, mode);
}

export async function signInLocal(username?: string): Promise<{ uid: string }> {
  try {
    const result = await signInAnonymously(auth);
    localStorage.setItem(USER_ID_KEY, result.user.uid);
    createLocalUser(username || 'Local User', 'local');
    return result.user;
  } catch (error) {
    const localId = localStorage.getItem(USER_ID_KEY) || `local_${Date.now()}`;
    localStorage.setItem(USER_ID_KEY, localId);
    createLocalUser(username || 'Local User', 'local');
    return { uid: localId };
  }
}

export async function signInWithGoogle(): Promise<any> {
  const result = await signInWithPopup(auth, googleProvider);
  localStorage.setItem(USER_ID_KEY, result.user.uid);
  createLocalUser(result.user.displayName || 'Google User', 'google');
  return result.user;
}

export const signOut = async () => {
  await firebaseSignOut(auth).catch(() => undefined);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(CURRENT_USER_KEY); // App.tsx'in çıkışı fark etmesi için
};

export function getCurrentUserId() { 
  return auth.currentUser?.uid || localStorage.getItem(USER_ID_KEY) || ''; 
}

export function getCurrentUserDisplayName(): string { 
  return getCurrentUserNickname(); 
}