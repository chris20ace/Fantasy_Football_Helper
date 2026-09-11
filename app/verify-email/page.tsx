import { PasswordPage } from '@/components/password-management';
export const metadata = {
  title: 'Confirm recovery email | Sunday Desk',
  robots: { index: false },
  referrer: 'no-referrer',
};
export default function VerifyEmail() {
  return <PasswordPage mode="verify" />;
}
