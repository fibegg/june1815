import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from './ui/Button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.js';
import { Input } from './ui/Input.js';
import { captureTokenFromUrl, fetchAuthStatus, getToken, setToken } from '@/lib/api.js';

/**
 * Gate every other UI behind a verified bearer token. Sources, in order:
 *   1. `?token=...` in the URL (captured then stripped from history)
 *   2. sessionStorage (across reloads in the same tab)
 *   3. an inline form prompting the user
 *
 * Once a token is set, we ping `/v1/auth/status` to confirm both that the
 * token is valid AND that the server has an authenticated claude — if the
 * latter is missing we surface a warning so the user knows new
 * conversations will fail.
 */
export function TokenGate({ children }: { children: React.ReactNode }): JSX.Element {
  const [token, setLocalToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, setPending] = useState<string>('');

  useEffect(() => {
    const captured = captureTokenFromUrl();
    if (captured) setLocalToken(captured);
    else setLocalToken(getToken());
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        setError(null);
        setWarning(status.authenticated
          ? null
          : 'token works, but the server has no authenticated claude — new conversations will fail');
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setLocalToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle>june15</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the bearer token printed by <code className="font-mono">june15 gogogo</code>
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const trimmed = pending.trim();
                if (trimmed.length < 8) {
                  setError('token looks too short');
                  return;
                }
                setToken(trimmed);
                setLocalToken(trimmed);
                setPending('');
              }}
            >
              <Input
                type="password"
                placeholder="paste token"
                value={pending}
                onChange={(e) => {
                  setPending(e.target.value);
                  setError(null);
                }}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit">Connect</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {warning && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {warning}
        </div>
      )}
      {children}
    </>
  );
}
