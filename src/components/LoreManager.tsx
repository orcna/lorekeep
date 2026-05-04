import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, deleteDoc, doc, updateDoc, writeBatch
} from 'firebase/firestore';
import { LoreEntry, LoreCategory } from '../lib/types';
import { 
  getLocalUserId, 
  getLoreForUniverse, 
  addLoreEntry, 
  updateLoreEntry, 
  deleteLoreEntry 
} from '../lib/localStorage';
import { motion, AnimatePresence } from 'framer-motion';
import { useHistory } from '../hooks/useHistory';
import { useUniverse } from '../contexts/UniverseContext';
import { useDropzone } from 'react-dropzone';

// assets
const MONO = "'JetBrains Mono','Fira Code',monospace";
const CAT_META: Record<LoreCategory, { label: string; }> = {
  character: { label: 'Character' },
  history:   { label: 'History' },
  mechanic:  { label: 'Mechanic' },
  location:  { label: 'Location' },
  other:     { label: 'Other' },
};
const ALL_CATS: (LoreCategory | 'all')[] = ['all', 'character', 'history', 'mechanic', 'location', 'other'];

// helpers
const formatDate = (ts: any) => {
  if (!ts) return '00/00/00';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};
const getWordCount = (text: string) => (text?.trim() ? text.trim().split(/\s+/).length : 0);

