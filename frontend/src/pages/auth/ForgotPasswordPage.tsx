import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { Input } from '../../components/ui/Input';
import { ToastContainer } from '../../components/ui/Toast';

export function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const { setPendingEmail }   = useAuthStore();
  const { addToast }          = useUIStore();
  const navigate              = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.requestReset({ email });
      // Neutral feedback — never reveals whether the account exists (anti-enumeration).
      setPendingEmail(email.trim().toLowerCase());
      addToast('info', 'Если такой email зарегистрирован, мы отправили код.');
      navigate('/reset-password');
    } catch (err: any) {
      addToast('error', err.message ?? 'Не удалось отправить запрос');
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
        <h1 className="setup-title">Забыли пароль?</h1>
        <p className="setup-desc">Введите email — отправим код для сброса пароля</p>

        <form onSubmit={handleSubmit} className="setup-form">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Отправка...' : 'Отправить код'}
          </button>
        </form>

        <p className="setup-link">
          Вспомнили пароль? <Link to="/login">Войти</Link>
        </p>
      </div>
      <ToastContainer />
    </>
  );
}
