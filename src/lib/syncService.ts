// src/lib/syncService.ts
import { db } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { getLocalUserId } from './localStorage';

// TÜM VERİYİ BULUTA BAS
export const saveAllToCloud = async (universes: any[]) => {
  const uid = getLocalUserId();
  if (!uid) return;

  console.log("[SYNC]: Cloud backup sequence initiated...");
  const userRef = doc(db, 'users', uid, 'backups', 'latest');
  
  await setDoc(userRef, {
    data: universes,
    last_updated: new Date().toISOString(),
    version: '2.0'
  });
};

// AÇILIŞTA BULUTTAN KONTROL ET
export const syncLocalWithCloud = async () => {
  const uid = getLocalUserId();
  if (!uid) return;

  const userRef = doc(db, 'users', uid, 'backups', 'latest');
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const cloudData = snap.data();
    // Burada cloudData.data'yı alıp LocalStorage'a yazma mantığı kurabilirsin
    console.log("[SYNC]: Cloud sync validated.");
    return cloudData.data;
  }
  return null;
};