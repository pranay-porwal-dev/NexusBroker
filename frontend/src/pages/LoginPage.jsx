import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ErrorBox } from '../components/FormFeedback';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.bg}>
      <div style={S.card}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={S.brand}>NexusBroker</div>
          <div style={{ color: '#787b86', fontSize: 13, marginTop: 4 }}>
            India's next-gen trading platform
          </div>
        </div>

        <div style={S.heading}>Sign in to your account</div>

        <div style={S.field}>
          <label style={S.label}>Email address</label>
          <input
            type="email" autoComplete="email" autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            style={S.input}
          />
        </div>

        <div style={S.field}>
          <label style={S.label}>
            Password
            <button type="button" onClick={() => setShowPw(p => !p)}
              style={S.showPwBtn}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </label>
          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            style={S.input}
          />
        </div>

        <ErrorBox message={error} />

        <button
          onClick={handleSubmit}
          disabled={!email || !password || loading}
          style={{
            ...S.btn,
            background: (!email || !password || loading) ? '#1e222d' : '#2196f3',
            color:      (!email || !password || loading) ? '#555'    : '#fff',
            border:     `1px solid ${(!email || !password || loading) ? '#2a2e39' : '#2196f3'}`,
            cursor:     (!email || !password || loading) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#787b86' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#2196f3', textDecoration: 'none', fontWeight: 600 }}>
            Create account
          </Link>
        </div>

        {/* Demo credentials hint */}
        <div style={S.demoBox}>
          <div style={{ color: '#787b86', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Demo credentials
          </div>
          <div style={{ fontSize: 12, color: '#9bb8d3' }}>
            arjun@demo.com · Demo@1234
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  bg:   { minHeight: '100vh', background: '#0a0d14',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 20 },
  card: { background: '#0f1117', border: '1px solid #2a2e39', borderRadius: 12,
          padding: '40px 36px', width: '100%', maxWidth: 420 },
  brand:{ fontSize: 26, fontWeight: 800, color: '#2196f3', letterSpacing: 1 },
  heading:{ fontSize: 18, fontWeight: 600, color: '#e0e3eb', marginBottom: 24 },
  field:{ marginBottom: 18 },
  label:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 12, color: '#787b86', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: 0.5 },
  input:{ width: '100%', background: '#1e222d', border: '1px solid #2a2e39',
          color: '#e0e3eb', borderRadius: 6, padding: '11px 14px', fontSize: 14,
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          transition: 'border-color 0.15s' },
  btn:  { width: '100%', padding: '13px', border: '1px solid',
          borderRadius: 6, fontSize: 15, fontWeight: 700,
          fontFamily: 'inherit', transition: 'all 0.15s', marginTop: 4 },
  showPwBtn: { background: 'none', border: 'none', color: '#2196f3',
               fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  demoBox:{ marginTop: 24, padding: '12px 14px', background: '#1e222d',
            border: '1px solid #2a2e39', borderRadius: 6, textAlign: 'center' },
};