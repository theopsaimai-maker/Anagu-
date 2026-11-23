import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { installBrowserExtensionErrorGuard } from './lib/web3Wallet.ts';
import './index.css';

installBrowserExtensionErrorGuard();

createRoot(document.getElementById('admin-root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </StrictMode>
);
