import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';
import { ErrorBox, SuccessBox, SubmitButton } from '../components/FormFeedback';
import { onEvent, AppEvents } from '../utils/events';
import { NotificationBell } from '../components/Toast';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../contexts/AuthContext';

const PAYMENT_CHANNELS = ['UPI', 'NEFT', 'IMPS', 'RTGS'];
const ACCOUNT_TYPES    = ['SAVINGS', 'CURRENT'];

function generateRefId() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TXN-${Date.now()}-${rand}`;
}

export default function WalletPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [wallet, setWallet]           = useState(null);
  const [accounts, setAccounts]       = useState([]);
  const [activeTab, setActiveTab]     = useState('deposit');
  const [pageLoading, setPageLoading] = useState(true);

  const [deposit, setDeposit]                 = useState({ amount: '', payment_channel: 'UPI' });
  const [depositLoading, setDepositLoading]   = useState(false);
  const [depositError, setDepositError]       = useState('');
  const [depositSuccess, setDepositSuccess]   = useState('');

  const [withdraw, setWithdraw]               = useState({ amount: '', bank_account_id: '' });
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError]     = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');

  const [addAccount, setAddAccount]           = useState({
    account_number: '', ifsc_code: '', account_holder: '', bank_name: '', account_type: 'SAVINGS',
  });
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError]     = useState('');
  const [accountSuccess, setAccountSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch('/portfolio'), apiFetch('/bank-accounts')])
      .then(([p, a]) => {
        if (cancelled) return;
        if (p?.data?.wallet) setWallet(p.data.wallet);
        if (a?.data)         setAccounts(a.data);
      })
      .catch(err => { if (!cancelled && err.message.includes('401')) navigate('/login'); })
      .finally(() => { if (!cancelled) setPageLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    return onEvent(AppEvents.WALLET_CHANGED, () => {
      apiFetch('/portfolio')
        .then(d => { if (d?.data?.wallet) setWallet(d.data.wallet); })
        .catch(() => {});
    });
  }, []);

  const refreshWallet = () => {
    apiFetch('/portfolio')
      .then(d => { if (d?.data?.wallet) setWallet(d.data.wallet); })
      .catch(() => {});
  };

  const refreshAccounts = () => {
    apiFetch('/bank-accounts')
      .then(d => { if (d?.data) setAccounts(d.data); })
      .catch(() => {});
  };

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const handleDeposit = async (e) => {
    e.preventDefault();
    setDepositError('');
    setDepositSuccess('');
    setDepositLoading(true);
    try {
      const data = await apiFetch('/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(deposit.amount),
          reference_id: generateRefId(),
          payment_channel: deposit.payment_channel,
        }),
      });
      setDepositSuccess(`₹${parseFloat(deposit.amount).toLocaleString('en-IN')} added. New balance: ${formatCurrency(data.data?.new_balance)}`);
      setDeposit({ amount: '', payment_channel: 'UPI' });
      refreshWallet();
    } catch (err) {
      setDepositError(err.message);
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!withdraw.bank_account_id) {
      setWithdrawError('Please select a bank account to withdraw to.');
      return;
    }
    setWithdrawError('');
    setWithdrawSuccess('');
    setWithdrawLoading(true);
    try {
      await apiFetch('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(withdraw.amount),
          bank_account_id: withdraw.bank_account_id,
        }),
      });
      setWithdrawSuccess('Withdrawal initiated. Funds will be credited within 1–2 business days.');
      setWithdraw({ amount: '', bank_account_id: '' });
      refreshWallet();
    } catch (err) {
      setWithdrawError(err.message);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setAccountError('');
    setAccountSuccess('');
    setAccountLoading(true);
    try {
      await apiFetch('/bank-accounts', {
        method: 'POST',
        body: JSON.stringify(addAccount),
      });
      setAccountSuccess('Bank account linked successfully.');
      setAddAccount({ account_number: '', ifsc_code: '', account_holder: '', bank_name: '', account_type: 'SAVINGS' });
      refreshAccounts();
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setAccountLoading(false);
    }
  };

  if (pageLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading wallet...</div>
    </div>
  );

  const available = wallet?.available_balance ?? 0;
  const total     = wallet?.total_balance ?? 0;
  const reserved  = wallet?.reserved_balance ?? 0;

  return (
    <div style={S.page} className="nexus-page">
      <nav style={S.nav} className="nexus-nav">
        <span style={S.logo} onClick={() => navigate('/dashboard')}>NexusBroker</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <NavBtn onClick={() => navigate('/dashboard')}>Portfolio</NavBtn>
          <NavBtn onClick={() => navigate('/')}>Markets</NavBtn>
          <NavBtn onClick={() => navigate('/orders')}>Orders</NavBtn>
          <ThemeToggle />
          <NotificationBell />
          <button onClick={handleLogout} style={S.logoutBtn}>Logout</button>
        </div>
      </nav>

      {/* Balance cards */}
      <div style={S.grid3}>
        <BalCard label="Available to Invest" value={formatCurrency(available)} accent="var(--green)" />
        <BalCard label="Total Balance"        value={formatCurrency(total)}     accent="var(--blue)" />
        <BalCard label="Blocked in Orders"    value={formatCurrency(reserved)}  accent="var(--yellow)" />
      </div>

      {/* Tabs */}
      <div style={S.tabRow}>
        {[
          ['deposit',  '↓ Add Money'],
          ['withdraw', '↑ Withdraw'],
          ['accounts', '🏦 Bank Accounts'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            ...S.tab,
            color:        activeTab === k ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: activeTab === k ? '2px solid var(--blue)' : '2px solid transparent',
            fontWeight:   activeTab === k ? 600 : 400,
          }}>{l}</button>
        ))}
      </div>

      <div style={{ minHeight: 400 }}>

        {/* ── ADD MONEY ── */}
        {activeTab === 'deposit' && (
          <div style={S.formCard} className="nexus-card">
            <h3 style={S.formTitle}>Add Money to Wallet</h3>

            {/* Clear explanation — no bank account needed for deposits */}
            <div style={S.infoBox}>
              <strong style={{ color: 'var(--blue)' }}>How deposits work:</strong>
              {' '}Transfer money from your bank directly to your NexusBroker wallet using UPI, NEFT, IMPS, or RTGS.
              No bank account registration needed — just enter the amount and choose your transfer method.
            </div>

            <Field label="Amount (₹)">
              <input type="number" min="1" max="1000000" step="1"
                placeholder="Enter amount (e.g. 10000)"
                value={deposit.amount}
                onChange={e => { setDeposit(p => ({ ...p, amount: e.target.value })); setDepositError(''); }}
                style={S.input} className="nexus-input" />
              <div style={S.hint}>Min ₹1 · Max ₹10,00,000 per transaction</div>
            </Field>

            <Field label="Transfer Method">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {PAYMENT_CHANNELS.map(ch => (
                  <ChipBtn key={ch} active={deposit.payment_channel === ch}
                    onClick={() => setDeposit(p => ({ ...p, payment_channel: ch }))}>
                    {ch}
                  </ChipBtn>
                ))}
              </div>
              <div style={S.hint}>
                {deposit.payment_channel === 'UPI'  && '⚡ Instant · 24×7 · No minimum amount'}
                {deposit.payment_channel === 'NEFT' && '🕐 Processed in 2 hours · Bank hours only'}
                {deposit.payment_channel === 'IMPS' && '⚡ Instant · 24×7 · Up to ₹5 lakh'}
                {deposit.payment_channel === 'RTGS' && '🏦 Same day · Minimum ₹2,00,000 · Bank hours'}
              </div>
            </Field>

            <ErrorBox message={depositError} />
            <SuccessBox message={depositSuccess} />

            <SubmitButton
              onClick={handleDeposit}
              disabled={!deposit.amount || parseFloat(deposit.amount) <= 0}
              loading={depositLoading}
              label={`Add ${deposit.amount ? formatCurrency(parseFloat(deposit.amount)) : 'Money'}`}
              color="var(--green)"
            />
          </div>
        )}

        {/* ── WITHDRAW ── */}
        {activeTab === 'withdraw' && (
          <div style={S.formCard} className="nexus-card">
            <h3 style={S.formTitle}>Withdraw Funds</h3>

            {/* Always show this explanation at the top */}
            <div style={S.infoBox}>
              <strong style={{ color: 'var(--blue)' }}>How withdrawals work:</strong>
              {' '}Select a linked bank account below, then enter the amount to transfer.
              Funds arrive in your bank within 1–2 business days via NEFT.
            </div>

            {accounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏦</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8, fontSize: 16 }}>
                  No bank account linked yet
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                  To withdraw money, you need to link your bank account first.
                  This is a one-time setup — once added, you can withdraw anytime.
                </div>
                <button onClick={() => setActiveTab('accounts')} style={{
                  background: 'var(--blue)', border: 'none', color: '#fff',
                  padding: '12px 24px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                }}>
                  + Add Bank Account
                </button>
              </div>
            ) : (
              <>
                <Field label={`Step 1 — Select Bank Account (${accounts.length} linked)`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
                    {accounts.map(acc => (
                      <div key={acc.id}
                        onClick={() => { setWithdraw(p => ({ ...p, bank_account_id: acc.id })); setWithdrawError(''); }}
                        style={{
                          padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
                          background: withdraw.bank_account_id === acc.id
                            ? 'var(--blue-bg)' : 'var(--bg-input)',
                          border: `1px solid ${withdraw.bank_account_id === acc.id
                            ? 'var(--blue)' : 'var(--border)'}`,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'all 0.15s',
                        }}>
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>
                            {acc.bank_name}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {acc.account_number} · {acc.account_type} · {acc.account_holder}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
                            background: acc.is_verified ? 'var(--green-bg)' : 'rgba(244,185,66,0.1)',
                            color:      acc.is_verified ? 'var(--green)'    : 'var(--yellow)',
                          }}>
                            {acc.is_verified ? '✓ VERIFIED' : 'PENDING'}
                          </span>
                          {withdraw.bank_account_id === acc.id && (
                            <span style={{ color: 'var(--blue)', fontSize: 20 }}>●</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!withdraw.bank_account_id && (
                    <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4 }}>
                      ↑ Tap an account to select it
                    </div>
                  )}
                </Field>

                <Field label="Step 2 — Enter Amount (₹)">
                  <input type="number" min="1" max="500000" step="1"
                    placeholder="Enter amount to withdraw"
                    value={withdraw.amount}
                    onChange={e => { setWithdraw(p => ({ ...p, amount: e.target.value })); setWithdrawError(''); }}
                    style={S.input} className="nexus-input" />
                  <div style={S.hint}>
                    Available: <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                      {formatCurrency(available)}
                    </span>
                    {' · '}Max per transaction: ₹5,00,000
                  </div>
                </Field>

                <ErrorBox message={withdrawError} />
                <SuccessBox message={withdrawSuccess} />

                <SubmitButton
                  onClick={handleWithdraw}
                  disabled={!withdraw.amount || !withdraw.bank_account_id || parseFloat(withdraw.amount) <= 0}
                  loading={withdrawLoading}
                  label={withdraw.bank_account_id
                    ? `Withdraw ${withdraw.amount ? formatCurrency(parseFloat(withdraw.amount)) : ''}`
                    : 'Select a bank account first'
                  }
                  color="var(--red)"
                />
              </>
            )}
          </div>
        )}

        {/* ── BANK ACCOUNTS ── */}
        {activeTab === 'accounts' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Linked accounts list */}
            <div style={S.formCard} className="nexus-card">
              <h3 style={S.formTitle}>Linked Accounts ({accounts.length})</h3>
              {accounts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13,
                  textAlign: 'center', padding: '32px 0' }}>
                  No accounts linked yet. Add one →
                </div>
              ) : accounts.map(acc => (
                <div key={acc.id} style={{
                  padding: '14px', background: 'var(--bg-input)',
                  border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 3 }}>
                        {acc.bank_name}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {acc.account_number}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>
                        {acc.account_holder} · {acc.account_type} · {acc.ifsc_code}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
                      background: acc.is_verified ? 'var(--green-bg)' : 'rgba(244,185,66,0.1)',
                      color:      acc.is_verified ? 'var(--green)'    : 'var(--yellow)',
                    }}>
                      {acc.is_verified ? '✓ VERIFIED' : 'PENDING'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add account form */}
            <div style={S.formCard} className="nexus-card">
              <h3 style={S.formTitle}>Add Bank Account</h3>
              <div style={{ ...S.infoBox, marginBottom: 16 }}>
                Bank account is required only for withdrawals. Your account number is
                masked and stored securely.
              </div>
              {[
                { label: 'Account Number',  key: 'account_number', placeholder: '9–18 digit number (no spaces)' },
                { label: 'IFSC Code',       key: 'ifsc_code',      placeholder: 'e.g. HDFC0001234' },
                { label: 'Account Holder',  key: 'account_holder', placeholder: 'Full name as on passbook' },
                { label: 'Bank Name',       key: 'bank_name',      placeholder: 'e.g. HDFC Bank' },
              ].map(f => (
                <Field key={f.key} label={f.label}>
                  <input type="text" placeholder={f.placeholder}
                    value={addAccount[f.key]}
                    onChange={e => { setAddAccount(p => ({ ...p, [f.key]: e.target.value })); setAccountError(''); }}
                    style={S.input} className="nexus-input" />
                </Field>
              ))}

              <Field label="Account Type">
                <div style={{ display: 'flex', gap: 8 }}>
                  {ACCOUNT_TYPES.map(t => (
                    <ChipBtn key={t} active={addAccount.account_type === t}
                      onClick={() => setAddAccount(p => ({ ...p, account_type: t }))}>
                      {t}
                    </ChipBtn>
                  ))}
                </div>
              </Field>

              <ErrorBox message={accountError} />
              <SuccessBox message={accountSuccess} />

              <SubmitButton
                onClick={handleAddAccount}
                disabled={!addAccount.account_number || !addAccount.ifsc_code ||
                          !addAccount.account_holder || !addAccount.bank_name}
                loading={accountLoading}
                label="Link Bank Account"
                color="var(--blue)"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ChipBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 16px', borderRadius: 20, fontSize: 13,
      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      background: active ? 'var(--blue)'    : 'var(--bg-input)',
      color:      active ? '#fff'            : 'var(--text-muted)',
      border:     `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
      fontWeight: active ? 600 : 400,
    }}>{children}</button>
  );
}

