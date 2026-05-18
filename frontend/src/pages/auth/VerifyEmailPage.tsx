import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { Input } from '../../components/ui/Input';
import { ToastContainer } from '../../components/ui/Toast';

export function VerifyEmailPage() {
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const { pendingEmail, setAuth, setPartner } = useAuthStore();
  const { addToast }          = useUIStore();
  const navigate              = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pendingEmail) { navigate('/register'); return; }
    setLoading(true);
    try {
      const data = await api.verifyEmail({ email: pendingEmail, code });
      setAuth(data.token, { id: data.user.id, email: data.user.email, name: data.user.name, gender: data.user.gender as 'm' | 'f', partnerId: null });
      const me = await api.me();
      if (me.partner) setPartner({ ...me.partner, gender: me.partner.gender as 'm' | 'f' });
      addToast('success', `Добро пожаловать, ${data.user.name}!`);
      navigate('/today');
    } catch (err: any) {
      addToast('error', err.message ?? 'Неверный код');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!pendingEmail) return;
    try {
      await api.register({ email: pendingEmail, name: '', gender: 'f', password: '' });
      addToast('info', 'Новый код отправлен');
    } catch {
      addToast('error', 'Не удалось отправить код');
    }
  }

  return (
    <>
      <div className="setup-page">
        <div className="setup-heart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mail size={40} />
        </div>
        <h1 className="setup-title">Проверь почту</h1>
        <p className="setup-desc">
          Отправили 6-значный код на<br />
          <strong style={{ color: 'var(--text)' }}>{pendingEmail}</strong>
        </p>

        <form onSubmit={handleSubmit} className="setup-form">
          <Input
            label="Код подтверждения"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="text-center text-2xl tracking-widest"
            required
          />
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Проверка...' : 'Подтвердить'}
          </button>
        </form>

        <p className="setup-link">
          Не пришло?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); resend(); }}>Отправить снова</a>
        </p>
      </div>
      <ToastContainer />
    </>
  );
}
