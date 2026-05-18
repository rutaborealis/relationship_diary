import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useUIStore } from '../../store';
import { PageLayout } from '../../components/layout/PageLayout';
import { Textarea } from '../../components/ui/Textarea';
import { Loader } from '../../components/ui/Loader';
import type { Entry } from '../../types';

const MOODS = [
  { key: 'good', label: '😊 Хорошее'   },
  { key: 'ok',   label: '😐 Нормальное' },
  { key: 'bad',  label: '😔 Плохое'    },
];

const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateStr(new Date());
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function isEntryEmpty(e: Partial<Entry>) {
  return !e.mood_level && !e.mood_text && !e.noticed_1 && !e.noticed_2 && !e.noticed_3
    && !e.gratitude_1 && !e.gratitude_2 && !e.gratitude_3
    && !e.closeness_text && !e.note_to_partner && !e.free_thought;
}

export function TodayPage() {
  const location = useLocation();
  const [date, setDate]           = useState(() => (location.state as any)?.date ?? todayStr());
  const [entry, setEntry]         = useState<Partial<Entry>>({});
  const [hasEntry, setHasEntry]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const { addToast }              = useUIStore();

  const isToday = date === todayStr();

  const load = useCallback((d: string) => {
    setLoading(true);
    setConfirmDel(false);
    api.getEntry(d)
      .then((res) => {
        const e = res.entry ?? {};
        setEntry(e);
        setHasEntry(!isEntryEmpty(e));
      })
      .catch(() => addToast('error', 'Не удалось загрузить запись'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(date); }, [date]);

  function update(field: keyof Entry) {
    return (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      setEntry((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.saveEntry({ ...entry, date });
      setHasEntry(!isEntryEmpty(entry));
      addToast('success', 'Запись сохранена');
      api.notifyPartner(date).catch(() => {});
    } catch (err: any) {
      addToast('error', err.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await api.deleteEntry(date);
      setEntry({});
      setHasEntry(false);
      setConfirmDel(false);
      addToast('success', 'Запись удалена');
    } catch (err: any) {
      addToast('error', err.message ?? 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  }

  const subtitle = isToday
    ? 'Сегодня'
    : formatDate(date);

  return (
    <PageLayout title="Дневник" subtitle={subtitle}>
      {/* Date navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <button
          className="cal-nav"
          onClick={() => setDate((d: string) => addDays(d, -1))}
          style={{ fontSize: '1rem' }}
        >
          <ChevronLeft size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isToday && (
            <span style={{
              fontSize: '.65rem', fontWeight: 700, letterSpacing: '.06em',
              textTransform: 'uppercase', color: 'var(--accent)',
              background: 'var(--accent-s)', padding: '2px 8px', borderRadius: '100px',
            }}>Сегодня</span>
          )}
          {!isToday && (
            <button
              className="btn-ghost"
              onClick={() => setDate(todayStr())}
              style={{ fontSize: '.75rem', padding: '4px 10px' }}
            >
              К сегодня
            </button>
          )}
        </div>

        <button
          className="cal-nav"
          onClick={() => setDate((d: string) => addDays(d, 1))}
          disabled={isToday}
          style={{ fontSize: '1rem', opacity: isToday ? .3 : 1, cursor: isToday ? 'default' : 'pointer' }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? <Loader text="Загрузка..." /> : (
        <>
          {/* Mood */}
          <div className="card">
            <p className="card-label">Настроение</p>
            <div className="mood-tags">
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`mood-tag${entry.mood_level === m.key ? ' selected' : ''}`}
                  onClick={() => setEntry((e) => ({ ...e, mood_level: m.key }))}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Textarea value={entry.mood_text ?? ''} onChange={update('mood_text')} placeholder="Опиши как себя чувствуешь..." rows={3} />
          </div>

          {/* Noticed */}
          <div className="card">
            <p className="card-label">Что заметил(а) в партнёре</p>
            <div className="noticed-list">
              {(['noticed_1', 'noticed_2', 'noticed_3'] as const).map((f, i) => (
                <div key={f} className="noticed-item">
                  <span className="noticed-num">{i + 1}</span>
                  <input className="input" style={{ paddingLeft: '28px' }} value={entry[f] ?? ''} onChange={update(f)} placeholder={`${i + 1}...`} />
                </div>
              ))}
            </div>
          </div>

          {/* Gratitude */}
          <div className="card">
            <p className="card-label">За что благодарен(а)</p>
            <div className="noticed-list">
              {(['gratitude_1', 'gratitude_2', 'gratitude_3'] as const).map((f, i) => (
                <div key={f} className="noticed-item">
                  <span className="noticed-num">{i + 1}</span>
                  <input className="input" style={{ paddingLeft: '28px' }} value={entry[f] ?? ''} onChange={update(f)} placeholder={`${i + 1}...`} />
                </div>
              ))}
            </div>
          </div>

          {/* Closeness */}
          <div className="card">
            <Textarea label="Близость сегодня" value={entry.closeness_text ?? ''} onChange={update('closeness_text')} placeholder="Как вы были близки сегодня?" rows={3} />
          </div>

          {/* Note to partner */}
          <div className="card">
            <Textarea label="Записка партнёру" value={entry.note_to_partner ?? ''} onChange={update('note_to_partner')} placeholder="Что хочешь передать?" rows={2} />
          </div>

          {/* Free thought */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="field-label" style={{ margin: 0 }}>Свободная мысль</label>
              <span className="private-tag">только для тебя</span>
            </div>
            <textarea className="textarea" value={entry.free_thought ?? ''} onChange={update('free_thought')} placeholder="Личные мысли..." rows={3} />
          </div>

          {/* Actions */}
          <button className="btn-save" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : hasEntry ? 'Сохранить изменения' : 'Сохранить запись'}
          </button>

          {hasEntry && (
            <button
              onClick={deleteEntry}
              disabled={deleting}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                width: '100%', padding: '10px', background: 'transparent',
                border: confirmDel ? '1.5px solid #C05050' : '1.5px solid var(--border)',
                borderRadius: 'var(--r)', fontSize: '.85rem', fontFamily: 'inherit',
                color: confirmDel ? '#C05050' : 'var(--text-soft)',
                cursor: 'pointer', transition: 'all .2s',
              }}
            >
              <Trash2 size={15} />
              {deleting ? 'Удаление...' : confirmDel ? 'Нажми ещё раз для подтверждения' : 'Удалить запись'}
            </button>
          )}
        </>
      )}
    </PageLayout>
  );
}
