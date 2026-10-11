import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PaginationBar } from '@/components/common/PaginationBar';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/services/api';
import { formatDate } from '@/lib/utils';
import {
  AGE_GROUPS,
  EARLY_BIRD_TYPES,
  EarlyBirdType,
  INTEREST_LABELS,
  deleteEarlyBird,
  exportEarlyBirdCsv,
  listEarlyBird,
} from '@/services/earlyBird.service';

export default function EarlyBirdListPage() {
  const { admin } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<EarlyBirdType | 'ALL'>('ALL');
  const [ageGroup, setAgeGroup] = useState('ALL');
  const [interest, setInterest] = useState('ALL');
  const [exporting, setExporting] = useState(false);

  const filters = {
    search: search || undefined,
    interestType: type === 'ALL' ? undefined : type,
    ageGroup: ageGroup === 'ALL' ? undefined : ageGroup,
    interest: interest === 'ALL' ? undefined : interest,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['early-bird', page, filters],
    queryFn: () => listEarlyBird({ page, limit: 20, ...filters }),
  });

  async function handleExport() {
    setExporting(true);
    try {
      await exportEarlyBirdCsv(filters);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to export registrations'));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteEarlyBird(id);
      toast.success('Registration deleted');
      queryClient.invalidateQueries({ queryKey: ['early-bird'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete registration'));
    }
  }

  const canDelete = admin?.role === 'SUPER_ADMIN';

  function onFilter<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div>
      <PageHeader
        title="Early Bird Registrations"
        description={
          data ? `${data.pagination.total} sign-ups from the public website` : 'Sign-ups from the public website'
        }
        actions={
          <Button variant="outline" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Search name, number, email, town..."
          value={search}
          onChange={(e) => onFilter(setSearch)(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={type} onValueChange={onFilter(setType as (v: string) => void)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {EARLY_BIRD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ageGroup} onValueChange={onFilter(setAgeGroup)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="All ages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All ages</SelectItem>
            {AGE_GROUPS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={interest} onValueChange={onFilter(setInterest)}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="All interests" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All interests</SelectItem>
            {Object.entries(INTEREST_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-96" />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No registrations found"
          description="Sign-ups from the public website will appear here."
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Town / City</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Interests</TableHead>
                <TableHead>Registered</TableHead>
                {canDelete && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="accent">{r.interestType}</Badge>
                  </TableCell>
                  <TableCell>
                    <a href={`https://wa.me/91${r.whatsappNumber}`} target="_blank" rel="noreferrer" className="hover:underline">
                      +91 {r.whatsappNumber}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.email ?? '—'}</TableCell>
                  <TableCell>{r.townOrCity}</TableCell>
                  <TableCell>{r.ageGroup}</TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {r.interests.length === 0 && <span className="text-muted-foreground">—</span>}
                      {r.interests.map((i) => (
                        <Badge key={i} variant="outline">
                          {INTEREST_LABELS[i] ?? i}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(r.createdAt, true)}
                  </TableCell>
                  {canDelete && (
                    <TableCell>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Delete registration">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete registration?"
                        description={`This permanently removes the registration from ${r.name}.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        onConfirm={() => handleDelete(r.id)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
