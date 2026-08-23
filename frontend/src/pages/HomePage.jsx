import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';
import CompanyLogo from '../components/CompanyLogo';
import TickerBar from '../components/TickerBar';
import Sparkline from '../components/Sparkline';
import { NotificationBell } from '../components/Toast';
import ThemeToggle from '../components/ThemeToggle';

const SECTORS = ['All', 'Banking', 'IT', 'Energy', 'FMCG', 'Pharma',
                 'Auto', 'Metals', 'Finance', 'Insurance', 'Healthcare',
                 'Materials', 'Telecom', 'Conglomerate', 'Consumer'];

export default function HomePage() {
  const navigate                    = useNavigate();
  const { prices, history, subscribe, unsubscribe } = useWebSocket();
  const { logout }                  = useAuth();

  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [sector, setSector]           = useState('All');
  const [sortBy, setSortBy]           = useState('symbol'); 

  useEffect(() => {
    let cancelled = false;
    apiFetch('/instruments')
      .then(d => { if (!cancelled && d?.data) setInstruments(d.data); })
      .catch(err => { if (err.message.includes('401')) navigate('/login'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  const noop = useCallback(() => {}, []);
  useEffect(() => {
    if (!instruments.length) return;
    instruments.forEach(i => subscribe(i.symbol, noop));
    return () => instruments.forEach(i => unsubscribe(i.symbol, noop));
  }, [instruments, subscribe, unsubscribe, noop]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const filtered = instruments
    .filter(i => {
      const matchSearch = !search ||
        i.symbol.includes(search.toUpperCase()) ||
        i.company_name.toLowerCase().includes(search.toLowerCase());
      const matchSector = sector === 'All' || i.sector === sector;
      return matchSearch && matchSector;
    })
    .map(i => {
      const price   = prices[i.symbol];
      const hist    = history[i.symbol] || [];
      const oldest  = hist.length > 1 ? hist[0] : price;
      const change  = price && oldest ? ((price - oldest) / oldest) * 100 : 0;
      return { ...i, price, hist, change };
    })
    .sort((a, b) => {
      if (sortBy === 'price')  return (b.price || 0) - (a.price || 0);
      if (sortBy === 'change') return b.change - a.change;
      return a.symbol.localeCompare(b.symbol);
    });

  return (
    <div style={S.page} className="nexus-page">
      {/* Navbar */}
      <nav style={S.nav} className="nexus-nav">
        <span style={S.logo}>NexusBroker</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <NavBtn onClick={() => navigate('/dashboard')}>Portfolio</NavBtn>
          <NavBtn onClick={() => navigate('/orders')}>Orders</NavBtn>
          <NavBtn onClick={() => navigate('/wallet')}>Wallet</NavBtn>
          <ThemeToggle/>
          <NotificationBell/>
          <button onClick={handleLogout} style={S.logoutBtn}>Logout</button>
        </div>
      </nav>

      {/* Live ticker */}
      <div style={{ margin: '0 -20px' }}>
        <TickerBar instruments={instruments} />
      </div>

      {/* Hero */}
      <div style={S.hero}>
        <h1 style={S.heroTitle}>Markets</h1>
        <p style={{ color: '#787b86', fontSize: 14, margin: 0 }}>
          {instruments.length} instruments · Live prices · Click any stock to trade
        </p>
      </div>

      {/* Controls row */}
      <div style={S.controlsRow}>
        {/* Search */}
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input
            placeholder="Search symbol or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={S.searchInput}
          />
          {search && (
            <button onClick={() => setSearch('')} style={S.clearBtn}>✕</button>
          )}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={S.select}>
          <option value="symbol">Sort: A–Z</option>
          <option value="price">Sort: Price</option>
          <option value="change">Sort: % Change</option>
        </select>
      </div>

      {/* Sector chips */}
      <div style={S.sectorRow}>
        {SECTORS.map(s => (
          <button key={s} onClick={() => setSector(s)} style={{
            ...S.sectorChip,
            background:  sector === s ? '#2196f3' : '#1e222d',
            color:       sector === s ? '#fff'    : '#787b86',
            border:      `1px solid ${sector === s ? '#2196f3' : '#2a2e39'}`,
            fontWeight:  sector === s ? 600 : 400,
          }}>{s}</button>
        ))}
      </div>

      {/* Table header */}
      {!loading && filtered.length > 0 && (
        <div style={S.tableHeader}>
          <div>Company</div>
          <div>Sector</div>
          <div style={{ textAlign: 'right' }}>Price</div>
          <div style={{ textAlign: 'right' }}>Change</div>
          <div style={{ textAlign: 'center' }}>Trend</div>
          <div style={{ textAlign: 'center' }}>Action</div>
        </div>
      )}

      {/* Instrument rows */}
      {loading ? (
        <div style={S.centered}>
          <div style={{ color: '#787b86' }}>Loading market data...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={S.centered}>
          <div style={{ color: '#787b86' }}>No instruments match your search.</div>
        </div>
      ) : (
        <div>
          {filtered.map(inst => {
            const hasPrice  = inst.price != null;
            const isUp      = inst.change >= 0;
            const changeCol = hasPrice ? (isUp ? '#26a69a' : '#ef5350') : '#555';

            return (
              <div
                key={inst.id}
                onClick={() => navigate(`/trade/${inst.symbol}`)}
                style={S.row}
                onMouseEnter={e => e.currentTarget.style.background = '#1a1f2e'}
                onMouseLeave={e => e.currentTarget.style.background = '#131722'}
              >
                {/* Company + logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CompanyLogo
                    symbol={inst.symbol}
                    domain={inst.domain}
                    sector={inst.sector}
                    size={36}
                  />
                  <div>
                    <div style={{ fontWeight: 700, color: '#e0e3eb', fontSize: 14 }}>
                      {inst.symbol}
                    </div>
                    <div style={{ color: '#787b86', fontSize: 11 }}>
                      {inst.company_name.length > 28
                        ? inst.company_name.slice(0, 28) + '…'
                        : inst.company_name}
                    </div>
                  </div>
                </div>

                {/* Sector badge */}
                <div>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 10,
                    background: '#1e222d', color: '#787b86', fontWeight: 500,
                    border: '1px solid #2a2e39',
                  }}>
                    {inst.sector}
                  </span>
                </div>

                {/* Live price */}
                <div style={{ textAlign: 'right' }}>
                  {hasPrice ? (
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e3eb' }}>
                      {formatCurrency(inst.price)}
                    </div>
                  ) : (
                    <div style={{ color: '#555', fontSize: 13 }}>—</div>
                  )}
                </div>

                {/* % Change since session start */}
                <div style={{ textAlign: 'right' }}>
                  {hasPrice && inst.hist.length > 1 ? (
                    <div style={{ color: changeCol, fontWeight: 600, fontSize: 13 }}>
                      {isUp ? '▲' : '▼'} {Math.abs(inst.change).toFixed(2)}%
                    </div>
                  ) : (
                    <div style={{ color: '#555', fontSize: 12 }}>—</div>
                  )}
                </div>

                {/* Sparkline */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Sparkline
                    data={inst.hist}
                    color={changeCol}
                    width={80}
                    height={28}
                  />
                </div>

                {/* Trade button */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/trade/${inst.symbol}`); }}
                    style={S.tradeBtn}
                  >
                    Trade
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}

function NavBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: '1px solid #2a2e39',
      color: '#e0e3eb', padding: '6px 14px', borderRadius: 4,
      cursor: 'pointer', fontSize: 13,
    }}>{children}</button>
  );
}

const S = {
  page:       { maxWidth: 1100, margin: '0 auto', padding: '0 20px',
                fontFamily: 'var(--font)',minHeight: '100vh'},
  nav:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 0', borderBottom: '1px solid var(--nav-border)' },
  logo:       { fontSize: 18, fontWeight: 700, color: '#2196f3', letterSpacing: 1 },
  logoutBtn:  { background: 'transparent', border: '1px solid #ef5350', color: '#ef5350',
                padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
  hero:       { padding: '28px 0 16px' },
  heroTitle:  { fontSize: 28, fontWeight: 800, color: '#e0e3eb', margin: '0 0 6px' },
  controlsRow:{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' },
  searchWrap: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 12, color: '#555', fontSize: 18, pointerEvents: 'none' },
  searchInput:{ width: '100%', background: '#131722', border: '1px solid #2a2e39',
                color: '#e0e3eb', borderRadius: 6, padding: '10px 36px',
                fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  clearBtn:   { position: 'absolute', right: 10, background: 'none', border: 'none',
                color: '#555', cursor: 'pointer', fontSize: 14 },
  select:     { background: '#131722', border: '1px solid #2a2e39', color: '#e0e3eb',
                borderRadius: 6, padding: '10px 12px', fontSize: 13, cursor: 'pointer',
                outline: 'none', fontFamily: 'inherit' },
  sectorRow:  { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  sectorChip: { padding: '5px 12px', borderRadius: 20, fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' },
  tableHeader:{ display: 'grid',
                gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 0.8fr',
                padding: '8px 16px', marginBottom: 4,
                color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:        { display: 'grid',
                gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 0.8fr',
                alignItems: 'center', padding: '12px 16px',
                background: '#131722', border: '1px solid #2a2e39',
                borderRadius: 6, marginBottom: 4, cursor: 'pointer',
                transition: 'background 0.15s' },
  tradeBtn:   { background: '#2196f3', border: 'none', color: '#fff',
                padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit' },
  centered:   { display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: 300, color: '#787b86' },
};