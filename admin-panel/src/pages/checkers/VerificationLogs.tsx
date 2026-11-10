import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataPanel } from '@/components/common/DataPanel';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterSelect, FilterTabs, SearchInput } from '@/components/common/ListControls';
import { Badge, BadgeProps } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useListParams } from '@/hooks/useListParams';
import { formatDate } from '@/lib/utils';
import {
  VERIFICATION_OUTCOMES,
  VerificationMethod,
  VerificationOutcome,
  listVerificationLogs,
} from '@/services/checkin.service';
import { listScanners } from '@/services/scanner.service';

const FILTER_KEYS = ['search', 'outcome', 'method', 'adminId'] as const;

const OUTCOME_VARIANT: Record<VerificationOutcome, BadgeProps['variant']> = {
  CHECKED_IN: 'success',
  VALID: 'default',
  DUPLICATE: 'warning',
  NOT_FOUND: 'destructive',
  INVALID: 'destructive',
};

const OUTCOME_LABEL = Object.fromEntries(VERIFICATION_OUTCOMES.map((o) => [o.value, o.label])) as Record<
  VerificationOutcome,
  string
>;

export default function VerificationLogsPage() {
  const { page, get, setFilter, setPage, hasFilters, clearFilters } = useListParams(FILTER_KEYS);
  const filters = {
    search: get('search') || undefined,
    outcome: (get('outcome') as VerificationOutcome) || undefined,
    method: (get('method') as VerificationMethod) || undefined,
    adminId: get('adminId') || undefined,
  };

  const { data, isLoading, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ['verification-logs', page, filters],
    queryFn: () => listVerificationLogs({ page, limit: 25, ...filters }),
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
  const checkers = useQuery({ queryKey: ['scanners'], queryFn: listScanners });

  return (
    <div>
      <PageHeader
        title="Verification log"
        description="Every ticket lookup and check-in made at the gate, newest first"
      />

      <DataPanel
        tabs={
          <FilterTabs
            value={get('outcome')}
            onChange={(v) => setFilter('outcome', v)}
            allLabel="All"
            options={VERIFICATION_OUTCOMES}
          />
        }
        filters={
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={get('search')}
              onChange={(v) => setFilter('search', v)}
              placeholder="Search ticket number or checker"
            />
            <FilterSelect
              value={get('method')}
              onChange={(v) => setFilter('method', v)}
              allLabel="Any method"
              options={[
                { value: 'QR', label: 'QR scan' },
                { value: 'MANUAL', label: 'Manual entry' },
              ]}
            />
            <FilterSelect
              value={get('adminId')}
              onChange={(v) => setFilter('adminId', v)}
              allLabel="All checkers"
              options={(checkers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
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
            icon={History}
            title="No verifications yet"
            description="Scans and manual lookups from the Check-in screen appear here."
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Checker</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap font-mono text-foreground">{log.ticketNumber}</TableCell>
                <TableCell className="text-foreground">{log.admin?.name ?? 'Deleted user'}</TableCell>
                <TableCell className="whitespace-nowrap text-foreground">{formatDate(log.createdAt, true)}</TableCell>
                <TableCell className="text-foreground">{log.method === 'QR' ? 'QR scan' : 'Manual'}</TableCell>
                <TableCell className="text-foreground">{log.action === 'CHECK_IN' ? 'Check-in' : 'Lookup'}</TableCell>
                <TableCell>
                  <Badge variant={OUTCOME_VARIANT[log.outcome]}>{OUTCOME_LABEL[log.outcome]}</Badge>
                  {log.message && log.outcome !== 'CHECKED_IN' && (
                    <p className="mt-1 max-w-xs text-xs text-foreground">{log.message}</p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataPanel>
    </div>
  );
}
