import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { getLocalUserId } from '../lib/localStorage';
import {
  collection, query, where, onSnapshot,
  doc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { MindMapNode, MindMapEdge, MindMapData, LoreEntry, LoreCategory } from '../lib/types';
import { useUniverse } from '../contexts/UniverseContext';
import { ZoomIn, ZoomOut, RotateCcw, Target } from 'lucide-react'; 

const MONO = "'JetBrains Mono','Fira Code','SF Mono','Cascadia Code',monospace";
const NODE_W = 140;
const NODE_H = 70;
const CATEGORY_COLORS: Record<LoreCategory | 'default', string> = {
  character: '#ffffff', history: '#d4d4d4', mechanic: '#a3a3a3',
  location: '#737373', other: '#525252', default: '#404040',
};
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
  const canvasRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLinking, setIsLinking] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loreSearch, setLoreSearch] = useState('');
  
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 100, y: 100 });

  const isPanningCanvas = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const dragNodeId = useRef<string | null>(null);
  const dragStart = useRef({ mx: 0, my: 0 });
  const nodeStartPos = useRef<[string, { x: number; y: number }][]>([]);
  const didDrag = useRef(false);

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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isLinking) return;
    const zoomSpeed = 0.0015;
    const delta = -e.deltaY;
    const zoomChange = delta * zoomSpeed;
    const nextZoom = Math.min(Math.max(zoom + zoomChange, 0.2), 3);

    if (nextZoom !== zoom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;
      const newPanX = mouseX - worldX * nextZoom;
      const newPanY = mouseY - worldY * nextZoom;
      setZoom(nextZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  }, [zoom, pan, isLinking]);

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
      category: entry.category, x: (300 - pan.x) / zoom, y: (300 - pan.y) / zoom
    };
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes); 
    saveMap(updatedNodes, edges);
  }, [loreEntries, nodes, edges, pan, zoom, saveMap]);

  const removeNode = useCallback((nodeId: string) => {
    const updatedNodes = nodes.filter(n => n.id !== nodeId);
    const updatedEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    setNodes(updatedNodes); setEdges(updatedEdges); saveMap(updatedNodes, updatedEdges);
  }, [nodes, edges, saveMap]);

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

  const resetView = () => { setZoom(0.85); setPan({ x: 100, y: 100 }); };

  if (!activeUniverse) return null;

  return (
    <div className="parchment-container w-full h-[800px] relative scribe-ink" style={{ fontFamily: MONO }}>
      <div className="parchment-inner flex flex-col w-full h-full overflow-hidden rounded-md bg-transparent">
        
        <header className="px-6 py-4 border-b border-scribe-ink/10 bg-scribe-sidebar flex justify-between items-center shrink-0">
          <span className="text-sm font-bold tracking-[0.3em] uppercase scribe-ink">Synapse Graph</span>
          <div className="flex items-center gap-2 px-4 py-2 bg-scribe-surface border border-scribe-ink/10 rounded-2xl">
            <div className={`w-2 h-2 rounded-full ${syncStatus === 'saving' ? 'bg-[#d4af37] animate-pulse' : 'opacity-40 bg-current'}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest scribe-ink">{syncStatus === 'saving' ? 'Saving' : 'Ready'}</span>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden min-h-0">
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

          <div ref={canvasRef} className="flex-1 relative overflow-hidden bg-black/5" 
               onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} 
               onPointerUp={handlePointerUp} onWheel={handleWheel}>
            
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

            <div className="absolute inset-0 transition-transform duration-75 ease-out" 
                 style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              {nodes.map(n => (
                <div key={n.id} data-node="true" className="absolute select-none cursor-move" style={{ left: n.x, top: n.y, width: NODE_W }} onPointerDown={e => handleNodePointerDown(n.id, e)}>
                  <div className={`p-4 border shadow-lg transition-all rounded-xl ${selectedIds.includes(n.id) ? 'bg-[#1a1510] border-[#d4af37]' : 'bg-scribe-sidebar border-scribe-ink/10'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <Badge color={CATEGORY_COLORS[n.category ?? 'default']} label={n.category ?? 'Lore'} />
                      <div className="flex gap-1.5 relative z-50">
                        <button onClick={(e) => { e.stopPropagation(); setIsLinking(n.id); }} className="relative z-[60] opacity-100 p-1 text-[8px] font-black uppercase scribe-btn-text hover:brightness-150 transition-all cursor-pointer">Link</button>
                        <button onClick={(e) => { e.stopPropagation(); removeNode(n.id); }} className="relative z-[60] opacity-100 p-1 text-[8px] font-black uppercase scribe-btn-text hover:text-red-600 transition-all cursor-pointer">Del</button>
                      </div>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest truncate scribe-ink">{n.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 🛡️ REFINED ZOOM CONTROLS (Medieval Frame Small Applied) */}
            <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-50">
              <button onClick={() => setZoom(z => Math.min(z + 0.15, 3))} className="lore-btn-medieval-sm w-11 h-11 flex items-center justify-center group active:scale-90 transition-all shadow-2xl">
                <span className="relative z-10 scribe-btn-text"><ZoomIn size={18} strokeWidth={2.5} /></span>
              </button>
              <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.2))} className="lore-btn-medieval-sm w-11 h-11 flex items-center justify-center group active:scale-90 transition-all shadow-2xl">
                <span className="relative z-10 scribe-btn-text"><ZoomOut size={18} strokeWidth={2.5} /></span>
              </button>
              <button onClick={resetView} className="lore-btn-medieval-sm w-11 h-11 flex items-center justify-center group active:scale-90 transition-all shadow-2xl">
                <span className="relative z-10 scribe-btn-text"><RotateCcw size={18} strokeWidth={2.5} /></span>
              </button>
            </div>

            <div className="absolute bottom-8 left-8 bg-black/20 backdrop-blur-md px-3 py-1.5 border border-scribe-ink/10 rounded-lg">
              <span className="text-[9px] font-black tracking-tighter scribe-ink opacity-40 uppercase font-mono">Scale: {(zoom * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>
      
      {isLinking && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#1a1510] scribe-btn-text px-6 py-3 text-[10px] font-bold uppercase tracking-widest z-50 animate-pulse rounded-full border border-[#0f0c09] shadow-2xl flex items-center gap-2">
          <Target size={12} className="animate-spin" /> Establish connection...
        </div>
      )}

      <style>{`
        .parchment-inner { position: relative; z-index: 10; }
        .lore-btn-medieval-sm {
          isolation: isolate;
          border-style: solid;
          border-image-repeat: round; 
          background-color: #0d0a08 !important; 
          box-shadow: inset 0 0 0 1000px #0d0a08; 
          border-radius: 0 !important; 
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          cursor: pointer;
          position: relative;
          border-image-source: url('./assets/ui/medieval-frame-small.png'); 
          border-image-slice: 165 fill; 
          border-width: 10px;
        }
        .lore-btn-medieval-sm:hover { filter: brightness(1.4); transform: translateY(-1px); }
        .lore-btn-medieval-sm span { z-index: 20 !important; position: relative; display: flex; align-items: center; }
      `}</style>
    </div>
  );
}