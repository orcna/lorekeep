import React, { useState, useEffect, useCallback } from 'react';
import { signOut, auth, getCurrentUserDisplayName, isFirebaseActive } from './lib/firebase';
import Login from './components/Login';
import LoreManager from './components/LoreManager';
import ScriptWriter from './components/ScriptWriter';
import DevAssist from './components/DevAssist';
import WorldMap from './components/WorldMap';
import MindMap from './components/MindMap';
import SetupWizard from './components/SetupWizard';
import SystemSettings from './components/SystemSettings';
import { UniverseProvider, useUniverse } from './contexts/UniverseContext';
import { onAuthStateChanged } from 'firebase/auth';
import {
  BookOpen, Map as MapIcon, Share2, LogOut, Menu, X,
  Plus, Database, Clock, Settings, Zap, Activity,
  Trash2, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MONO = "'JetBrains Mono','Fira Code',monospace";
const SERIF = "'Palatino Linotype', 'Book Antiqua', Palatino, serif"; 
type Tab = 'lore' | 'map' | 'writer' | 'dev' | 'mindmap' | 'settings' | 'ai';

const ipc = (window as any).require ? (window as any).require('electron').ipcRenderer : null;

// components: system modal
const SystemModal = ({ isOpen, type, title, message, onConfirm, onCancel, inputValue, setInputValue }: any) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-[420px] bg-[var(--app-surface)] border border-[var(--app-border)] p-10 shadow-2xl relative overflow-hidden rounded-[24px]"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[var(--app-accent)] opacity-50" />
          <div className="mb-6 relative z-10">
            <span className="text-[12px] font-black tracking-[0.4em] text-[var(--app-text)] uppercase" style={{ fontFamily: MONO }}>{title}</span>
          </div>
          <p className="text-[14px] text-[var(--app-text)] mb-8 leading-relaxed italic opacity-80" style={{ fontFamily: SERIF }}>{message}</p>
          {type === 'prompt' && (
            <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)}
              className="w-full bg-[var(--app-bg)] border-b border-[var(--app-border)] px-4 py-3 mb-8 text-[12px] font-bold scribe-btn-text outline-none focus:border-[var(--app-accent)] transition-all uppercase tracking-widest rounded-t-xl"
              style={{ fontFamily: MONO }} />
          )}
          <div className="flex justify-end gap-4 mt-4 relative z-10">
            {onCancel && (
              <button onClick={onCancel} className="px-6 py-2.5 border border-[var(--app-border)] text-[9px] font-bold text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-bg)] transition-all uppercase tracking-widest rounded-xl" style={{ fontFamily: MONO }}>
                Cancel
              </button>
            )}
            <button onClick={onConfirm} className="px-8 py-2.5 bg-[var(--app-accent)] text-[var(--app-accent-fg)] text-[9px] font-black uppercase tracking-[0.3em] hover:brightness-125 transition-all shadow-[0_0_15px_var(--app-accent)]/20 rounded-xl" style={{ fontFamily: MONO }}>
              Confirm
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const HeaderBadge = ({ icon: Icon, label, value }: any) => (
  <div className="flex items-center h-8 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg overflow-hidden shadow-inner">
    <div className="flex items-center justify-center h-full px-2.5 bg-[var(--app-bg)] border-r border-[var(--app-border)]">
      <Icon size={12} className="scribe-btn-text" />
    </div>
    <div className="flex items-center gap-2 px-3">
      <span className="text-[8px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]" style={{ fontFamily: MONO }}>{label}</span>
      <span className="text-[10px] font-black text-[var(--app-text)] tracking-wider" style={{ fontFamily: MONO }}>{value}</span>
    </div>
  </div>
); 

