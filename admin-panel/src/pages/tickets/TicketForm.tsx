import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Ticket } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Field, FormActions, FormSection } from '@/components/common/FormLayout';
import { getApiErrorMessage } from '@/services/api';
import { listFestivals } from '@/services/festival.service';

const ticketSchema = z
  .object({
    festivalId: z.union([z.string().uuid('Select a festival'), z.literal('')]).optional(),
    name: z.string().min(2, 'Name is required'),
    description: z.string().optional(),
    ticketType: z.enum(['GENERAL', 'VIP', 'STUDENT', 'EARLY_BIRD', 'DAY_PASS', 'FULL_FESTIVAL']),
    price: z.coerce.number().nonnegative('Price cannot be negative'),
    totalQuantity: z.coerce.number().int().positive('Must be at least 1'),
    salesStart: z.string().min(1, 'Sales start date is required'),
    salesEnd: z.string().min(1, 'Sales end date is required'),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .refine((d) => new Date(d.salesEnd) > new Date(d.salesStart), {
    message: 'Sales end must be after sales start',
    path: ['salesEnd'],
  });

export type TicketFormValues = z.infer<typeof ticketSchema>;

function toInputDateTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TicketFormProps {
  defaultValues?: Partial<Ticket>;
  fixedFestivalId?: string;
  onSubmit: (values: TicketFormValues) => Promise<unknown>;
  submitLabel: string;
}

export function TicketForm({ defaultValues, fixedFestivalId, onSubmit, submitLabel }: TicketFormProps) {
  const navigate = useNavigate();
  const { data: festivalsData } = useQuery({
    queryKey: ['festivals-all'],
    queryFn: () => listFestivals({ page: 1, limit: 100 }),
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      festivalId: defaultValues?.festivalId ?? fixedFestivalId ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      ticketType: defaultValues?.ticketType ?? 'GENERAL',
      price: defaultValues?.price ? Number(defaultValues.price) : 0,
      totalQuantity: defaultValues?.totalQuantity ?? 100,
      salesStart: toInputDateTime(defaultValues?.salesStart) || toInputDateTime(new Date().toISOString()),
      salesEnd: toInputDateTime(defaultValues?.salesEnd),
      status: defaultValues?.status ?? 'ACTIVE',
    },
  });

  async function handleFormSubmit(values: TicketFormValues) {
    try {
      await onSubmit(values);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save ticket'));
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <FormSection title="Ticket details" description="What customers see when they choose a ticket.">
          <Field label="Festival" wide error={errors.festivalId?.message}>
            <Controller
              control={control}
              name="festivalId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!!fixedFestivalId}>
                  <SelectTrigger aria-label="Festival">
                    <SelectValue placeholder="Latest festival (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    {festivalsData?.data.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Ticket name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" placeholder="General Admission" {...register('name')} />
          </Field>

          <Field label="Ticket type" required>
            <Controller
              control={control}
              name="ticketType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Ticket type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">General</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="STUDENT">Student</SelectItem>
                    <SelectItem value="EARLY_BIRD">Early Bird</SelectItem>
                    <SelectItem value="DAY_PASS">Day Pass</SelectItem>
                    <SelectItem value="FULL_FESTIVAL">Full Festival</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Description" htmlFor="description" wide>
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
        </FormSection>

        <FormSection title="Price and inventory" description="How much it costs and how many can be sold.">
          <Field label="Price" htmlFor="price" required error={errors.price?.message}>
            <Input id="price" type="number" step="0.01" min="0" {...register('price')} />
          </Field>
          <Field label="Total quantity" htmlFor="totalQuantity" required error={errors.totalQuantity?.message}>
            <Input id="totalQuantity" type="number" min="1" {...register('totalQuantity')} />
          </Field>
        </FormSection>

        <FormSection title="Availability" description="When the ticket can be bought. Inactive tickets stay hidden from sale.">
          <Field label="Sales start" htmlFor="salesStart" required error={errors.salesStart?.message}>
            <Input id="salesStart" type="datetime-local" {...register('salesStart')} />
          </Field>
          <Field label="Sales end" htmlFor="salesEnd" required error={errors.salesEnd?.message}>
            <Input id="salesEnd" type="datetime-local" {...register('salesEnd')} />
          </Field>
          <Field label="Status" required>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </FormSection>

        <FormActions>
          <Button type="button" variant="outline" onClick={() => navigate('/tickets')}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </FormActions>
      </form>
    </Card>
  );
}
