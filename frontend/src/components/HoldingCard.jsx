import { useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatCurrency, formatPnL, formatPercent, pnlColor } from '../utils/format';
import CompanyLogo from './CompanyLogo';
import Sparkline from './Sparkline';
import { useNavigate } from 'react-router-dom';

export default function HoldingCard({ holding }) {
  const { subscribe, unsubscribe, prices, history } = useWebSocket();
  const navigate = useNavigate();

  const currentPrice =
    prices[holding.symbol] ??
    holding.current_price ??
    holding.average_buy_price;

   const priceHistory = history[holding.symbol] || [];

  const onPriceUpdate = useCallback(() => {
  }, []);

  useEffect(() => {
    subscribe(holding.symbol, onPriceUpdate);
    return () => unsubscribe(holding.symbol, onPriceUpdate);
  }, [holding.symbol, subscribe, unsubscribe, onPriceUpdate]);

  const liveValue  = currentPrice * holding.quantity;
  const livePnL    = (currentPrice - holding.average_buy_price) * holding.quantity;
  const livePnLPct = holding.average_buy_price > 0
    ? ((currentPrice - holding.average_buy_price) / holding.average_buy_price) * 100
    : 0;
  const color = pnlColor(livePnL);

  return (
    <div
      onClick={() => navigate(`/trade/${holding.symbol}`)}
      style={{
        background: '#131722',
        border: '1px solid #2a2e39',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 10,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#2196f3'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2e39'}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <CompanyLogo
            symbol={holding.symbol}
            domain={holding.domain}
            sector={holding.sector}
            size={36}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#e0e3eb' }}>
                {holding.symbol}
              </span>
              <span style={{
                fontSize: 10, color: '#555', background: '#1e222d',
                padding: '2px 5px', borderRadius: 3
              }}>
                {holding.exchange}
              </span>
            </div>
            <div style={{ color: '#787b86', fontSize: 11 }}>{holding.company_name}</div>
          </div>

          {/* Sparkline — shows price movement since page load */}
          <Sparkline
            data={priceHistory}
            color={color}
            width={72}
            height={24}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 20, fontSize: 13 }}>
          <div>
            <div style={{ color: '#787b86', fontSize: 11, marginBottom: 2 }}>QTY</div>
            <div style={{ color: '#e0e3eb' }}>{holding.quantity}</div>
          </div>
          <div>
            <div style={{ color: '#787b86', fontSize: 11, marginBottom: 2 }}>AVG COST</div>
            <div style={{ color: '#e0e3eb' }}>{formatCurrency(holding.average_buy_price)}</div>
          </div>
          <div>
            <div style={{ color: '#787b86', fontSize: 11, marginBottom: 2 }}>INVESTED</div>
            <div style={{ color: '#e0e3eb' }}>{formatCurrency(holding.total_invested)}</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e0e3eb', marginBottom: 4 }}>
          {formatCurrency(currentPrice)}
        </div>
        <div style={{ color, fontSize: 14, fontWeight: 600 }}>
          {formatPnL(livePnL)}{' '}
          <span style={{ fontSize: 12 }}>({formatPercent(livePnLPct)})</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ color: '#787b86', fontSize: 11, marginBottom: 2 }}>CURRENT VALUE</div>
          <div style={{ color, fontWeight: 600 }}>{formatCurrency(liveValue)}</div>
        </div>
      </div>
    </div>
  );
}