import { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Clock, Mail, MapPin, MessageCircle, Phone, Trash2, User } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/ErrorState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/services/api';
import { formatDate } from '@/lib/utils';
import {
  EARLY_BIRD_TYPE_VARIANT,
  deleteEarlyBird,
  earlyBirdTypeLabel,
  formatIndianPhone,
  getEarlyBird,
  interestLabel,
  nameInitials,
} from '@/services/earlyBird.service';

export default function EarlyBirdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { admin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: r, isLoading, isError, refetch } = useQuery({
    queryKey: ['early-bird', 'detail', id],
    queryFn: () => getEarlyBird(id!),
    enabled: !!id,
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError || !r) return <ErrorState onRetry={() => refetch()} />;

  async function handleDelete() {
    try {
      await deleteEarlyBird(r!.id);
      toast.success('Registration deleted');
      queryClient.invalidateQueries({ queryKey: ['early-bird'] });
      navigate('/early-bird');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete registration'));
    }
  }

  const waLink = `https://wa.me/91${r.whatsappNumber}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Registration details" backTo="/early-bird" backLabel="Back to early bird" />

      {/* Profile header */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {nameInitials(r.name)}
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="truncate text-xl font-semibold">{r.name}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
                <Badge variant={EARLY_BIRD_TYPE_VARIANT[r.interestType] ?? 'default'}>
                  {earlyBirdTypeLabel(r.interestType)}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {r.townOrCity}
                </span>
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> {r.ageGroup}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`tel:+91${r.whatsappNumber}`}>
                <Phone className="h-4 w-4" /> Call
              </a>
            </Button>
            {r.email && (
              <Button variant="outline" asChild>
                <a href={`mailto:${r.email}`}>
                  <Mail className="h-4 w-4" /> Email
                </a>
              </Button>
            )}
            {admin?.role === 'SUPER_ADMIN' && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                }
                title="Delete registration?"
                description={`This permanently removes the registration from ${r.name}.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleDelete}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Interests</CardTitle>
          </CardHeader>
          <CardContent>
            {r.interests.length === 0 ? (
              <p className="text-sm text-foreground">No interests selected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {r.interests.map((i) => (
                  <Badge key={i} variant="outline" className="border-primary/40 px-3 py-1 text-sm font-normal text-primary">
                    {interestLabel(i)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            <InfoRow
              icon={MessageCircle}
              label="WhatsApp"
              value={
                <a href={waLink} target="_blank" rel="noreferrer" className="tabular-nums text-primary hover:underline">
                  {formatIndianPhone(r.whatsappNumber)}
                </a>
              }
            />
            <InfoRow
              icon={Mail}
              label="Email"
              value={
                r.email ? (
                  <a href={`mailto:${r.email}`} className="break-all text-primary hover:underline">
                    {r.email}
                  </a>
                ) : (
                  <span className="text-foreground">Not provided</span>
                )
              }
            />
            <InfoRow icon={MapPin} label="Town / city" value={r.townOrCity} />
            <InfoRow icon={User} label="Age group" value={r.ageGroup} />
            <InfoRow icon={Calendar} label="Registered" value={formatDate(r.createdAt, true)} />
            <InfoRow icon={Clock} label="Last updated" value={formatDate(r.updatedAt, true)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-primary">{label}</p>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
