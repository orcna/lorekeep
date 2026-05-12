import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider, 
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { createLocalUser, getCurrentUserNickname } from './localStorage';

// 🛡️ HYBRID CONFIG LOGIC
const getFirebaseConfig = () => {
  // 1. SetupWizard üzerinden kaydedilmiş bir konfigürasyon var mı? (Paketli sürüm için)
  const savedConfig = localStorage.getItem('lorekeep_firebase_config');
  if (savedConfig) {
    try {
      return JSON.parse(savedConfig);
    } catch (e) {
      console.error("Saved config corrupted.");
    }
  }

  // 2. Yoksa .env dosyasına bak (Geliştirme aşaması için)
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DB_ID,
  };
};

const firebaseConfig = getFirebaseConfig();

// 🛡️ CRASH PREVENTERS
export let db: any = {};
export let auth: any = { currentUser: null }; 

// Firebase'in aktif olup olmadığını kontrol eden mühür
export const isFirebaseActive = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'undefined';

if (isFirebaseActive) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
    auth = getAuth(app);
  } catch (error) {
    console.error("Firebase Initialization Failure:", error);
  }
} else {
  console.warn("⚠️ SYSTEM WARNING: NO API KEYS DETECTED. OPERATING IN LOCAL MODE.");
}

const USER_ID_KEY = 'lorekeep_user_id';
const CURRENT_USER_KEY = 'lorekeep_current_user';
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function setupAuthPersistence(remember: boolean) {
  if (!isFirebaseActive) return;
  const mode = remember ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, mode);
}

export async function signInLocal(username?: string): Promise<{ uid: string }> {
  try {
    if (!isFirebaseActive) throw new Error("API Offline");
    
    const result = await signInAnonymously(auth);
    localStorage.setItem(USER_ID_KEY, result.user.uid);
    createLocalUser(username || 'Operator', 'local');
    return result.user;
  } catch (error) {
    // API yoksa veya hata verirse Local ID mühürle
    const localId = localStorage.getItem(USER_ID_KEY) || `local_${Date.now()}`;
    localStorage.setItem(USER_ID_KEY, localId);
    createLocalUser(username || 'Local Operator', 'local');
    return { uid: localId };
  }
}

export async function signInWithGoogle(): Promise<any> {
  if (!isFirebaseActive) throw new Error("Cloud nexus is offline.");
  // ⚡ Electron tarafında User-Agent set edilmiş olmalı!
  const result = await signInWithPopup(auth, googleProvider);
  localStorage.setItem(USER_ID_KEY, result.user.uid);
  createLocalUser(result.user.displayName || 'Google User', 'google');
  return result.user;
}

export const signOut = async () => {
  if (isFirebaseActive && auth.signOut) {
    await firebaseSignOut(auth).catch(() => undefined);
  }
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
};

export function getCurrentUserId() { 
  return auth?.currentUser?.uid || localStorage.getItem(USER_ID_KEY) || ''; 
}

export function getCurrentUserDisplayName(): string { 
  return getCurrentUserNickname(); 
}