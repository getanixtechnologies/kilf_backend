import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Ticket, TicketType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Field, FormActions, FormSection } from '@/components/common/FormLayout';
import { getApiErrorMessage } from '@/services/api';
import { PerksInput } from './PerksInput';
import { TICKET_TYPES, TICKET_TYPE_OPTIONS, passRuleDefaults } from '@/lib/ticketTypes';

const optionalAge = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 120), 'Enter an age from 0 to 120');

const optionalDays = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 60), 'Enter 1 to 60 days');

const ticketSchema = z
  .object({
    festivalId: z.union([z.string().uuid('Select a festival'), z.literal('')]).optional(),
    name: z.string().min(2, 'Name is required'),
    description: z.string().optional(),
    ticketType: z.enum(TICKET_TYPES as [TicketType, ...TicketType[]]),
    price: z.coerce.number().nonnegative('Price cannot be negative'),
    gstRate: z.coerce.number().min(0, 'GST cannot be negative').max(100, 'GST cannot exceed 100%'),
    totalQuantity: z.coerce.number().int().positive('Must be at least 1'),
    salesStart: z.string().min(1, 'Sales start date is required'),
    salesEnd: z.string().min(1, 'Sales end date is required'),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    perks: z.array(z.string()).optional(),
    multiDay: z.boolean(),
    requiresDate: z.boolean(),
    requiresShowSession: z.boolean(),
    minAge: optionalAge,
    maxAge: optionalAge,
    validityDays: optionalDays,
    allowReentry: z.boolean(),
  })
  .refine((d) => new Date(d.salesEnd) > new Date(d.salesStart), {
    message: 'Sales end must be after sales start',
    path: ['salesEnd'],
  })
  .refine((d) => d.ticketType !== 'NEW_YEAR_EVE' || d.price === 0, {
    message: "New Year's Eve registration is free; price must be 0",
    path: ['price'],
  })
  .refine((d) => d.minAge === '' || d.maxAge === '' || Number(d.minAge) <= Number(d.maxAge), {
    message: 'Max age must be at least the min age',
    path: ['maxAge'],
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

const RULE_SWITCHES: { name: 'multiDay' | 'requiresDate' | 'requiresShowSession' | 'allowReentry'; label: string; hint: string }[] = [
  { name: 'multiDay', label: 'Valid on every festival day', hint: 'Checked in once per day instead of once.' },
  { name: 'requiresDate', label: 'Buyer picks a festival day', hint: 'For single-day passes.' },
  { name: 'requiresShowSession', label: 'Buyer picks a show date', hint: 'For Khasak show seats.' },
  { name: 'allowReentry', label: 'Allow re-entry', hint: 'Can be scanned in more than once on the same day.' },
];

export function TicketForm({ defaultValues, fixedFestivalId, onSubmit, submitLabel }: TicketFormProps) {
  const navigate = useNavigate();

  const initialType: TicketType = defaultValues?.ticketType ?? 'FULL_FESTIVAL';
  const presets = passRuleDefaults(initialType);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      festivalId: defaultValues?.festivalId ?? fixedFestivalId ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      ticketType: initialType,
      price: defaultValues?.price != null ? Number(defaultValues.price) : 0,
      gstRate: defaultValues?.gstRate != null ? Number(defaultValues.gstRate) : presets.gstRate,
      totalQuantity: defaultValues?.totalQuantity ?? 100,
      salesStart: toInputDateTime(defaultValues?.salesStart) || toInputDateTime(new Date().toISOString()),
      salesEnd: toInputDateTime(defaultValues?.salesEnd),
      status: defaultValues?.status ?? 'ACTIVE',
      perks: defaultValues?.perks?.length ? defaultValues.perks : [''],
      multiDay: defaultValues?.multiDay ?? presets.multiDay,
      requiresDate: defaultValues?.requiresDate ?? presets.requiresDate,
      requiresShowSession: defaultValues?.requiresShowSession ?? presets.requiresShowSession,
      minAge: defaultValues?.minAge != null ? String(defaultValues.minAge) : '',
      maxAge: defaultValues?.maxAge != null ? String(defaultValues.maxAge) : '',
      validityDays: defaultValues?.validityDays != null ? String(defaultValues.validityDays) : '',
      allowReentry: defaultValues?.allowReentry ?? false,
    },
  });

  function handleTypeChange(type: TicketType) {
    setValue('ticketType', type);
    const rules = passRuleDefaults(type);
    setValue('gstRate', rules.gstRate);
    setValue('multiDay', rules.multiDay);
    setValue('requiresDate', rules.requiresDate);
    setValue('requiresShowSession', rules.requiresShowSession);
    if (type === 'NEW_YEAR_EVE') setValue('price', 0);
  }

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
          <Field label="Ticket name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" placeholder="Festival Pass" {...register('name')} />
          </Field>

          <Field label="Ticket type" required hint="Picking a type fills in its usual GST and pass rules.">
            <Controller
              control={control}
              name="ticketType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => handleTypeChange(v as TicketType)}>
                  <SelectTrigger aria-label="Ticket type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field
            label="What's included"
            htmlFor="perks"
            wide
            hint="Shown to buyers as a list. Press Enter to add the next point."
          >
            <Controller
              control={control}
              name="perks"
              render={({ field }) => (
                <PerksInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholders={['Front-row seating at main-stage sessions', 'Priority entry at both venues']}
                />
              )}
            />
          </Field>
        </FormSection>

        <FormSection title="Price and inventory" description="Price is before GST; GST is added at checkout.">
          <Field label="Price (excl. GST)" htmlFor="price" required error={errors.price?.message}>
            <Input id="price" type="number" step="0.01" min="0" {...register('price')} />
          </Field>
          <Field label="GST %" htmlFor="gstRate" required error={errors.gstRate?.message}>
            <Input id="gstRate" type="number" step="0.01" min="0" max="100" {...register('gstRate')} />
          </Field>
          <Field label="Total quantity" htmlFor="totalQuantity" required error={errors.totalQuantity?.message}>
            <Input id="totalQuantity" type="number" min="1" {...register('totalQuantity')} />
          </Field>
        </FormSection>

        <FormSection title="Pass rules" description="Who can use the pass and what the buyer has to choose.">
          {RULE_SWITCHES.map((rule) => (
            <Field key={rule.name} label={rule.label} hint={rule.hint}>
              <Controller
                control={control}
                name={rule.name}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={rule.label} />
                )}
              />
            </Field>
          ))}
          <Field
            label="Validity (event days)"
            htmlFor="validityDays"
            hint="Days of entry from the festival's first day (or the chosen day). Blank = 1 day, or every day if valid on every festival day."
            error={errors.validityDays?.message}
          >
            <Input id="validityDays" type="number" min="1" max="60" {...register('validityDays')} />
          </Field>
          <Field label="Min age" htmlFor="minAge" hint="Leave blank for no limit." error={errors.minAge?.message}>
            <Input id="minAge" type="number" min="0" max="120" {...register('minAge')} />
          </Field>
          <Field label="Max age" htmlFor="maxAge" hint="Leave blank for no limit." error={errors.maxAge?.message}>
            <Input id="maxAge" type="number" min="0" max="120" {...register('maxAge')} />
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
