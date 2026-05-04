import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, query, where, onSnapshot, 
  setDoc, doc, deleteDoc, getDocs 
} from 'firebase/firestore';
import {
  getLocalUserId,
  getUniverses as getLocalUniverses,
  createUniverse as createLocalUniverse,
  updateUniverse as updateLocalUniverse,
  getCurrentUser,
} from '../lib/localStorage';
import { Universe } from '../lib/types';

interface UniverseContextType {
  universes: Universe[];
  activeUniverse: Universe | null;
  setActiveUniverse: (u: Universe | null) => void;
  isLoading: boolean;
  createUniverse: (name: string, description: string) => Promise<string | undefined>;
  updateUniverse: (id: string, name: string, description: string) => Promise<void>;
  deleteUniverse: (id: string) => Promise<void>;
  saveUniverseMapState: (
    id: string,
    imageUrl: string,
    useLineart: boolean,
    markers: { loreId: string; x: number; y: number }[]
  ) => Promise<void>;
}

const UniverseContext = createContext<UniverseContextType | undefined>(undefined);

export const UniverseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [activeUniverse, setActiveUniverse] = useState<Universe | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // CORE_BOOT: Hibrit Senkronizasyon (Operatör Duyarlı)
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      // 1. Önce aktif operatörün yerel verilerini her durumda yükle (Hızlı erişim)
      const initialLocal = getLocalUniverses(); 
      setUniverses(initialLocal);

      if (user) {
        // GOOGLE OPERATÖRÜ: Firestore senkronizasyonunu başlat
        const q = query(collection(db, 'universes'), where('userId', '==', user.uid));
        let isFirstSnapshot = true;

        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const remoteUniverses = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Universe[];
          
          // ANTI-NUKE LOGIC: Bulut boşsa ama yerel doluysa yereli koru
          if (remoteUniverses.length === 0 && initialLocal.length > 0 && isFirstSnapshot) {
            setUniverses(initialLocal);
          } else {
            setUniverses(remoteUniverses);
          }
          
          isFirstSnapshot = false; 
          setIsLoading(false);
        }, (error) => {
          console.error("[SYNC_ERROR]:", error.message);
          setIsLoading(false);
        });
      } else {
        // YEREL OPERATÖR: Sadece yerel verilerle devam et
        const localOp = getCurrentUser();
        if (localOp) {
          setUniverses(initialLocal);
        }
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const createUniverse = async (name: string, description: string) => {
    const next = createLocalUniverse(name, description); // Yerel mühür
    
    setUniverses(prev => [...prev, next]);
    setActiveUniverse(next);

    if (auth.currentUser) {
      await setDoc(doc(db, 'universes', next.id), {
        ...next,
        userId: auth.currentUser.uid,
        updatedAt: new Date().toISOString()
      });
    }
    return next.id;
  };

  const updateUniverse = async (id: string, name: string, description: string) => {
    updateLocalUniverse(id, name, description);
    if (auth.currentUser) {
      await setDoc(doc(db, 'universes', id), { 
        name, description, 
        userId: auth.currentUser.uid, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
    }
  };

  const deleteUniverse = async (id: string) => {
    const user = getCurrentUser();
    const userId = auth.currentUser?.uid || user?.id || 'guest';

    // 🛡️ DÜZELTME: Sadece mevcut operatörün listesinden siler[cite: 5]
    const filtered = universes.filter(u => u.id !== id);
    setUniverses(filtered);
    
    const cacheKeys = [`lore_cache_${id}`, `map_cache_${id}`, `mindmap_cache_${id}`, `script_cache_${id}`, `chat_cache_${id}`];
    cacheKeys.forEach(k => localStorage.removeItem(k));

    if (activeUniverse?.id === id) {
      setActiveUniverse(filtered[0] || null);
    }

    // Fiziksel silme işlemi (localStorage.ts içindeki deleteUniverse zaten mühürlendi)
    if (auth.currentUser) {
      try {
        const collections = ['lore', 'markers', 'mapConfigs', 'scripts', 'messages', 'chats'];
        for (const col of collections) {
          const q = query(collection(db, col), where('universeId', '==', id));
          const snap = await getDocs(q);
          await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))));
        }
        await deleteDoc(doc(db, 'universes', id));
      } catch (err) {
        console.error("[PURGE_ERROR]:", err);
      }
    }
  };

  const saveUniverseMapState = async (id: string, imageUrl: string, useLineart: boolean, markers: any[]) => {
    const mapState = { imageUrl, useLineart, markers, updatedAt: new Date().toISOString() };
    localStorage.setItem(`map_cache_${id}`, JSON.stringify(mapState));

    if (auth.currentUser) {
      await setDoc(doc(db, 'mapConfigs', id), { ...mapState, universeId: id, userId: auth.currentUser.uid }, { merge: true });
    }
  };

  return (
    <UniverseContext.Provider value={{
      universes, activeUniverse, setActiveUniverse,
      isLoading, createUniverse, updateUniverse, deleteUniverse, saveUniverseMapState,
    }}>
      {children}
    </UniverseContext.Provider>
  );
};

export const useUniverse = () => {
  const ctx = useContext(UniverseContext);
  if (!ctx) throw new Error('useUniverse must be used within a UniverseProvider');
  return ctx;
};