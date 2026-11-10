import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter the temporary password from your email'),
    newPassword: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Choose a password different from the temporary one',
    path: ['newPassword'],
  });

type Form = z.infer<typeof schema>;

/** Shown after signing in with a temporary password; nothing else is reachable until it is changed. */
export default function ChangePasswordPage() {
  const { admin, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  if (admin && !admin.mustChangePassword) return <Navigate to="/" replace />;

  async function onSubmit(values: Form) {
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success('Password updated');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not change password'));
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-background px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Set your password</h1>
        <p className="mt-1 text-base text-foreground">
          Signed in as <span className="font-medium">{admin?.email}</span>. Replace your temporary password to continue.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <Field id="currentPassword" label="Temporary password" error={errors.currentPassword?.message}>
            <Input id="currentPassword" type="password" autoComplete="current-password" className="h-12 text-base" {...register('currentPassword')} />
          </Field>
          <Field id="newPassword" label="New password" error={errors.newPassword?.message}>
            <Input id="newPassword" type="password" autoComplete="new-password" className="h-12 text-base" {...register('newPassword')} />
          </Field>
          <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
            <Input id="confirmPassword" type="password" autoComplete="new-password" className="h-12 text-base" {...register('confirmPassword')} />
          </Field>
          <Button type="submit" className="h-12 w-full text-base" loading={isSubmitting}>
            Save and continue
          </Button>
        </form>

        <Button variant="ghost" className="mt-3 h-12 w-full text-base" onClick={() => logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
      </Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
