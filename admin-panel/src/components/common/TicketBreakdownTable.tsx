import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TicketBreakdown } from '@/types';

function SlotsBar({ row }: { row: TicketBreakdown }) {
  const confirmedPct = row.totalQuantity ? (row.confirmedQuantity / row.totalQuantity) * 100 : 0;
  const pendingPct = row.totalQuantity ? (row.pendingQuantity / row.totalQuantity) * 100 : 0;
  return (
    <div className="min-w-36">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="bg-success" style={{ width: `${confirmedPct}%` }} />
        <div className="bg-warning" style={{ width: `${pendingPct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatNumber(row.totalQuantity - row.remaining)} / {formatNumber(row.totalQuantity)} taken
      </p>
    </div>
  );
}

export function TicketBreakdownTable({ rows }: { rows: TicketBreakdown[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticket</TableHead>
          <TableHead>Slots</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
          <TableHead className="text-right">Bookings</TableHead>
          <TableHead className="text-right">Checked in</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(row.price)}
              </p>
            </TableCell>
            <TableCell>
              <SlotsBar row={row} />
            </TableCell>
            <TableCell className="text-right">
              {row.remaining === 0 ? (
                <Badge variant="destructive">Sold out</Badge>
              ) : (
                <span className="font-medium">{formatNumber(row.remaining)}</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs">
              <p className="text-sm font-medium">{row.bookings.total}</p>
              <p className="text-muted-foreground">
                {row.bookings.confirmed} confirmed · {row.bookings.pending} pending
              </p>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right">
              {row.checkIn.checkedIn} / {row.checkIn.issued}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right font-medium">
              {formatCurrency(row.revenue)}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/bookings?ticketId=${row.id}`}>View bookings</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
