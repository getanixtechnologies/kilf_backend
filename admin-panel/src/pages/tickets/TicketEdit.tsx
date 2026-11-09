import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { TicketForm, TicketFormValues } from './TicketForm';
import { toTicketPayload } from './ticketPayload';
import { getTicket, updateTicket } from '@/services/ticket.service';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/ErrorState';

export default function TicketEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: ticket, isLoading, isError, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    // The festival can't be changed after creation, so it isn't sent.
    mutationFn: (values: TicketFormValues) =>
      updateTicket(id!, { ...toTicketPayload(values), festivalId: undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      toast.success('Ticket updated');
      navigate('/tickets');
    },
  });

  return (
    <div>
      <PageHeader
        title="Edit Ticket"
        description="Update ticket pricing, inventory, and sales window"
        backTo="/tickets"
        backLabel="Back to tickets"
      />
      {isLoading && <Skeleton className="h-96" />}
      {isError && <ErrorState onRetry={() => refetch()} />}
      {ticket && (
        <TicketForm
          defaultValues={ticket}
          fixedFestivalId={ticket.festivalId}
          onSubmit={(v) => mutation.mutateAsync(v)}
          submitLabel="Save Changes"
        />
      )}
    </div>
  );
}
