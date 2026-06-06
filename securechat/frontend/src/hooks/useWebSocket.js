import { useRef, useCallback, useEffect } from 'react';

export function useWebSocket({ onMessage, onOpen, onClose }) {
  const wsRef = useRef(null);
  const handlersRef = useRef({ onMessage, onOpen, onClose });

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose };
  });

  const connect = useCallback((roomId) => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId }));
      handlersRef.current.onOpen?.();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handlersRef.current.onMessage?.(msg);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = (e) => {
      handlersRef.current.onClose?.(e.code, e.reason);
    };

    return ws;
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { connect, send, close };
}
