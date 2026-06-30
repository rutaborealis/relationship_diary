import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import { api } from './api';

import { LoginPage }       from './pages/auth/LoginPage';
import { RegisterPage }    from './pages/auth/RegisterPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage }  from './pages/auth/ResetPasswordPage';
import { TodayPage }       from './pages/app/TodayPage';
import { PartnerPage }     from './pages/app/PartnerPage';
import { CalendarPage }    from './pages/app/CalendarPage';
import { DayPage }         from './pages/app/DayPage';
import { QualitiesPage }   from './pages/app/QualitiesPage';
import { SettingsPage }    from './pages/app/SettingsPage';
import { UpdateBanner }    from './components/UpdateBanner';
import { clearAppBadge }   from './lib/badge';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const jwt = useAuthStore((s) => s.jwt);
  if (!jwt) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { jwt, user, setAuth, setPartner, logout } = useAuthStore();

  // Set theme based on gender (body.theme-m = male/blue)
  useEffect(() => {
    document.body.className = user?.gender === 'm' ? 'theme-m' : '';
  }, [user?.gender]);

  // Clear the app-icon badge when the app is opened/focused — user has seen it.
  useEffect(() => {
    const clear = () => { if (document.visibilityState === 'visible') clearAppBadge(); };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);

  // Validate JWT on mount
  useEffect(() => {
    if (!jwt) return;
    api.me()
      .then((me) => {
        setAuth(jwt, { id: me.id, email: me.email, name: me.name, gender: me.gender as 'm' | 'f', partnerId: me.partnerId });
        if (me.partner) setPartner({ ...me.partner, gender: me.partner.gender as 'm' | 'f' });
      })
      .catch(() => logout());
  }, []);

  // Accept invite token after login (token was saved to sessionStorage in main.tsx before auth redirect)
  useEffect(() => {
    if (!jwt) return;
    const token = sessionStorage.getItem('invite_token');
    if (!token) return;
    sessionStorage.removeItem('invite_token');
    api.acceptInvite(token)
      .then((res: any) => {
        if (res?.partner) {
          setPartner({ id: res.partner.id, name: res.partner.name, gender: res.partner.gender as 'm' | 'f' });
        }
        // Refresh user to get updated partnerId
        return api.me();
      })
      .then((me) => {
        setAuth(jwt, { id: me.id, email: me.email, name: me.name, gender: me.gender as 'm' | 'f', partnerId: me.partnerId });
        if (me.partner) setPartner({ ...me.partner, gender: me.partner.gender as 'm' | 'f' });
      })
      .catch(console.error);
  }, [jwt]);

  return (
    <BrowserRouter>
      <UpdateBanner />
      <Routes>
        <Route path="/login"        element={<LoginPage />} />
        <Route path="/register"     element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password"  element={<ResetPasswordPage />} />

        <Route path="/today"      element={<RequireAuth><TodayPage /></RequireAuth>} />
        <Route path="/partner"    element={<RequireAuth><PartnerPage /></RequireAuth>} />
        <Route path="/calendar"   element={<RequireAuth><CalendarPage /></RequireAuth>} />
        <Route path="/day/:date"  element={<RequireAuth><DayPage /></RequireAuth>} />
        <Route path="/qualities"  element={<RequireAuth><QualitiesPage /></RequireAuth>} />
        <Route path="/settings"   element={<RequireAuth><SettingsPage /></RequireAuth>} />

        <Route path="*" element={<Navigate to={jwt ? '/today' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
