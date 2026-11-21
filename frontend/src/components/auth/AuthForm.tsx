import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Popover from '@/components/ui/Popover';
import { gameApiClient } from '@arcane-familiars/game/api-client';
import { adoptGuestGame, getCurrentUser, login, logout, register, type AuthUser } from '@/lib/auth';

interface AuthFormProps {
  onAuthChange?: (signedIn: boolean) => void;
  compact?: boolean;
}

type Mode = 'login' | 'register';

export default function AuthForm({ onAuthChange, compact = false }: AuthFormProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUser().then((next) => {
      if (cancelled) return;
      setUser(next);
      setReady(true);
      onAuthChange?.(next !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [onAuthChange]);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const session = mode === 'register' ? await register(email, password) : await login(email, password);
      setUser(session.user);
      setOpen(false);
      setPassword('');
      onAuthChange?.(true);
      window.dispatchEvent(new CustomEvent('af:auth-changed'));

      const guestId = localStorage.getItem('af_anonymous_id');
      if (guestId) {
        const adopted = await adoptGuestGame(guestId);
        if (adopted) {
          gameApiClient.rotateGuestIdentity();
          setNotice('Your guest progress was moved to this account.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }, [busy, email, mode, onAuthChange, password]);

  const handleLogout = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await logout();
      setUser(null);
      onAuthChange?.(false);
      window.dispatchEvent(new CustomEvent('af:auth-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
    } finally {
      setBusy(false);
    }
  }, [onAuthChange]);

  if (!ready) return null;

  if (user) {
    // Compact: a 32px avatar whose popover holds the email and sign-out, so the
    // slim game bar never has to show the address inline.
    if (compact) {
      return (
        <Popover
          label="Account"
          align="right"
          trigger={(triggerProps) => (
            <button
              {...triggerProps}
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-semibold leading-none text-white shadow-btn transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {user.email.trim().charAt(0).toUpperCase() || '?'}
            </button>
          )}
        >
          <div className="flex flex-col gap-2 p-1.5">
            <span className="truncate font-body text-xs text-text-secondary" title={user.email}>
              {user.email}
            </span>
            {error && (
              <span role="alert" className="font-body text-xs text-error">
                {error}
              </span>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleLogout()}
              disabled={busy}
              className="w-full rounded-sm px-2 py-1.5 text-left font-body text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </Popover>
      );
    }

    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="max-w-[18rem] truncate font-body text-text-secondary" title={user.email}>
          {user.email}
        </span>
        {error && <span className="font-body text-xs text-error">{error}</span>}
        <Button variant="ghost" size="sm" onClick={() => void handleLogout()} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={`min-w-0 whitespace-nowrap ${compact ? '!px-2' : ''}`}
        onClick={() => setOpen(true)}
      >
        {compact ? (
          <>
            <span className="hidden min-w-0 truncate sm:inline-block">Guest · Sign in</span>
            <span className="sm:hidden">Sign in</span>
          </>
        ) : (
          <>
            <span className="hidden sm:inline">Sign in / Create account</span>
            <span className="sm:hidden">Sign in</span>
          </>
        )}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={mode === 'login' ? 'Sign in' : 'Create account'} hud>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <label className="flex flex-col gap-1 font-body text-xs text-text-secondary">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-border bg-surface-primary px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 font-body text-xs text-text-secondary">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-md border border-border bg-surface-primary px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          {error && (
            <p role="alert" className="font-body text-xs text-error">
              {error}
            </p>
          )}
          {notice && <p className="font-body text-xs text-success">{notice}</p>}

          <Button type="submit" size="md" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>

          <button
            type="button"
            className="font-body text-xs text-text-secondary underline underline-offset-2"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </button>

          <p className="font-body text-[11px] text-text-muted">
            Guest progress is saved in this browser. Sign in to keep it across devices.
          </p>
        </form>
      </Modal>
    </>
  );
}
