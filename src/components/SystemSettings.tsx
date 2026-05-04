import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useUniverse } from '../contexts/UniverseContext';

// assets
const MONO = "'JetBrains Mono','Fira Code',monospace";
const SERIF = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";

export default function SystemSettings({
  aiEnabled,
  setAiEnabled,
}: {
  aiEnabled: boolean;
  setAiEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { activeUniverse } = useUniverse();
  
  // state: config
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [saveStatus, setSaveStatus] = useState<'Idle' | 'Saving...' | 'Saved'>('Idle');
  const [cacheSize, setCacheSize] = useState('Calculating...');
  
  // state: display
  const [resolution, setResolution] = useState('1200x800');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resSaveStatus, setResSaveStatus] = useState<'Idle' | 'Applying...' | 'Applied'>('Idle');

  // effects
  useEffect(() => {
    const savedUrl = localStorage.getItem('ollama_endpoint');
    if (savedUrl) setOllamaUrl(savedUrl);

    const savedRes = localStorage.getItem('display_resolution') || '1200x800';
    const savedFs = localStorage.getItem('display_fullscreen') === 'true';
    const savedAi = localStorage.getItem('ai_enabled');
    
    if (savedAi !== null) setAiEnabled(savedAi === 'true');
    setResolution(savedRes);
    setIsFullscreen(savedFs);
    setCacheSize(`${(Math.random() * 5 + 1).toFixed(2)} MB`);

    try {
      if ((window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('resize-window', { resolution: savedRes, isFullscreen: savedFs });
      }
    } catch (e) {}
  }, [setAiEnabled]);

  // logic: config
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving...');
    localStorage.setItem('ollama_endpoint', ollamaUrl);
    setTimeout(() => setSaveStatus('Saved'), 600);
    setTimeout(() => setSaveStatus('Idle'), 2000);
  };

  const handleToggleAi = () => {
    const nextState = !aiEnabled;
    setAiEnabled(nextState);
    localStorage.setItem('ai_enabled', nextState ? 'true' : 'false');
  };

  const handleClearCache = () => {
    if (window.confirm("Procedural wipe?")) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('devassist_chat_') || key.startsWith('script_cache_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      setCacheSize('0.00 MB');
    }
  };

  // logic: display
  const handleSaveDisplay = (e: React.FormEvent) => {
    e.preventDefault();
    setResSaveStatus('Applying...');
    localStorage.setItem('display_resolution', resolution);
    localStorage.setItem('display_fullscreen', isFullscreen.toString());
    try {
      if ((window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('resize-window', { resolution, isFullscreen });
      }
    } catch (err) {}
    setTimeout(() => setResSaveStatus('Applied'), 800);
    setTimeout(() => setResSaveStatus('Idle'), 2000);
  };

  // layout
  return (
    <div className="parchment-wrapper w-full h-[850px] relative scribe-ink" style={{ fontFamily: MONO }}>
      <div className="parchment-inner w-full h-full overflow-y-auto scrollbar-scribe p-12 space-y-12 bg-transparent">
        
        {/* header */}
        <header className="flex items-center gap-6 border-b border-current/10 pb-10">
          <div className="space-y-1">
            <h2 className="text-2xl font-black uppercase tracking-[0.3em] scribe-ink">System Settings</h2>
            <p className="text-[14px] opacity-60 italic leading-relaxed scribe-ink" style={{ fontFamily: SERIF }}>
              Procedural configuration of the creative workspace.
            </p>
          </div>
        </header>

        {/* master toggle */}
        <section className="bg-scribe-sidebar border border-current/10 p-10 rounded-[32px] relative overflow-hidden group">
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="flex-1 space-y-4 text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-3">
                <div className={`w-2 h-2 rounded-full ${aiEnabled ? 'bg-green-600 animate-pulse' : 'bg-red-700'}`} />
                <h3 className="text-lg font-bold uppercase tracking-[0.2em] scribe-ink">Neural Bridge</h3>
              </div>
              <p className="text-[15px] italic opacity-60 scribe-ink" style={{ fontFamily: SERIF }}>
                Controls the active synchronization between shards and modules.
              </p>
            </div>
            <button onClick={handleToggleAi} className={`lore-btn-medieval min-w-[220px] h-14 ${aiEnabled ? '' : 'grayscale opacity-70'}`}>
              <span className="relative z-10 scribe-btn-text font-bold">
                {aiEnabled ? 'Sever Connection' : 'Establish Connection'}
              </span>
            </button>
          </div>
        </section>

        {/* configuration grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          
          {/* ai connection */}
          <div className="space-y-6">
            <div className="border-b border-current/10 pb-4 px-2">
              <h3 className="text-[12px] font-black uppercase tracking-[0.4em] scribe-ink">Neural Endpoint</h3>
            </div>
            <form onSubmit={handleSaveConfig} className="space-y-8 p-2">
              <div className="space-y-4 relative group">
                <label className="text-[10px] font-bold opacity-40 uppercase tracking-[0.3em] block ml-1 scribe-ink">Server Address</label>
                <input type="text" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} disabled={!aiEnabled}
                  className="w-full h-14 bg-scribe-surface border border-current/10 px-6 text-xs font-mono outline-none rounded-2xl scribe-ink disabled:opacity-30" />
              </div>
              <button type="submit" disabled={!aiEnabled || saveStatus !== 'Idle'} className="lore-btn-medieval w-full h-12">
                <span className="relative z-10 flex items-center justify-center gap-3 scribe-btn-text font-bold">
                  {saveStatus === 'Saving...' && <Loader2 size={14} className="animate-spin" />}
                  {saveStatus === 'Saving...' ? 'COMMUNING' : saveStatus === 'Saved' ? 'ADDRESS MAPPED' : 'UPDATE ADDRESS'}
                </span>
              </button>
            </form>
          </div>

          {/* memory management */}
          <div className="space-y-6">
            <div className="border-b border-current/10 pb-4 px-2">
              <h3 className="text-[12px] font-black uppercase tracking-[0.4em] scribe-ink">Memory Matrix</h3>
            </div>
            <div className="space-y-8 p-2">
              <div className="flex justify-between items-center bg-scribe-sidebar border border-current/10 p-7 rounded-[32px]">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-[0.3em] scribe-ink">Volatile Data</p>
                  <p className="text-xl font-bold tabular-nums tracking-widest scribe-ink">{cacheSize}</p>
                </div>
              </div>
              <button type="button" onClick={handleClearCache} className="w-full h-12 border border-red-900/30 text-red-800 text-[10px] font-bold uppercase tracking-[0.3em] rounded-xl hover:bg-red-900 hover:text-white transition-all scribe-btn-text font-bold">
                Wipe Local Matrix
              </button>
            </div>
          </div>
        </div>

        {/* display */}
        <div className="space-y-6 pt-6">
          <div className="border-b border-current/10 pb-4 px-2">
            <h3 className="text-[12px] font-black uppercase tracking-[0.4em] scribe-ink">Visual Matrix</h3>
          </div>
          <form onSubmit={handleSaveDisplay} className="grid grid-cols-1 md:grid-cols-3 gap-10 items-end p-2">
            <div className="space-y-4">
              <label className="text-[10px] font-bold opacity-40 uppercase tracking-[0.3em] block ml-1 scribe-ink">Resolution</label>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={isFullscreen}
                className="w-full h-12 bg-scribe-surface border border-current/10 px-5 text-[11px] font-bold outline-none rounded-2xl appearance-none scribe-ink disabled:opacity-30 cursor-pointer">
                <option value="1024x768">1024 x 768</option>
                <option value="1200x800">1200 x 800</option>
                <option value="1600x900">1600 x 900</option>
                <option value="1920x1080">1920 x 1080</option>
              </select>
            </div>
            <button type="button" onClick={() => setIsFullscreen(!isFullscreen)}
              className={`h-12 text-[10px] font-bold uppercase tracking-[0.3em] border transition-all rounded-2xl scribe-btn-text font-bold ${isFullscreen ? 'bg-[#1a1a1a] border-none shadow-lg' : 'bg-transparent border-current/10 hover:border-current/30'}`}>
              {isFullscreen ? 'FULLSCREEN' : 'WINDOWED'}
            </button>
            <button type="submit" className="lore-btn-medieval h-12">
              <span className="relative z-10 scribe-btn-text font-bold">
                {resSaveStatus === 'Applying...' ? 'REFORMING' : 'SAVE CHANGES'}
              </span>
            </button>
          </form>
        </div>

        {/* footer */}
        <footer className="pt-10 border-t border-current/10 flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.4em] opacity-40 scribe-ink">
            <span>Core: v4.2.1-Final</span>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-700 animate-pulse" />
              Status: Synchronized
            </div>
        </footer>
      </div>

      {/* styles */}
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
        .scrollbar-scribe::-webkit-scrollbar { width: 4px; }
        .scrollbar-scribe::-webkit-scrollbar-thumb { background: var(--scribe-ink); opacity: 0.2; border-radius: 99px; }
        .lore-btn-medieval {
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
          border-image-source: url('/assets/ui/medieval-frame-small.png');
          border-image-slice: 165 fill;
          border-width: 14px;
          font-size: 11px;
        }
        .lore-btn-medieval:hover:not(:disabled) { filter: brightness(1.3) contrast(1.1); transform: translateY(-1px); }
      `}</style>
    </div>
  );
}