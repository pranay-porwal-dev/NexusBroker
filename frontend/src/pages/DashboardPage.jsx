import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatCurrency, formatPnL, formatPercent, pnlColor } from '../utils/format';
import HoldingCard from '../components/HoldingCard';
import TickerBar from '../components/TickerBar';
import { onEvent, AppEvents } from '../utils/events';
import { NotificationBell } from '../components/Toast';
import ThemeToggle from '../components/ThemeToggle';

export default function DashboardPage() {
  const [portfolio, setPortfolio]     = useState(null);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const { logout }                    = useAuth();
  const navigate                      = useNavigate();
  const { prices }                    = useWebSocket();

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch('/portfolio'), apiFetch('/instruments')])
      .then(([p, i]) => {
        if (cancelled) return;
        if (p?.data)   setPortfolio(p.data);
        if (i?.data)   setInstruments(i.data);
      })
      .catch(err => {
        if (!cancelled) {
          if (err.message.includes('401')) navigate('/login');
          else setError(err.message);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
  const cleanup = onEvent(AppEvents.WALLET_CHANGED, () => {
    apiFetch('/portfolio')
      .then(p => { if (p?.data) setPortfolio(p.data); })
      .catch(() => {});
    });
  return cleanup;
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    apiFetch('/portfolio')
      .then(p => { if (p?.data) setPortfolio(p.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) return (
    <div style={S.centered}><div style={{ color: '#787b86' }}>Loading portfolio...</div></div>
  );
  if (error) return (
    <div style={S.centered}><div style={{ color: '#ef5350' }}>{error}</div></div>
  );
  if (!portfolio) return null;

  const { wallet, holdings } = portfolio;

  let liveTotalInvested    = 0;
  let liveTotalCurrentVal  = 0;

  const enrichedHoldings = holdings.map(h => {
    const livePrice    = prices[h.symbol] ?? h.current_price;
    const liveValue    = livePrice * h.quantity;
    const livePnL      = liveValue - h.total_invested;
    const livePnLPct   = h.total_invested > 0 ? (livePnL / h.total_invested) * 100 : 0;

    liveTotalInvested   += h.total_invested;
    liveTotalCurrentVal += liveValue;

    return { ...h, livePrice, liveValue, livePnL, livePnLPct };
  });

  const liveTotalPnL    = liveTotalCurrentVal - liveTotalInvested;
  const liveTotalPnLPct = liveTotalInvested > 0
    ? (liveTotalPnL / liveTotalInvested) * 100 : 0;

  return (
    <div style={S.page} className="nexus-page">
      <nav style={S.nav} className="nexus-nav">
        <span style={S.logo}>NexusBroker</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <NavButton to="/"  label="Markets"  navigate={navigate} />
          <NavButton to="/orders" label="Orders" navigate={navigate} />
          <NavButton to="/wallet" label="Wallet" navigate={navigate} />
          <ThemeToggle/>
          <NotificationBell/>
          <button onClick={handleLogout} style={S.logoutBtn}>Logout</button>
        </div>
      </nav>

      {/* Live ticker */}
      <div style={{ margin: '0 -20px', marginBottom: 24 }}>
        <TickerBar instruments={instruments} />
      </div>

      {/* Wallet row */}
      <div style={S.grid3}>
        <MetricCard label="Available Balance" value={formatCurrency(wallet.available_balance)} />
        <MetricCard label="Total Balance"      value={formatCurrency(wallet.total_balance)} />
        <MetricCard label="In Open Orders"     value={formatCurrency(wallet.reserved_balance)} />
      </div>

      {/* Live P&L summary — updates on every WebSocket tick */}
      <div style={S.grid4}>
        <MetricCard label="Invested"      value={formatCurrency(liveTotalInvested)} />
        <MetricCard label="Current Value" value={formatCurrency(liveTotalCurrentVal)} />
        <MetricCard label="Unrealised P&L"
          value={formatPnL(liveTotalPnL)}
          valueColor={pnlColor(liveTotalPnL)} />
        <MetricCard label="P&L %"
          value={formatPercent(liveTotalPnLPct)}
          valueColor={pnlColor(liveTotalPnL)} />
      </div>

      {/* Holdings */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: '#e0e3eb', fontSize: 16 }}>
            Holdings ({holdings.length})
          </h2>
          <button onClick={handleRefresh} style={S.refreshBtn}>↻ Refresh</button>
        </div>

        {holdings.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ color: '#787b86', marginBottom: 12 }}>No holdings yet.</div>
            <Link to="/trade" style={{ color: '#2196f3', textDecoration: 'none' }}>
              Place your first trade →
            </Link>
          </div>
        ) : (
          enrichedHoldings.map(h => (
            <HoldingCard key={h.instrument_id} holding={h} />
          ))
        )}
      </div>
    </div>
  );
}

function NavButton({ to, label, navigate }) {
  return (
    <button onClick={() => navigate(to)} style={S.navBtn}>{label}</button>
  );
}

function MetricCard({ label, value, valueColor }) {
  return (
    <div style={S.metricCard} className='nexus-card'>
      <div style={{ color: '#787b86', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor || '#e0e3eb' }}>
        {value}
      </div>
    </div>
  );
}

const S = {
  page:       { maxWidth: 960, margin: '0 auto', padding: '0 20px 40px',
                fontFamily: 'var(--font)', minHeight: '100vh'},
  nav:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 0', marginBottom: 0, borderBottom: '1px solid var(--nav-border)' },
  logo:       { fontSize: 18, fontWeight: 700, color: '#2196f3', letterSpacing: 1 },
  navBtn:     { background: 'transparent', border: '1px solid #2a2e39', color: '#e0e3eb',
                padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
  logoutBtn:  { background: 'transparent', border: '1px solid #ef5350', color: '#ef5350',
                padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
  refreshBtn: { background: 'transparent', border: '1px solid #2a2e39', color: '#787b86',
                padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  grid3:      { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12,
                marginBottom: 12, marginTop: 24 },
  grid4:      { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 },
  metricCard: { background: '#131722', border: '1px solid #2a2e39', borderRadius: 8, padding: '14px 16px' },
  emptyState: { background: '#131722', border: '1px solid #2a2e39',
                borderRadius: 8, padding: 40, textAlign: 'center' },
  centered:   { display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: '100vh', background: '#0f1117' },
};