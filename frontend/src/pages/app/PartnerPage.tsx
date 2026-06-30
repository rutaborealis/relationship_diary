import { useState, useEffect, useCallback } from 'react';
import { Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { PageLayout } from '../../components/layout/PageLayout';
import { Loader } from '../../components/ui/Loader';
import { MoodIcon } from '../../components/ui/MoodIcon';

const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MOODS: Record<string, string> = { good: 'Хорошее', ok: 'Нормальное', bad: 'Плохое' };

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

export function PartnerPage() {
  const { partner } = useAuthStore();
  const { addToast } = useUIStore();
  const [date, setDate]       = useState(todayStr());
  const [entry, setEntry]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isToday = date === todayStr();

  const load = useCallback((d: string) => {
    setLoading(true);
    api.getEntry(d)
      .then((res) => setEntry(res.partnerEntry))
      .catch(() => addToast('error', 'Не удалось загрузить запись'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (partner) load(date); }, [date, partner]);

  if (!partner) return (
    <PageLayout title="Партнёр">
      <div className="partner-empty">
        <Users size={48} style={{ color: 'var(--partner-accent)', opacity: .7 }} />
        <p className="partner-empty-text">Партнёр ещё не подключён.<br />Пригласи его в настройках.</p>
      </div>
    </PageLayout>
  );

  const noticed   = entry ? [entry.noticed_1, entry.noticed_2, entry.noticed_3, entry.noticed_4, entry.noticed_5].filter(Boolean) : [];
  const gratitude = entry ? [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3, entry.gratitude_4, entry.gratitude_5].filter(Boolean) : [];

  return (
    <PageLayout title={partner.name} subtitle={isToday ? 'Сегодня' : formatDate(date)}>
      {/* Date navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <button className="cal-nav" onClick={() => setDate((d) => addDays(d, -1))} style={{ fontSize: '1rem' }}>
          <ChevronLeft size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isToday ? (
            <span style={{
              fontSize: '.65rem', fontWeight: 700, letterSpacing: '.06em',
              textTransform: 'uppercase', color: 'var(--accent)',
              background: 'var(--accent-s)', padding: '2px 8px', borderRadius: '100px',
            }}>Сегодня</span>
          ) : (
            <button className="btn-ghost" onClick={() => setDate(todayStr())} style={{ fontSize: '.75rem', padding: '4px 10px' }}>
              К сегодня
            </button>
          )}
        </div>

        <button
          className="cal-nav"
          onClick={() => setDate((d) => addDays(d, 1))}
          disabled={isToday}
          style={{ fontSize: '1rem', opacity: isToday ? .3 : 1, cursor: isToday ? 'default' : 'pointer' }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? <Loader /> : !entry ? (
        <div className="partner-empty">
          <p className="partner-empty-text">
            {partner.name} {isToday ? 'ещё не заполнил(а) дневник сегодня' : 'не заполнил(а) дневник в этот день'}
          </p>
        </div>
      ) : (
        <>
          {(entry.mood_level || entry.mood_text) && (
            <div className="card">
              <p className="entry-field-label">Настроение</p>
              {entry.mood_level && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: 32, height: 32, display: 'block', flexShrink: 0 }}><MoodIcon type={entry.mood_level} /></span>
                  <p className="entry-field-value" style={{ margin: 0 }}>{MOODS[entry.mood_level] ?? entry.mood_level}</p>
                </div>
              )}
              {entry.mood_text && (
                <p className="entry-field-value" style={{ marginTop: entry.mood_level ? '6px' : 0 }}>{entry.mood_text}</p>
              )}
            </div>
          )}

          {noticed.length > 0 && (
            <div className="card">
              <p className="entry-field-label">Что заметил(а) в тебе</p>
              <ul className="entry-noticed-list">
                {noticed.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {gratitude.length > 0 && (
            <div className="card">
              <p className="entry-field-label">За что благодарен(а)</p>
              <ul className="entry-noticed-list">
                {gratitude.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {entry.closeness_text && (
            <div className="card">
              <p className="entry-field-label">Близость</p>
              <p className="entry-field-value">{entry.closeness_text}</p>
            </div>
          )}

          {entry.note_to_partner && (
            <div className="card note-card">
              <p className="entry-field-label">Записка тебе</p>
              <p className="note-text">{entry.note_to_partner}</p>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
