import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

import LoginPage from '@/pages/Login';
import DashboardPage from '@/pages/Dashboard';
import TicketsListPage from '@/pages/tickets/TicketsList';
import TicketCreatePage from '@/pages/tickets/TicketCreate';
import TicketEditPage from '@/pages/tickets/TicketEdit';
import BookingsListPage from '@/pages/bookings/BookingsList';
import BookingDetailPage from '@/pages/bookings/BookingDetail';
import SponsorsListPage from '@/pages/sponsors/SponsorsList';
import SponsorCreatePage from '@/pages/sponsors/SponsorCreate';
import SponsorEditPage from '@/pages/sponsors/SponsorEdit';
import EarlyBirdListPage from '@/pages/earlyBird/EarlyBirdList';
import EarlyBirdDetailPage from '@/pages/earlyBird/EarlyBirdDetail';
import EnquiriesListPage from '@/pages/enquiries/EnquiriesList';
import RevenuePage from '@/pages/Revenue';
import CheckInPage from '@/pages/CheckIn';
import ProfilePage from '@/pages/Profile';
import SettingsPage from '@/pages/Settings';
import NotFoundPage from '@/pages/NotFound';
import ChangePasswordPage from '@/pages/ChangePassword';
import CheckersPage from '@/pages/checkers/Checkers';
import VerificationLogsPage from '@/pages/checkers/VerificationLogs';

/** Lands each role on its home screen: gate staff go straight to scanning. */
function RoleHome() {
  const { admin } = useAuth();
  return <Navigate to={admin?.role === 'SCANNER' ? '/check-in' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/tickets" element={<TicketsListPage />} />
          <Route path="/tickets/create" element={<TicketCreatePage />} />
          <Route path="/tickets/:id/edit" element={<TicketEditPage />} />

          <Route path="/bookings" element={<BookingsListPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />

          <Route path="/sponsors" element={<SponsorsListPage />} />
          <Route path="/sponsors/create" element={<SponsorCreatePage />} />
          <Route path="/sponsors/:id/edit" element={<SponsorEditPage />} />

          <Route path="/early-bird" element={<EarlyBirdListPage />} />
          <Route path="/early-bird/:id" element={<EarlyBirdDetailPage />} />
          <Route path="/enquiries" element={<EnquiriesListPage />} />

          <Route path="/revenue" element={<RevenuePage />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="/checkers" element={<CheckersPage />} />
          <Route path="/verification-logs" element={<VerificationLogsPage />} />

          <Route path="/admin/profile" element={<ProfilePage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RoleHome />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
