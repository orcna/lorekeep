export type LoreCategory = 'character' | 'history' | 'mechanic' | 'location' | 'other';

export interface LoreEntry {
  id: string;
  title: string;
  content: string;
  category: LoreCategory;
  userId: string;
  universeId: string;
  createdAt: any;
  updatedAt: any;
}

export interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  timestamp: any;
  userId: string;
  universeId?: string;
}

export interface MapMarker {
  id: string;
  loreId: string;
  universeId: string;
  x: number; // percentage
  y: number; // percentage
  userId: string;
}

export interface MapLayer {
  id: string;
  name: string;
  imageUrl?: string;
  visible: boolean;
  opacity?: number;
  order?: number;
}

export interface MapBorder {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  isPolygon?: boolean;
  fillColor?: string;
}

export interface MapConfig {
  id: string;
  userId: string;
  universeId: string;
  imageUrl: string;
  useLineart: boolean;
  layers?: MapLayer[];
  borders?: MapBorder[];
}

export interface MindMapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  loreId?: string;
  category?: LoreCategory;
  isFolder?: boolean;
  isExpanded?: boolean;
  groupId?: string;
  isGroup?: boolean;
  collapsed?: boolean;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface MindMapData {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  universeId?: string;
  userId?: string;
  updatedAt?: any;
}

export interface Universe {
  id: string;
  name: string;
  description: string;
  userId: string;
  createdAt: any;
  updatedAt?: any;
}
