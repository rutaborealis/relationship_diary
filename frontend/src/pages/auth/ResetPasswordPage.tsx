import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { Input } from '../../components/ui/Input';
import { ToastContainer } from '../../components/ui/Toast';

export function ResetPasswordPage() {
  const [code, setCode]               = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [loading, setLoading]         = useState(false);
  const { pendingEmail }              = useAuthStore();
  const { addToast }                  = useUIStore();
  const navigate                      = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pendingEmail) { navigate('/forgot-password'); return; }

    // Client-side guards (FR-11); the server validates independently.
    if (password.length < 8) { addToast('error', 'Пароль должен быть не короче 8 символов'); return; }
    if (password !== confirm) { addToast('error', 'Пароли не совпадают'); return; }

    setLoading(true);
    try {
      await api.confirmReset({ email: pendingEmail, code, newPassword: password });
      addToast('success', 'Пароль изменён. Войдите с новым паролем.');
      navigate('/login');
    } catch (err: any) {
      addToast('error', err.message ?? 'Не удалось сбросить пароль');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="setup-page">
        <div className="setup-heart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <KeyRound size={40} />
        </div>
        <h1 className="setup-title">Новый пароль</h1>
        <p className="setup-desc">
          Введите код из письма на<br />
          <strong style={{ color: 'var(--text)' }}>{pendingEmail ?? 'вашу почту'}</strong>
        </p>

        <form onSubmit={handleSubmit} className="setup-form">
          <Input
            label="Код из письма"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="text-center text-2xl tracking-widest"
            required
          />
          <Input label="Новый пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          <Input label="Повторите пароль" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required />
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Сохранение...' : 'Сбросить пароль'}
          </button>
        </form>

        <p className="setup-link">
          Не пришёл код? <a href="#" onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}>Запросить снова</a>
        </p>
      </div>
      <ToastContainer />
    </>
  );
}
