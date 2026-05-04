import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUniverse } from '../contexts/UniverseContext';

// assets
const MONO = "'JetBrains Mono', 'Fira Code', monospace";
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function DevAssist({ aiEnabled }: { aiEnabled: boolean }) {
  const { activeUniverse } = useUniverse();

  // state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loreContext, setLoreContext] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // effects: data sync
  useEffect(() => {
    if (!activeUniverse?.id) return;
    
    const cached = localStorage.getItem(`dev_assist_chat_${activeUniverse.id}`);
    if (cached) setMessages(JSON.parse(cached));
    
    const unsubscribe = onSnapshot(
      query(collection(db, 'lore'), 
      where('userId', '==', auth.currentUser?.uid || 'guest'), 
      where('universeId', '==', activeUniverse.id)),
      (snapshot) => {
        const fullContext = snapshot.docs
          .map(doc => `[${doc.data().title}]: ${doc.data().content}`)
          .join('\n\n');
        setLoreContext(fullContext);
      }
    );

    return () => unsubscribe();
  }, [activeUniverse?.id]);

  // effects: auto-scroll
  useEffect(() => { 
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, loading]);

  // logic: transmission
  const handleTransmit = async () => {
    const directive = input.trim();
    if (!aiEnabled || !directive || loading || !activeUniverse) return;

    const userEntry: Message = { 
      id: generateId(), 
      role: 'user', 
      content: directive, 
      timestamp: new Date().toISOString() 
    };
    
    const nextChatState = [...messages, userEntry];
    setMessages(nextChatState);
    setInput('');
    setLoading(true);

    try {
      const prompt = `You are a helpful assistant for the universe: "${activeUniverse.name}". Context:\n${loreContext}\n\nUser: ${directive}\nAssistant:`;
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mistral', prompt, stream: false })
      });
      const data = await res.json();
      const assistantMsg: Message = { id: generateId(), role: 'assistant', content: data.response, timestamp: new Date().toISOString() };
      
      const finalArchive = [...nextChatState, assistantMsg];
      setMessages(finalArchive);
      localStorage.setItem(`dev_assist_chat_${activeUniverse.id}`, JSON.stringify(finalArchive));
    } catch (e) {
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'Connection Error: Ollama offline.', timestamp: new Date().toISOString() }]);
    } finally { 
      setLoading(false); 
    }
  };

  if (!activeUniverse) return null;

  // layout
  return (
    <div className="parchment-container w-full h-[800px] relative font-mono scribe-ink">
      <div className="parchment-inner flex flex-col w-full h-full overflow-hidden rounded-md bg-transparent">
        
        {/* header */}
        <header className="px-8 py-6 border-b border-scribe-ink/10 bg-scribe-sidebar flex items-center justify-between">
          <div className="scribe-ink">
            <h1 className="text-[12px] font-bold tracking-widest uppercase">Assistant Node</h1>
            <p className="text-[9px] font-bold uppercase mt-0.5 opacity-60">Status: Online</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-scribe-ink/10 bg-scribe-surface rounded-xl">
              <div className="w-1.5 h-1.5 bg-green-600 animate-pulse rounded-full" />
              <span className="text-[8px] font-bold uppercase tracking-widest scribe-ink">Connected</span>
            </div>
            <button onClick={() => setMessages([])} className="px-3 py-2 border border-scribe-ink/10 rounded-xl hover:bg-scribe-sidebar transition-colors text-[9px] font-bold uppercase scribe-btn-text">Reset</button>
          </div>
        </header>

        {/* stream */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-scribe p-8 space-y-10">
            <AnimatePresence>
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center scribe-ink">
                   <p className="text-[10px] uppercase font-bold tracking-[0.2em]">Awaiting input...</p>
                </div>
              )}
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                  <div className={`flex items-center gap-3 text-[10px] font-bold tracking-widest uppercase scribe-ink`}>
                    <span className="opacity-60">{msg.role === 'user' ? 'Operator' : 'Scribe'}</span>
                    <div className="h-[1px] flex-1 bg-scribe-ink/10" />
                    <span className="text-[8px] opacity-40 font-normal">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className={`text-sm leading-relaxed pl-5 border-l-[3px] border-scribe-ink/20 scribe-ink ${msg.role === 'assistant' ? 'italic' : ''}`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={endRef} />
          </div>

          {/* stats */}
          <aside className="hidden lg:flex w-72 flex-col p-8 space-y-10 border-l border-scribe-ink/10 bg-scribe-sidebar scribe-ink">
            <div className="space-y-4">
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">Memory</span>
              <div className="h-1.5 w-full bg-scribe-surface rounded-full border border-scribe-ink/10 overflow-hidden">
                 <motion.div className="h-full bg-scribe-ink opacity-40" animate={{ width: `${Math.min(messages.length * 8, 100)}%` }} />
              </div>
            </div>
            <div className="space-y-4">
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">Context</span>
              <div className="p-5 border border-scribe-ink/10 bg-scribe-surface text-[9px] leading-relaxed uppercase rounded-2xl tracking-widest shadow-inner">
                  Universe: <span className="font-bold block mt-1">{activeUniverse?.name}</span>
                  <div className="h-px bg-scribe-ink/10 my-3" />
                  Lore: <span className="font-bold">{loreContext ? loreContext.split('\n\n').length : 0} nodes</span>
              </div>
            </div>
          </aside>
        </div>

        {/* input */}
        <footer className="p-8 border-t border-scribe-ink/10 bg-scribe-sidebar">
          <div className="max-w-4xl mx-auto relative group">
            <div className="flex items-center bg-scribe-surface border border-scribe-ink/10 focus-within:border-scribe-ink/40 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 scribe-ink font-bold text-xs">&gt;</div>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTransmit()} placeholder="Enter directive..." disabled={loading || !aiEnabled}
                className="flex-1 bg-transparent py-4 text-xs outline-none font-bold uppercase scribe-ink placeholder:opacity-40" />
              <button onClick={handleTransmit} disabled={loading || !input.trim() || !aiEnabled} className="lore-btn-scribe h-full px-8 disabled:opacity-40">
                {loading ? <Loader2 size={16} className="animate-spin scribe-btn-text" /> : <span className="relative z-10 scribe-btn-text font-bold text-[10px]">Transmit</span>}
              </button>
            </div>
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
        .lore-btn-scribe {
          border-style: solid;
          border-image-source: url('/assets/ui/medieval-frame-small.png');
          border-image-slice: 165 fill;
          border-width: 14px;
          background-color: #1a1510 !important;
          cursor: pointer;
        }
        .scrollbar-scribe::-webkit-scrollbar { width: 4px; }
        .scrollbar-scribe::-webkit-scrollbar-thumb { background: var(--scribe-ink); opacity: 0.2; border-radius: 99px; }
      `}</style>
    </div>
  );
}