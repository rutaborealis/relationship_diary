import { useAuthStore } from '../store';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const jwt = useAuthStore.getState().jwt;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Ошибка запроса');
  return data as T;
}

export const api = {
  // Auth
  register: (body: { email: string; name: string; gender: string; password: string }) =>
    request<{ message: string }>('POST', '/api/auth/register', body),
  verifyEmail: (body: { email: string; code: string }) =>
    request<{ token: string; user: { id: string; email: string; name: string; gender: string } }>('POST', '/api/auth/verify-email', body),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: { id: string; email: string; name: string; gender: string; partnerId: string | null } }>('POST', '/api/auth/login', body),
  me: () =>
    request<{ id: string; email: string; name: string; gender: string; partnerId: string | null; partner: { id: string; name: string; gender: string } | null }>('GET', '/api/auth/me'),
  requestReset: (body: { email: string }) =>
    request<{ message: string }>('POST', '/api/auth/request-reset', body),
  confirmReset: (body: { email: string; code: string; newPassword: string }) =>
    request<{ message: string }>('POST', '/api/auth/confirm-reset', body),

  // Entries
  getEntry: (date: string) =>
    request<{ entry: any; partnerEntry: any }>('GET', `/api/entries?date=${date}`),
  saveEntry: (body: any) =>
    request<{ ok: boolean }>('POST', '/api/entries', body),
  deleteEntry: (date: string) =>
    request<{ ok: boolean }>('DELETE', `/api/entries?date=${date}`),
  // month is 1-based (1–12); backend expects 0-based, so we subtract 1
  getCalendar: (year: number, month: number) =>
    request<Record<string, { mine?: boolean; theirs?: boolean }>>('GET', `/api/calendar?year=${year}&month=${month - 1}`),

  // Qualities — backend returns array directly, not { qualities: [] }
  getQualities: () =>
    request<Array<{ id: string; text: string; created_at: string }>>('GET', '/api/qualities'),
  createQuality: (text: string) =>
    request<{ id: string; text: string; created_at: string }>('POST', '/api/qualities', { text }),
  updateQuality: (id: string, text: string) =>
    request<{ ok: boolean }>('PATCH', `/api/qualities/${id}`, { text }),
  deleteQuality: (id: string) =>
    request<{ message: string }>('DELETE', `/api/qualities/${id}`),

  // Partners — backend returns array directly, not { users: [] }
  searchUsers: (q: string) =>
    request<Array<{ id: string; name: string; gender: string; email?: string }>>('GET', `/api/users/search?q=${encodeURIComponent(q)}`),
  invitePartner: (userId: string) =>
    request<{ message: string }>('POST', '/api/partner/invite', { userId: userId }),
  acceptInvite: (token: string) =>
    request<{ message: string }>('POST', '/api/partner/accept', { token }),

  // Push
  getPushSettings: () =>
    request<{ reminderTime: string | null }>('GET', '/api/push-settings'),
  getVapidKey: () =>
    request<{ key: string }>('GET', '/api/vapid-public-key'),
  subscribe: (subscription: any) =>
    request<{ message: string }>('POST', '/api/subscribe', { subscription }),
  setReminder: (time: string | null) =>
    request<{ message: string }>('POST', '/api/reminder', { reminderTime: time }),
  notifyPartner: (date: string) =>
    request<{ message: string }>('POST', '/api/notify-partner', { date }),
};
