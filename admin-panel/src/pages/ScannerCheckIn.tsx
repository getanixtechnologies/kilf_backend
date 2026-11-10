import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Keyboard, Loader2, QrCode, TriangleAlert, XCircle } from 'lucide-react';
import { QrScanner } from '@/components/common/QrScanner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  checkInTicket,
  getTicketNumberFormat,
  VerificationMethod,
  VerifyResult,
  verifyTicket,
} from '@/services/checkin.service';
import { getApiErrorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';

const AUTO_KEY = 'kilf.scanner.autoCheckIn';
const PREFIX_KEY = 'kilf.scanner.idPrefix';
const DONE_DISMISS_MS = 1500;

type Mode = 'home' | 'scan' | 'manual';
type Outcome = 'ok' | 'used' | 'invalid' | 'missing' | 'done';

function outcomeOf(r: VerifyResult): Outcome {
  if (!r.ticket) return 'missing';
  if (!r.valid) return 'invalid';
  return r.alreadyUsed ? 'used' : 'ok';
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

function readPrefix(): string {
  try {
    return localStorage.getItem(PREFIX_KEY) ?? '';
  } catch {
    return '';
  }
}

const STYLE = {
  ok: { box: 'border-success bg-success/10', text: 'text-success', Icon: CheckCircle2, title: 'Valid ticket' },
  done: { box: 'border-success bg-success/10', text: 'text-success', Icon: CheckCircle2, title: 'Checked in' },
  used: { box: 'border-amber-500 bg-amber-500/10', text: 'text-amber-700', Icon: TriangleAlert, title: 'Already checked in' },
  invalid: { box: 'border-destructive bg-destructive/10', text: 'text-destructive', Icon: XCircle, title: 'Not valid' },
  missing: { box: 'border-destructive bg-destructive/10', text: 'text-destructive', Icon: XCircle, title: 'Ticket not found' },
};

/** Mobile-first checker dashboard: scan a QR or type the ticket number, see details, one tap to admit. */
export function ScannerCheckIn() {
  const { admin } = useAuth();
  const [mode, setMode] = useState<Mode>('home');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [method, setMethod] = useState<VerificationMethod>('QR');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(readAuto);
  const [suffix, setSuffix] = useState('');
  const [count, setCount] = useState(0);
  const dismissTimer = useRef<number>();
  const suffixRef = useRef<HTMLInputElement>(null);
  // Guards against out-of-order responses when scans arrive back to back.
  const seq = useRef(0);

  const format = useQuery({ queryKey: ['ticket-number-format'], queryFn: getTicketNumberFormat, staleTime: 60 * 60 * 1000 });
  const prefixes = format.data?.prefixes ?? [];
  const [chosenPrefix, setChosenPrefix] = useState(readPrefix);
  // The checker's last pick if it still exists, else the first configured one.
  const prefix =
    prefixes.find((p) => p.prefix === chosenPrefix)?.prefix ?? prefixes[0]?.prefix ?? format.data?.prefix ?? '';

  function choosePrefix(value: string) {
    setChosenPrefix(value);
    try {
      localStorage.setItem(PREFIX_KEY, value);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => suffixRef.current?.focus(), 0);
  }

  const clear = useCallback(() => {
    window.clearTimeout(dismissTimer.current);
    seq.current++;
    setResult(null);
    setOutcome(null);
    setBusy(false);
    if (mode === 'manual') {
      setSuffix('');
      window.setTimeout(() => suffixRef.current?.focus(), 0);
    }
  }, [mode]);

  useEffect(() => () => window.clearTimeout(dismissTimer.current), []);

  const admit = useCallback(
    async (ticketNumber: string, verified: VerifyResult, how: VerificationMethod) => {
      const mine = ++seq.current;
      setBusy(true);
      try {
        await checkInTicket(ticketNumber, how);
        if (mine !== seq.current) return;
        setCount((c) => c + 1);
        setOutcome('done');
        setResult({ ...verified, alreadyUsed: true, message: 'Checked in' });
        buzz(60);
        if (how === 'QR') dismissTimer.current = window.setTimeout(clear, DONE_DISMISS_MS);
      } catch (err) {
        if (mine !== seq.current) return;
        toast.error(getApiErrorMessage(err, 'Failed to check in ticket'));
        buzz([100, 60, 100]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [clear]
  );

  const lookup = useCallback(
    async (raw: string, how: VerificationMethod) => {
      const ticketNumber = raw.trim().toUpperCase();
      if (!ticketNumber) return;
      const mine = ++seq.current;
      setMethod(how);
      setBusy(true);
      setResult(null);
      setOutcome(null);
      try {
        const verified = await verifyTicket(ticketNumber, how);
        if (mine !== seq.current) return;
        const o = outcomeOf(verified);
        setResult(verified);
        setOutcome(o);
        buzz(o === 'ok' ? 40 : [100, 60, 100]);
        if (o === 'ok' && auto && how === 'QR') {
          await admit(ticketNumber, verified, how);
        } else {
          setBusy(false);
        }
      } catch (err) {
        if (mine !== seq.current) return;
        toast.error(getApiErrorMessage(err, 'Failed to verify ticket'));
        buzz([100, 60, 100]);
        setBusy(false);
      }
    },
    [auto, admit]
  );

  function toggleAuto(value: boolean) {
    setAuto(value);
    try {
      localStorage.setItem(AUTO_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function fullNumber(typed: string) {
    const s = typed.trim().toUpperCase();
    if (!s) return '';
    // Pasted a whole number (any known prefix): use as is.
    if (prefixes.some((p) => s.startsWith(p.prefix)) || (prefix && s.startsWith(prefix))) return s;
    const digits = format.data?.digits ?? 0;
    const padded = /^\d+$/.test(s) && s.length < digits ? s.padStart(digits, '0') : s;
    return `${prefix}${padded}`;
  }

  function handleManual(e: FormEvent) {
    e.preventDefault();
    const n = fullNumber(suffix);
    if (n) lookup(n, 'MANUAL');
  }

  function open(next: Mode) {
    clear();
    setSuffix('');
    setMode(next);
  }

  const t = result?.ticket;
  const attendee = t?.attendee;
  const style = STYLE[outcome ?? 'invalid'];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
      {mode === 'home' ? (
        <>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Check-in</h1>
            <p className="text-base text-foreground">Hi {admin?.name?.split(' ')[0]}, choose how to verify a ticket.</p>
          </div>
          <BigOption icon={QrCode} title="Scan QR" subtitle="Use the phone camera" onClick={() => open('scan')} />
          <BigOption
            icon={Keyboard}
            title="Enter Booking ID"
            subtitle={prefixes.length > 1 ? 'Pick the ticket type, then type its number' : prefix ? `Type the number after ${prefix}` : 'Type the ticket number'}
            onClick={() => open('manual')}
            variant="outline"
          />
          {count > 0 && (
            <p className="text-center text-base text-foreground">
              Checked in this session: <span className="font-bold">{count}</span>
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="-ml-2 h-12 px-3 text-base" onClick={() => open('home')}>
              <ArrowLeft className="h-5 w-5" /> Back
            </Button>
            <span className="text-base text-foreground">
              Checked in: <span className="font-bold">{count}</span>
            </span>
          </div>

          {mode === 'scan' && (
            <>
              <label className="flex items-center justify-between rounded-lg border border-border p-3 text-base text-foreground">
                Check in automatically when valid
                <Switch checked={auto} onCheckedChange={toggleAuto} />
              </label>
              {/* Camera stays on between scans; decoding pauses while a result is showing. */}
              <QrScanner autoStart onScan={(text) => lookup(text, 'QR')} paused={!!result || busy} cooldownMs={1500} />
            </>
          )}

          {mode === 'manual' && !result && (
            <form onSubmit={handleManual} className="space-y-3">
              {prefixes.length > 1 && (
                <div className="space-y-2">
                  <span className="block text-base font-medium text-foreground">Ticket type</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ticket ID prefix">
                    {prefixes.map((p) => (
                      <button
                        key={p.prefix}
                        type="button"
                        role="radio"
                        aria-checked={p.prefix === prefix}
                        onClick={() => choosePrefix(p.prefix)}
                        className={`min-h-12 rounded-lg border-2 px-3 py-2 text-left ${
                          p.prefix === prefix
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-background text-foreground'
                        }`}
                      >
                        <span className="block font-mono text-lg font-semibold">{p.prefix}</span>
                        <span className="block text-sm opacity-80">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label htmlFor="ticket-suffix" className="block text-base font-medium text-foreground">
                Booking / ticket ID
              </label>
              <div className="flex h-16 items-stretch overflow-hidden rounded-lg border-2 border-input bg-background focus-within:border-primary">
                <span className="flex select-none items-center border-r border-input bg-secondary px-3 font-mono text-xl font-semibold text-foreground">
                  {prefix || '…'}
                </span>
                <input
                  id="ticket-suffix"
                  ref={suffixRef}
                  autoFocus
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value.replace(/\s+/g, ''))}
                  inputMode="numeric"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="000123"
                  aria-label={`Ticket number after ${prefix}`}
                  className="min-w-0 flex-1 bg-transparent px-3 font-mono text-2xl text-foreground outline-none placeholder:text-foreground/30"
                />
              </div>
              <Button type="submit" className="h-14 w-full text-lg" disabled={!suffix.trim() || format.isLoading} loading={busy}>
                Verify
              </Button>
            </form>
          )}

          {busy && !result && mode === 'scan' && (
            <div className="flex items-center justify-center gap-2 py-3 text-base text-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Checking…
            </div>
          )}

          {result && (
            <div className={`rounded-xl border-2 p-4 ${style.box}`} role="status" aria-live="polite">
              <div className="flex items-center gap-3">
                <style.Icon className={`h-12 w-12 shrink-0 ${style.text}`} />
                <div className="min-w-0">
                  <p className={`text-2xl font-bold ${style.text}`}>
                    {outcome === 'invalid' && result.code === 'EXPIRED'
                      ? 'Ticket expired'
                      : outcome === 'invalid' && result.code === 'INVALID_DATE'
                        ? 'Invalid date'
                        : style.title}
                  </p>
                  <p className="break-words text-base text-foreground">
                    {outcome === 'done' || outcome === 'ok' ? t?.ticketNumber : result.message}
                  </p>
                </div>
              </div>

              {t && (
                <div className="mt-4 space-y-2 rounded-lg bg-background p-3 text-base">
                  <Row label="Name" value={attendee?.name || t.booking.customer.name} />
                  <Row label="Ticket" value={t.ticket.name} />
                  {attendee?.showSession && (
                    <Row label="Show" value={`${attendee.showSession.name} • ${formatDate(attendee.showSession.startsAt, true)}`} />
                  )}
                  {result.validFrom && result.validUntil && (
                    <Row
                      label="Valid"
                      value={
                        result.validFrom === result.validUntil
                          ? formatDate(result.validFrom)
                          : `${formatDate(result.validFrom)} – ${formatDate(result.validUntil)}`
                      }
                    />
                  )}
                  <Row label="Booking" value={<span className="font-mono">{t.booking.bookingNumber}</span>} />
                  <Row label="Ticket #" value={<span className="font-mono">{t.ticketNumber}</span>} />
                  <Row label="Status" value={outcome === 'done' ? 'Checked in' : statusLabel(t.status, result)} />
                  {t.checkedInAt && outcome === 'used' && <Row label="Checked in at" value={formatDate(t.checkedInAt, true)} />}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {outcome === 'ok' && t && (
                  <Button className="h-14 text-lg" loading={busy} onClick={() => admit(t.ticketNumber, result, method)}>
                    <CheckCircle2 className="h-5 w-5" /> Confirm check-in
                  </Button>
                )}
                <Button variant="outline" className="h-14 bg-background text-lg" onClick={clear}>
                  {mode === 'scan' ? 'Scan next' : 'Enter another'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function statusLabel(status: string, r: VerifyResult) {
  if (r.alreadyUsed) return 'Already checked in';
  if (status === 'CANCELLED') return 'Cancelled';
  if (!r.valid) return 'Not valid';
  return 'Not checked in yet';
}

function BigOption({
  icon: Icon,
  title,
  subtitle,
  onClick,
  variant = 'default',
}: {
  icon: typeof QrCode;
  title: string;
  subtitle: string;
  onClick: () => void;
  variant?: 'default' | 'outline';
}) {
  const solid = variant === 'default';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[7rem] w-full items-center gap-4 rounded-xl border-2 p-5 text-left transition-colors active:scale-[0.99] ${
        solid
          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border-primary bg-background text-foreground hover:bg-primary/5'
      }`}
    >
      <Icon className={`h-12 w-12 shrink-0 ${solid ? '' : 'text-primary'}`} />
      <span>
        <span className="block text-2xl font-bold">{title}</span>
        <span className="block text-base">{subtitle}</span>
      </span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-foreground/80">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}
