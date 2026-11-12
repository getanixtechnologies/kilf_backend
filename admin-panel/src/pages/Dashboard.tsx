import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Handshake,
  MessageSquare,
  ScanLine,
  Ticket,
  TicketX,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { TicketBreakdownTable } from '@/components/common/TicketBreakdownTable';
import { getDashboardStats } from '@/services/revenue.service';
import { listEnquiries } from '@/services/enquiry.service';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { CHART_COLORS, CHART_GRID, CHART_PRIMARY } from '@/lib/chartTheme';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

const TITLE = 'Dashboard';
const DESCRIPTION = "What's happening across the festival today";

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });
  const { data: pendingEnquiries } = useQuery({
    queryKey: ['enquiries', 'pending-count'],
    queryFn: () => listEnquiries({ page: 1, limit: 1, status: 'PENDING' }),
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="mt-6 h-80" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const soldOut = data.ticketBreakdown.filter((t) => t.remaining === 0).length;
  const pendingEnquiryCount = pendingEnquiries?.pagination.total ?? 0;
  const bookingStatuses = [
    { label: 'Confirmed', value: data.bookings.confirmed, color: 'bg-success' },
    { label: 'Pending payment', value: data.bookings.pending, color: 'bg-warning' },
    { label: 'Cancelled', value: data.bookings.cancelled, color: 'bg-destructive' },
    { label: 'Refunded', value: data.bookings.refunded, color: 'bg-primary' },
    { label: 'Expired', value: data.bookings.expired, color: 'bg-muted-foreground' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net revenue"
          value={formatCurrency(data.revenue.net)}
          hint={`${formatCurrency(data.revenue.today)} today`}
          icon={Wallet}
          tone="success"
          to="/revenue"
        />
        <StatCard
          label="Tickets sold"
          value={formatNumber(data.tickets.sold)}
          hint={`${formatNumber(data.tickets.available)} of ${formatNumber(data.tickets.total)} still available`}
          icon={Ticket}
          to="/tickets"
          footer={<ProgressBar value={data.tickets.sold} max={data.tickets.total} />}
        />
        <StatCard
          label="Confirmed bookings"
          value={formatNumber(data.bookings.confirmed)}
          hint={`${formatNumber(data.bookings.total)} bookings in total`}
          icon={ClipboardCheck}
          to="/bookings?status=CONFIRMED"
        />
        <StatCard
          label="Checked in"
          value={`${formatNumber(data.checkIn.checkedIn)} / ${formatNumber(data.checkIn.issued)}`}
          hint={`${formatNumber(data.checkIn.notArrived)} yet to arrive`}
          icon={ScanLine}
          to="/check-in"
          footer={<ProgressBar value={data.checkIn.checkedIn} max={data.checkIn.issued} barClassName="bg-success" />}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Needs attention</CardTitle>
        </CardHeader>
        <CardContent>
          {data.bookings.pending === 0 && pendingEnquiryCount === 0 && soldOut === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> You're all caught up.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {data.bookings.pending > 0 && (
                <AttentionLink
                  icon={Clock}
                  to="/bookings?status=PENDING_PAYMENT"
                  title={`${formatNumber(data.bookings.pending)} awaiting payment`}
                  description="Review unpaid bookings"
                />
              )}
              {pendingEnquiryCount > 0 && (
                <AttentionLink
                  icon={MessageSquare}
                  to="/enquiries?status=PENDING"
                  title={`${formatNumber(pendingEnquiryCount)} new ${pendingEnquiryCount === 1 ? 'enquiry' : 'enquiries'}`}
                  description="Reply to website enquiries"
                />
              )}
              {soldOut > 0 && (
                <AttentionLink
                  icon={TicketX}
                  to="/tickets"
                  title={`${formatNumber(soldOut)} sold out ${soldOut === 1 ? 'ticket' : 'tickets'}`}
                  description="Check ticket inventory"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Revenue by day</CardTitle>
          </CardHeader>
          <CardContent className="h-72 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts.revenueByDay} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(v) => formatDate(v as string)} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_PRIMARY} strokeWidth={2} fill="url(#revenueGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Revenue summary</CardTitle>
            <SectionLink to="/revenue">Details</SectionLink>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              <SummaryRow label="Today" value={formatCurrency(data.revenue.today)} />
              <SummaryRow label="This week" value={formatCurrency(data.revenue.thisWeek)} />
              <SummaryRow label="This month" value={formatCurrency(data.revenue.thisMonth)} />
              <SummaryRow label="Gross revenue" value={formatCurrency(data.revenue.total)} />
              <SummaryRow label="Refunds" value={formatCurrency(data.revenue.refunds)} />
              <SummaryRow label="Net revenue" value={formatCurrency(data.revenue.net)} strong />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Ticket performance</CardTitle>
          <SectionLink to="/tickets">Manage tickets</SectionLink>
        </CardHeader>
        {data.ticketBreakdown.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">No tickets created yet.</p>
          </CardContent>
        ) : (
          <TicketBreakdownTable rows={data.ticketBreakdown} />
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Bookings by status</CardTitle>
            <SectionLink to="/bookings">View all</SectionLink>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
              {bookingStatuses.map((s) => (
                <div
                  key={s.label}
                  className={s.color}
                  style={{ width: `${data.bookings.total ? (s.value / data.bookings.total) * 100 : 0}%` }}
                />
              ))}
            </div>
            <ul className="space-y-2 text-sm">
              {bookingStatuses.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="ml-auto font-medium">{formatNumber(s.value)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by ticket</CardTitle>
          </CardHeader>
          <CardContent>
            {data.charts.revenueByTicket.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.charts.revenueByTicket}
                        dataKey="revenue"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {data.charts.revenueByTicket.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {data.charts.revenueByTicket.map((row, index) => (
                    <li key={row.name} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate text-muted-foreground">{row.name}</span>
                      <span className="ml-auto whitespace-nowrap font-medium">{formatCurrency(row.revenue)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Sponsors</CardTitle>
            <SectionLink to="/sponsors">Manage</SectionLink>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Handshake className="h-5 w-5" />
              </div>
              <div>
                <p className="font-serif text-2xl font-bold leading-tight">{formatNumber(data.sponsors.active)}</p>
                <p className="text-xs text-muted-foreground">
                  active of {formatNumber(data.sponsors.total)} sponsors
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AttentionLink({
  icon: Icon,
  to,
  title,
  description,
}: {
  icon: LucideIcon;
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary/50 hover:bg-secondary/50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</dt>
      <dd className={strong ? 'font-bold' : 'font-medium'}>{value}</dd>
    </div>
  );
}
