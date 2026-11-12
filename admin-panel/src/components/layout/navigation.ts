import {
  ClipboardList,
  History,
  UserCheck,
  Handshake,
  LayoutDashboard,
  LineChart,
  LucideIcon,
  MessageSquare,
  ScanLine,
  Settings,
  Sparkles,
  Ticket,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Nav items a SCANNER (gate staff) account may see. */
export const SCANNER_NAV_PATHS = ['/check-in'];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Revenue', to: '/revenue', icon: LineChart },
    ],
  },
  {
    label: 'Ticketing',
    items: [
      { label: 'Tickets', to: '/tickets', icon: Ticket },
      { label: 'Bookings', to: '/bookings', icon: ClipboardList },
      { label: 'Check-in', to: '/check-in', icon: ScanLine },
      { label: 'Checkers', to: '/checkers', icon: UserCheck },
      { label: 'Verification log', to: '/verification-logs', icon: History },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Early Bird', to: '/early-bird', icon: Sparkles },
      { label: 'Enquiries', to: '/enquiries', icon: MessageSquare },
      { label: 'Sponsors', to: '/sponsors', icon: Handshake },
    ],
  },
  {
    label: 'System',
    items: [{ label: 'Settings', to: '/admin/settings', icon: Settings }],
  },
];

const SECTIONS = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  { label: 'My Profile', to: '/admin/profile' },
];

export function getBreadcrumbs(pathname: string): { label: string; to?: string }[] {
  const section = SECTIONS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (!section) return [];
  if (pathname === section.to) return [{ label: section.label }];

  const leaf = pathname.endsWith('/create') ? 'New' : pathname.endsWith('/edit') ? 'Edit' : 'Details';
  return [{ label: section.label, to: section.to }, { label: leaf }];
}
