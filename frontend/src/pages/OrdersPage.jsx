import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';
import CompanyLogo from '../components/CompanyLogo';
import { ErrorBox } from '../components/FormFeedback';
import { AppEvents, emitEvent } from '../utils/events';
import { NotificationBell } from '../components/Toast';
import ThemeToggle from '../components/ThemeToggle';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'];

const STATUS_STYLE = {
  PENDING:   { color: 'var(--yellow)',  bg: 'rgba(244,185,66,0.08)',  label: 'Pending'   },
  PARTIAL:   { color: 'var(--blue)',    bg: 'var(--blue-bg)',          label: 'Partial'   },
  FILLED:    { color: 'var(--green)',   bg: 'var(--green-bg)',         label: 'Filled'    },
  CANCELLED: { color: 'var(--text-muted)', bg: 'rgba(90,90,90,0.08)', label: 'Cancelled' },
  REJECTED:  { color: 'var(--red)',     bg: 'var(--red-bg)',           label: 'Rejected'  },
};

const CANCELLABLE = new Set(['PENDING', 'PARTIAL']);

export default function OrdersPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { prices, subscribe, unsubscribe } = useWebSocket();

  const [orders, setOrders]         = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [cancelling, setCancelling] = useState(null);

  const activeSymbols = [...new Set(
    orders
      .filter(o => CANCELLABLE.has(o.status))
      .map(o => o.instrument?.symbol)
      .filter(Boolean)
  )];

  useEffect(() => {
    if (!activeSymbols.length) return;
    const noop = () => {};
    activeSymbols.forEach(s => subscribe(s, noop));
    return () => activeSymbols.forEach(s => unsubscribe(s, noop));
  }, [activeSymbols.join(','), subscribe, unsubscribe]); // eslint-disable-line

  useEffect(() => {
    let cancelled = false;
    const query = filter !== 'ALL' ? `?status=${filter}` : '';
    apiFetch(`/orders${query}`)
      .then(data => { if (!cancelled && data?.data) setOrders(data.data); })
      .catch(err => {
        if (!cancelled) {
          if (err.message.includes('401')) navigate('/login');
          else setError(err.message);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter, navigate]);

  const handleRefresh = useCallback(() => {
    setError('');
    setLoading(true);
    const query = filter !== 'ALL' ? `?status=${filter}` : '';
    apiFetch(`/orders${query}`)
      .then(data => { if (data?.data) setOrders(data.data); })
      .catch(err => {
        if (err.message.includes('401')) navigate('/login');
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [filter, navigate]);

  const handleCancel = async (orderId) => {
    setCancelling(orderId);
    try {
      await apiFetch(`/orders/${orderId}`, { method: 'DELETE' });
      handleRefresh();
      emitEvent(AppEvents.WALLET_CHANGED);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={S.page} className="nexus-page">
      <nav style={S.nav} className="nexus-nav">
        <span style={S.logo} onClick={() => navigate('/dashboard')}>NexusBroker</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <NavBtn onClick={() => navigate('/dashboard')}>Portfolio</NavBtn>
          <NavBtn onClick={() => navigate('/')}>Markets</NavBtn>
          <NavBtn onClick={() => navigate('/wallet')}>Wallet</NavBtn>
          <ThemeToggle />
          <NotificationBell />
          <button onClick={handleLogout} style={S.logoutBtn}>Logout</button>
        </div>
      </nav>

      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)' }}>Order History</h2>
        <button onClick={handleRefresh} style={S.refreshBtn}>↻ Refresh</button>
      </div>

      {/* Status filter tabs */}
      <div style={S.filterRow}>
        {STATUS_OPTIONS.map(s => (
          <button key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            style={{
              ...S.filterTab,
              background:  filter === s ? 'var(--blue)'  : 'transparent',
              color:       filter === s ? '#fff'          : 'var(--text-muted)',
              borderColor: filter === s ? 'var(--blue)'  : 'var(--border)',
              fontWeight:  filter === s ? 600 : 400,
            }}>
            {s}
          </button>
        ))}
      </div>

      <ErrorBox message={error} />

      {loading ? (
        <div style={S.centered}>
          <div style={{ color: 'var(--text-muted)' }}>Loading orders...</div>
        </div>
      ) : orders.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 500 }}>
            No {filter !== 'ALL' ? filter.toLowerCase() : ''} orders found.
          </div>
          <button onClick={() => navigate('/')} style={S.ctaBtn}>
            Browse Markets →
          </button>
        </div>
      ) : (
        <div>
          {/* Table header */}
          <div style={S.tableHeader}>
            {['Instrument', 'Side', 'Type', 'Qty / Filled', 'Order Price', 'Mkt Price', 'Status', 'Placed At', ''].map(h => (
              <div key={h} style={{ color: 'var(--text-muted)', fontSize: 10,
                textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {h}
              </div>
            ))}
          </div>

          {orders.map(order => {
            const st        = STATUS_STYLE[order.status] || STATUS_STYLE.PENDING;
            const isBuy     = order.side === 'BUY';
            const canCancel = CANCELLABLE.has(order.status);
            const symbol    = order.instrument?.symbol;
            const livePrice = symbol ? prices[symbol] : null;
            const isMarket  = order.order_type === 'MARKET';

            const priceDiff = !isMarket && livePrice && order.price
              ? ((livePrice - order.price) / order.price * 100)
              : null;

            return (
              <div key={order.order_id} style={S.row}
                onClick={() => navigate(`/trade/${symbol}`)}
              >
                {/* Instrument */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={e => e.stopPropagation()} // prevent nav when clicking logo
                >
                  <CompanyLogo
                    symbol={order.instrument?.symbol}
                    domain={order.instrument?.domain}
                    sector={order.instrument?.sector}
                    size={30}
                  />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
                      {order.instrument?.symbol ?? '—'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {order.product_type} · {order.instrument?.exchange ?? 'NSE'}
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{
                    fontWeight: 700, fontSize: 10,
                    color: isBuy ? 'var(--green)' : 'var(--red)',
                    background: isBuy ? 'var(--green-bg)' : 'var(--red-bg)',
                    border: `1px solid ${isBuy ? 'var(--green-border)' : 'var(--red-border)'}`,
                    padding: '2px 6px', borderRadius: 3,
                    display: 'inline-block', letterSpacing: 0.3,
                  }}>
                    {order.side}
                  </span>
                </div>

                {/* Order type */}
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {order.order_type}
                </div>

                {/* Qty / filled */}
                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>
                    {order.filled_quantity}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {' '}/ {order.quantity}
                  </span>
                </div>

                {/* Order price column*/}
                <div style={{ fontSize: 13 }}>
                  {isMarket ? (
                    <div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: 'var(--yellow)',
                        background: 'rgba(244,185,66,0.1)',
                        border: '1px solid rgba(244,185,66,0.2)',
                        padding: '2px 6px', borderRadius: 4, display: 'inline-block',
                      }}>
                        MARKET
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {formatCurrency(order.price)}
                    </span>
                  )}
                </div>

                {/* Current market price (LTP) */}
                <div style={{ fontSize: 12 }}>
                  {livePrice ? (
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {formatCurrency(livePrice)}
                      </div>
                      {!isMarket && priceDiff !== null && (
                        <div style={{
                          fontSize: 10, marginTop: 1,
                          color: Math.abs(priceDiff) < 0.5
                            ? 'var(--green)' : 'var(--text-muted)',
                        }}>
                          {priceDiff > 0 ? '↑' : '↓'}{Math.abs(priceDiff).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>

                {/* Status badge */}
                <div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 8px',
                    borderRadius: 20, letterSpacing: 0.3,
                    color: st.color, background: st.bg,
                    border: `1px solid ${st.color}30`,
                    whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                </div>

                {/* Time */}
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {order.placed_at
                    ? new Date(order.placed_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      })
                    : '—'
                  }
                </div>

                {/* Cancel */}
                <div onClick={e => e.stopPropagation()}>
                  {canCancel ? (
                    <button
                      onClick={() => handleCancel(order.order_id)}
                      disabled={cancelling === order.order_id}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--red-border)',
                        color: 'var(--red)',
                        padding: '4px 10px', borderRadius: 4,
                        fontSize: 11, fontFamily: 'inherit',
                        opacity: cancelling === order.order_id ? 0.5 : 1,
                        cursor: cancelling === order.order_id ? 'not-allowed' : 'pointer',
                      }}>
                      {cancelling === order.order_id ? '…' : 'Cancel'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent',
      border: '1px solid var(--border)',
      color: 'var(--text-secondary)',
      padding: '6px 14px', borderRadius: 4,
      cursor: 'pointer', fontSize: 13,
      transition: 'border-color 0.15s',
    }}>{children}</button>
  );
}

const S = {
  page: {
    maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px',
    fontFamily: 'var(--font)',minHeight: '100vh'},
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 0', marginBottom: 24,
    borderBottom: '1px solid var(--nav-border)',
  },
  logo: {
    fontSize: 18, fontWeight: 800, color: 'var(--blue)',
    letterSpacing: 0.5, cursor: 'pointer',
  },
  logoutBtn: {
    background: 'transparent', border: '1px solid var(--red-border)',
    color: 'var(--red)', padding: '6px 14px', borderRadius: 4,
    cursor: 'pointer', fontSize: 13,
  },
  filterRow:   { display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' },
  filterTab:   {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-muted)', padding: '5px 14px', borderRadius: 20,
    cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  refreshBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-muted)', padding: '4px 10px', borderRadius: 4,
    cursor: 'pointer', fontSize: 12,
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1.6fr 0.5fr 0.5fr 0.7fr 0.9fr 0.9fr 0.8fr 1fr 0.5fr',
    padding: '8px 16px', marginBottom: 6,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.6fr 0.5fr 0.5fr 0.7fr 0.9fr 0.9fr 0.8fr 1fr 0.5fr',
    alignItems: 'center', padding: '12px 16px',
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 8, marginBottom: 4, cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  ctaBtn: {
    background: 'var(--blue)', border: 'none', color: '#fff',
    padding: '10px 20px', borderRadius: 6, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
  },
  empty: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 48, textAlign: 'center',
  },
  centered: {
    display: 'flex', justifyContent: 'center',
    alignItems: 'center', minHeight: 200,
  },
};