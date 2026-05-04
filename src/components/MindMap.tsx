import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { getLocalUserId } from '../lib/localStorage';
import {
  collection, query, where, onSnapshot,
  doc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { MindMapNode, MindMapEdge, MindMapData, LoreEntry, LoreCategory } from '../lib/types';
import { useUniverse } from '../contexts/UniverseContext';

// assets
const MONO = "'JetBrains Mono','Fira Code','SF Mono','Cascadia Code',monospace";
const NODE_W = 140;
const NODE_H = 70;
const CATEGORY_COLORS: Record<LoreCategory | 'default', string> = {
  character: '#ffffff', history: '#d4d4d4', mechanic: '#a3a3a3',
  location: '#737373', other: '#525252', default: '#404040',
};
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// components
const Badge = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-widest scribe-ink"
    style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}>
    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
);

export default function MindMap() {
  const { activeUniverse } = useUniverse();
  const userId = auth.currentUser?.uid || getLocalUserId();
  const isMounted = useRef(true);

  // state
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLinking, setIsLinking] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loreSearch, setLoreSearch] = useState('');
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // refs
  const isPanningCanvas = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const dragNodeId = useRef<string | null>(null);
  const dragStart = useRef({ mx: 0, my: 0 });
  const nodeStartPos = useRef<[string, { x: number; y: number }][]>([]);
  const didDrag = useRef(false);

  // effects
  useEffect(() => {
    isMounted.current = true;
    if (!userId || !activeUniverse?.id) return;
    const cacheKey = `mindmap_cache_${activeUniverse.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      setNodes(data.nodes || []); 
      setEdges(data.edges || []);
    }
    const fetchMindMap = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'mindmaps', activeUniverse.id));
        if (snapshot.exists() && isMounted.current) {
          const data = snapshot.data() as MindMapData;
          setNodes(data.nodes ?? []); 
          setEdges(data.edges ?? []);
          localStorage.setItem(cacheKey, JSON.stringify({ nodes: data.nodes, edges: data.edges }));
        }
      } catch (err) { console.warn("Sync failed."); }
    };
    fetchMindMap();
    const unsubscribeLore = onSnapshot(
      query(collection(db, 'lore'), where('universeId', '==', activeUniverse.id)),
      (snapshot) => {
        if (isMounted.current) {
          setLoreEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoreEntry)));
        }
      }
    );
    return () => { isMounted.current = false; unsubscribeLore(); };
  }, [userId, activeUniverse?.id]);

  // logic: save
  const saveMap = useCallback(async (currentNodes: MindMapNode[], currentEdges: MindMapEdge[]) => {
    if (!activeUniverse?.id || !userId) return;
    localStorage.setItem(`mindmap_cache_${activeUniverse.id}`, JSON.stringify({ nodes: currentNodes, edges: currentEdges }));
    setSyncStatus('saving');
    try {
      await setDoc(doc(db, 'mindmaps', activeUniverse.id), { 
        universeId: activeUniverse.id, userId, nodes: currentNodes, edges: currentEdges, updatedAt: serverTimestamp() 
      }, { merge: true });
      if (isMounted.current) { 
        setSyncStatus('saved'); 
        setTimeout(() => setSyncStatus('idle'), 2000); 
      }
    } catch { if (isMounted.current) setSyncStatus('error'); }
  }, [activeUniverse?.id, userId]);

  // logic: graph actions
  const handleLinkTarget = useCallback((targetNodeId: string) => {
    if (!isLinking || isLinking === targetNodeId) { setIsLinking(null); return; }
    setEdges(prevEdges => {
      const edgeExists = prevEdges.some(e => (e.source === isLinking && e.target === targetNodeId) || (e.source === targetNodeId && e.target === isLinking));
      if (edgeExists) return prevEdges;
      const newEdges = [...prevEdges, { id: `edge-${generateId()}`, source: isLinking, target: targetNodeId }];
      saveMap(nodes, newEdges);
      return newEdges;
    });
    setIsLinking(null);
  }, [isLinking, nodes, saveMap]);

  const addLoreNode = useCallback((loreId: string) => {
    const entry = loreEntries.find(x => x.id === loreId);
    if (!entry || nodes.some(n => n.loreId === loreId)) return;
    const newNode: MindMapNode = { 
      id: `node-${generateId()}`, label: entry.title, loreId: entry.id, 
      category: entry.category, x: 200 - pan.x, y: 200 - pan.y 
    };
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes); 
    saveMap(updatedNodes, edges);
  }, [loreEntries, nodes, edges, pan, saveMap]);

  const removeNode = useCallback((nodeId: string) => {
    const updatedNodes = nodes.filter(n => n.id !== nodeId);
    const updatedEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    setNodes(updatedNodes); setEdges(updatedEdges); saveMap(updatedNodes, updatedEdges);
  }, [nodes, edges, saveMap]);

  // logic: pointer
  const handleNodePointerDown = useCallback((nodeId: string, event: React.PointerEvent) => {
    event.stopPropagation();
    if (isLinking) { handleLinkTarget(nodeId); return; }
    setSelectedIds([nodeId]);
    dragNodeId.current = nodeId;
    dragStart.current = { mx: event.clientX, my: event.clientY };
    const node = nodes.find(n => n.id === nodeId);
    if (node) nodeStartPos.current = [[nodeId, { x: node.x, y: node.y }]];
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }, [isLinking, handleLinkTarget, nodes]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (isPanningCanvas.current) {
      setPan({ x: panStart.current.px + event.clientX - panStart.current.mx, y: panStart.current.py + event.clientY - panStart.current.my });
    } else if (dragNodeId.current) {
      const dx = (event.clientX - dragStart.current.mx) / zoom;
      const dy = (event.clientY - dragStart.current.my) / zoom;
      setNodes(prevNodes => prevNodes.map(node => 
        node.id === dragNodeId.current ? { ...node, x: nodeStartPos.current[0][1].x + dx, y: nodeStartPos.current[0][1].y + dy } : node
      ));
      didDrag.current = true;
    }
  }, [zoom]);

  const handlePointerUp = useCallback(() => {
    isPanningCanvas.current = false;
    if (dragNodeId.current && didDrag.current) saveMap(nodes, edges);
    dragNodeId.current = null; didDrag.current = false;
  }, [nodes, edges, saveMap]);

  const handleCanvasPointerDown = useCallback((event: React.PointerEvent) => {
    if ((event.target as Element).closest('[data-node]')) return;
    setIsLinking(null); setSelectedIds([]);
    isPanningCanvas.current = true;
    panStart.current = { mx: event.clientX, my: event.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  if (!activeUniverse) return null;

  // layout
  return (
    <div className="parchment-container w-full h-[800px] relative scribe-ink" style={{ fontFamily: MONO }}>
      <div className="parchment-inner flex flex-col w-full h-full overflow-hidden rounded-md bg-transparent">
        
        {/* header */}
        <header className="px-6 py-4 border-b border-scribe-ink/10 bg-scribe-sidebar flex justify-between items-center shrink-0">
          <span className="text-sm font-bold tracking-[0.3em] uppercase scribe-ink">Synapse Graph</span>
          <div className="flex items-center gap-2 px-4 py-2 bg-scribe-surface border border-scribe-ink/10 rounded-2xl">
            <div className={`w-2 h-2 rounded-full ${syncStatus === 'saving' ? 'bg-[#d4af37] animate-pulse' : 'opacity-40 bg-current'}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest scribe-ink">{syncStatus === 'saving' ? 'Saving' : 'Ready'}</span>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* sidebar */}
          <aside className="w-64 shrink-0 bg-scribe-sidebar border-r border-scribe-ink/10 p-5 flex flex-col min-h-0">
             <div className="space-y-4 flex flex-col h-full min-h-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] scribe-ink">Records</p>
                <input value={loreSearch} onChange={e => setLoreSearch(e.target.value)} placeholder="Search..." 
                  className="w-full bg-scribe-surface border border-scribe-ink/10 px-4 py-3 text-xs outline-none rounded-xl scribe-ink placeholder:opacity-30" />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-scribe min-h-0">
                  {loreEntries.filter(e => e.title.toLowerCase().includes(loreSearch.toLowerCase())).map(e => (
                    <button key={e.id} onClick={() => addLoreNode(e.id)} 
                      className="w-full text-left p-3 bg-scribe-sidebar border border-scribe-ink/10 hover:border-[#d4af37] flex items-center gap-3 rounded-xl transition-all scribe-ink">
                      <div className="w-1.5 h-4 shrink-0 rounded-full opacity-60" style={{ backgroundColor: CATEGORY_COLORS[e.category] }} />
                      <span className="text-[10px] font-bold truncate uppercase tracking-widest scribe-btn-text">{e.title}</span>
                    </button>
                  ))}
                </div>
             </div>
          </aside>

          {/* canvas */}
          <div className="flex-1 relative overflow-hidden" onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {edges.map(e => {
                  const s = nodes.find(n => n.id === e.source);
                  const t = nodes.find(n => n.id === e.target);
                  if (!s || !t) return null;
                  return <line key={e.id} x1={s.x + NODE_W/2} y1={s.y + NODE_H/2} x2={t.x + NODE_W/2} y2={t.y + NODE_H/2} 
                    stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" opacity="0.3" className="scribe-ink" />;
                })}
              </g>
            </svg>

            <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              {nodes.map(n => (
                <div key={n.id} data-node="true" className="absolute select-none cursor-move" style={{ left: n.x, top: n.y, width: NODE_W }} onPointerDown={e => handleNodePointerDown(n.id, e)}>
                  <div className={`p-4 border shadow-lg transition-all rounded-xl ${selectedIds.includes(n.id) ? 'bg-[#1a1510] border-[#d4af37]' : 'bg-scribe-sidebar border-scribe-ink/10'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <Badge color={CATEGORY_COLORS[n.category ?? 'default']} label={n.category ?? 'Lore'} />
                      <div className="flex gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); setIsLinking(n.id); }} className="opacity-60 hover:opacity-100 p-1 text-[9px] font-bold uppercase scribe-btn-text">Link</button>
                        <button onClick={(e) => { e.stopPropagation(); removeNode(n.id); }} className="opacity-60 hover:text-red-700 p-1 text-[9px] font-bold uppercase scribe-btn-text">Del</button>
                      </div>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest truncate scribe-ink">{n.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {isLinking && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#1a1510] scribe-btn-text px-6 py-3 text-[10px] font-bold uppercase tracking-widest z-50 animate-pulse rounded-full border border-[#0f0c09] shadow-2xl">
           Establish link.
        </div>
      )}

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
        .scrollbar-scribe::-webkit-scrollbar { width: 4px; }
        .scrollbar-scribe::-webkit-scrollbar-thumb { background: var(--scribe-ink); opacity: 0.2; border-radius: 99px; }
      `}</style>
    </div>
  );
}