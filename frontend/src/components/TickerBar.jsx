import { useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatCurrency } from '../utils/format';

const SECTOR_COLORS = {
  'Banking':      '#1565c0',
  'Finance':      '#0277bd',
  'Insurance':    '#00695c',
  'IT':           '#6a1b9a',
  'Energy':       '#e65100',
  'FMCG':         '#2e7d32',
  'Pharma':       '#ad1457',
  'Healthcare':   '#c62828',
  'Auto':         '#4527a0',
  'Metals':       '#37474f',
  'Materials':    '#558b2f',
  'Telecom':      '#00838f',
  'Conglomerate': '#4e342e',
  'Consumer':     '#f9a825',
};

const INDICES = ['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'NIFTY IT'];

export default function TickerBar({ instruments }) {
  const { prices, subscribe, unsubscribe } = useWebSocket();

  const noop = useCallback(() => {}, []);

  useEffect(() => {
    if (!instruments.length) return;
    instruments.forEach(i => subscribe(i.symbol, noop));
    INDICES.forEach(idx => subscribe(idx, noop));
    return () => {
      instruments.forEach(i => unsubscribe(i.symbol, noop));
      INDICES.forEach(idx => unsubscribe(idx, noop));
    }
  }, [instruments, subscribe, unsubscribe, noop]);

  if (!instruments.length) return null;
  const indexItems = INDICES.map(name => ({
    symbol: name, company_name: name, sector: null, domain: null,
    isIndex: true,
  }));

  const allItems   = [...indexItems, ...instruments];
  const items = [...allItems, ...allItems];

  return (
    <div style={tickerStyles.wrapper}>
      <div style={tickerStyles.track}>
        {items.map((inst, idx) => {
          const price = prices[inst.symbol];
          const sectorColor = inst.isIndex ? '#f4b942' : (SECTOR_COLORS[inst.sector] || '#555');

          return (
          <span key={`${inst.symbol}-${idx}`} style={{
            ...tickerStyles.item,
            borderRight: inst.isIndex ? '1px solid #2a2e39' : 'none',
            paddingRight: inst.isIndex ? 20 : 16,
            marginRight:  inst.isIndex ? 4 : 0,
          }}>
            {inst.isIndex ? (
              // Index display — no dot, bold name, larger text
              <>
                <span style={{ color: '#555', fontSize: 9,
                  textTransform: 'uppercase', marginRight: 4 }}>IDX</span>
                <span style={{ ...tickerStyles.symbol, color: '#f4b942' }}>
                  {inst.symbol}
                </span>
              </>
            ) : (
              <span style={{
                display: 'inline-block', width: 6, height: 6,
                borderRadius: '50%', background: sectorColor,
                marginRight: 5, verticalAlign: 'middle',
              }} />
            )}
            {!inst.isIndex && (
              <span style={tickerStyles.symbol}>{inst.symbol}</span>
            )}
            <span style={{
              ...tickerStyles.price,
              color: inst.isIndex ? '#f4b942' : '#26a69a',
            }}>
              {price ? formatCurrency(price) : '--'}
            </span>
            <span style={tickerStyles.divider}>|</span>
          </span>
          );
        })}
      </div>

      {/* CSS animation injected inline — no external stylesheet needed */}
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

const tickerStyles = {
  wrapper: {
    width: '100%',
    overflow: 'hidden',
    background: '#0d1117',
    borderBottom: '1px solid #2a2e39',
    borderTop: '1px solid #2a2e39',
    height: 32,
    display: 'flex',
    alignItems: 'center',
  },
  track: {
    display: 'flex',
    whiteSpace: 'nowrap',
    animation: 'ticker-scroll 120s linear infinite',
    willChange: 'transform',    // GPU-accelerated scroll — no jank
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 16px',
    fontSize: 12,
    gap: 4,
  },
  symbol: {
    color: '#e0e3eb',
    fontWeight: 700,
    marginRight: 4,
  },
  price: {
    color: '#26a69a',
    fontFamily: "'Courier New', monospace",  // monospace so price width is stable
    minWidth: 72,
    display: 'inline-block',
  },
  divider: {
    color: '#2a2e39',
    marginLeft: 8,
  },
};