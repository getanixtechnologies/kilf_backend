import { FormEvent, ReactNode, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProgressBar } from '@/components/common/ProgressBar';
import { checkInTicket, getTicketNumberFormat, VerificationMethod, VerifyResult, verifyTicket } from '@/services/checkin.service';
import { getApiErrorMessage } from '@/services/api';
import { formatDate, formatNumber } from '@/lib/utils';
import { getDashboardStats } from '@/services/revenue.service';
import { QrScanner } from '@/components/common/QrScanner';
import { useAuth } from '@/hooks/useAuth';
import { ScannerCheckIn } from '@/pages/ScannerCheckIn';

export default function CheckInPage() {
  const isScanner = useAuth().admin?.role === 'SCANNER';
  return isScanner ? <ScannerCheckIn /> : <AdminCheckInPage />;
}

function AdminCheckInPage() {
  const [ticketNumber, setTicketNumber] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMethod = useRef<VerificationMethod>('MANUAL');
  const queryClient = useQueryClient();
  // Gate-staff (SCANNER) accounts can't read dashboard stats.
  const isScanner = useAuth().admin?.role === 'SCANNER';
  const stats = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 15000,
    enabled: !isScanner,
  });
  const numberFormat = useQuery({ queryKey: ['ticket-number-format'], queryFn: getTicketNumberFormat, staleTime: 3600000 });
  const refreshStats = () => queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

  const verifyMutation = useMutation({
    mutationFn: ({ ticketNumber, method }: { ticketNumber: string; method: VerificationMethod }) =>
      verifyTicket(ticketNumber, method),
    onSuccess: (data, vars) => {
      lastMethod.current = vars.method;
      setResult(data);
      // Rejected tickets leave the number selected so the next scan replaces it.
      if (!data.valid || data.alreadyUsed) inputRef.current?.select();
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to verify ticket'));
      setResult(null);
      inputRef.current?.select();
    },
  });

  const checkInMutation = useMutation({
    mutationFn: (n: string) => checkInTicket(n, lastMethod.current),
    onSuccess: async () => {
      toast.success('Attendee checked in');
      refreshStats();
      if (ticketNumber) {
        const refreshed = await verifyTicket(ticketNumber.trim());
        setResult(refreshed);
      }
      inputRef.current?.select();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to check in ticket')),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ticketNumber.trim()) return;
    verifyMutation.mutate({ ticketNumber: ticketNumber.trim(), method: 'MANUAL' });
  }

  function handleCameraScan(text: string) {
    const scanned = text.trim();
    if (!scanned) return;
    setTicketNumber(scanned);
    verifyMutation.mutate({ ticketNumber: scanned, method: 'QR' });
  }

  function reset() {
    setTicketNumber('');
    setResult(null);
    inputRef.current?.focus();
  }

  const canCheckIn = result?.valid && !result.alreadyUsed;
  const issuedTickets = stats.data?.ticketBreakdown.filter((t) => t.checkIn.issued > 0) ?? [];

  return (
    <div>
      <PageHeader title="Check-in" description="Scan or enter a ticket number to verify and check in attendees" />

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardContent className="p-5">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ticketNumber">Ticket number / QR code</Label>
                  <Input
                    id="ticketNumber"
                    ref={inputRef}
                    autoFocus
                    autoComplete="off"
                    placeholder={numberFormat.data?.example ?? 'Ticket number'}
                    className="h-11 font-mono"
                    value={ticketNumber}
                    onChange={(e) => setTicketNumber(e.target.value)}
                  />
                </div>
                <Button type="submit" size="lg" className="h-11" loading={verifyMutation.isPending}>
                  <ScanLine className="h-4 w-4" /> Verify
                </Button>
              </form>
              <div className="mt-4">
                <QrScanner onScan={handleCameraScan} paused={!!result || verifyMutation.isPending} />
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card className={canCheckIn ? 'border-success/50' : 'border-destructive/50'}>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  {canCheckIn ? (
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-8 w-8 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-semibold">{result.message}</p>
                    {result.detail && <p className="text-sm text-muted-foreground">{result.detail}</p>}
                    {result.ticket && <p className="font-mono text-xs text-muted-foreground">{result.ticket.ticketNumber}</p>}
                  </div>
                </div>

                {result.ticket && (
                  <div className="space-y-2 rounded-md bg-secondary/60 p-4 text-sm">
                    <Row label="Attendee" value={result.ticket.booking.customer.name} />
                    <Row label="Ticket type" value={result.ticket.ticket.name} />
                    <Row label="Email" value={result.ticket.booking.customer.email} />
                    <Row label="Booking #" value={result.ticket.booking.bookingNumber} />
                    <Row label="Status" value={<StatusBadge status={result.ticket.status} />} />
                    {result.ticket.checkedInAt && <Row label="Checked in at" value={formatDate(result.ticket.checkedInAt, true)} />}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {canCheckIn && (
                    <Button
                      size="lg"
                      onClick={() => checkInMutation.mutate(ticketNumber.trim())}
                      loading={checkInMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Check in attendee
                    </Button>
                  )}
                  <Button variant="outline" size="lg" onClick={reset}>
                    Scan another
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.data && stats.data.checkIn.recent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent check-ins</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {stats.data.checkIn.recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.booking.customer.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.ticket.name} • <span className="font-mono">{r.ticketNumber}</span>
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-xs text-muted-foreground">
                      {r.checkedInAt ? formatDate(r.checkedInAt, true) : ''}
                      {r.checkedInBy && <span className="block">by {r.checkedInBy.name}</span>}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {stats.data && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Attendance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="font-serif text-3xl font-bold">
                  {formatNumber(stats.data.checkIn.checkedIn)}
                  <span className="text-lg font-medium text-muted-foreground"> / {formatNumber(stats.data.checkIn.issued)}</span>
                </p>
                <p className="mb-2 text-sm text-muted-foreground">
                  checked in • {formatNumber(stats.data.checkIn.notArrived)} yet to arrive
                </p>
                <ProgressBar
                  value={stats.data.checkIn.checkedIn}
                  max={stats.data.checkIn.issued}
                  className="h-2"
                  barClassName="bg-success"
                />
              </div>

              {issuedTickets.length > 0 && (
                <div className="space-y-3 border-t border-border pt-4">
                  {issuedTickets.map((t) => (
                    <div key={t.id}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{t.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {t.checkIn.checkedIn} / {t.checkIn.issued}
                        </span>
                      </div>
                      <ProgressBar value={t.checkIn.checkedIn} max={t.checkIn.issued} className="mt-1" barClassName="bg-success" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}
