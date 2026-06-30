import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { Input } from '../../components/ui/Input';
import { ToastContainer } from '../../components/ui/Toast';

export function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { setAuth, setPartner } = useAuthStore();
  const { addToast }            = useUIStore();
  const navigate                = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setAuth(data.token, { id: data.user.id, email: data.user.email, name: data.user.name, gender: data.user.gender as 'm' | 'f', partnerId: data.user.partnerId });
      const me = await api.me();
      if (me.partner) setPartner({ ...me.partner, gender: me.partner.gender as 'm' | 'f' });
      navigate('/today');
    } catch (err: any) {
      addToast('error', err.message ?? 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="setup-page">
        <Heart className="setup-heart" fill="currentColor" />
        <h1 className="setup-title">Our Diary</h1>
        <p className="setup-desc">Дневник для двоих</p>

        <form onSubmit={handleSubmit} className="setup-form">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <Input label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p className="setup-link">
          <Link to="/forgot-password">Забыли пароль?</Link>
        </p>
        <p className="setup-link">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
      <ToastContainer />
    </>
  );
}
