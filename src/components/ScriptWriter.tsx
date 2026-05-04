import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { getLocalUserId } from '../lib/localStorage';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, Loader2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUniverse } from '../contexts/UniverseContext';

// assets
const MONO = "'JetBrains Mono','Fira Code','SF Mono','Cascadia Code',monospace";

// components
const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="absolute -top-2 left-3 bg-[var(--scribe-bg)] px-2 text-[9px] font-bold opacity-60 uppercase tracking-wider z-10 scribe-ink">
    {children}
  </label>
);

export default function ScriptWriter({ aiEnabled }: { aiEnabled: boolean }) {
  // state
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('dramatic');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const userId = auth.currentUser?.uid || getLocalUserId();
  const { activeUniverse } = useUniverse();

  // effects
  useEffect(() => {
    if (!activeUniverse?.id || !userId) return;
    const cacheKey = `script_cache_${activeUniverse.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { lastPrompt, lastResult, lastTone } = JSON.parse(cached);
        setPrompt(lastPrompt || '');
        setResult(lastResult || '');
        setTone(lastTone || 'dramatic');
      } catch (e) { console.error("Cache corrupted"); }
    }
  }, [activeUniverse?.id, userId]);

  // logic: generation
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiEnabled || !prompt.trim() || !userId || !activeUniverse) return;
    
    setLoading(true);
    setSyncStatus('saving');
    setResult('');

    try {
      const q = query(collection(db, 'lore'), where('userId', '==', userId), where('universeId', '==', activeUniverse.id));
      const loreDocs = await new Promise<any[]>((resolve) => {
        const unsubscribe = onSnapshot(q, snap => {
          resolve(snap.docs.map(d => d.data()));
          unsubscribe();
        });
      });

      const contextStr = loreDocs.map(d => `[${d.title}]: ${d.content}`).join('\n\n');
      const safeContext = contextStr.length > 2000 ? contextStr.substring(0, 2000) + "\n... [TRUNCATED]" : contextStr;
      const fullPrompt = `Universe: ${activeUniverse.name}\nTone: ${tone}\nContext: ${safeContext}\nRequest: ${prompt}\nWriter:`;

      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mistral', prompt: fullPrompt, stream: false })
      });

      if (!res.ok) throw new Error();
      
      const data = await res.json();
      setResult(data.response);

      localStorage.setItem(`script_cache_${activeUniverse.id}`, JSON.stringify({
        lastPrompt: prompt, lastResult: data.response, lastTone: tone
      }));

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      setResult(`Connection Error: Ensure Ollama is active.`);
      setSyncStatus('error');
    } finally { setLoading(false); }
  };

  if (!activeUniverse) return null;

  // layout
  return (
    <div className="parchment-container w-full min-h-[800px] relative scribe-ink" style={{ fontFamily: MONO }}>
      <div className="parchment-inner flex flex-col w-full h-full overflow-hidden p-2">
        
        {/* header */}
        <header className="px-8 py-6 border-b border-scribe-ink/10 bg-scribe-sidebar flex items-center justify-between">
          <div className="scribe-ink">
            <h1 className="text-sm font-bold uppercase tracking-widest">Script Writer</h1>
            <p className="text-[9px] opacity-60 font-bold uppercase">Workspace: {activeUniverse.name}</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="px-3 py-1.5 border border-scribe-ink/10 bg-scribe-surface rounded-xl">
               <span className="text-[8px] font-bold tracking-widest uppercase scribe-ink">Local AI Active</span>
             </div>
             <div className={`w-2 h-2 rounded-full ${syncStatus === 'saving' ? 'bg-[#d4af37] animate-pulse' : 'opacity-40 bg-current'}`} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-scribe">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* input side */}
            <div className="space-y-8">
               <div className="relative group">
                  <Label>Scene Description</Label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} disabled={loading || !aiEnabled}
                    className="w-full h-[300px] bg-scribe-surface border border-scribe-ink/10 p-6 text-sm leading-loose outline-none transition-all resize-none rounded-3xl scribe-ink placeholder:opacity-30" />
               </div>

               <div className="flex gap-4">
                  <div className="relative group flex-1">
                    <Label>Tone</Label>
                    <select value={tone} onChange={e => setTone(e.target.value)}
                      className="w-full h-12 bg-scribe-surface border border-scribe-ink/10 px-4 text-xs font-bold uppercase rounded-2xl outline-none appearance-none scribe-ink cursor-pointer">
                      <option value="dramatic">Dramatic</option>
                      <option value="noir">Noir</option>
                      <option value="cyberpunk">Cyberpunk</option>
                      <option value="epic">Epic</option>
                    </select>
                  </div>
                  <button onClick={handleGenerate} disabled={loading || !aiEnabled || !prompt.trim()}
                    className="lore-btn-medieval h-12 px-8 disabled:opacity-40">
                    {loading && <Loader2 size={16} className="animate-spin scribe-btn-text" />}
                    <span className="relative z-10 scribe-btn-text font-bold">Generate</span>
                  </button>
               </div>
            </div>

            {/* output side */}
            <div className="relative group">
              <Label>Generated Output</Label>
              <div className="absolute right-4 top-4 z-20">
                {result && (
                  <button onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="p-2 bg-scribe-surface border border-scribe-ink/10 rounded-xl scribe-btn-text font-bold text-[9px] uppercase hover:brightness-110">
                    {copied ? <Check size={14} className="text-green-700" /> : "Copy"}
                  </button>
                )}
              </div>
              <div className="w-full h-[400px] bg-scribe-sidebar border border-scribe-ink/10 p-8 text-sm leading-relaxed overflow-y-auto rounded-3xl whitespace-pre-wrap font-serif italic scribe-ink">
                {loading ? (
                   <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                     <Loader2 size={24} className="animate-spin" />
                     <p className="text-[10px] uppercase">Consulting Muses...</p>
                   </div>
                ) : result || "The page remains empty..."}
              </div>
            </div>

          </div>
        </div>
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
        .parchment-container {
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
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative;
          border-image-source: url('/assets/ui/medieval-frame.png');
          border-image-slice: 165 fill;
          border-width: 14px;
        }
        .lore-btn-medieval:hover:not(:disabled) { filter: brightness(1.2); transform: translateY(-1px); }
        .scrollbar-scribe::-webkit-scrollbar { width: 4px; }
        .scrollbar-scribe::-webkit-scrollbar-thumb { background: var(--scribe-ink); opacity: 0.2; border-radius: 99px; }
      `}</style>
    </div>
  );
}