import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { TicketForm, TicketFormValues } from './TicketForm';
import { toTicketPayload } from './ticketPayload';
import { createTicket } from '@/services/ticket.service';

export default function TicketCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSubmit(values: TicketFormValues) {
    await createTicket(toTicketPayload(values));
    await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    toast.success('Ticket created');
    navigate('/tickets');
  }

  return (
    <div>
      <PageHeader
        title="Create Ticket"
        description="Add a new ticket type for a festival"
        backTo="/tickets"
        backLabel="Back to tickets"
      />
      <TicketForm onSubmit={handleSubmit} submitLabel="Create Ticket" />
    </div>
  );
}