function MainApp() {
  const { universes, activeUniverse, setActiveUniverse, createUniverse, deleteUniverse } = useUniverse(); 
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('lore');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userNickname, setUserNickname] = useState('OPERATOR');
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => localStorage.getItem('ai_enabled') !== 'false');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme_mode') === 'dark' ? 'dark' : 'light'));
  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', action: null as any });
  const [modalInput, setModalInput] = useState('');

  const checkAuthStatus = useCallback(() => {
    const firebaseUser = auth?.currentUser;
    const localUser = localStorage.getItem('lorekeep_current_user');
    if (firebaseUser || localUser) {
      setIsLoggedIn(true);
      const name = getCurrentUserDisplayName();
      setUserNickname(name ? name.toUpperCase() : 'OPERATOR');
      ipc?.send('resize-window', { resolution: '1600x900' });
    } else {
      setIsLoggedIn(false);
      ipc?.send('resize-window', { resolution: '450x700' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFirebaseActive) {
      checkAuthStatus();
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, () => checkAuthStatus());
    checkAuthStatus();
    return () => unsubscribe();
  }, [checkAuthStatus]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem('theme_mode', themeMode);
  }, [themeMode]);

  if (loading) return null;
  if (!isLoggedIn) return <Login onLogin={() => checkAuthStatus()} />;

  const handleLogout = () => { 
    setModal({
      isOpen: true, type: 'confirm', title: 'SYSTEM LOGOUT',
      message: 'Sever the current connection?',
      action: async () => {
        setLoading(true);
        await signOut();
        localStorage.removeItem('lorekeep_current_user');
        setIsLoggedIn(false);
        setModal(prev => ({ ...prev, isOpen: false }));
        setLoading(false);
      }
    });
  };

  const handleAddUniverse = () => {
    setModalInput('');
    setModal({
      isOpen: true, type: 'prompt', title: 'FORGE WORLD',
      message: 'Assign a title to the new workspace:',
      action: async (name: string) => {
        if (name) {
          await createUniverse(name, "Archive Initialized.");
          setModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteUniverse = () => {
    if (!activeUniverse) return;
    setModal({
      isOpen: true, type: 'confirm', title: 'ERASE UNIVERSE',
      message: `CRITICAL: Erasure of "${activeUniverse.name}" is permanent.`,
      action: async () => {
        await deleteUniverse(activeUniverse.id);
        setActiveUniverse(universes.length > 1 ? universes.find(u => u.id !== activeUniverse.id) || null : null);
        setModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const tabs: Array<{ id: Tab; label: string; Icon: any }> = [
    { id: 'lore', label: 'LORE ARCHIVE', Icon: BookOpen },
    { id: 'map', label: 'WORLD ATLAS', Icon: MapIcon },
    { id: 'mindmap', label: 'NEURAL WEB', Icon: Share2 },
  ];
  if (aiEnabled) tabs.push({ id: 'ai', label: 'AI TOOLKIT', Icon: Zap });

  return (
    <div className="flex-1 h-screen flex flex-col bg-[var(--app-bg)] text-[var(--app-text)] select-none transition-colors duration-500 overflow-hidden font-mono" style={{ fontFamily: SERIF }}>
      
      {!isFirebaseActive && (
        <div className="w-full bg-[#3d1a15] text-[#d1b1a7] py-1.5 text-center text-[10px] font-black tracking-[0.2em] uppercase z-[150] shadow-md flex items-center justify-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          LOCAL MANIFEST ACTIVE - CLOUD CONNECTION OFFLINE
        </div>
      )}

      <SystemModal isOpen={modal.isOpen} type={modal.type} title={modal.title} message={modal.message} inputValue={modalInput} setInputValue={setModalInput} onConfirm={() => modal.action(modalInput)} onCancel={() => setModal(prev => ({ ...prev, isOpen: false }))} />

      <div className="relative w-full h-full flex overflow-hidden">
        
        {/* sidebar */}
        <motion.aside initial={false} animate={{ width: sidebarOpen ? 280 : 0, opacity: sidebarOpen ? 1 : 0 }} className="relative bg-[var(--app-sidebar-bg)] border-r border-[var(--app-border)] flex flex-col z-50 overflow-hidden shadow-xl">
          <div className="h-20 px-10 border-b border-[var(--app-border)] bg-black/20 flex items-center justify-between shrink-0">
            <div className="flex flex-col">
              <span className="text-[14px] font-black tracking-[0.4em] text-[var(--app-text)] uppercase" style={{ fontFamily: MONO }}>LOREKEEP</span>
              <span className="text-[7px] font-bold text-[var(--app-accent)] opacity-50 uppercase tracking-[0.4em] mt-0.5">Manifest v4.2</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-[var(--app-muted)] hover:scribe-btn-text transition-all"><X size={14} /></button>
          </div>

          <div className="p-6 space-y-4 shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-[8px] font-black text-[var(--app-muted)] uppercase tracking-[0.4em]" style={{ fontFamily: MONO }}>Workspace</span>
              <div className="flex gap-2">
                {/* 🛡️ UI PROTECTION: Working medieval-frame spans */}
                <button onClick={handleAddUniverse} className="lore-btn-medieval-sm w-7 h-7 flex items-center justify-center">
                   <span className="relative z-[60] flex items-center justify-center scribe-btn-text"><Plus size={12} /></span>
                </button>
                {activeUniverse && (
                  <button onClick={handleDeleteUniverse} className="lore-btn-medieval-sm w-7 h-7 flex items-center justify-center">
                    <span className="relative z-[60] flex items-center justify-center text-red-500"><Trash2 size={12} /></span>
                  </button>
                )}
              </div>
            </div>
            <select value={activeUniverse?.id || ''} onChange={e => setActiveUniverse(universes.find(u => u.id === e.target.value) || null)}
              className="w-full h-11 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-4 text-[10px] text-[var(--app-text)] font-bold outline-none appearance-none cursor-pointer tracking-widest uppercase transition-all shadow-sm" style={{ fontFamily: MONO }}>
              {universes.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto custom-scrollbar">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all border group relative overflow-hidden active:scale-95 ${activeTab === t.id ? 'bg-[var(--app-surface)] border-[var(--app-border-hover)] scribe-btn-text shadow-md' : 'bg-transparent border-transparent text-[var(--app-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]'}`}>
                <t.Icon size={18} className={activeTab === t.id ? 'text-[var(--app-accent)]' : 'opacity-40 group-hover:opacity-100'} />
                <span className="text-[10px] font-black tracking-[0.25em] uppercase relative z-10" style={{ fontFamily: MONO }}>{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-5 border-t border-[var(--app-border)] bg-black/10 shrink-0">
            <div className="flex items-center justify-between bg-[var(--app-surface)] border border-[var(--app-border)] p-2 rounded-2xl shadow-inner relative">
              <div className="flex items-center gap-3 pl-2 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)] shadow-[0_0_10px_var(--app-accent)]" />
                <span className="text-[10px] font-black text-[var(--app-text)] truncate tracking-[0.1em] uppercase" style={{ fontFamily: MONO }}>{userNickname}</span>
              </div>
              <div className="flex gap-1 shrink-0 relative z-50">
                <button onClick={() => setActiveTab('settings')} className="w-8 h-8 flex items-center justify-center text-[var(--app-muted)] hover:scribe-btn-text transition-colors relative z-50">
                   <span className="relative z-[60] flex items-center justify-center"><Settings size={14} /></span>
                </button>
                <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center text-[var(--app-muted)] hover:text-red-500 transition-colors relative z-50">
                   <span className="relative z-[60] flex items-center justify-center"><LogOut size={14} /></span>
                </button>
              </div>
            </div>
          </div>
        </motion.aside>

        {/* main content */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--app-bg)] relative shadow-[inset_15px_0_40px_rgba(0,0,0,0.6)]">
          <header className="h-20 border-b border-[var(--app-border)] bg-[var(--app-header-bg)]/95 backdrop-blur-md flex items-center justify-between px-8 z-40">
            <div className="flex items-center gap-6">
              {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 flex items-center justify-center border border-[var(--app-border)] text-[var(--app-text)] bg-[var(--app-surface)] rounded-xl shadow-sm"><Menu size={16} /></button>
              )}
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] bg-[var(--app-surface)] px-4 py-2 rounded-lg border border-[var(--app-border)] shadow-sm" style={{ fontFamily: MONO }}>
                <span className="text-[var(--app-muted)]">CORE</span>
                <span className="scribe-btn-text">/</span>
                <span className="text-[var(--app-text)]">{activeTab}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-5">
              <div className="hidden lg:flex items-center gap-3">
                <HeaderBadge icon={Activity} label="STATUS" value="READY" />
                <HeaderBadge icon={Database} label="SYNC" value={isFirebaseActive ? "CLOUD" : "LOCAL"} />
                <HeaderBadge icon={Zap} label="AI" value={aiEnabled ? 'ACTIVE' : 'OFF'} />
              </div>
              <div className="h-8 w-px bg-[var(--app-border)]" />
              <div className="flex items-center gap-3 text-[var(--app-muted)] text-[11px] font-black tracking-widest tabular-nums uppercase" style={{ fontFamily: MONO }}>
                <Clock size={12} className="scribe-btn-text" />
                <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              </div>
              <div className="flex items-center gap-3 ml-2">
                <button onClick={() => setThemeMode(prev => prev === 'dark' ? 'light' : 'dark')} className="px-4 py-2.5 border border-[var(--app-border)] scribe-btn-text text-[9px] font-bold uppercase tracking-[0.2em] rounded-xl hover:border-[var(--app-border-hover)] transition-all flex items-center gap-2 bg-[var(--app-surface)] shadow-sm" style={{ fontFamily: MONO }}>
                  {themeMode === 'dark' ? <Sun size={12} /> : <Moon size={12} />} {themeMode === 'dark' ? 'LIGHT' : 'DARK'}
                </button>
                <button onClick={() => window.close()} className="px-3 py-2.5 border border-[var(--app-border)] text-[var(--app-muted)] hover:bg-red-500 hover:text-white transition-all rounded-xl flex items-center justify-center shadow-sm relative z-50"><X size={14} strokeWidth={3} /></button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto custom-scrollbar p-6 lg:p-10 transition-colors duration-500">
            <AnimatePresence mode="wait">
              <motion.div key={`${activeTab}-${activeUniverse?.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="h-full">
                {!activeUniverse && activeTab !== 'settings' ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--app-muted)] border-2 border-[var(--app-border)] rounded-[40px] bg-[var(--app-surface)]/30 border-dashed">
                    <Database size={64} strokeWidth={1} className="mb-6 text-[var(--app-accent)] opacity-20" />
                    <p className="text-[12px] font-black tracking-[0.8em] uppercase opacity-40" style={{ fontFamily: MONO }}>INITIALIZING ARCHIVE CONNECTION</p>
                  </div>
                ) : (
                  <div className="h-full">
                    {activeTab === 'lore' && <LoreManager />}
                    {activeTab === 'map' && <WorldMap />}
                    {activeTab === 'mindmap' && <MindMap />}
                    {activeTab === 'ai' && (
                      <div className="h-full flex items-center justify-center p-4">
                        <div className="parchment-container w-full max-w-5xl rounded-[40px] shadow-2xl relative overflow-hidden transition-colors duration-500">
                          <div className="p-20 relative text-center">
                            <h2 className="text-4xl font-black uppercase tracking-[0.5em] scribe-ink mb-16" style={{ fontFamily: SERIF }}>neural manifestations</h2>
                            <div className="grid gap-16 md:grid-cols-2 relative z-10 mt-10">
                              {['writer', 'dev'].map(tool => (
                                <button key={tool} onClick={() => setActiveTab(tool as Tab)} className="lore-btn-medieval w-full flex flex-col p-12 text-left relative z-50 group">
                                  <span className="relative z-[60] scribe-btn-text font-black uppercase tracking-[0.2em] mb-3 text-sm" style={{ fontFamily: MONO }}>{tool === 'writer' ? 'Script Writer' : 'Dev Assist'}</span>
                                  <p className="relative z-[60] scribe-btn-text text-[9px] opacity-60 uppercase leading-relaxed tracking-widest" style={{ fontFamily: MONO }}>Connect to the central matrix for creative augmentation.</p>
                                  <div className="absolute inset-0 bg-[var(--app-accent)]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeTab === 'writer' && <ScriptWriter aiEnabled={aiEnabled} />}
                    {activeTab === 'dev' && <DevAssist aiEnabled={aiEnabled} />}
                    {activeTab === 'settings' && <SystemSettings aiEnabled={aiEnabled} setAiEnabled={setAiEnabled} />}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <style>{`
        :root {
          --app-bg: #2e1d16;
          --app-surface: #402c24;
          --app-header-bg: #1c100c;
          --app-sidebar-bg: #38241b;
          --app-border: rgba(212, 175, 55, 0.2);
          --app-border-hover: rgba(212, 175, 55, 0.6);
          --app-text: #f0e6d2;
          --app-muted: #a69080;
          --app-accent: #d4af37;
          --app-accent-fg: #1c100c;
          --danger: #e63946;
          --scribe-ink: #2d1f13;
          --scribe-bg: #d1cfc4;
          --scribe-btn: #b6a54d;
          --parchment-img: url('./assets/ui/parchment-base.png');
        }

        html[data-theme='dark'] {
          --app-bg: #0c0c0e;
          --app-surface: #18181c;
          --app-header-bg: #050505;
          --app-sidebar-bg: #111114;
          --app-border: rgba(255, 255, 255, 0.08);
          --app-border-hover: rgba(212, 175, 55, 0.4);
          --app-text: #e4e4e7;
          --app-muted: #71717a;
          --app-accent: #c4a040;
          --app-accent-fg: #000000;
          --scribe-ink: #1a1714;
          --scribe-bg: #2a2621;
          --parchment-img: url('./assets/ui/parchment-dark.png');
        }

        .scribe-ink { color: var(--scribe-ink) !important; }
        .scribe-btn-text { color: var(--scribe-btn) !important; font-family: ${MONO} !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: 99px; }

        .parchment-container {
          border-style: solid;
          border-width: 60px;
          border-image-source: var(--parchment-img);
          border-image-slice: 210 130 140 130 fill;
          border-image-repeat: stretch;
          background-color: var(--scribe-bg) !important;
          background-clip: padding-box;
          filter: drop-shadow(0 25px 50px rgba(0,0,0,0.6));
          transition: all 0.3s ease;
        }

        .lore-btn-medieval, .lore-btn-medieval-sm {
          isolation: isolate;
          border-style: solid;
          border-image-repeat: round; 
          background-color: #0d0a08 !important; 
          box-shadow: inset 0 0 0 1000px #0d0a08; 
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative;
        }

        /* ⚡ RELATIVE PATHS FOR PACKAGING */
        .lore-btn-medieval { border-image-source: url('./assets/ui/medieval-frame.png'); border-image-slice: 165 fill; border-width: 14px; }
        .lore-btn-medieval-sm { border-image-source: url('./assets/ui/medieval-frame-small.png'); border-image-slice: 165 fill; border-width: 14px; }
        .lore-btn-medieval:hover, .lore-btn-medieval-sm:hover { filter: brightness(1.4); transform: translateY(-1px); }
        
        .lore-btn-medieval *, .lore-btn-medieval-sm * {
          z-index: 60 !important;
          position: relative;
        }

        select { background-image: none !important; }
        option { background: #1a1510; color: #eadecc; }
      `}</style>
    </div>
  );
}

export default function App() { 
  const [needsSetup, setNeedsSetup] = useState(() => {
    // 🛡️ Logic from "Wrong but Base" code: Check env keys and setup flag
    const hasEnv = isFirebaseActive; 
    const isSetupDone = localStorage.getItem('lorekeep_setup_done') === 'true';
    return !(hasEnv || isSetupDone);
  });

  if (needsSetup) {
    return <SetupWizard onComplete={() => setNeedsSetup(false)} />;
  }

  return (
    <UniverseProvider> 
      <MainApp /> 
    </UniverseProvider>
  ); 
}