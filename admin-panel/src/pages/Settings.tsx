import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { API_URL } from '@/services/api';

export default function SettingsPage() {
  const { admin } = useAuth();
  const apiUrl = API_URL;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="System information and preferences" />

      <Card>
        <CardHeader>
          <CardTitle>API connection</CardTitle>
          <CardDescription>The backend this admin panel is talking to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">API base URL</span>
            <span className="font-mono text-xs">{apiUrl}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API documentation</span>
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <a href={`${apiUrl}/api/docs`} target="_blank" rel="noreferrer">
                Open Swagger docs <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
          <CardDescription>Your current role determines which actions are available.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="accent">{admin?.role.replace('_', ' ')}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {admin?.role === 'SUPER_ADMIN'
              ? 'Super Admins can delete festivals, tickets, and sponsors, and view audit logs.'
              : 'Admins can manage festivals, tickets, bookings, and sponsors. Deleting records and viewing audit logs requires the Super Admin role.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
