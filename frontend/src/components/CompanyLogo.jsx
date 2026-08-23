import { useState } from 'react';

const SECTOR_COLORS = {
  'Banking':      '#1565c0', 'Finance':      '#0277bd',
  'Insurance':    '#00695c', 'IT':           '#6a1b9a',
  'Energy':       '#e65100', 'FMCG':         '#2e7d32',
  'Pharma':       '#ad1457', 'Healthcare':   '#c62828',
  'Auto':         '#4527a0', 'Metals':       '#37474f',
  'Materials':    '#558b2f', 'Telecom':      '#00838f',
  'Conglomerate': '#4e342e', 'Consumer':     '#f9a825',
};

function LogoFallback({ symbol, sector, size }) {
  const bgColor     = SECTOR_COLORS[sector] || '#333';
  const firstLetter = (symbol || '?')[0];
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: bgColor, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45), fontWeight: 700, color: '#fff',
      fontFamily: 'inherit', userSelect: 'none',
    }}>
      {firstLetter}
    </div>
  );
}

export default function CompanyLogo({ symbol, domain, sector, size = 32 }) {
  const [imgFailed, setImgFailed] = useState(false);

  const token = import.meta.env.VITE_LOGO_DEV_TOKEN;

  // No domain, or img already failed → show fallback
  if (!domain || !token || imgFailed) {
    return <LogoFallback symbol={symbol} sector={sector} size={size} />;
  }
  return (
    <img
      src={`https://img.logo.dev/${domain}?token=${token}&size=64`}
      alt={symbol}
      width={size}
      height={size}
      onError={() => setImgFailed(true)}
      style={{
        borderRadius: 6, objectFit: 'contain',
        background: '#fff', flexShrink: 0,
        padding: 2, boxSizing: 'border-box',
      }}
    />
  );
}

