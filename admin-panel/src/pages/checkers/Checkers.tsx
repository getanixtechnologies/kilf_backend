import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Mail, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage } from '@/services/api';
import {
  CheckerCredentialsResult,
  createScanner,
  listScanners,
  resendScannerCredentials,
  updateScanner,
} from '@/services/scanner.service';
import { formatDate } from '@/lib/utils';

const EMPTY = { name: '', email: '', password: '' };

/** Admin tool: gate staff logins that can only verify and check in tickets. */
export default function CheckersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [generate, setGenerate] = useState(true);
  const [issued, setIssued] = useState<CheckerCredentialsResult | null>(null);
  const checkers = useQuery({ queryKey: ['scanners'], queryFn: listScanners });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['scanners'] });

  const create = useMutation({
    mutationFn: createScanner,
    onSuccess: (result) => {
      setForm(EMPTY);
      setIssued(result);
      refresh();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to create checker')),
  });

  const resend = useMutation({
    mutationFn: resendScannerCredentials,
    onSuccess: (result) => {
      setIssued(result);
      refresh();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to resend credentials')),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateScanner(id, { isActive }),
    onSuccess: (a) => {
      toast.success(a.isActive ? `${a.name} reactivated` : `${a.name} deactivated`);
      refresh();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update checker')),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      password: generate ? undefined : form.password,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checkers"
        description="Gate staff accounts. Checkers can only scan, verify and check in tickets."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add checker</CardTitle>
          <CardDescription>
            Login details are emailed to the checker. They must set a new password the first time they sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="checker-name">Name</Label>
              <Input
                id="checker-name"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checker-email">Email</Label>
              <Input
                id="checker-email"
                type="email"
                required
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-foreground sm:col-span-2">
              <Switch checked={generate} onCheckedChange={setGenerate} />
              Generate a secure temporary password
            </label>
            {!generate && (
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-sm">
                <Label htmlFor="checker-password">Temporary password</Label>
                <Input
                  id="checker-password"
                  type="text"
                  required
                  minLength={8}
                  autoComplete="off"
                  className="font-mono"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            )}
            <Button type="submit" className="sm:col-span-2 sm:w-fit" loading={create.isPending}>
              <UserCheck className="h-4 w-4" /> Create checker
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checker accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {checkers.data?.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={UserCheck} title="No checkers yet" description="Create one above to staff the gate." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Checker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkers.data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="text-sm text-foreground">{c.email}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={c.isActive ? 'success' : 'destructive'}>{c.isActive ? 'Active' : 'Deactivated'}</Badge>
                        {c.mustChangePassword && <Badge variant="outline">Temporary password</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-foreground">
                      {c.lastLoginAt ? formatDate(c.lastLoginAt, true) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3">
                        <ConfirmDialog
                          title="Resend login details?"
                          description={`${c.name}'s current password stops working and a new temporary password is emailed to ${c.email}.`}
                          confirmLabel="Reset and email"
                          onConfirm={() => resend.mutateAsync(c.id).catch(() => undefined)}
                          trigger={
                            <Button variant="outline" size="sm" disabled={!c.isActive || resend.isPending}>
                              <Mail className="h-3.5 w-3.5" /> Resend login
                            </Button>
                          }
                        />
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <span className="hidden sm:inline">{c.isActive ? 'Active' : 'Off'}</span>
                          <Switch
                            aria-label={c.isActive ? `Deactivate ${c.name}` : `Reactivate ${c.name}`}
                            checked={c.isActive}
                            disabled={toggle.isPending}
                            onCheckedChange={(isActive) => toggle.mutate({ id: c.id, isActive })}
                          />
                        </label>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!issued} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{issued?.emailSent ? 'Login details emailed' : 'Email not sent'}</DialogTitle>
            <DialogDescription className="text-foreground">
              {issued?.emailSent
                ? `${issued.scanner.email} has been sent their login details.`
                : `The email to ${issued?.scanner.email} could not be sent. Share the password below with them directly.`}{' '}
              This password is shown only once.
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="flex items-center gap-2 rounded-md border border-border p-3">
              <code className="flex-1 break-all font-mono text-lg text-foreground">{issued.temporaryPassword}</code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard?.writeText(issued.temporaryPassword).then(
                    () => toast.success('Copied'),
                    () => toast.error('Copy failed')
                  );
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button onClick={() => setIssued(null)}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
