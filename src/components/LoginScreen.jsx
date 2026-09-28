import { useState } from 'react';
import PasswordInput from './PasswordInput';

export default function LoginScreen({ onLogin, error, loading = false }) {
  const [form, setForm] = useState({ nik: '', password: '' });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (typeof onLogin === 'function') {
      onLogin({ nik: form.nik, password: form.password });
    }
  };

  return (
    <div className="app theme-dark" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--bg-panel, #163559)',
          border: '1px solid var(--border, #2b4f7a)',
          borderRadius: '18px',
          padding: '32px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--primary,#60a5fa)', marginBottom: '8px' }}>
            GC PIT REPORT
          </div>
          <h1 style={{ margin: 0, fontSize: '28px' }}>Secure Login</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '18px' }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <label htmlFor="login-nik" style={{ fontWeight: 700, color: 'var(--text-subtle,#dfeeff)' }}>
              NIK
            </label>
            <input
              id="login-nik"
              name="nik"
              value={form.nik}
              onChange={handleChange}
              autoComplete="username"
              placeholder="Masukkan NIK"
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '12px',
                border: '1px solid var(--border,#2b4f7a)',
                borderRadius: '10px',
                background: 'var(--bg-soft,#1d466d)',
                color: 'var(--text,#ffffff)',
              }}
            />
          </div>

          <PasswordInput
            id="login-password"
            name="password"
            label="Password"
            value={form.password}
            onChange={handleChange}
            placeholder="Masukkan password"
            autoComplete="current-password"
            disabled={loading}
          />

          {error ? (
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca' }}>
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              minHeight: '46px',
              borderRadius: '10px',
              background: 'var(--primary,#60a5fa)',
              color: 'var(--primary-text,#071a33)',
              fontWeight: 800,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Memeriksa akses...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
