/* eslint-disable next/no-html-link-for-pages -- Setup requires a full document load to activate its browser connector. */
import type { ComponentProps } from 'react';
export default function SetupLink({
  children,
  ...props
}: Omit<ComponentProps<'a'>, 'href'>) {
  // A full document load activates the extension's setup-only content script.
  return (
    <a {...props} href="/setup">
      {children}
    </a>
  );
}
