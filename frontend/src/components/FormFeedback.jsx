export function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: '#ef535015', border: '1px solid #ef535040',
      borderLeft: '3px solid #ef5350', borderRadius: 6,
      padding: '10px 14px', marginBottom: 14,
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ color: '#ef5350', fontSize: 15, flexShrink: 0 }}>⚠</span>
      <span style={{ color: '#ef5350', fontSize: 13, lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

export function SuccessBox({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: '#26a69a15', border: '1px solid #26a69a40',
      borderLeft: '3px solid #26a69a', borderRadius: 6,
      padding: '10px 14px', marginBottom: 14,
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ color: '#26a69a', fontSize: 15, flexShrink: 0 }}>✓</span>
      <span style={{ color: '#26a69a', fontSize: 13, lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

export function SubmitButton({ onClick, disabled, loading, label, color = '#26a69a' }) {
  const isDisabled = disabled || loading;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        width: '100%', padding: '13px 0',
        borderRadius: 6, fontSize: 15, fontWeight: 700,
        fontFamily: 'inherit', cursor: isDisabled ? 'not-allowed' : 'pointer',
        background: isDisabled ? '#1e222d' : color,
        color: isDisabled ? '#555' : '#fff',
        border: `1px solid ${isDisabled ? '#2a2e39' : color}`,
        transition: 'all 0.15s',
        opacity: loading ? 0.8 : 1,
      }}
    >
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{
            width: 14, height: 14, border: '2px solid #555',
            borderTopColor: '#fff', borderRadius: '50%',
            display: 'inline-block', animation: 'spin 0.8s linear infinite',
          }} />
          Processing...
        </span>
      ) : label}
    </button>
  );
}