function BalCard({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '16px 20px', borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function NavBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: '1px solid var(--border)',
      color: 'var(--text-secondary)', padding: '6px 14px',
      borderRadius: 4, cursor: 'pointer', fontSize: 13,
    }}>{children}</button>
  );
}

const S = {
  page:     { maxWidth: 960, margin: '0 auto', padding: '0 20px 40px',
              fontFamily: 'var(--font)', minHeight: '100vh' },
  nav:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 0', marginBottom: 24,
              borderBottom: '1px solid var(--nav-border)' },
  logo:     { fontSize: 18, fontWeight: 800, color: 'var(--blue)', cursor: 'pointer' },
  logoutBtn:{ background: 'transparent', border: '1px solid var(--red-border)',
              color: 'var(--red)', padding: '6px 14px', borderRadius: 4,
              cursor: 'pointer', fontSize: 13 },
  grid3:    { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 },
  tabRow:   { display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 },
  tab:      { background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
              padding: '10px 20px', cursor: 'pointer', fontSize: 14,
              fontFamily: 'inherit', transition: 'all 0.15s' },
  formCard: { background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 24 },
  formTitle:{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
              borderBottom: '1px solid var(--border)', paddingBottom: 12 },
  input:    { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', borderRadius: 6, padding: '10px 12px',
              fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  hint:     { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 },
  infoBox:  { background: 'var(--blue-bg)', border: '1px solid rgba(29,108,229,0.2)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 },
};