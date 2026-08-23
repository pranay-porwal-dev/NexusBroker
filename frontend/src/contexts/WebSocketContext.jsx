import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WebSocketContext = createContext(null);
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

export function WebSocketProvider({ children }) {
  const wsRef             = useRef(null);
  const [prices, setPrices] = useState({});
  const [history, setHistory] = useState({});
  const listenersRef      = useRef(new Map());
  const reconnectTimerRef = useRef(null);
  const isMountedRef      = useRef(true);
  const connectRef        = useRef(null);
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      listenersRef.current.forEach((_, symbol) => {
        ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'price') {
          setPrices(prev => ({ ...prev, [msg.symbol]: msg.price }));
          setHistory(prev => {
            const existing = prev[msg.symbol] || [];
            const updated  = [...existing, msg.price].slice(-20); // keep last 20
            return { ...prev, [msg.symbol]: updated };
          });
          listenersRef.current.get(msg.symbol)?.forEach(cb => cb(msg.price));
        }
        if (msg.type === 'subscribed') {
          if (msg.lastPrice !== null && msg.lastPrice !== undefined) {
            setPrices(prev => ({ ...prev, [msg.symbol]: msg.lastPrice }));
            setHistory(prev => ({
              ...prev,
              [msg.symbol]: prev[msg.symbol]?.length
                ? prev[msg.symbol]
                : [msg.lastPrice],
            }));
          }
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected. Reconnecting in 3s...');
      if (isMountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close(); 
    };
  }, []); 

  useEffect(() => {
    isMountedRef.current = true;
    connectRef.current = connect;  
    connect();
    return () => {
      isMountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((symbol, callback) => {
    if (!listenersRef.current.has(symbol)) {
      listenersRef.current.set(symbol, new Set());
    }
    listenersRef.current.get(symbol).add(callback);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }, []);

  const unsubscribe = useCallback((symbol, callback) => {
    const callbacks = listenersRef.current.get(symbol);
    if (!callbacks) return;
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      listenersRef.current.delete(symbol);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe', symbol }));
      }
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ prices, history, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWebSocket = () => useContext(WebSocketContext);
