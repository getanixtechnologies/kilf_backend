import { NavLink } from 'react-router-dom';
import {
  BookOpen,
  LayoutDashboard,
  Ticket,
  ClipboardList,
  ScanLine,
  Handshake,
  Sparkles,
  MessageSquare,
  LineChart,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true }] },
  {
    label: 'Tickets',
    items: [
      { label: 'All Tickets', to: '/tickets', icon: Ticket, end: true },
      { label: 'Create Ticket', to: '/tickets/create', icon: Ticket },
    ],
  },
  {
    label: 'Bookings',
    items: [
      { label: 'All Bookings', to: '/bookings', icon: ClipboardList },
      { label: 'Check-in', to: '/check-in', icon: ScanLine },
    ],
  },
  { items: [{ label: 'Sponsors', to: '/sponsors', icon: Handshake }] },
  { items: [{ label: 'Early Bird', to: '/early-bird', icon: Sparkles }] },
  { items: [{ label: 'Enquiries', to: '/enquiries', icon: MessageSquare }] },
  { items: [{ label: 'Revenue', to: '/revenue', icon: LineChart }] },
  { items: [{ label: 'Settings', to: '/admin/settings', icon: Settings }] },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { admin, logout } = useAuth();

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BookOpen className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="font-serif text-base font-extrabold leading-tight text-primary">
            kilf <span className="text-xs font-semibold text-foreground">2027</span>
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Kollam Intl. Literature Festival</p>
        </div>
        <button
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-secondary lg:hidden"
          onClick={onNavigate}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group, idx) => (
          <div key={idx}>
            {group.label && (
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/80 hover:bg-secondary hover:text-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent-foreground">
            {admin?.name?.charAt(0) ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{admin?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{admin?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2.5 text-muted-foreground" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
