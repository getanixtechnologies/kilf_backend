import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  ENQUIRY_STATUSES,
  EnquiryStatus,
  deleteEnquiry,
  listEnquiries,
  updateEnquiryStatus,
} from '@/services/enquiry.service';

export default function EnquiriesListPage() {
  const { admin } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EnquiryStatus | 'ALL'>('ALL');

  const filters = { search: search || undefined, status: status === 'ALL' ? undefined : status };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['enquiries', page, filters],
    queryFn: () => listEnquiries({ page, limit: 20, ...filters }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EnquiryStatus }) => updateEnquiryStatus(id, status),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update status')),
  });

  async function handleDelete(id: string) {
    try {
      await deleteEnquiry(id);
      toast.success('Enquiry deleted');
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete enquiry'));
    }
  }

  const canDelete = admin?.role === 'SUPER_ADMIN';

  return (
    <div>
      <PageHeader
        title="Enquiries"
        description={
          data ? `${data.pagination.total} enquiries from the website form` : 'Enquiries from the website form'
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search name, email, phone, company, message..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as EnquiryStatus | 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ENQUIRY_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-96" />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No enquiries found"
          description="Submissions from the website enquiry form will appear here."
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Company / brand</TableHead>
                <TableHead>Interested in</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                {canDelete && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <a href={`mailto:${e.email}`} className="hover:underline">
                      {e.email}
                    </a>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <a href={`tel:${e.phone}`} className="hover:underline">
                      {e.phone}
                    </a>
                  </TableCell>
                  <TableCell>{e.organisation}</TableCell>
                  <TableCell>{e.topic ?? '—'}</TableCell>
                  <TableCell className="max-w-xs">
                    {e.notes ? (
                      <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground" title={e.notes}>
                        {e.notes}
                      </p>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={e.status}
                      onValueChange={(v) => statusMutation.mutate({ id: e.id, status: v as EnquiryStatus })}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENQUIRY_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(e.createdAt, true)}
                  </TableCell>
                  {canDelete && (
                    <TableCell>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Delete enquiry">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete enquiry?"
                        description={`This permanently removes the enquiry from ${e.name}.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        onConfirm={() => handleDelete(e.id)}
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
