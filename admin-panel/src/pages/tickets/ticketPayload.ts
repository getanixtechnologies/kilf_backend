import { TicketInput } from '@/services/ticket.service';
import type { TicketFormValues } from './TicketForm';

/** Turns ticket form values into the API payload shared by create and edit. */
export function toTicketPayload(values: TicketFormValues): TicketInput {
  return {
    ...values,
    festivalId: values.festivalId || undefined,
    salesStart: new Date(values.salesStart).toISOString(),
    salesEnd: new Date(values.salesEnd).toISOString(),
    perks: (values.perks ?? '')
      .split('\n')
      .map((p) => p.replace(/^[\s*•-]+/, '').trim())
      .filter(Boolean),
    minAge: values.minAge === '' ? null : Number(values.minAge),
    maxAge: values.maxAge === '' ? null : Number(values.maxAge),
  };
}
