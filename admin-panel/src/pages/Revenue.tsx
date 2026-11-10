import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Wallet, RefreshCcw, TrendingUp, Ticket } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState } from '@/components/common/ErrorState';
import {
  getDailyRevenue,
  getMonthlyRevenue,
  getRevenueByFestival,
  getRevenueByPaymentStatus,
  getRevenueByTicket,
  getRevenueSummary,
} from '@/services/revenue.service';
import { CHART_COLORS, CHART_GRID, CHART_PRIMARY } from '@/lib/chartTheme';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

export default function RevenuePage() {
  const summary = useQuery({ queryKey: ['revenue-summary'], queryFn: getRevenueSummary });
  const daily = useQuery({ queryKey: ['revenue-daily'], queryFn: () => getDailyRevenue(30) });
  const monthly = useQuery({ queryKey: ['revenue-monthly'], queryFn: () => getMonthlyRevenue(12) });
  const byTicket = useQuery({ queryKey: ['revenue-by-ticket'], queryFn: getRevenueByTicket });
  const byFestival = useQuery({ queryKey: ['revenue-by-festival'], queryFn: getRevenueByFestival });
  const byPaymentStatus = useQuery({ queryKey: ['revenue-by-payment-status'], queryFn: getRevenueByPaymentStatus });

  const isLoading = summary.isLoading || daily.isLoading || monthly.isLoading || byTicket.isLoading;
  const isError = summary.isError || daily.isError || monthly.isError || byTicket.isError;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Revenue" description="Financial performance across the festival" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !summary.data) {
    return (
      <div>
        <PageHeader title="Revenue" description="Financial performance across the festival" />
        <ErrorState
          onRetry={() => {
            summary.refetch();
            daily.refetch();
            monthly.refetch();
            byTicket.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Revenue" description="Financial performance across the festival" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Gross revenue" value={formatCurrency(summary.data.grossRevenue)} icon={Wallet} />
          <StatCard label="Refunds" value={formatCurrency(summary.data.refunds)} icon={RefreshCcw} tone="destructive" />
          <StatCard label="Net revenue" value={formatCurrency(summary.data.netRevenue)} icon={TrendingUp} tone="success" />
          <StatCard label="Tickets sold" value={formatNumber(summary.data.ticketsSold)} icon={Ticket} />
          <StatCard label="Avg. ticket value" value={formatCurrency(summary.data.averageTicketValue)} icon={Wallet} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">Trends</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily revenue (last 30 days)</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pl-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.data ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(v) => formatDate(v as string)} />
                  <Line type="monotone" dataKey="grossRevenue" name="Gross revenue" stroke={CHART_PRIMARY} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly revenue</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pl-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly.data ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis dataKey="month" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(v) => formatDate(v as string)} />
                  <Bar dataKey="grossRevenue" name="Gross revenue" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Breakdown</h2>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by ticket</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(byTicket.data ?? []).map((row) => (
                  <TableRow key={row.ticketId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.quantitySold)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{formatCurrency(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Share by ticket</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byTicket.data ?? []} dataKey="revenue" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {(byTicket.data ?? []).map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue by festival</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byFestival.data ?? []} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_GRID} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART_PRIMARY} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payments by status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(byPaymentStatus.data ?? []).map((row) => (
                  <div key={row.status} className="rounded-md border border-border p-3">
                    <StatusBadge status={row.status} />
                    <p className="mt-2 font-serif text-lg font-semibold">{formatCurrency(row.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} {row.count === 1 ? 'transaction' : 'transactions'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
