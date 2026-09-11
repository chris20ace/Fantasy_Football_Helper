import { PasswordPage } from '@/components/password-management';
export const metadata = {
  title: 'Reset password | Sunday Desk',
  robots: { index: false },
  referrer: 'no-referrer',
};
export default function ResetPassword() {
  return <PasswordPage mode="reset" />;
}
