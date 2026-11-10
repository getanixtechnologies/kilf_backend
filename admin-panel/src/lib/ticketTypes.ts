import { TicketType } from '@/types';

export const TICKET_TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: 'FULL_FESTIVAL', label: 'Festival Pass' },
  { value: 'DAY_PASS', label: 'Day Pass' },
  { value: 'YOUNG_READER', label: 'Young Reader Pass' },
  { value: 'KHASAK_SHOW', label: 'Khasak show' },
  { value: 'DRAMA', label: 'Drama' },
  { value: 'ELITE', label: 'Elite Pass' },
  { value: 'NEW_YEAR_EVE', label: "New Year's Eve (free)" },
  { value: 'GENERAL', label: 'General' },
  { value: 'VIP', label: 'VIP' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'EARLY_BIRD', label: 'Early Bird' },
];

export const TICKET_TYPES = TICKET_TYPE_OPTIONS.map((o) => o.value);

export interface PassRuleDefaults {
  gstRate: number;
  requiresDate: boolean;
  requiresShowSession: boolean;
  multiDay: boolean;
}

/** Mirrors the backend's per-type presets so the form starts with the right rules. */
export function passRuleDefaults(type: TicketType): PassRuleDefaults {
  return {
    gstRate: type === 'NEW_YEAR_EVE' ? 0 : 18,
    requiresDate: type === 'DAY_PASS',
    // Elite is a whole-festival pass: no festival day or show date to pick.
    requiresShowSession: type === 'KHASAK_SHOW' || type === 'DRAMA',
    multiDay: type === 'FULL_FESTIVAL' || type === 'YOUNG_READER' || type === 'ELITE',
  };
}
