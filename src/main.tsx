import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const LazyAdminApp = lazy(() =>
  import('./admin/AdminApp.tsx').then((m) => ({ default: m.AdminApp }))
);

function isAdminSiteRequest(): boolean {
  if (import.meta.env.VITE_APP_MODE === 'admin') return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  if (pathname === '/admin' || pathname === '/admin.html' || pathname.startsWith('/admin/')) {
    return true;
  }
  if (host.startsWith('admin.') || host.includes('.admin.') || host.includes('-admin.')) {
    return true;
  }
  return false;
}

const showAdminSite = isAdminSiteRequest();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showAdminSite ? (
      <Suspense fallback={<div className="min-h-screen bg-[#060911]" />}>
        <LazyAdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);

