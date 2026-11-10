import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Plus, Pencil, Trash2, Ticket as TicketIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataPanel } from '@/components/common/DataPanel';
import { SearchInput } from '@/components/common/ListControls';
import { ProgressBar } from '@/components/common/ProgressBar';
import { useListParams } from '@/hooks/useListParams';
import { archiveTicket, deleteTicket, listTickets, updateTicketStatus } from '@/services/ticket.service';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TicketSaleStatus } from '@/types';
import { getApiErrorMessage } from '@/services/api';

const FILTER_KEYS = ['search'] as const;

export default function TicketsListPage() {
  const { page, get, setFilter, setPage, hasFilters, clearFilters } = useListParams(FILTER_KEYS);
  const search = get('search');
  const queryClient = useQueryClient();

  const { data, isLoading, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ['tickets', page, search],
    queryFn: () =>
      listTickets({
        page,
        limit: 10,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => {
      toast.success('Ticket deleted');
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to delete ticket')),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveTicket,
    onSuccess: () => {
      toast.success('Ticket archived');
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to archive ticket')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketSaleStatus }) => updateTicketStatus(id, status),
    onSuccess: () => {
      toast.success('Ticket status updated');
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update status')),
  });

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Manage ticket types, pricing, and inventory"
        actions={
          <Button asChild>
            <Link to="/tickets/create">
              <Plus className="h-4 w-4" /> Create ticket
            </Link>
          </Button>
        }
      />

      <DataPanel
        filters={
          <>
            <SearchInput value={search} onChange={(v) => setFilter('search', v)} placeholder="Search tickets" />
          </>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={data?.data.length === 0}
        isStale={isPlaceholderData}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        pagination={data?.pagination}
        onPageChange={setPage}
        empty={
          <EmptyState
            icon={TicketIcon}
            title="No tickets yet"
            description="Create a ticket type to start selling to the public."
            action={
              <Button asChild size="sm">
                <Link to="/tickets/create">Create ticket</Link>
              </Button>
            }
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Sold</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>On sale</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((ticket) => {
              const sold = ticket.totalQuantity - ticket.availableQuantity;
              return (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Link to={`/tickets/${ticket.id}/edit`} className="font-medium hover:text-primary hover:underline">
                      {ticket.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {ticket.festival?.name ?? ''}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatCurrency(ticket.price)}</TableCell>
                  <TableCell>
                    <div className="min-w-32">
                      <ProgressBar value={sold} max={ticket.totalQuantity} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatNumber(sold)} of {formatNumber(ticket.totalQuantity)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className={ticket.availableQuantity === 0 ? 'font-medium text-destructive' : 'font-medium'}>
                    {ticket.availableQuantity === 0 ? 'Sold out' : formatNumber(ticket.availableQuantity)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`${ticket.name} on sale`}
                      checked={ticket.status === 'ACTIVE'}
                      onCheckedChange={(checked) =>
                        statusMutation.mutate({ id: ticket.id, status: checked ? 'ACTIVE' : 'INACTIVE' })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/bookings?ticketId=${ticket.id}`}>Bookings</Link>
                      </Button>
                      <Button variant="ghost" size="icon" asChild title="Edit ticket" aria-label={`Edit ${ticket.name}`}>
                        <Link to={`/tickets/${ticket.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      {sold > 0 ? (
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Archive ticket"
                              aria-label={`Archive ${ticket.name}`}
                              className="text-destructive hover:text-destructive"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          }
                          title="Archive ticket"
                          description={`"${ticket.name}" has bookings, so it can't be deleted. Archiving hides it from this list and stops sales; existing bookings are kept.`}
                          confirmLabel="Archive"
                          variant="destructive"
                          onConfirm={() => archiveMutation.mutateAsync(ticket.id)}
                        />
                      ) : (
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete ticket"
                              aria-label={`Delete ${ticket.name}`}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Delete ticket"
                          description={`Are you sure you want to delete "${ticket.name}"? This cannot be undone.`}
                          confirmLabel="Delete"
                          variant="destructive"
                          onConfirm={() => deleteMutation.mutateAsync(ticket.id)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataPanel>
    </div>
  );
}