// components
interface Toast { id: number; kind: 'success' | 'error'; text: string }
const ToastStack = ({ toasts }: { toasts: Toast[] }) => (
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
    <AnimatePresence>
      {toasts.map(t => (
        <motion.div key={t.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
          className={`flex items-center gap-3 px-4 py-3 border font-bold uppercase tracking-[0.1em] text-[10px] shadow-lg rounded-xl scribe-ink bg-[var(--scribe-bg)] border-current/10 ${
            t.kind === 'success' ? 'text-green-700' : 'text-red-700'
          }`}>
          {t.text}
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="absolute -top-2 left-3 bg-[var(--scribe-bg)] px-2 text-[9px] font-bold opacity-60 uppercase tracking-wider z-10 transition-colors scribe-ink">
    {children}
  </label>
);

export default function LoreManager() {
  const { activeUniverse } = useUniverse();
  const userId = auth.currentUser?.uid || getLocalUserId();
  
  // state
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeCat, setActiveCat] = useState<LoreCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const { state, set, undo, redo, canUndo, canRedo, reset } = useHistory({
    title: '', content: '', category: 'other' as LoreCategory,
  });

  // notifications
  const pushToast = useCallback((kind: 'success' | 'error', text: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, kind, text }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  // effects: sync
  useEffect(() => {
    if (!activeUniverse?.id) return;
    const localEntries = getLoreForUniverse(activeUniverse.id);
    setEntries(localEntries);

    if (auth.currentUser) {
      const q = query(collection(db, 'lore'), where('userId', '==', userId), where('universeId', '==', activeUniverse.id));
      const unsubscribe = onSnapshot(q, snap => {
        const remoteData = snap.docs.map(d => ({ id: d.id, ...d.data() } as LoreEntry));
        if (remoteData.length === 0 && localEntries.length > 0) {
          setEntries(localEntries);
        } else {
          setEntries(remoteData);
        }
      });
      return () => unsubscribe();
    }
  }, [userId, activeUniverse?.id]);

  // logic: filter
  const filtered = useMemo(() => {
    const queryStr = search.toLowerCase();
    return entries
      .filter(e => (activeCat === 'all' || e.category === activeCat) && 
                   (!queryStr || e.title.toLowerCase().includes(queryStr) || e.content.toLowerCase().includes(queryStr)))
      .sort((a, b) => {
        const timeA = (a.updatedAt as any)?.seconds || new Date(a.updatedAt as any).getTime() || 0;
        const timeB = (b.updatedAt as any)?.seconds || new Date(b.updatedAt as any).getTime() || 0;
        return sortDir === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [entries, activeCat, search, sortDir]);

  const selectedEntry = useMemo(() => entries.find(e => e.id === selectedId) || null, [entries, selectedId]);

  // effects: selection
  useEffect(() => {
    if (selectedEntry) {
      reset({ title: selectedEntry.title, content: selectedEntry.content, category: selectedEntry.category });
      setIsAdding(false);
    } else if (isAdding) {
      reset({ title: '', content: '', category: 'other' });
    }
  }, [selectedId, isAdding, reset, selectedEntry]);

  // logic: save
  const handleSave = async () => {
    if (!userId || !activeUniverse || !state.title.trim()) return;
    setSaving(true);
    try {
      const payload = { ...state, title: state.title.trim(), userId, universeId: activeUniverse.id };
      if (isAdding) {
        const localNext = addLoreEntry(payload);
        if (auth.currentUser) {
          await addDoc(collection(db, 'lore'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        setSelectedId(localNext.id);
        setIsAdding(false);
        pushToast('success', 'Recorded');
      } else if (selectedId) {
        updateLoreEntry(selectedId, payload);
        if (auth.currentUser) {
          await updateDoc(doc(db, 'lore', selectedId), { ...payload, updatedAt: serverTimestamp() });
        }
        pushToast('success', 'Updated');
      }
    } catch (e) { pushToast('error', 'Failed'); } finally { setSaving(false); }
  };

  // logic: delete
  const handleDelete = async () => {
    if (!selectedId || !window.confirm("Banish forever?")) return;
    try {
      deleteLoreEntry(selectedId);
      if (auth.currentUser) await deleteDoc(doc(db, 'lore', selectedId));
      setSelectedId(null);
      pushToast('success', 'Banished');
    } catch { pushToast('error', 'Error'); }
  };

  // logic: import
  const onDrop = useCallback(async (files: File[]) => {
    if (!userId || !activeUniverse || !files.length) return;
    setImporting(true);
    const batch = auth.currentUser ? writeBatch(db) : null;
    try {
      for (const file of files) {
        const text = await file.text();
        const data = { title: file.name.replace(/\.[^/.]+$/, '').toUpperCase(), content: text, category: 'other' as LoreCategory, userId, universeId: activeUniverse.id };
        addLoreEntry(data);
        if (batch) {
          const newDocRef = doc(collection(db, 'lore'));
          batch.set(newDocRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
      }
      if (batch) await batch.commit();
      pushToast('success', `Imported ${files.length}`);
    } catch { pushToast('error', 'Failed'); } finally { setImporting(false); }
  }, [userId, activeUniverse, pushToast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop } as any);

  if (!activeUniverse) return null;

  const isDirty = selectedEntry 
    ? (state.title !== selectedEntry.title || state.content !== selectedEntry.content || state.category !== selectedEntry.category) 
    : isAdding;

  // layout
  return (
    <div className="parchment-wrapper w-full h-[800px] relative scribe-ink" style={{ fontFamily: MONO }}>
      <ToastStack toasts={toasts} />
      <div className="parchment-inner flex w-full h-full overflow-hidden rounded-md bg-transparent">
        
        {/* sidebar */}
        <aside className="w-80 shrink-0 flex flex-col border-r border-current/10 bg-scribe-sidebar">
          <header className="p-6 border-b border-current/10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[12px] font-bold uppercase tracking-widest scribe-ink">The Ledger</h2>
                <p className="text-[9px] mt-1 truncate opacity-60 scribe-ink">{activeUniverse.name}</p>
              </div>
              <button onClick={() => { setSelectedId(null); setIsAdding(true); }} className="lore-btn-medieval-sm w-10 h-10 flex items-center justify-center">
                <span className="relative z-10 scribe-btn-text font-black">+</span>
              </button>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Locate..." className="w-full h-10 bg-scribe-surface border border-current/10 px-4 text-[10px] uppercase font-bold tracking-widest outline-none rounded-xl scribe-ink placeholder:opacity-30" />
            <div className="flex flex-wrap gap-2 mt-4">
              {ALL_CATS.map(cat => (
                <button key={cat} onClick={() => setActiveCat(cat)} className={`lore-btn-medieval-sm px-3 py-1.5 text-[9px] ${activeCat === cat ? 'brightness-125' : 'opacity-70'}`}>
                  <span className="relative z-10 scribe-btn-text">{cat}</span>
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto scrollbar-scribe">
            {filtered.map(entry => (
              <button key={entry.id} onClick={() => setSelectedId(entry.id)} className={`relative w-full px-5 py-4 text-left border-b border-current/10 transition-all scribe-ink ${selectedId === entry.id ? 'bg-current/10' : 'hover:bg-scribe-sidebar'}`}>
                <p className="text-[11px] font-bold truncate uppercase tracking-widest scribe-ink">{entry.title}</p>
                <p className="text-[9px] mt-1 opacity-60 scribe-ink">{getWordCount(entry.content)} words • {formatDate(entry.updatedAt)}</p>
              </button>
            ))}
          </div>

          <div {...getRootProps()} className={`p-6 border-t border-current/10 cursor-pointer ${isDragActive ? 'bg-scribe-sidebar' : ''}`}>
            <input {...getInputProps()} />
            <p className="text-[10px] font-bold uppercase scribe-ink">Bulk Manifest</p>
            <p className="text-[8px] uppercase opacity-40 scribe-ink">Drop files</p>
          </div>
        </aside>

        {/* workspace */}
        <main className="flex-1 bg-transparent relative flex flex-col">
          <AnimatePresence mode="wait">
            {isAdding || selectedEntry ? (
              <motion.div key={isAdding ? 'new' : selectedEntry?.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-full">
                <header className="px-8 py-6 border-b border-current/10 bg-scribe-sidebar flex items-center justify-between">
                  <div className="scribe-ink">
                    <h1 className="text-sm font-bold uppercase tracking-widest scribe-ink">{isAdding ? 'Initiate' : 'Refine'}</h1>
                    <p className="text-[12px] opacity-60 font-bold uppercase scribe-ink">{isAdding ? 'Local' : `Ref: ${selectedEntry?.id?.slice(0, 8)}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={undo} disabled={!canUndo} className="px-3 py-2 border border-current/10 bg-scribe-surface scribe-btn-text text-[9px] font-bold uppercase disabled:opacity-30 rounded-xl">Undo</button>
                    <button onClick={redo} disabled={!canRedo} className="px-3 py-2 border border-current/10 bg-scribe-surface scribe-btn-text text-[9px] font-bold uppercase disabled:opacity-30 rounded-xl">Redo</button>
                    <button onClick={() => { setIsAdding(false); setSelectedId(null); }} className="px-3 py-2 ml-4 bg-scribe-surface border border-current/10 scribe-btn-text text-[9px] font-bold uppercase rounded-xl">Close</button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-scribe">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-8">
                      <div className="relative group">
                        <Label>Title</Label>
                        <input value={state.title} onChange={e => set({ ...state, title: e.target.value })} className="w-full h-12 bg-scribe-surface border border-current/10 px-4 text-xs scribe-ink uppercase font-bold tracking-widest outline-none rounded-2xl" />
                      </div>
                      <div className="relative group">
                        <Label>Category</Label>
                        <select value={state.category} onChange={e => set({ ...state, category: e.target.value as LoreCategory })} className="w-full h-12 bg-scribe-surface border border-current/10 px-4 text-xs scribe-ink font-bold uppercase tracking-widest outline-none appearance-none rounded-2xl cursor-pointer">
                          {Object.entries(CAT_META).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="border border-current/10 bg-scribe-sidebar p-6 rounded-3xl scribe-ink">
                      <p className="text-[10px] font-bold border-b border-current/10 pb-3 uppercase opacity-60">Stats</p>
                      <div className="grid grid-cols-2 gap-4 mt-4 uppercase">
                        <div><p className="text-[8px] opacity-60">Words</p><p className="text-xs font-bold">{getWordCount(state.content)}</p></div>
                        <div><p className="text-[8px] opacity-60">Updated</p><p className="text-xs font-bold">{selectedEntry ? formatDate(selectedEntry.updatedAt) : 'Draft'}</p></div>
                      </div>
                    </div>
                  </div>
                  <div className="relative group">
                    <Label>Content</Label>
                    <textarea value={state.content} onChange={e => set({ ...state, content: e.target.value })} className="w-full h-[400px] bg-scribe-surface border border-current/10 p-6 text-sm leading-loose outline-none font-mono rounded-3xl scribe-ink resize-none" />
                  </div>
                </div>

                <footer className="p-8 border-t border-current/10 bg-scribe-sidebar flex justify-between items-center">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 scribe-ink">
                      <div className={`w-2 h-2 rounded-full ${saving ? 'animate-pulse bg-current' : 'opacity-30 bg-current'}`} />
                      <span className="text-[10px] font-bold uppercase">{saving ? 'Syncing' : 'Stable'}</span>
                    </div>
                    {selectedId && <button onClick={handleDelete} className="text-[10px] font-bold text-red-700 uppercase scribe-ink">Banish</button>}
                  </div>
                  <div className="flex gap-4">
                    {isDirty && <button onClick={() => selectedEntry ? reset({ title: selectedEntry.title, content: selectedEntry.content, category: selectedEntry.category }) : setIsAdding(false)} className="h-12 px-6 border border-current/10 scribe-btn-text text-[11px] font-bold uppercase tracking-widest rounded-2xl">Discard</button>}
                    <button onClick={handleSave} disabled={saving || !isDirty || !state.title.trim()} className="lore-btn-medieval h-12 px-10 disabled:opacity-40">
                      <span className="relative z-10 scribe-btn-text font-bold">Commit Fragment</span>
                    </button>
                  </div>
                </footer>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-30 scribe-ink">
                <h3 className="text-lg font-bold uppercase tracking-widest">Archive Chamber Silent</h3>
                <button onClick={() => setIsAdding(true)} className="lore-btn-medieval mt-8 h-12 px-12">
                    <span className="relative z-10 scribe-btn-text font-bold">Record Fragment</span>
                </button>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>
      
      <style>{`
        :root {
          --scribe-ink: #2d1f13;
          --scribe-bg: #d1cfc4;
          --scribe-btn: #b6a54d;
          --scribe-sidebar: rgba(0, 0, 0, 0.04);
          --scribe-surface: #d1cfc4;
          --parchment-img: url('/assets/ui/parchment-base.png');
        }
        html[data-theme='dark'] {
          --scribe-ink: #1a1714;
          --scribe-bg: #2a2621;
          --scribe-sidebar: rgba(0, 0, 0, 0.2);
          --scribe-surface: #2a2621;
          --parchment-img: url('/assets/ui/parchment-dark.png');
        }
        .scribe-ink { color: var(--scribe-ink) !important; }
        .scribe-btn-text { 
          color: var(--scribe-btn) !important; 
          font-family: ${MONO} !important;
        }
        .parchment-wrapper {
          border-style: solid;
          border-width: 60px;
          border-image-source: var(--parchment-img);
          border-image-slice: 210 130 140 130 fill;
          border-image-repeat: stretch;
          background-color: var(--scribe-bg) !important;
          background-clip: padding-box;
          filter: drop-shadow(0 15px 30px rgba(0,0,0,0.5));
          transition: all 0.3s ease;
        }
        .lore-btn-medieval, .lore-btn-medieval-sm {
          isolation: isolate;
          border-style: solid;
          border-image-repeat: round; 
          background-color: #1a1510 !important; 
          box-shadow: inset 0 0 0 1000px #1a1510; 
          border-radius: 0 !important; 
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative; 
        }
        .lore-btn-medieval * , .lore-btn-medieval-sm * { position: relative; z-index: 50 !important; }
        .lore-btn-medieval { border-image-source: url('/assets/ui/medieval-frame.png'); border-image-slice: 165 fill; border-width: 14px; }
        .lore-btn-medieval-sm { border-image-source: url('/assets/ui/medieval-frame-small.png'); border-image-slice: 165 fill; border-width: 14px; }
        .scrollbar-scribe::-webkit-scrollbar { width: 4px; }
        .scrollbar-scribe::-webkit-scrollbar-thumb { background: var(--scribe-ink); opacity: 0.2; border-radius: 99px; }
      `}</style>
    </div>
  );
}