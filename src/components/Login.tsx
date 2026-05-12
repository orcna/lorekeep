import React, { useState, useEffect } from 'react';
import { signInLocal, setupAuthPersistence, signInWithGoogle, isFirebaseActive } from '../lib/firebase';
import { Loader2, User, ChevronRight, Shield, Sun, Moon, Check, History, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const medievalFont = "'Cinzel', 'Uncial Antiqua', 'Luminari', 'Old English Text MT', 'Georgia', serif";
const monoFont = "'JetBrains Mono', 'Fira Code', monospace";

export default function Login({ onLogin }: { onLogin: (remember: boolean) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<string[]>([]);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => 
    (localStorage.getItem('theme_mode') === 'dark' ? 'dark' : 'light')
  );

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem('theme_mode', themeMode);
    
    const history = localStorage.getItem('recent_operators');
    if (history) setSavedAccounts(JSON.parse(history));
  }, [themeMode]);

  const toggleTheme = () => setThemeMode(prev => prev === 'dark' ? 'light' : 'dark');

  const handleSignIn = async (method: string, user?: string) => {
    const targetUser = user || username || 'Guest';
    setLoading(method);
    setError(null);
    try {
      await setupAuthPersistence(rememberMe);
      await signInLocal(targetUser);
      const updatedHistory = Array.from(new Set([targetUser, ...savedAccounts])).slice(0, 3);
      localStorage.setItem('recent_operators', JSON.stringify(updatedHistory));
      onLogin(rememberMe);
    } catch (err: any) {
      setError(`Ritual Error: ${err.message || 'Access Denied'}`);
    } finally { setLoading(null); }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseActive) {
      setError("Nexus Offline.");
      return;
    }

    setLoading('google');
    setError(null);
    
    try {
      // 🛡️ POP-UP MÜHÜRÜ: Electron içinde native pop-up tetikle
      await setupAuthPersistence(rememberMe);
      const result = await signInWithGoogle();
      
      if (result) {
        onLogin(rememberMe);
      }
    } catch (err: any) {
      console.error("Portal Error Detail:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Portal Blocked: Check system pop-up settings.");
      } else if (err.code === 'auth/user-agent-not-supported') {
        setError("UA Error: Electron version mismatch.");
      } else {
        setError(`Portal Error: ${err.code || 'Unauthorized'}`);
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 bg-transparent transition-colors duration-500 overflow-hidden font-mono text-scribe-ink">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex flex-col items-center justify-center w-full max-w-[680px] h-[720px] parchment-wrapper transition-all duration-500"
      >
        <button onClick={toggleTheme} className="absolute top-4 right-4 p-3 bg-transparent text-scribe-ink rounded-full hover:bg-current/10 transition-all z-50 opacity-40 hover:opacity-100 cursor-pointer">
          {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="flex flex-col justify-center items-center w-full max-w-[320px] h-full relative z-10 text-center">
          <header className="mb-8 w-full">
            <span className="text-[8px] font-black uppercase tracking-[0.5em] opacity-40 block mb-2">Identity Verification</span>
            <h1 style={{ fontFamily: medievalFont }} className="text-4xl font-black tracking-widest uppercase leading-none">LOREKEEP</h1>
          </header>

          <div className="space-y-5 w-full">
            {savedAccounts.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                <span className="text-[7px] font-bold uppercase tracking-[0.3em] opacity-30 flex items-center justify-center gap-1.5"><History size={10} /> Manifested Operators</span>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {savedAccounts.map(acc => (
                    <button key={acc} onClick={() => handleSignIn('local', acc)} className="px-3 py-1 border border-current/20 rounded-md text-[9px] font-bold hover:bg-current hover:text-scribe-bg transition-all uppercase cursor-pointer">{acc}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="relative group w-full">
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Operator ID" className="w-full h-12 pl-10 pr-4 bg-transparent border border-current/20 text-scribe-ink placeholder:opacity-30 focus:outline-none focus:border-current transition-all text-[10px] font-bold uppercase tracking-[0.25em] rounded-xl" style={{ fontFamily: monoFont }} />
              <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
            </div>

            <div className="flex justify-center">
              <label className="flex items-center gap-3 cursor-pointer group w-max">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="hidden" />
                <div className={`w-3.5 h-3.5 transition-all rounded-md flex items-center justify-center ${rememberMe ? 'bg-current' : 'border border-current/30 bg-transparent'}`}>{rememberMe && <Check size={10} className="text-scribe-bg" strokeWidth={5} />}</div>
                <span className="text-[8px] font-bold uppercase tracking-[0.2em] opacity-50">Remember Session</span>
              </label>
            </div>

            <button onClick={() => handleSignIn('local')} disabled={!!loading} className="w-full h-12 flex items-center justify-center bg-current/10 border border-current/20 text-scribe-ink font-bold uppercase tracking-[0.24em] text-[10px] hover:bg-current/20 transition-all rounded-md shadow-md active:scale-95 cursor-pointer">
              {loading === 'local' ? <Loader2 className="animate-spin" size={18} /> : <ChevronRight size={18} strokeWidth={3} />}
            </button>

            <div className="flex items-center gap-4 py-2 opacity-20 w-full">
              <div className="h-[1px] flex-1 bg-current" /><span className="text-[7px] font-bold tracking-[0.3em] uppercase">Or</span><div className="h-[1px] flex-1 bg-current" />
            </div>

            <button onClick={handleGoogleSignIn} disabled={!!loading} className={`w-full h-12 flex items-center justify-center gap-3 border text-scribe-ink font-bold uppercase tracking-[0.25em] text-[10px] transition-all rounded-md shadow-md active:scale-95 cursor-pointer ${isFirebaseActive ? 'bg-current/10 border-current/20 hover:bg-current/20' : 'bg-red-500/5 border-red-500/20 opacity-50 cursor-not-allowed'}`}>
              {loading === 'google' ? <Loader2 className="animate-spin" size={14} /> : <Shield size={14} strokeWidth={2.5} />} 
              <span>{isFirebaseActive ? 'SIGN IN WITH GOOGLE' : 'GOOGLE Nexus'}</span>
            </button>

            <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 text-red-700/60 font-bold text-[9px] uppercase tracking-widest pt-2"><AlertTriangle size={12} /> {error}</motion.div>}</AnimatePresence>
          </div>
        </div>
      </motion.div>

      <style>{`
        :root { --scribe-ink: #413c31; --scribe-bg: #d1cfc4; --parchment-img: url('./assets/ui/parchment-base.png'); }
        html[data-theme='dark'] { --scribe-ink: #1a1714; --scribe-bg: #2a2621; --parchment-img: url('./assets/ui/parchment-dark.png'); }
        .parchment-wrapper { border-style: solid; border-width: 65px 95px; border-image-source: var(--parchment-img); border-image-slice: 210 130 140 130 fill; border-image-repeat: stretch; background-color: var(--scribe-bg) !important; background-clip: padding-box; filter: drop-shadow(0 25px 60px rgba(0,0,0,0.4)); transition: background-color 0.5s ease, color 0.5s ease; }
      `}</style>
    </div>
  );
}