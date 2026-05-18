import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { ToastContainer } from '../ui/Toast';

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  hideNav?: boolean;
}

export function PageLayout({ children, title, subtitle, hideNav }: Props) {
  return (
    <div className="page">
      {title && (
        <div className="page-header">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      )}
      <div className="page-body">{children}</div>
      {!hideNav && <BottomNav />}
      <ToastContainer />
    </div>
  );
}
