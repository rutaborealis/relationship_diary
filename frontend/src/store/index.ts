import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Partner, ToastMessage } from '../types';

interface AuthState {
  jwt: string | null;
  user: User | null;
  partner: Partner | null;
  pendingEmail: string | null;
  setAuth: (jwt: string, user: User) => void;
  setPartner: (partner: Partner | null) => void;
  setPendingEmail: (email: string) => void;
  logout: () => void;
}

interface UIState {
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      jwt: null,
      user: null,
      partner: null,
      pendingEmail: null,
      setAuth: (jwt, user) => set({ jwt, user }),
      setPartner: (partner) => set({ partner }),
      setPendingEmail: (email) => set({ pendingEmail: email }),
      logout: () => set({ jwt: null, user: null, partner: null, pendingEmail: null }),
    }),
    { name: 'diary-auth', partialize: (s) => ({ jwt: s.jwt, user: s.user }) }
  )
);

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
