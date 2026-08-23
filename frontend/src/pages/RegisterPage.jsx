import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi';
import { ErrorBox, SuccessBox } from '../components/FormFeedback';

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', dob: '',
    phone_no: '', tax_id: '', tax_id_type: 'PAN', country_code: 'IN',
  });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSuccess('Account created! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isValid = form.name && form.email && form.password &&
                  form.dob && form.phone_no && form.tax_id;

  return (
    <div style={S.bg}>
      <div style={S.card}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={S.brand}>NexusBroker</div>
          <div style={{ color: '#787b86', fontSize: 13, marginTop: 4 }}>
            Open your trading account in minutes
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <InputField label="Full Name" name="name" placeholder="As per PAN card"
              value={form.name} onChange={handleChange} />
          </div>
          <InputField label="Email" name="email" type="email"
            placeholder="you@example.com"
            value={form.email} onChange={handleChange} />
          <div>
            <label style={S.label}>
              Password
              <button type="button" onClick={() => setShowPw(p => !p)} style={S.showPwBtn}>
                {showPw ? 'Hide' : 'Show'}
              </button>
            </label>
            <input name="password" type={showPw ? 'text' : 'password'}
              placeholder="Min 8 characters"
              value={form.password} onChange={handleChange} style={S.input} />
          </div>
          <InputField label="Date of Birth" name="dob" type="date"
            value={form.dob} onChange={handleChange} />
          <InputField label="Phone Number" name="phone_no" type="tel"
            placeholder="10-digit mobile number"
            value={form.phone_no} onChange={handleChange} />
          <InputField label="PAN Number" name="tax_id"
            placeholder="e.g. ABCDE1234F"
            value={form.tax_id} onChange={handleChange} />
        </div>

        <ErrorBox message={error} />
        <SuccessBox message={success} />

        <button onClick={handleSubmit} disabled={!isValid || loading}
          style={{
            ...S.btn,
            background: (!isValid || loading) ? '#1e222d' : '#2196f3',
            color:      (!isValid || loading) ? '#555'    : '#fff',
            border:     `1px solid ${(!isValid || loading) ? '#2a2e39' : '#2196f3'}`,
            cursor:     (!isValid || loading) ? 'not-allowed' : 'pointer',
          }}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#787b86' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#2196f3', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function InputField({ label, name, type = 'text', placeholder, value, onChange }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input name={name} type={type} placeholder={placeholder}
        value={value} onChange={onChange} style={S.input} />
    </div>
  );
}

const S = {
  bg:   { minHeight: '100vh', background: '#0a0d14',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 20 },
  card: { background: '#0f1117', border: '1px solid #2a2e39', borderRadius: 12,
          padding: '36px', width: '100%', maxWidth: 520 },
  brand:{ fontSize: 26, fontWeight: 800, color: '#2196f3', letterSpacing: 1 },
  label:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, color: '#787b86', marginBottom: 5,
          textTransform: 'uppercase', letterSpacing: 0.5 },
  input:{ width: '100%', background: '#1e222d', border: '1px solid #2a2e39',
          color: '#e0e3eb', borderRadius: 6, padding: '10px 12px', fontSize: 13,
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn:  { width: '100%', padding: '13px', border: '1px solid',
          borderRadius: 6, fontSize: 15, fontWeight: 700,
          fontFamily: 'inherit', marginTop: 16, transition: 'all 0.15s' },
  showPwBtn: { background: 'none', border: 'none', color: '#2196f3',
               fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
};