import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatCurrency} from '../utils/format';
import CompanyLogo from '../components/CompanyLogo';
import { ErrorBox } from '../components/FormFeedback';
import { NotificationBell } from '../components/Toast';
import ThemeToggle from '../components/ThemeToggle';

function PriceChart({ data, color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;
    const ctx    = canvas.getContext('2d');
    const W      = canvas.width;
    const H      = canvas.height;

    const min   = Math.min(...data);
    const max   = Math.max(...data);
    const range = max - min || 1;
    const pad   = 8;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1e222d';
    ctx.lineWidth   = 1;
    [0.25, 0.5, 0.75].forEach(f => {
      const y = pad + f * (H - pad * 2);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    });

    // Build path
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '44');
    grad.addColorStop(1, color + '00');
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // Current price label on right
    const lastV = data[data.length - 1];
    const lastY = H - pad - ((lastV - min) / range) * (H - pad * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(W - 1, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

  }, [data, color]);

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={180}
      style={{ width: '100%', height: 180, display: 'block', borderRadius: 4 }}
    />
  );
}

export default function TradePage() {
  const { symbol }  = useParams();        
  const navigate    = useNavigate();
  const { prices, history, subscribe, unsubscribe } = useWebSocket();

  const [instrument, setInstrument] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);

  const [form, setForm] = useState({
    side: 'BUY', order_type: 'LIMIT', quantity: '', price: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [holding, setHolding]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/instruments')
      .then(d => {
        if (cancelled) return;
        const found = d?.data?.find(i => i.symbol === symbol?.toUpperCase());
        if (!found) { setNotFound(true); return; }
        setInstrument(found);
      })
      .catch(err => { if (err.message.includes('401')) navigate('/login'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, navigate]);

  const noop = useCallback(() => {}, []);
  useEffect(() => {
    if (!symbol) return;
    const s = symbol.toUpperCase();
    subscribe(s, noop);
    return () => unsubscribe(s, noop);
  }, [symbol, subscribe, unsubscribe, noop]);

  const sym          = symbol?.toUpperCase() || '';
  const currentPrice = prices[sym] ?? null;
  const priceHistory = history[sym] || [];
  const oldest       = priceHistory.length > 1 ? priceHistory[0] : currentPrice;
  const priceDelta   = currentPrice && oldest ? currentPrice - oldest : 0;
  const priceDeltaPct = oldest ? (priceDelta / oldest) * 100 : 0;
  const isUp         = priceDelta >= 0;
  const chartColor   = isUp ? '#26a69a' : '#ef5350';

  const qty          = parseFloat(form.quantity) || 0;
  const limitPrice   = parseFloat(form.price) || 0;
  const priceToUse   = form.order_type === 'LIMIT' ? limitPrice : (currentPrice ?? 0);
  const estimatedCost = qty * priceToUse;
  const isValid      = qty > 0 && (form.order_type === 'MARKET' || limitPrice > 0) && !!instrument;

  useEffect(() => {
    if (!sym) return;
    apiFetch('/portfolio')
      .then(data => {
        const found = data?.data?.holdings?.find(h => h.symbol === sym);
        setHolding(found || null);
      })
      .catch(() => {});
  }, [sym]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'order_type' && value === 'MARKET') next.price = '';
      return next;
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    const payload = {
      instrument_id: instrument.id,
      side:          form.side,
      order_type:    form.order_type,
      quantity:      parseInt(form.quantity, 10),
      product_type:  'CNC',
    };
    if (form.order_type === 'LIMIT') payload.price = parseFloat(form.price);

    try {
      const data = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSuccess(`✓ ${form.side} order placed! ID: ${data.data?.order_id?.slice(0, 8)}…`);
      setForm(prev => ({ ...prev, quantity: '', price: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={S.centered}><div style={{ color: '#787b86' }}>Loading...</div></div>;
  if (notFound) return (
    <div style={S.centered}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#ef5350', fontSize: 18, marginBottom: 12 }}>
          Instrument "{symbol}" not found
        </div>
        <button onClick={() => navigate('/')} style={S.backBtn}>← Back to Markets</button>
      </div>
    </div>
  );

  return (
    <div style={S.page} className="nexus-page">
      {/* Navbar */}
      <nav style={S.nav} className="nexus-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={S.backBtn}>← Markets</button>
          <span style={S.logo}>NexusBroker</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <NavBtn onClick={() => navigate('/dashboard')}>Portfolio</NavBtn>
          <NavBtn onClick={() => navigate('/orders')}>Orders</NavBtn>
          <NavBtn onClick={() => navigate('/wallet')}>Wallet</NavBtn>
          <ThemeToggle/>
          <NotificationBell/>
        </div>
      </nav>

      {/* Stock header */}
      <div style={S.stockHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <CompanyLogo symbol={instrument?.symbol} domain={instrument?.domain}
            sector={instrument?.sector} size={48} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={S.stockSymbol}>{sym}</h1>
              <span style={S.exchangeBadge}>{instrument?.exchange ?? 'NSE'}</span>
              <span style={S.sectorBadge}>{instrument?.sector}</span>
            </div>
            <div style={{ color: '#787b86', fontSize: 13 }}>{instrument?.company_name}</div>
          </div>
        </div>

        {/* Live price block */}
        <div style={{ textAlign: 'right' }}>
          {currentPrice ? (
            <>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#e0e3eb', lineHeight: 1 }}>
                {formatCurrency(currentPrice)}
              </div>
              <div style={{ color: chartColor, fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                {isUp ? '▲' : '▼'} {formatCurrency(Math.abs(priceDelta))}
                {' '}({isUp ? '+' : ''}{priceDeltaPct.toFixed(2)}%)
                <span style={{ color: '#555', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                  since session start
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: '#787b86' }}>Waiting for price...</div>
          )}
        </div>
      </div>

      <div style={S.layout}>
        {/* Left: Chart + stats */}
        <div>
          {/* Price chart */}
          <div style={S.chartCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#787b86' }}>
                Price chart · {priceHistory.length} ticks
              </div>
              {priceHistory.length < 2 && (
                <div style={{ fontSize: 11, color: '#555' }}>
                  Collecting data…
                </div>
              )}
            </div>
            <PriceChart data={priceHistory} color={chartColor} />
            <div style={{ display: 'flex', justifyContent: 'space-between',
              marginTop: 8, fontSize: 11, color: '#555' }}>
              <span>Session open</span>
              <span>Now</span>
            </div>
          </div>

          {/* Stats row */}
          <div style={S.statsGrid}>
            {[
              { label: 'Session High', value: priceHistory.length
                ? formatCurrency(Math.max(...priceHistory)) : '—' },
              { label: 'Session Low',  value: priceHistory.length
                ? formatCurrency(Math.min(...priceHistory)) : '—' },
              { label: 'LTP',          value: currentPrice ? formatCurrency(currentPrice) : '—' },
              { label: 'Exchange',     value: instrument?.exchange ?? 'NSE' },
            ].map(s => (
              <div key={s.label} style={S.statCard}>
                <div style={{ fontSize: 10, color: '#787b86', textTransform: 'uppercase',
                  letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e3eb' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Order form */}
        <div style={S.formCard}>
          {holding && (
            <div style={{
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Your Position
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'Qty Held',   value: holding.quantity,           color: 'var(--text-primary)' },
                  { label: 'Available',  value: holding.available_quantity,  color: 'var(--green)' },
                  { label: 'Avg Price',  value: `₹${holding.average_buy_price}`, color: 'var(--text-primary)' },
                  { label: 'Invested',   value: `₹${holding.total_invested}`,    color: 'var(--text-secondary)' },
                  { label: 'Cur Value',  value: `₹${(currentPrice * holding.quantity).toFixed(2)}`, color: currentPrice * holding.quantity >= holding.total_invested ? 'var(--green)' : 'var(--red)' },
                  { label: 'P&L',
                    value: currentPrice
                      ? `${((currentPrice - holding.average_buy_price) * holding.quantity) >= 0 ? '+' : ''}₹${((currentPrice - holding.average_buy_price) * holding.quantity).toFixed(2)}`
                      : '—',
                    color: currentPrice && (currentPrice - holding.average_buy_price) >= 0 ? 'var(--green)' : 'var(--red)'
                  },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={S.formTitle}>Place Order</div>

          {/* BUY / SELL */}
          <div style={S.toggleRow}>
            {['BUY', 'SELL'].map(side => (
              <button key={side} type="button"
                onClick={() => setForm(p => ({ ...p, side }))}
                style={{
                  ...S.toggleBtn,
                  background: form.side === side
                    ? (side === 'BUY' ? '#26a69a' : '#ef5350') : '#1e222d',
                  color:     form.side === side ? '#fff' : '#787b86',
                  fontWeight: form.side === side ? 700 : 400,
                }}>{side}</button>
            ))}
          </div>

          {/* LIMIT / MARKET */}
          <div style={{ ...S.toggleRow, marginBottom: 20 }}>
            {['LIMIT', 'MARKET'].map(type => (
              <button key={type} type="button"
                onClick={() => handleChange({ target: { name: 'order_type', value: type } })}
                style={{
                  ...S.toggleBtn,
                  background: form.order_type === type ? '#2196f3' : '#1e222d',
                  color:     form.order_type === type ? '#fff' : '#787b86',
                }}>{type}</button>
            ))}
          </div>

          {/* Price input — LIMIT only */}
          {form.order_type === 'LIMIT' && (
            <div style={S.field}>
              <label style={S.label}>
                Limit Price (₹)
                {currentPrice && (
                  <span style={{ color: '#555', fontWeight: 400, marginLeft: 6 }}>
                    LTP {formatCurrency(currentPrice)}
                  </span>
                )}
              </label>
              <input type="number" name="price" value={form.price}
                onChange={handleChange} min="0.01" step="0.05"
                placeholder={currentPrice ? currentPrice.toFixed(2) : '0.00'}
                style={S.input} />
            </div>
          )}

          {form.order_type === 'MARKET' && (
            <div style={S.marketNote}>
              Order fills at best available market price.
              {currentPrice && <> Est. {formatCurrency(currentPrice)}</>}
            </div>
          )}
                    {/* Quantity */}
          <div style={S.field}>
            <label style={S.label}>Quantity (shares)</label>
            <input type="number" name="quantity" value={form.quantity}
              onChange={handleChange} min="1" step="1" placeholder="0"
              style={S.input} />
          </div>

          {/* Estimated cost */}
          {estimatedCost > 0 && (
            <div style={S.costPreview}>
              <span style={{ color: '#787b86', fontSize: 13 }}>
                Est. {form.side === 'BUY' ? 'Cost' : 'Credit'}
              </span>
              <span style={{
                fontWeight: 700, fontSize: 18,
                color: form.side === 'BUY' ? '#ef5350' : '#26a69a',
              }}>
                {formatCurrency(estimatedCost)}
              </span>
            </div>
          )}

          <ErrorBox message={error} />
          {success && (
            <div style={{ background: '#26a69a15', border: '1px solid #26a69a40',
              borderLeft: '3px solid #26a69a', borderRadius: 6,
              padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#26a69a' }}>
              {success}
            </div>
          )}

          <button onClick={handleSubmit} disabled={!isValid || submitting}
            style={{
              ...S.submitBtn,
              background: (!isValid || submitting)
                ? '#1e222d' : form.side === 'BUY' ? '#26a69a' : '#ef5350',
              color:  (!isValid || submitting) ? '#555' : '#fff',
              cursor: (!isValid || submitting) ? 'not-allowed' : 'pointer',
            }}>
            {submitting
              ? 'Placing…'
              : `${form.side} ${form.quantity || 0} × ${sym}`
            }
          </button>

          <button onClick={() => navigate('/orders')}
            style={S.ordersLink}>
            View my orders →
          </button>
        </div>
      </div>
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
  page:        { maxWidth: 1100, margin: '0 auto', padding: '0 20px 40px',
                 fontFamily: 'var(--font)',minHeight: '100vh'},
  nav:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 padding: '16px 0', marginBottom: 24, borderBottom: '1px solid var(--nav-border)' },
  logo:        { fontSize: 16, fontWeight: 700, color: '#2196f3', letterSpacing: 1 },
  backBtn:     { background: 'transparent', border: '1px solid #2a2e39', color: '#787b86',
                 padding: '6px 12px', borderRadius: 4, cursor: 'pointer',
                 fontSize: 13, fontFamily: 'inherit' },
  stockHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                 marginBottom: 24, padding: '16px 0', borderBottom: '1px solid #2a2e39' },
  stockSymbol: { fontSize: 24, fontWeight: 800, color: '#e0e3eb', margin: 0 },
  exchangeBadge:{ fontSize: 10, background: '#1e222d', color: '#555',
                  border: '1px solid #2a2e39', padding: '2px 7px', borderRadius: 10 },
  sectorBadge: { fontSize: 10, background: '#1e222d', color: '#2196f3',
                 border: '1px solid #2196f320', padding: '2px 7px', borderRadius: 10 },
  layout:      { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' },
  chartCard:   { background: '#131722', border: '1px solid #2a2e39',
                 borderRadius: 8, padding: 20, marginBottom: 12 },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  statCard:    { background: '#131722', border: '1px solid #2a2e39',
                 borderRadius: 6, padding: '10px 12px' },
  formCard:    { background: '#131722', border: '1px solid #2a2e39', borderRadius: 8, padding: 24 },
  formTitle:   { fontSize: 16, fontWeight: 700, color: '#e0e3eb',
                 marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #2a2e39' },
  toggleRow:   { display: 'flex', gap: 8, marginBottom: 12 },
  toggleBtn:   { flex: 1, padding: '10px 0', border: 'none', borderRadius: 4,
                 fontSize: 14, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' },
  field:       { marginBottom: 16 },
  label:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 fontSize: 11, color: '#787b86', textTransform: 'uppercase',
                 letterSpacing: 0.5, marginBottom: 6 },
  input:       { width: '100%', background: '#1e222d', border: '1px solid #2a2e39',
                 color: '#e0e3eb', borderRadius: 4, padding: '10px 12px', fontSize: 14,
                 outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  marketNote:  { background: '#f9a82510', border: '1px solid #f9a82530', borderRadius: 6,
                 padding: '8px 12px', fontSize: 12, color: '#f9a825', marginBottom: 16 },
  costPreview: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 background: '#1e222d', border: '1px solid #2a2e39',
                 borderRadius: 6, padding: '12px 16px', marginBottom: 16 },
  submitBtn:   { width: '100%', padding: '14px 0', border: 'none', borderRadius: 6,
                 fontSize: 15, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s' },
  ordersLink:  { width: '100%', padding: '10px 0', background: 'transparent',
                 border: '1px solid #2a2e39', color: '#787b86', borderRadius: 6,
                 cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', marginTop: 10 },
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center',
                 minHeight: '100vh', background: '#0f1117' },
};