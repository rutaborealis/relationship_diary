import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { Input } from '../../components/ui/Input';
import { ToastContainer } from '../../components/ui/Toast';

export function RegisterPage() {
  const [form, setForm] = useState({ email: '', name: '', gender: 'f', password: '' });
  const [loading, setLoading] = useState(false);
  const { setPendingEmail }   = useAuthStore();
  const { addToast }          = useUIStore();
  const navigate              = useNavigate();

  function update(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.register(form);
      setPendingEmail(form.email);
      addToast('success', 'Код отправлен на почту');
      navigate('/verify-email');
    } catch (err: any) {
      addToast('error', err.message ?? 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="setup-page">
        <Heart className="setup-heart" fill="currentColor" />
        <h1 className="setup-title">Создать аккаунт</h1>
        <p className="setup-desc">Дневник для двоих</p>

        <form onSubmit={handleSubmit} className="setup-form">
          <Input label="Email" type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" required />
          <Input label="Имя" type="text" value={form.name} onChange={update('name')} placeholder="Как тебя зовут?" required />
          <div>
            <label className="field-label">Пол</label>
            <div className="gender-row">
              <button type="button" className={`gender-btn${form.gender === 'f' ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, gender: 'f' }))}>Женский</button>
              <button type="button" className={`gender-btn${form.gender === 'm' ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, gender: 'm' }))}>Мужской</button>
            </div>
          </div>
          <Input label="Пароль" type="password" value={form.password} onChange={update('password')} placeholder="Минимум 8 символов" minLength={8} required />
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="setup-link">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
      <ToastContainer />
    </>
  );
}
