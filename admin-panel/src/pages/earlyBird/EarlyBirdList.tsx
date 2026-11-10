import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, Download, MapPin, MessageCircle, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataPanel } from '@/components/common/DataPanel';
import { FilterSelect, FilterTabs, SearchInput } from '@/components/common/ListControls';
import { useAuth } from '@/hooks/useAuth';
import { useListParams } from '@/hooks/useListParams';
import { getApiErrorMessage } from '@/services/api';
import { formatDate } from '@/lib/utils';
import {
  AGE_GROUPS,
  EARLY_BIRD_TYPES,
  EARLY_BIRD_TYPE_VARIANT,
  EarlyBirdType,
  INTEREST_LABELS,
  deleteEarlyBird,
  earlyBirdTypeLabel,
  exportEarlyBirdCsv,
  formatIndianPhone,
  interestLabel,
  listEarlyBird,
  nameInitials,
} from '@/services/earlyBird.service';

const FILTER_KEYS = ['search', 'type', 'age', 'interest'] as const;
const VISIBLE_INTERESTS = 2;

export default function EarlyBirdListPage() {
  const { admin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { page, get, setFilter, setPage, hasFilters, clearFilters } = useListParams(FILTER_KEYS);
  const [exporting, setExporting] = useState(false);

  const filters = {
    search: get('search') || undefined,
    interestType: (get('type') as EarlyBirdType) || undefined,
    ageGroup: get('age') || undefined,
    interest: get('interest') || undefined,
  };

  const { data, isLoading, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ['early-bird', page, filters],
    queryFn: () => listEarlyBird({ page, limit: 20, ...filters }),
    placeholderData: keepPreviousData,
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
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

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

      <DataPanel
        tabs={
          <FilterTabs
            value={get('type')}
            onChange={(v) => setFilter('type', v)}
            allLabel="All"
            options={EARLY_BIRD_TYPES}
          />
        }
        filters={
          <>
            <SearchInput
              value={get('search')}
              onChange={(v) => setFilter('search', v)}
              placeholder="Search name, number, email, town"
            />
            <FilterSelect
              value={get('age')}
              onChange={(v) => setFilter('age', v)}
              allLabel="All ages"
              className="sm:w-36"
              options={AGE_GROUPS.map((a) => ({ value: a, label: a }))}
            />
            <FilterSelect
              value={get('interest')}
              onChange={(v) => setFilter('interest', v)}
              allLabel="All interests"
              className="sm:w-52"
              options={Object.entries(INTEREST_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={data?.data.length === 0}
        isStale={isPlaceholderData}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        pagination={data?.pagination}
        onPageChange={setPage}
        empty={
          <EmptyState
            icon={Sparkles}
            title="No registrations yet"
            description="Sign-ups from the public website will appear here."
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden lg:table-cell">Age</TableHead>
              <TableHead className="hidden md:table-cell">Interests</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/early-bird/${r.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {nameInitials(r.name)}
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/early-bird/${r.id}`}
                        onClick={stop}
                        className="block truncate font-medium hover:text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      <p className="flex items-center gap-1 truncate text-xs text-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-primary" />
                        {r.townOrCity}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <a
                    href={`https://wa.me/91${r.whatsappNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={stop}
                    title="Open in WhatsApp"
                    className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-success" />
                    {formatIndianPhone(r.whatsappNumber)}
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant={EARLY_BIRD_TYPE_VARIANT[r.interestType] ?? 'default'}>
                    {earlyBirdTypeLabel(r.interestType)}
                  </Badge>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.ageGroup}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {r.interests.length === 0 ? (
                    <span className="text-foreground">—</span>
                  ) : (
                    <div
                      className="flex max-w-[17rem] flex-wrap items-center gap-1"
                      title={r.interests.map(interestLabel).join(', ')}
                    >
                      {r.interests.slice(0, VISIBLE_INTERESTS).map((i) => (
                        <Badge key={i} variant="outline" className="max-w-[9rem] truncate border-primary/40 font-normal text-primary">
                          {interestLabel(i)}
                        </Badge>
                      ))}
                      {r.interests.length > VISIBLE_INTERESTS && (
                        <span className="text-xs font-medium text-foreground">
                          +{r.interests.length - VISIBLE_INTERESTS} more
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-foreground" title={formatDate(r.createdAt, true)}>
                  {formatDate(r.createdAt)}
                </TableCell>
                <TableCell onClick={stop}>
                  <div className="flex items-center justify-end">
                    {canDelete ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete registration"
                            aria-label={`Delete registration from ${r.name}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete registration?"
                        description={`This permanently removes the registration from ${r.name}.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        onConfirm={() => handleDelete(r.id)}
                      />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataPanel>
    </div>
  );
}
