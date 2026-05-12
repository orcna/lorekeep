import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { getLocalUserId } from '../lib/localStorage';
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, serverTimestamp
} from 'firebase/firestore'; 
import { motion, AnimatePresence } from 'framer-motion';
import { useUniverse } from '../contexts/UniverseContext';

// Basic Type Definitions
interface Point { x: number; y: number }
interface MapMarker { id: string; x: number; y: number; label: string; style: { color: string }; universeId?: string; userId?: string }
interface MapBorder { id: string; label: string; points: Point[]; color: string; width: number; fillColor: string }

type DrawMode = 'grab' | 'select' | 'marker' | 'lasso';
type SidebarTab = 'layers' | 'assets';
type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

// Constants and Core Settings
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 675;
const CLOSE_RADIUS_SQ = 144;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.18;
const SIDEBAR_WIDTH = 280;
const MONO = "'JetBrains Mono','Fira Code',monospace";

// Geometry and Calculation Functions
const getDistanceSq = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const getCentroid = (pts: Point[]): Point => {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  return { 
    x: pts.reduce((sum, p) => sum + (p.x || 0), 0) / pts.length, 
    y: pts.reduce((sum, p) => sum + (p.y || 0), 0) / pts.length 
  };
};

// Convert Hex to RGBA
const hexToRgba = (hex: string, alpha: number) => { 
  if (!hex || !hex.startsWith('#')) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`; 
};

const pointsToString = (pts: Point[]) => pts.map(p => `${p.x},${p.y}`).join(' ');

// Status Badge Component
const StatusBadge = ({ label, value, active }: any) => (
  <div className="flex flex-col gap-1 px-4 py-2 border border-scribe-ink/10 bg-scribe-sidebar backdrop-blur-md rounded-2xl shadow-sm scribe-ink">
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-bold opacity-40 uppercase tracking-widest scribe-ink">{label}</span>
    </div>
    <span className={`text-[10px] font-bold uppercase scribe-ink ${active ? 'animate-pulse' : ''}`}>{value}</span>
  </div>
);

// Main WorldMap Component
export default function WorldMap() {
  const { activeUniverse } = useUniverse();
  const userId = useRef(auth.currentUser?.uid || getLocalUserId());
  const isMounted = useRef(true);

  // Map state and data
  const [borders, setBorders] = useState<MapBorder[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.7);
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('layers');
  const [showLabels, setShowLabels] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'marker' | 'border'; id: string } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [cursorPos, setCursorPos] = useState<Point>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);

  useEffect(() => { panRef.current = pan; zoomRef.current = zoom; }, [pan, zoom]);

  const interactionRefs = useRef({
    isPanning: false,
    panStart: { mx: 0, my: 0, px: 0, py: 0 },
    dragVertex: null as { borderId: string; idx: number } | null,
    moveMarker: null as string | null,
    didDrag: false
  });

  const markAsDirty = useCallback(() => { setIsDirty(true); setSyncStatus('idle'); }, []);

  useEffect(() => {
    isMounted.current = true;
    if (!activeUniverse?.id || !userId.current) return;

    const cacheKey = `worldmap_cache_${activeUniverse.id}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      const data = JSON.parse(cached);
      setMarkers(data.markers || []); 
      setBorders(data.borders || []); 
      setMapImage(data.mapImage || null);
    }

    const fetchMapData = async () => {
      try {
        const configSnapshot = await getDoc(doc(db, 'mapConfigs', activeUniverse.id));
        const markersSnapshot = await getDocs(query(collection(db, 'markers'), where('universeId', '==', activeUniverse.id)));

        if (isMounted.current) {
          const remoteMarkers = markersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as MapMarker));
          let remoteBorders: MapBorder[] = [];
          let remoteImage = null;

          if (configSnapshot.exists()) {
            const data = configSnapshot.data();
            remoteBorders = data.borders ?? [];
            remoteImage = data.imageUrl ?? null;
          }

          setMarkers(remoteMarkers);
          setBorders(remoteBorders);
          setMapImage(remoteImage);

          localStorage.setItem(cacheKey, JSON.stringify({ markers: remoteMarkers, borders: remoteBorders, mapImage: remoteImage }));
        }
      } catch (err) {
        console.warn("Failed to load map data. Using local cache.");
      }
    };

    fetchMapData();
    return () => { isMounted.current = false; };
  }, [activeUniverse?.id]);

  const getSvgCoordinates = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const main = mainRef.current;
    if (!main) return;
    const rect = main.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const oldZ = zoomRef.current;
    const newZ = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldZ * factor));
    
    if (newZ === oldZ) return;
    
    const dx = (mx - rect.width / 2 - panRef.current.x) * (factor - 1);
    const dy = (my - rect.height / 2 - panRef.current.y) * (factor - 1);
    
    setPan(p => ({ x: p.x - dx, y: p.y - dy }));
    setZoom(newZ);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    interactionRefs.current.didDrag = false;
    
    if (drawMode === 'grab') {
      interactionRefs.current.isPanning = true;
      interactionRefs.current.panStart = { mx: e.clientX, my: e.clientY, px: panRef.current.x, py: panRef.current.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, [drawMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const refs = interactionRefs.current;
    if (refs.isPanning) {
      refs.didDrag = true;
      setPan({ x: refs.panStart.px + e.clientX - refs.panStart.mx, y: refs.panStart.py + e.clientY - refs.panStart.my });
      return;
    }
    
    const coords = getSvgCoordinates(e.clientX, e.clientY);
    setCursorPos(coords);
    
    if (refs.dragVertex) {
      refs.didDrag = true;
      const { borderId, idx } = refs.dragVertex;
      setBorders(prev => prev.map(b => b.id === borderId ? { ...b, points: Object.assign([], b.points, { [idx]: coords }) } : b));
      markAsDirty();
    } else if (refs.moveMarker) {
      refs.didDrag = true;
      setMarkers(prev => prev.map(m => m.id === refs.moveMarker ? { ...m, x: coords.x, y: coords.y } : m));
      markAsDirty();
    }
  }, [getSvgCoordinates, markAsDirty]);

  const handlePointerUp = useCallback(() => { 
    const refs = interactionRefs.current;
    refs.isPanning = false;
    refs.dragVertex = null;
    refs.moveMarker = null; 
  }, []);

  const finalizeLasso = useCallback(() => {
    if (lassoPoints.length < 3) return;
    const id = `border-${Date.now()}`;
    const color = '#3b3a2a';
    const finalPoints = lassoPoints.map(p => ({ x: p.x, y: p.y }));
    
    setBorders(prev => [...prev, { 
      id, 
      label: `Region ${prev.length + 1}`, 
      points: finalPoints, 
      color, 
      width: 0.6, 
      fillColor: hexToRgba(color, 0.05) 
    }]);
    
    setLassoPoints([]);
    setSelectedEntity({ type: 'border', id });
    markAsDirty();
  }, [lassoPoints, markAsDirty]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (interactionRefs.current.didDrag) return;
    const coords = getSvgCoordinates(e.clientX, e.clientY);
    const isBackground = e.target === svgRef.current || (e.target as Element).tagName === 'image';

    if (drawMode === 'marker') {
      const id = `marker-${Date.now()}`;
      setMarkers(prev => [...prev, { id, x: coords.x, y: coords.y, label: `Point ${prev.length + 1}`, style: { color: '#3b3a2a' } }]);
      setSelectedEntity({ type: 'marker', id });
      markAsDirty();
    } else if (drawMode === 'lasso') {
      if (lassoPoints.length > 2 && getDistanceSq(lassoPoints[0], cursorPos) < CLOSE_RADIUS_SQ) {
        finalizeLasso();
      } else {
        setLassoPoints(prev => [...prev, coords]);
      }
    } else if (drawMode === 'select' && isBackground) {
      setSelectedEntity(null);
    }
  }, [drawMode, lassoPoints, cursorPos, getSvgCoordinates, markAsDirty, finalizeLasso]);

  const onBorderPointerDown = (e: React.PointerEvent, b: MapBorder) => {
    if (drawMode !== 'select') return;
    e.stopPropagation();
    setSelectedEntity({ type: 'border', id: b.id });
  };

  const onVertexDown = (e: React.PointerEvent, borderId: string, idx: number) => {
    if (drawMode !== 'select') return;
    e.stopPropagation();
    interactionRefs.current.dragVertex = { borderId, idx };
  };

  const onMarkerPointerDown = (e: React.PointerEvent, id: string) => {
    if (drawMode !== 'select') return;
    e.stopPropagation();
    setSelectedEntity({ type: 'marker', id });
    interactionRefs.current.moveMarker = id;
  };

  const syncToCloud = useCallback(async () => {
    if (!activeUniverse?.id || !userId.current) return;
    setSyncStatus('saving');
    
    const cleanBorders = borders.map(b => ({
      ...b,
      points: b.points.map(p => ({ x: p.x, y: p.y }))
    }));

    localStorage.setItem(`worldmap_cache_${activeUniverse.id}`, JSON.stringify({ markers, borders: cleanBorders, mapImage }));

    try {
      const configData = { 
        userId: userId.current, 
        universeId: activeUniverse.id, 
        borders: cleanBorders, 
        imageUrl: mapImage, 
        updatedAt: serverTimestamp() 
      };
      await setDoc(doc(db, 'mapConfigs', activeUniverse.id), configData, { merge: true });
      
      await Promise.all(markers.map(m => setDoc(doc(db, 'markers', m.id), { 
        ...m, universeId: activeUniverse.id, userId: userId.current, updatedAt: serverTimestamp() 
      }, { merge: true })));
      
      if (isMounted.current) {
        setIsDirty(false);
        setSyncStatus('saved'); 
        setTimeout(() => setSyncStatus('idle'), 2500);
      }
    } catch (err) {
      if (isMounted.current) setSyncStatus('error');
    }
  }, [activeUniverse?.id, borders, markers, mapImage]);

  const updateSelected = useCallback((patch: Record<string, any>) => {
    if (!selectedEntity) return;
    markAsDirty();
    if (selectedEntity.type === 'marker') {
      setMarkers(ms => ms.map(m => m.id === selectedEntity.id ? { ...m, ...patch, style: patch.color ? { ...m.style, color: patch.color } : m.style } : m));
    } else {
      setBorders(bs => bs.map(b => b.id === selectedEntity.id ? { ...b, ...patch, fillColor: patch.color ? hexToRgba(patch.color, 0.05) : b.fillColor } : b));
    }
  }, [selectedEntity, markAsDirty]);

  const deleteSelected = useCallback(() => {
    if (!selectedEntity) return;
    if (selectedEntity.type === 'marker') {
      setMarkers(ms => ms.filter(m => m.id !== selectedEntity.id));
    } else {
      setBorders(bs => bs.filter(b => b.id !== selectedEntity.id));
    }
    setSelectedEntity(null);
    markAsDirty();
  }, [selectedEntity, markAsDirty]);

  const activeBorder = useMemo(() => selectedEntity?.type === 'border' ? borders.find(b => b.id === selectedEntity.id) : null, [selectedEntity, borders]);
  const activeMarker = useMemo(() => selectedEntity?.type === 'marker' ? markers.find(m => m.id === selectedEntity.id) : null, [selectedEntity, markers]);
  const activeColor = activeBorder?.color ?? activeMarker?.style?.color ?? '#888';

  if (!activeUniverse) return null;

  return (
    <div className="parchment-container w-full h-[800px] flex scribe-ink select-none relative" style={{ fontFamily: MONO }}>
      
      <div className="parchment-inner flex w-full h-full overflow-hidden rounded-md bg-transparent">
        
        {/* Left Sidebar */}
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.aside 
              initial={{ width: 0 }} 
              animate={{ width: SIDEBAR_WIDTH }} 
              exit={{ width: 0 }} 
              className="shrink-0 z-50 flex flex-col border-r border-scribe-ink/10 bg-scribe-sidebar overflow-hidden shadow-lg"
            >
              <div className="p-6 border-b border-scribe-ink/10 flex items-center justify-between">
                  <div className="scribe-ink">
                    <h2 className="text-xs font-bold uppercase tracking-widest">World Atlas</h2>
                    <p className="text-[10px] opacity-60 truncate">Universe: {activeUniverse.name}</p>
                  </div>
                  <button onClick={() => setIsCollapsed(true)} className="lore-btn-medieval-sm w-8 h-8 flex items-center justify-center scribe-btn-text font-black">
                    <span className="relative z-10">-</span>
                  </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-scribe-ink/10 bg-scribe-sidebar">
                {(['Layers', 'Assets']).map((tab, idx) => {
                  const tabId = idx === 0 ? 'layers' : 'assets';
                  return (
                    <button 
                      key={tabId} 
                      onClick={() => setSidebarTab(tabId as SidebarTab)} 
                      className={`lore-btn-medieval-sm flex-1 py-3 text-[10px] font-bold uppercase transition-all ${sidebarTab === tabId ? 'brightness-125' : 'opacity-70'}`}
                    >
                      <span className="relative z-10 scribe-btn-text font-bold">{tab}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-scribe p-5 space-y-8">
                  <div className="space-y-4">
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 scribe-ink">Tools</span>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {mode:'grab', label:'Grab'},
                        {mode:'select', label:'Select'},
                        {mode:'marker', label:'Point'},
                        {mode:'lasso', label:'Region'}
                      ].map(tool => (
                        <button 
                          key={tool.mode} 
                          onClick={() => { setDrawMode(tool.mode as any); setLassoPoints([]); }}
                          className={`lore-btn-medieval-sm py-4 transition-all ${drawMode === tool.mode ? 'brightness-125' : 'opacity-70'}`}
                        >
                          <span className="relative z-10 scribe-btn-text font-bold text-[10px] uppercase">{tool.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {selectedEntity ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="inspector" className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest scribe-ink opacity-40">Properties</span>
                          <button onClick={() => setSelectedEntity(null)} className="text-[9px] font-bold uppercase scribe-btn-text hover:opacity-100 opacity-60">Close</button>
                        </div>
                        <div className="bg-scribe-surface border border-scribe-ink/10 rounded-2xl p-4 space-y-4">
                            <div className="space-y-2">
                              <label className="text-[8px] font-bold uppercase scribe-ink opacity-40">Label</label>
                              <input 
                                className="w-full bg-transparent text-xs scribe-ink font-bold outline-none border-b border-scribe-ink/10" 
                                value={activeBorder?.label || activeMarker?.label || ''} 
                                onChange={e => updateSelected({ label: e.target.value })} 
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[8px] font-bold uppercase scribe-ink opacity-40">Hex</label>
                              <div className="flex items-center gap-4">
                                <input type="color" className="w-10 h-8 p-0 border-none bg-transparent cursor-pointer" value={activeColor} onChange={e => updateSelected({ color: e.target.value })} />
                                <span className="text-xs font-mono scribe-ink opacity-40 uppercase">{activeColor}</span>
                              </div>
                            </div>
                        </div>
                        <button onClick={deleteSelected} className="w-full py-3 border border-red-800/30 text-red-800 text-[10px] font-bold uppercase rounded-xl hover:bg-red-800 hover:text-white transition-all scribe-btn-text font-bold">Banish Entity</button>
                      </motion.div>
                    ) : sidebarTab === 'layers' ? (
                      <div className="space-y-6">
                        {[
                          { items: borders, type: 'border' as const, label: 'Regions' },
                          { items: markers, type: 'marker' as const, label: 'Points' },
                        ].filter(g => g.items.length > 0).map(group => (
                          <section key={group.type} className="space-y-2">
                            <p className="text-[9px] font-bold uppercase scribe-ink opacity-40">{group.label}</p>
                            <div className="space-y-2">
                              {group.items.map((item) => (
                                <button 
                                  key={item.id} 
                                  onClick={() => setSelectedEntity({ type: group.type, id: item.id })} 
                                  className="w-full px-4 py-3 text-left border border-scribe-ink/10 bg-scribe-surface rounded-xl scribe-btn-text font-bold text-[10px] uppercase truncate hover:border-scribe-ink/30 transition-all"
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-6 text-center">
                        <div 
                         className="border-2 border-dashed border-scribe-ink/10 bg-scribe-surface p-8 rounded-3xl cursor-pointer hover:border-scribe-ink/30 transition-all scribe-btn-text font-bold" 
                         onClick={() => fileInputRef.current?.click()}
                        >
                          <p className="text-[10px] uppercase opacity-60">Upload Map Image</p>
                          <input 
                            ref={fileInputRef} 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => { 
                              const file = e.target.files?.[0]; 
                              if(file){ 
                                const reader = new FileReader(); 
                                reader.onloadend = () => { setMapImage(reader.result as string); markAsDirty(); }; 
                                reader.readAsDataURL(file); 
                              } 
                            }} 
                            className="hidden" 
                          />
                        </div>
                        {mapImage && (
                          <div className="p-4 border border-scribe-ink/10 bg-scribe-surface space-y-3 rounded-2xl">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest scribe-ink">Background</span>
                              <button onClick={() => { setMapImage(null); markAsDirty(); }} className="text-red-700 hover:opacity-70 font-bold uppercase text-[9px] scribe-btn-text">Remove</button>
                            </div>
                            <div className="aspect-video bg-black rounded-lg overflow-hidden"><img src={mapImage} className="w-full h-full object-cover opacity-80" alt="Map background" /></div>
                          </div>
                        )}
                      </div>
                    )}
                  </AnimatePresence>
              </div>

              <div className="p-6 border-t border-scribe-ink/10 bg-scribe-sidebar">
                <button 
                  disabled={syncStatus === 'saving' || (syncStatus === 'idle' && !isDirty)} 
                  onClick={syncToCloud} 
                  className="lore-btn-medieval w-full py-4 transition-all"
                >
                  <span className="relative z-10 scribe-btn-text font-bold text-[11px]">{syncStatus === 'saving' ? 'Saving' : 'Save Atlas'}</span>
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Canvas Area */}
        <main 
          ref={mainRef} 
          className="flex-1 relative overflow-hidden bg-transparent" 
          onPointerDown={handlePointerDown} 
          onPointerMove={handlePointerMove} 
          onPointerUp={handlePointerUp} 
          onWheel={handleWheel}
        >
          {/* Top Status Badges and Controls */}
          <div className="absolute top-8 left-8 right-8 flex items-start justify-between z-40 pointer-events-none">
              <div className="flex gap-4 pointer-events-auto">
                <StatusBadge label="Link" value={syncStatus === 'idle' ? 'Ready' : syncStatus} active={syncStatus === 'saving'} />
                <StatusBadge label="Mode" value={drawMode} active={true} />
                <StatusBadge label="Asset Count" value={markers.length + borders.length} active={false} />
              </div>
              
              <div className="flex gap-2 pointer-events-auto">
                {isCollapsed && (
                  <button onClick={() => setIsCollapsed(false)} className="lore-btn-medieval-sm w-10 h-10 flex items-center justify-center scribe-btn-text font-black">
                    <span className="relative z-10">+</span>
                  </button>
                )}
                <button onClick={() => setShowLabels(!showLabels)} className="lore-btn-medieval-sm w-10 h-10 flex items-center justify-center scribe-btn-text font-bold text-[8px] uppercase">
                   <span className="relative z-10">{showLabels ? 'Hide' : 'Show'}</span>
                </button>
                <button onClick={() => setZoom(z => Math.min(ZOOM_MAX, z * ZOOM_STEP))} className="lore-btn-medieval-sm w-10 h-10 flex items-center justify-center scribe-btn-text font-black">
                   <span className="relative z-10">+</span>
                </button>
                <button onClick={() => setZoom(z => Math.max(ZOOM_MIN, z / ZOOM_STEP))} className="lore-btn-medieval-sm w-10 h-10 flex items-center justify-center scribe-btn-text font-black">
                   <span className="relative z-10">-</span>
                </button>
                <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(0.7); }} className="lore-btn-medieval-sm w-10 h-10 flex items-center justify-center scribe-btn-text text-[16px]">
                   <span className="relative z-10">↺</span>
                </button>
              </div>
          </div>

          {/* SVG Canvas Content */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${pan.x}px,${pan.y}px)` }}>
            <div className="relative" style={{ width: MAP_WIDTH, height: MAP_HEIGHT, transform: `scale(${zoom})`, transformOrigin: 'center' }}>
              {mapImage && <img src={mapImage} className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90 contrast-[1.05]" draggable={false} alt="Map base" />}
              
              <svg 
                ref={svgRef} 
                onClick={handleCanvasClick} 
                className="absolute inset-0 w-full h-full overflow-visible z-20" 
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} 
                preserveAspectRatio="xMidYMid meet"
              >
                  <defs>
                    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="1.5" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>

                  {borders.map(b => {
                    const isSelected = selectedEntity?.id === b.id;
                    const color = b.color || '#3b3a2a';
                    const polyPath = pointsToString(b.points);
                    if (!polyPath) return null;

                    return (
                      <g key={b.id} onPointerDown={e => onBorderPointerDown(e, b)} className="cursor-pointer">
                        <polygon points={polyPath} fill={hexToRgba(color, isSelected ? 0.2 : 0.05)} stroke={color} strokeWidth={isSelected ? 1.5 : 0.8} strokeDasharray={isSelected ? "none" : "4, 4"} filter={isSelected ? 'url(#glow)' : undefined} className="transition-all duration-300" />
                        {showLabels && (
                          <text x={getCentroid(b.points).x} y={getCentroid(b.points).y} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold" className="uppercase pointer-events-none tracking-widest opacity-80">{b.label}</text>
                        )}
                        {isSelected && b.points.map((p, i) => (
                           <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} filter="url(#glow)" className="cursor-crosshair" onPointerDown={e => onVertexDown(e, b.id, i)} />
                        ))}
                      </g>
                    );
                  })}
                  
                  {markers.map(m => {
                    const isSelected = selectedEntity?.id === m.id;
                    const color = m.style?.color || '#3b3a2a';
                    return (
                      <g key={m.id} transform={`translate(${m.x},${m.y})`} onPointerDown={e => onMarkerPointerDown(e, m.id)} className="cursor-pointer">
                        {isSelected && ( <g className="animate-pulse opacity-50"><path d="M-6,-3 L-6,-6 L-3,-6 M3,-6 L6,-6 L6,-3 M6,3 L6,6 L3,6 M-3,6 L-6,6 L-6,3" fill="none" stroke={color} strokeWidth={0.5} /></g> )}
                        <circle r={isSelected ? 3.5 : 2.5} fill={color} filter="url(#glow)" className="transition-all duration-300" />
                        {showLabels && (
                          <text y="12" textAnchor="middle" fill={color} fontSize="8" fontWeight="bold" className="uppercase pointer-events-none tracking-tighter opacity-80">{m.label}</text>
                        )}
                      </g>
                    );
                  })}

                  {lassoPoints.length > 0 && (
                    <g>
                      <polyline points={pointsToString([...lassoPoints, cursorPos])} fill="none" stroke="rgba(182,165,77,0.5)" strokeWidth={1} strokeDasharray="3, 3" />
                      {lassoPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.5} fill="currentColor" className="scribe-ink" />)}
                    </g>
                  )}
              </svg>
            </div>
          </div>

          <div className="absolute bottom-8 left-8 right-8 pointer-events-none flex justify-center">
             <div className="inline-flex items-center gap-5 px-6 py-4 bg-scribe-sidebar backdrop-blur-lg border border-scribe-ink/10 rounded-full shadow-lg pointer-events-auto">
                <div className="text-[10px] font-bold scribe-ink opacity-40 uppercase tracking-wider scribe-ink">X: {Math.round(cursorPos.x)} | Y: {Math.round(cursorPos.y)}</div>
                <div className="h-4 w-px bg-scribe-ink/10" />
                <div className="text-[10px] font-bold scribe-ink uppercase scribe-ink">LoreKeep Atlas v4.2</div>
             </div>
          </div>
        </main>
      </div>

      <style>{`
        :root {
          --scribe-ink: #2d1f13;
          --scribe-bg: #d1cfc4;
          --scribe-btn: #b6a54d;
          --scribe-sidebar: rgba(0, 0, 0, 0.04);
          --scribe-surface: #d1cfc4;
          --parchment-img: url('./assets/ui/parchment-base.png');
        }
        html[data-theme='dark'] {
          --scribe-ink: #1a1714;
          --scribe-bg: #2a2621;
          --scribe-sidebar: rgba(0, 0, 0, 0.2);
          --scribe-surface: #2a2621;
          --parchment-img: url('./assets/ui/parchment-dark.png');
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
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative;
          font-family: ${MONO} !important;
        }
        .lore-btn-medieval { border-image-source: url('./assets/ui/medieval-frame.png'); border-image-slice: 165 fill; border-width: 14px; }
        .lore-btn-medieval-sm { border-image-source: url('./assets/ui/medieval-frame-small.png'); border-image-slice: 165 fill; border-width: 14px; }
        .lore-btn-medieval:hover, .lore-btn-medieval-sm:hover { filter: brightness(1.3); transform: translateY(-1px); }
      `}</style>
    </div>
  );
}