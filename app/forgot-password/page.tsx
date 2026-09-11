import { PasswordPage } from '@/components/password-management';
import { recoveryEmailReady } from '@/lib/accounts/email';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Forgot password | Sunday Desk',
  robots: { index: false },
  referrer: 'no-referrer',
};
export default function ForgotPassword() {
  return <PasswordPage mode="forgot" emailReady={recoveryEmailReady()} />;
}
