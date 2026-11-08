import { CelestialArt } from '../components/art';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, errorLabel, useAuth, useI18n, useToast } from '../lib/core';
import { Btn, Field, Icon } from '../components/ui';

type Mode = 'signin' | 'signup' | 'recover' | 'reset';

export function AuthPage() {
  const { login, register, user } = useAuth();
  const { t, locale } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; link?: string } | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  React.useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const fail = (err: unknown) => setError(errorLabel(err instanceof Error ? err.message : 'error', locale));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await login(identifier.trim(), password);
        navigate('/');
      } else if (mode === 'signup') {
        await register({ username: username.trim(), email: email.trim(), password, display_name: displayName.trim() });
        push('Welcome to YumEra ✦', 'success');
        navigate('/');
      } else if (mode === 'recover') {
        const res = await api<{ email_configured: boolean; sent: boolean; reset_link?: string; note?: string }>(
          '/auth/forgot',
          { method: 'POST', body: { email: email.trim() } }
        );
        const token = res.reset_link ? res.reset_link.split('/').pop() || '' : '';
        setResetToken(token);
        setNotice({ text: res.note || 'Check your email for the recovery link.', link: res.reset_link });
        if (token) setMode('reset');
      } else {
        await api('/auth/reset', { method: 'POST', body: { token: resetToken.trim(), password: newPassword } });
        push('Password updated', 'success');
        navigate('/');
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'signin' ? t('auth.welcome') : mode === 'signup' ? t('auth.join') : mode === 'recover' ? t('auth.forgot') : t('auth.reset');

  return (
    <div className="auth-page">
      <section className="auth-art">
        <div className="auth-art-inner">
          <p className="eyebrow">YumEra · Eternal Universe</p>
          <h1>
            A social universe for people who love <em>fictional worlds</em>.
          </h1>
          <p className="auth-art-copy">
            Yumesonas, F/O registry, portraits, stories, music and memories. Everything you love, kept in one
            celestial place.
          </p>
          <ul className="auth-points">
            <li>✦ Yumesona Studio &amp; F/O Registry with Anti-Double protection</li>
            <li>✦ YumEra V4 Portrait Studio, no generative AI</li>
            <li>✦ Outside notifications with Web Push &amp; PWA</li>
          </ul>
        </div>
        <div className="auth-orbit" aria-hidden="true">
          <span className="orbit orbit-1" />
          <span className="orbit orbit-2" />
          <span className="orbit orbit-3" />
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-head">
          <span className="brand-mark">✦</span>
          <h2>{title}</h2>
          {mode === 'signin' ? (
            <p>
              {t('auth.noAccount')}{' '}
              <button className="link-btn" onClick={() => { setMode('signup'); setError(''); }}>
                {t('auth.signUp')}
              </button>
            </p>
          ) : mode === 'signup' ? (
            <p>
              {t('auth.haveAccount')}{' '}
              <button className="link-btn" onClick={() => { setMode('signin'); setError(''); }}>
                {t('auth.signIn')}
              </button>
            </p>
          ) : (
            <p>Recover access to your universe.</p>
          )}
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? (
          <div className="alert alert-info">
            {notice.text}
            {notice.link ? (
              <a href={notice.link} className="link-inline">
                Open recovery link
              </a>
            ) : null}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signin' ? (
            <>
              <Field label={`${t('auth.email')} / ${t('auth.username')}`} required>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="you@yumera.app"
                />
              </Field>
              <Field label={t('auth.password')} required>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </Field>
              <div className="auth-row">
                <button type="button" className="link-btn" onClick={() => { setMode('recover'); setError(''); }}>
                  {t('auth.forgot')}
                </button>
              </div>
            </>
          ) : null}

          {mode === 'signup' ? (
            <>
              <Field label={t('auth.displayName')}>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="Luna" />
              </Field>
              <Field label={t('auth.username')} hint="3–24 characters · letters, numbers, _ and ." required>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[a-zA-Z0-9_.]{3,24}"
                  required
                  autoComplete="username"
                  placeholder="lunastar"
                />
              </Field>
              <Field label={t('auth.email')} required>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              <Field label={t('auth.password')} hint="At least 8 characters." required>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </Field>
            </>
          ) : null}

          {mode === 'recover' ? (
            <Field label={t('auth.email')} required>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          ) : null}

          {mode === 'reset' ? (
            <>
              <Field label="Recovery token" required>
                <input value={resetToken} onChange={(e) => setResetToken(e.target.value)} required />
              </Field>
              <Field label="New password" hint="At least 8 characters." required>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </Field>
            </>
          ) : null}

          <Btn type="submit" size="lg" disabled={busy}>
            {busy ? t('common.loading') : mode === 'signin' ? t('auth.signIn') : mode === 'signup' ? t('auth.signUp') : mode === 'recover' ? t('auth.forgot') : t('auth.reset')}
          </Btn>
        </form>

        <div className="auth-langs">
          {(['es', 'en', 'fr', 'ja'] as const).map((code) => (
            <button key={code} className="chip" onClick={() => localStorage.setItem('yumera.locale', code) || window.location.reload()}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="auth-legal">
          By joining you agree to keep YumEra a kind place: no harassment, no spam, no non-consensual sharing.
        </p>
        <Link to="/explore" className="link-inline">
          <Icon name="compass" size={14} /> Explore without an account
        </Link>
      </section>
    </div>
  );
}
