import { useState, useEffect } from 'react';
import { LogOut, UserPlus, Search, Bell, BellOff } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { PageLayout } from '../../components/layout/PageLayout';
import { Input } from '../../components/ui/Input';
import { useNavigate } from 'react-router-dom';

type PushStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

// reminder_time is stored/compared in UTC by the cron (getUTCHours). The picker
// shows local time, so convert on the way out/in. DST edges may drift ±1h — acceptable.
function localToUtcHHMM(local: string): string {
  const [h, m] = local.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function utcToLocalHHMM(utc: string): string {
  const [h, m] = utc.split(':').map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SettingsPage() {
  const { user, partner, logout } = useAuthStore();
  const { addToast }              = useUIStore();
  const navigate                  = useNavigate();
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [reminderTime, setReminderTime] = useState('');
  const [pushStatus, setPushStatus]     = useState<PushStatus>('loading');
  const [pushWorking, setPushWorking]   = useState(false);

  useEffect(() => {
    api.getPushSettings().then((d) => setReminderTime(d.reminderTime ? utcToLocalHHMM(d.reminderTime) : ''));
    checkPushStatus();
  }, []);

  async function getSwReg(): Promise<ServiceWorkerRegistration> {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Service worker не отвечает. Обнови страницу.')), 6000),
      ),
    ]);
  }

  async function checkPushStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }
    try {
      const reg = await getSwReg();
      const sub = await reg.pushManager.getSubscription();
      setPushStatus(sub ? 'subscribed' : 'unsubscribed');
    } catch {
      setPushStatus('unsubscribed');
    }
  }

  async function enablePush() {
    setPushWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        addToast('error', 'Разрешение на уведомления отклонено');
        return;
      }
      const { key } = await api.getVapidKey();
      // Strip whitespace (SSM value has trailing \n) + normalize to base64url without padding
      const vapidKey = key.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const reg = await getSwReg();
      // Unsubscribe any stale subscription first
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      await api.subscribe(sub.toJSON());
      setPushStatus('subscribed');
      addToast('success', 'Уведомления включены');
    } catch (err: any) {
      addToast('error', err.message ?? 'Ошибка подписки');
    } finally {
      setPushWorking(false);
    }
  }

  async function disablePush() {
    setPushWorking(true);
    try {
      const reg = await getSwReg();
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      setPushStatus('unsubscribed');
      addToast('success', 'Уведомления отключены');
    } catch (err: any) {
      addToast('error', err.message ?? 'Ошибка отписки');
    } finally {
      setPushWorking(false);
    }
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const users = await api.searchUsers(query);
      setResults(users ?? []);
      if ((users ?? []).length === 0) addToast('info', 'Пользователь не найден');
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setSearching(false);
    }
  }

  async function invite(userId: string) {
    try {
      await api.invitePartner(userId);
      addToast('success', 'Приглашение отправлено');
      setResults([]);
      setQuery('');
    } catch (err: any) {
      addToast('error', err.message);
    }
  }

  async function saveReminder() {
    try {
      await api.setReminder(reminderTime ? localToUtcHHMM(reminderTime) : null);
      addToast('success', 'Напоминание сохранено');
    } catch (err: any) {
      addToast('error', err.message);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <PageLayout title="Настройки">
      {/* Profile */}
      <div className="settings-section">
        <div className="settings-item">
          <div>
            <p className="settings-label" style={{ fontWeight: 600 }}>{user?.name}</p>
            <p className="settings-sub">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Partner */}
      <div>
        <p className="card-label" style={{ marginBottom: '8px' }}>Партнёр</p>
        {partner ? (
          <div className="settings-section">
            <div className="settings-item">
              <div>
                <p className="settings-label" style={{ fontWeight: 600 }}>{partner.name}</p>
                <p className="settings-sub">Подключён</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Email или имя партнёра"
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <button className="btn-ghost" onClick={search} disabled={searching} style={{ flexShrink: 0 }}>
                <Search size={16} />
              </button>
            </div>
            {results.map((u) => (
              <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '.9rem' }}>{u.name}</p>
                  {u.email && <p style={{ fontSize: '.78rem', color: 'var(--text-soft)' }}>{u.email}</p>}
                </div>
                <button className="btn-add" onClick={() => invite(u.id)} style={{ fontSize: '.8rem', padding: '7px 12px' }}>
                  <UserPlus size={14} /> Пригласить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Push Notifications */}
      <div>
        <p className="card-label" style={{ marginBottom: '8px' }}>Уведомления</p>
        <div className="settings-section">
          <div className="settings-item">
            {pushStatus === 'unsupported' && (
              <span className="settings-sub">Браузер не поддерживает уведомления</span>
            )}
            {pushStatus === 'denied' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className="settings-sub" style={{ color: '#C05050', fontWeight: 600 }}>
                  Браузер заблокировал уведомления
                </span>
                <span className="settings-sub">
                  Нажми на 🔒 в адресной строке → «Уведомления» → «Разрешить», затем обнови страницу.
                </span>
                <button
                  className="btn-ghost"
                  onClick={() => window.location.reload()}
                  style={{ padding: '5px 10px', fontSize: '.78rem', alignSelf: 'flex-start' }}
                >
                  Обновить страницу
                </button>
              </div>
            )}
            {pushStatus === 'loading' && (
              <span className="settings-sub">Проверка...</span>
            )}
            {(pushStatus === 'subscribed' || pushStatus === 'unsubscribed') && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {pushStatus === 'subscribed' ? <Bell size={15} /> : <BellOff size={15} />}
                  <span className="settings-label">
                    {pushStatus === 'subscribed' ? 'Включены' : 'Отключены'}
                  </span>
                </div>
                <button
                  className="btn-ghost"
                  onClick={pushStatus === 'subscribed' ? disablePush : enablePush}
                  disabled={pushWorking}
                  style={{ padding: '5px 12px', fontSize: '.8rem' }}
                >
                  {pushWorking ? '...' : pushStatus === 'subscribed' ? 'Отключить' : 'Включить'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Reminder */}
      <div>
        <p className="card-label" style={{ marginBottom: '8px' }}>Напоминание</p>
        <div className="settings-section">
          <div className="settings-item">
            <span className="settings-label">Время</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="time-input" />
              <button className="btn-ghost" onClick={saveReminder} style={{ padding: '5px 12px' }}>Сохранить</button>
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button className="btn-danger" onClick={handleLogout}>
        <LogOut size={16} /> Выйти
      </button>
    </PageLayout>
  );
}
