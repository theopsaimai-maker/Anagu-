import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('admin-root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </StrictMode>
);
