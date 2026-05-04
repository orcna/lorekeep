import { useState, useCallback } from 'react';

export function useHistory<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex] = useState(0);

  const pushState = useCallback((newState: T) => {
    // Basic deep check to avoid duplicate states if T is a simple object
    if (JSON.stringify(newState) === JSON.stringify(history[index])) return;

    const newHistory = history.slice(0, index + 1);
    newHistory.push(newState);
    
    // Limit history to 50 steps
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setIndex(newHistory.length - 1);
    }
    
    setHistory(newHistory);
    setState(newState);
  }, [history, index]);

  const undo = useCallback(() => {
    if (index > 0) {
      const newIndex = index - 1;
      setIndex(newIndex);
      setState(history[newIndex]);
    }
  }, [history, index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) {
      const newIndex = index + 1;
      setIndex(newIndex);
      setState(history[newIndex]);
    }
  }, [history, index]);

  const reset = useCallback((newState: T) => {
    setState(newState);
    setHistory([newState]);
    setIndex(0);
  }, []);

  return { 
    state, 
    set: pushState, 
    undo, 
    redo, 
    reset,
    canUndo: index > 0, 
    canRedo: index < history.length - 1 
  };
}
