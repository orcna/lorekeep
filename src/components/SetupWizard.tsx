import React, { useState, useEffect } from 'react';
import { ChevronRight, Save, ArrowLeft, Sun, Moon, Check, User, Shield, Lock, Cpu, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const medievalFont = "'Cinzel', 'Uncial Antiqua', 'Luminari', 'Old English Text MT', 'Georgia', serif";
const monoFont = "'JetBrains Mono', 'Fira Code', monospace";

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<'mode' | 'keys'>('mode');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => 
    (localStorage.getItem('theme_mode') === 'dark' ? 'dark' : 'light')
  );
  
  const [config, setConfig] = useState(() => {
    const savedFirebase = localStorage.getItem('lorekeep_firebase_config');
    const savedAiMode = localStorage.getItem('lorekeep_ai_mode');
    const savedOllama = localStorage.getItem('ollama_endpoint');
    const savedMode = localStorage.getItem('lorekeep_mode');

    return {
      mode: savedMode || 'local',
      firebase: savedFirebase ? JSON.parse(savedFirebase) : { 
        apiKey: '', 
        authDomain: '',
        projectId: '', 
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        firestoreDatabaseId: '' 
      },
      aiMode: savedAiMode || 'ollama',
      ollamaUrl: savedOllama || 'http://localhost:11434'
    };
  });

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem('theme_mode', themeMode);
  }, [themeMode]);

  const toggleTheme = () => setThemeMode(prev => prev === 'dark' ? 'light' : 'dark');

  const finishSetup = () => {
    localStorage.setItem('lorekeep_setup_done', 'true');
    localStorage.setItem('lorekeep_mode', config.mode);
    localStorage.setItem('lorekeep_ai_mode', config.aiMode);
    localStorage.setItem('ollama_endpoint', config.ollamaUrl);
    
    if (config.mode === 'cloud') {
      localStorage.setItem('lorekeep_firebase_config', JSON.stringify(config.firebase));
    }
    onComplete();
  };

  const updateFB = (field: string, value: string) => {
    setConfig({ ...config, firebase: { ...config.firebase, [field]: value } });
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-transparent transition-colors duration-500 overflow-hidden font-mono text-scribe-ink">
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex flex-col items-center justify-center w-full max-w-[850px] h-[820px] parchment-wrapper transition-all duration-500"
      >
        <button 
          onClick={toggleTheme}
          className="absolute top-2 right-2 p-3 bg-transparent text-scribe-ink rounded-full hover:bg-current/10 transition-all z-50 opacity-40 hover:opacity-100 cursor-pointer"
        >
          {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="flex flex-col justify-center items-center w-full max-w-[420px] h-full relative z-10 text-center py-10">
          
          <header className="mb-8 w-full">
            <span className="text-[8px] font-black uppercase tracking-[0.5em] opacity-40 block mb-2">
              System Initialization
            </span>
            <h1 style={{ fontFamily: medievalFont }} className="text-4xl font-black tracking-widest uppercase leading-none">
              PROTOCOL
            </h1>
          </header>

          <AnimatePresence mode="wait">
            {step === 'mode' ? (
              <motion.div 
                key="step-mode"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-6 w-full"
              >
                <div className="flex flex-col gap-3 w-full">
                  <ParchmentCard 
                    title="LOCAL VAULT" 
                    desc="Isolated Disk Storage (Offline)"
                    active={config.mode === 'local'}
                    onClick={() => setConfig({ ...config, mode: 'local' })}
                  />
                  <ParchmentCard 
                    title="CLOUD NEXUS" 
                    desc="Firebase Real-time Sync"
                    active={config.mode === 'cloud'}
                    onClick={() => setConfig({ ...config, mode: 'cloud' })}
                  />
                </div>
                
                <button 
                  onClick={() => setStep('keys')}
                  className="w-full h-12 flex items-center justify-center bg-current/10 border border-current/20 text-scribe-ink font-bold uppercase tracking-[0.25em] text-[10px] hover:bg-current/20 transition-all rounded-md shadow-md cursor-pointer"
                >
                  PROCEED <ChevronRight size={16} strokeWidth={3} className="ml-1" />
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="step-keys"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4 w-full overflow-y-auto custom-scrollbar px-2"
              >
                {config.mode === 'cloud' && (
                  <div className="space-y-2 text-left">
                    <div className="flex items-center gap-2 opacity-30 mb-1">
                      <Lock size={10} /> <span className="text-[7px] font-black uppercase tracking-[0.3em]">Firebase Credentials</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <InkedInput placeholder="API KEY" value={config.firebase.apiKey} onChange={v => updateFB('apiKey', v)} />
                        <InkedInput placeholder="PROJECT ID" value={config.firebase.projectId} onChange={v => updateFB('projectId', v)} />
                    </div>
                    <InkedInput placeholder="AUTH DOMAIN" value={config.firebase.authDomain} onChange={v => updateFB('authDomain', v)} />
                    <div className="grid grid-cols-2 gap-2">
                        <InkedInput placeholder="STORAGE BUCKET" value={config.firebase.storageBucket} onChange={v => updateFB('storageBucket', v)} />
                        <InkedInput placeholder="APP ID" value={config.firebase.appId} onChange={v => updateFB('appId', v)} />
                    </div>
                    <InkedInput placeholder="MESSAGING SENDER ID" value={config.firebase.messagingSenderId} onChange={v => updateFB('messagingSenderId', v)} />
                    <InkedInput placeholder="DATABASE ID (OPTIONAL)" value={config.firebase.firestoreDatabaseId} onChange={v => updateFB('firestoreDatabaseId', v)} />
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-current/5 text-left">
                  <div className="flex items-center gap-2 opacity-30 mb-1">
                    <Cpu size={10} /> <span className="text-[7px] font-black uppercase tracking-[0.3em]">Neural Engine</span>
                  </div>
                  <div className="flex p-1 bg-current/5 border border-current/10 rounded-xl mb-2">
                    {['ollama', 'cloud'].map(m => (
                      <button key={m}
                        onClick={() => setConfig({ ...config, aiMode: m })} 
                        className={`flex-1 py-2 text-[9px] font-black rounded-lg transition-all uppercase tracking-[0.2em] cursor-pointer ${config.aiMode === m ? 'bg-current text-scribe-bg shadow-md' : 'opacity-40 hover:opacity-100'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {config.aiMode === 'ollama' && (
                    <InkedInput 
                      placeholder="OLLAMA ENDPOINT" value={config.ollamaUrl}
                      onChange={v => setConfig({...config, ollamaUrl: v})} 
                    />
                  )}
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={finishSetup} 
                    className="w-full h-12 flex items-center justify-center gap-3 bg-current/10 border border-current/20 text-scribe-ink font-bold uppercase tracking-[0.25em] text-[10px] hover:bg-current/20 transition-all rounded-md shadow-md cursor-pointer"
                  >
                    <Shield size={14} strokeWidth={2.5} /> 
                    <span>IGNITE FORGE</span>
                  </button>
                  <button 
                    onClick={() => setStep('mode')} 
                    className="text-[8px] font-bold opacity-30 hover:opacity-100 uppercase tracking-[0.3em] flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <ArrowLeft size={10} /> Return to Vessel Selection
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <footer className="mt-8 flex justify-center w-full">
            <div className="flex items-center gap-2 text-[7px] font-bold opacity-30 uppercase tracking-[0.2em]">
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                Awaiting Manifest
            </div>
          </footer>
        </div>
      </motion.div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--scribe-ink); opacity: 0.1; border-radius: 10px; }
        
        .parchment-wrapper {
          border-style: solid;
          border-width: 65px 95px; 
          border-image-source: var(--parchment-img);
          border-image-slice: 210 130 140 130 fill;
          border-image-repeat: stretch;
          background-color: var(--scribe-bg) !important;
          background-clip: padding-box;
          filter: drop-shadow(0 25px 60px rgba(0,0,0,0.4));
          transition: background-color 0.5s ease, color 0.5s ease;
        }
      `}</style>
    </div>
  );
}

// 🛡️ MISSED COMPONENTS ADDED BELOW:

function ParchmentCard({ title, desc, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`relative w-full p-4 text-center transition-all duration-500 border rounded-xl group cursor-pointer ${
        active 
          ? 'bg-current border-current shadow-lg scale-[1.02]' 
          : 'bg-current/5 border-current/10 hover:border-current/30 hover:bg-current/10'
      }`}
    >
      <h3 className={`font-black text-[10px] mb-0.5 tracking-[0.2em] uppercase transition-colors ${active ? 'text-scribe-bg' : 'text-scribe-ink'}`}>
        {title}
      </h3>
      <p className={`text-[7px] uppercase tracking-widest font-bold transition-colors ${active ? 'text-scribe-bg/60' : 'text-scribe-ink/40'}`}>
        {desc}
      </p>
      {active && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Check size={12} className="text-scribe-bg" strokeWidth={4} />
        </div>
      )}
    </button>
  );
}

function InkedInput({ placeholder, value, onChange }: { placeholder: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="relative group w-full">
      <input 
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontFamily: monoFont }}
        className="w-full h-11 bg-transparent border border-current/20 text-scribe-ink placeholder:opacity-20 focus:outline-none focus:border-current transition-all text-[9px] font-bold uppercase tracking-[0.2em] rounded-xl pl-4 pr-4 mb-1"
      />
    </div>
  );
}