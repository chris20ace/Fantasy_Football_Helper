'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
export default function PasswordField({
  id,
  label,
  current = false,
}: {
  id: string;
  label: string;
  current?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label htmlFor={id}>
      {label}
      <div className="password-field">
        <Input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          autoComplete={current ? 'current-password' : 'new-password'}
          required
          minLength={current ? 1 : 12}
          maxLength={128}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={show}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}
