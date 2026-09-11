import LoginForm from '@/components/login-form';
import { recoveryEmailReady } from '@/lib/accounts/email';
export const dynamic = 'force-dynamic';
export default function LoginPage() {
  return <LoginForm emailReady={recoveryEmailReady()} />;
}
