// Local storage service - works entirely offline
// Segmented by Operator ID for multi-account support

import { Universe, LoreEntry, ChatMessage, MapMarker } from './types';

interface LocalDB {
  userId: string;
  universes: Universe[];
  lore: LoreEntry[];
  chats: ChatMessage[];
  markers: MapMarker[];
  lastSync: number;
}

interface LocalUser {
  id: string;
  nickname: string;
  createdAt: number;
  lastLogin: number;
  authMethod: 'local' | 'google' | 'guest';
}

const USER_ID_KEY = 'lorekeep_user_id';
const USERS_DB_KEY = 'lorekeep_users_db';
const CURRENT_USER_KEY = 'lorekeep_current_user';

/**
 * 🛡️ OPERATOR_SHIELD: Her kullanıcı için benzersiz bir depo anahtarı üretir.
 */
function getStorageKey(userId: string): string {
  return `lorekeep_db_${userId}`;
}

/**
 * 🛡️ DÜZELTME: Veritabanını mevcut kullanıcıya göre yükler.
 */
function getLocalDB(userId: string): LocalDB {
  const userKey = getStorageKey(userId);
  const stored = localStorage.getItem(userKey);
  
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Database corruption detected for user:", userId);
    }
  }
  
  return {
    userId: userId,
    universes: [],
    lore: [],
    chats: [],
    markers: [],
    lastSync: 0,
  };
}

/**
 * 🛡️ DÜZELTME: Verileri kullanıcıya özel anahtarla kaydeder.
 */
function saveLocalDB(userId: string, db: LocalDB): void {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(db));
}

export function getLocalUserId(): string {
  const user = getCurrentUser();
  return user?.id || 'guest';
}

export function getUniverses(): Universe[] {
  const user = getCurrentUser();
  if (!user) return [];
  const db = getLocalDB(user.id);
  return db.universes;
}

export function getUniverse(id: string): Universe | undefined {
  const user = getCurrentUser();
  if (!user) return undefined;
  const db = getLocalDB(user.id);
  return db.universes.find(u => u.id === id);
}

export function createUniverse(name: string, description: string): Universe {
  const user = getCurrentUser();
  const userId = user?.id || 'guest';
  const db = getLocalDB(userId);
  
  const universe: Universe = {
    id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    userId: userId,
    createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  };
  
  db.universes.push(universe);
  saveLocalDB(userId, db);
  return universe;
}

export function updateUniverse(id: string, name: string, description: string): void {
  const user = getCurrentUser();
  if (!user) return;
  const db = getLocalDB(user.id);
  const universe = db.universes.find(u => u.id === id);
  if (universe) {
    universe.name = name;
    universe.description = description;
    universe.updatedAt = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
    saveLocalDB(user.id, db);
  }
}

export function deleteUniverse(id: string): void {
  const user = getCurrentUser();
  if (!user) return;
  const db = getLocalDB(user.id);
  db.universes = db.universes.filter(u => u.id !== id);
  db.lore = db.lore.filter(l => l.universeId !== id);
  db.chats = db.chats.filter(c => c.universeId !== id);
  db.markers = db.markers.filter(m => m.universeId !== id);
  saveLocalDB(user.id, db);
}

// Lore, Chat ve Marker işlemleri
export function getLoreForUniverse(universeId: string): LoreEntry[] {
  const user = getCurrentUser();
  if (!user) return [];
  const db = getLocalDB(user.id);
  return db.lore.filter(l => l.universeId === universeId);
}

export function addLoreEntry(entry: Omit<LoreEntry, 'id' | 'createdAt' | 'updatedAt'>): LoreEntry {
  const user = getCurrentUser();
  const userId = user?.id || 'guest';
  const db = getLocalDB(userId);
  const lore: LoreEntry = {
    ...entry,
    id: `lore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  };
  db.lore.push(lore);
  saveLocalDB(userId, db);
  return lore;
}

export function updateLoreEntry(id: string, updates: Partial<LoreEntry>): void {
  const user = getCurrentUser();
  if (!user) return;
  const db = getLocalDB(user.id);
  const lore = db.lore.find(l => l.id === id);
  if (lore) {
    Object.assign(lore, updates);
    lore.updatedAt = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
    saveLocalDB(user.id, db);
  }
}

export function deleteLoreEntry(id: string): void {
  const user = getCurrentUser();
  if (!user) return;
  const db = getLocalDB(user.id);
  db.lore = db.lore.filter(l => l.id !== id);
  saveLocalDB(user.id, db);
}

// Yedekleme ve temizleme
export function exportData(): string {
  const user = getCurrentUser();
  if (!user) return "";
  const db = getLocalDB(user.id);
  return JSON.stringify(db, null, 2);
}

export function clearLocalData(): void {
  const user = getCurrentUser();
  if (user) {
    localStorage.removeItem(getStorageKey(user.id));
  }
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}

// --- Operatör Yönetimi ---

function loadUsersDB(): LocalUser[] {
  const stored = localStorage.getItem(USERS_DB_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch { return []; }
  }
  return [];
}

function saveUsersDB(users: LocalUser[]): void {
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
}

export function createLocalUser(nickname: string, authMethod: 'local' | 'google' | 'guest' = 'local'): LocalUser {
  const users = loadUsersDB();
  let user = users.find(u => u.nickname === nickname && u.authMethod === authMethod);
  
  if (user) {
    user.lastLogin = Date.now();
    saveUsersDB(users);
    setCurrentUser(user.id);
    return user;
  }
  
  const newUser: LocalUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    nickname: nickname || (authMethod === 'guest' ? 'Guest' : 'Local User'),
    createdAt: Date.now(),
    lastLogin: Date.now(),
    authMethod,
  };
  
  users.push(newUser);
  saveUsersDB(users);
  setCurrentUser(newUser.id);
  return newUser;
}

export function setCurrentUser(userId: string): void {
  localStorage.setItem(CURRENT_USER_KEY, userId);
}

export function getCurrentUser(): LocalUser | null {
  const userId = localStorage.getItem(CURRENT_USER_KEY);
  if (!userId) return null;
  const users = loadUsersDB();
  return users.find(u => u.id === userId) || null;
}

export function getAllLocalUsers(): LocalUser[] {
  return loadUsersDB();
}

export function getCurrentUserNickname(): string {
  const user = getCurrentUser();
  return user?.nickname || 'Local User';
}

export function deleteLocalUser(userId: string): void {
  let users = loadUsersDB();
  users = users.filter(u => u.id !== userId);
  saveUsersDB(users);
  const currentUserId = localStorage.getItem(CURRENT_USER_KEY);
  if (currentUserId === userId) {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}