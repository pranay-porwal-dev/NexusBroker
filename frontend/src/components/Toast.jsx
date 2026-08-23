import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../hooks/useApi';

let toastListeners   = [];
let bellListeners    = [];

// eslint-disable-next-line react-refresh/only-export-components
export function showToast(msg) {
  const notification = { id: Date.now() + Math.random(), ...msg };
  toastListeners.forEach(fn => fn(notification));
  bellListeners.forEach(fn => fn(notification));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (notification) => {
      setToasts(prev => [...prev, notification]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== notification.id));
      }, 4000);
    };
    toastListeners.push(handler);
    return () => { toastListeners = toastListeners.filter(l => l !== handler); };
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#0f1117',
          border: `1px solid ${t.color || '#2196f3'}`,
          borderLeft: `3px solid ${t.color || '#2196f3'}`,
          borderRadius: 8, padding: '12px 16px',
          minWidth: 280, maxWidth: 360,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          animation: 'toastIn 0.25s ease',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon || '🔔'}</span>
          <div>
            <div style={{ fontWeight: 700, color: t.color || '#2196f3',
              fontSize: 13, marginBottom: 2 }}>
              {t.title}
            </div>
            <div style={{ color: '#787b86', fontSize: 12, lineHeight: 1.4 }}>
              {t.body}
            </div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { transform: translateX(60px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen]                   = useState(false);
  const [unread, setUnread]               = useState(0);
  const panelRef                          = useRef(null);

  useEffect(() => {
    const handler = (notification) => {
      setNotifications(prev => [notification, ...prev].slice(0, 20)); // keep last 20
      setUnread(prev => prev + 1);
    };
    bellListeners.push(handler);
    return () => { bellListeners = bellListeners.filter(l => l !== handler); };
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(prev => !prev);
    setUnread(0); 
  };

  const clearAll = () => setNotifications([]);

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* Bell button */}
      <button onClick={handleOpen} style={{
        background: 'transparent',
        border: `1px solid ${open ? '#2196f3' : '#2a2e39'}`,
        color: open ? '#2196f3' : '#787b86',
        borderRadius: 4, padding: '6px 10px',
        cursor: 'pointer', fontSize: 16,
        position: 'relative',
        transition: 'all 0.15s',
      }}>
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6,
            background: '#ef5350', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: '50%',
            width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #0f1117',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, background: '#131722',
          border: '1px solid #2a2e39', borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid #2a2e39',
          }}>
            <span style={{ fontWeight: 700, color: '#e0e3eb', fontSize: 14 }}>
              Notifications
            </span>
            {notifications.length > 0 && (
              <button onClick={clearAll} style={{
                background: 'none', border: 'none', color: '#555',
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Clear all
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '32px 16px', textAlign: 'center',
                color: '#555', fontSize: 13,
              }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} style={{
                  padding: '12px 16px', borderBottom: '1px solid #1e222d',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon || '🔔'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: n.color || '#2196f3',
                      fontSize: 12, marginBottom: 2 }}>
                      {n.title}
                    </div>
                    <div style={{ color: '#787b86', fontSize: 11, lineHeight: 1.4 }}>
                      {n.body}
                    </div>
                    <div style={{ color: '#555', fontSize: 10, marginTop: 3 }}>
                      {new Date(n.id).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit', hour12: true,
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Order watcher — polls for status changes, fires toasts ───────────────────
export function OrderWatcher() {
  const prevRef = useRef(new Map());
  const seenFilled = useRef(new Set());

  const checkOrders = useCallback(async () => {
    try {
      const [pending, partial] = await Promise.all([
        apiFetch('/orders?status=PENDING'),
        apiFetch('/orders?status=PARTIAL'),
      ]);

      const active = [
        ...(pending?.data || []),
        ...(partial?.data || []),
      ];

      if (prevRef.current.size === 0 && active.length > 0) {
        active.forEach(o => prevRef.current.set(o.order_id, o.status));
        return;
      }
      active.forEach(o => {
        const prev = prevRef.current.get(o.order_id);
        if (prev && prev !== o.status) {
          if (o.status === 'PARTIAL') {
            showToast({
              icon:  '◑',
              title: `Partially Filled — ${o.instrument?.symbol}`,
              body:  `${o.filled_quantity} of ${o.quantity} shares ${o.side}`,
              color: '#2196f3',
            });
          }
        }
        prevRef.current.set(o.order_id, o.status);
      });

      const activeIds = new Set(active.map(o => o.order_id));
      for (const [orderId, data] of prevRef.current.entries()) {
        if (!activeIds.has(orderId) && !seenFilled.current.has(orderId) &&
            typeof data === 'object') {
          seenFilled.current.add(orderId);
        }
      }

    } catch {
      // Silently fail — polling errors shouldn't disrupt the UI
    }
  }, []);


  const checkFilled = useCallback(async () => {
    try {
      const filled = await apiFetch('/orders?status=FILLED');
      const recentFilled = (filled?.data || []).slice(0, 20);

      recentFilled.forEach(o => {
        if (!seenFilled.current.has(o.order_id)) {
          seenFilled.current.add(o.order_id);

          // Only toast for orders placed this session (within last 10 minutes)
          const placedAt = new Date(o.placed_at || o.updated_at);
          const ageMs    = Date.now() - placedAt.getTime();
          if (ageMs < 10 * 60 * 1000) {  
            showToast({
              icon:  o.side === 'BUY' ? '✅' : '💰',
              title: `Order Filled — ${o.instrument?.symbol}`,
              body:  `${o.filled_quantity} shares ${o.side}${
                o.price ? ` @ ₹${o.price}` : ' at market price'
              }`,
              color: o.side === 'BUY' ? '#26a69a' : '#ef5350',
            });
          }
        }
      });
    } catch (error){
      console.error("Failed to parse WebSocket message:", error);
    }
  }, []);

  useEffect(() => {
    apiFetch('/orders?status=FILLED')
      .then(d => { (d?.data || []).forEach(o => seenFilled.current.add(o.order_id)); })
      .catch(() => {});

    const activeInterval = setInterval(checkOrders, 3000);
    const filledInterval = setInterval(checkFilled, 4000);

    return () => {
      clearInterval(activeInterval);
      clearInterval(filledInterval);
    };
  }, [checkOrders, checkFilled]);

  return null;
}