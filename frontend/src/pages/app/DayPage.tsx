import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Pencil } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { BottomNav } from '../../components/layout/BottomNav';
import { ToastContainer } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { MoodIcon } from '../../components/ui/MoodIcon';
import type { Entry } from '../../types';

const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MOODS: Record<string, string> = { good: 'Хорошее', ok: 'Нормальное', bad: 'Плохое' };

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}

function isEntryEmpty(e: Partial<Entry> | null) {
  if (!e) return true;
  return !e.mood_level && !e.mood_text && !e.noticed_1 && !e.noticed_2 && !e.noticed_3 && !e.noticed_4 && !e.noticed_5
    && !e.gratitude_1 && !e.gratitude_2 && !e.gratitude_3 && !e.gratitude_4 && !e.gratitude_5
    && !e.closeness_text && !e.note_to_partner && !e.free_thought;
}

interface EntryViewProps {
  entry: Partial<Entry>;
  isMine: boolean;
  partnerName?: string;
}

function EntryView({ entry, isMine, partnerName }: EntryViewProps) {
  const noticed  = [entry.noticed_1,  entry.noticed_2,  entry.noticed_3,  entry.noticed_4,  entry.noticed_5 ].filter(Boolean);
  const gratitude= [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3, entry.gratitude_4, entry.gratitude_5].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            <p className="entry-field-value" style={{ marginTop: entry.mood_level ? '6px' : 0 }}>
              {entry.mood_text}
            </p>
          )}
        </div>
      )}

      {noticed.length > 0 && (
        <div className="card">
          <p className="entry-field-label">
            {isMine ? 'Что заметил(а) в партнёре' : `Что заметил(а) в тебе`}
          </p>
          <ul className="entry-noticed-list">
            {noticed.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {gratitude.length > 0 && (
        <div className="card">
          <p className="entry-field-label">За что благодарен(а)</p>
          <ul className="entry-noticed-list">
            {gratitude.map((t, i) => <li key={i}>{t}</li>)}
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
          <p className="entry-field-label">
            {isMine ? `Записка ${partnerName ?? 'партнёру'}` : 'Записка тебе'}
          </p>
          <p className="note-text">{entry.note_to_partner}</p>
        </div>
      )}

      {isMine && entry.free_thought && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <p className="entry-field-label" style={{ marginBottom: 0 }}>Свободная мысль</p>
            <span className="private-tag">только для тебя</span>
          </div>
          <p className="entry-field-value">{entry.free_thought}</p>
        </div>
      )}
    </div>
  );
}

export function DayPage() {
  const { date }      = useParams<{ date: string }>();
  const navigate      = useNavigate();
  const { partner }   = useAuthStore();
  const { addToast }  = useUIStore();

  const [myEntry,      setMyEntry]      = useState<Partial<Entry> | null>(null);
  const [partnerEntry, setPartnerEntry] = useState<Partial<Entry> | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<'mine' | 'partner'>('mine');

  useEffect(() => {
    if (!date) return;
    api.getEntry(date)
      .then((d) => {
        const mine    = isEntryEmpty(d.entry)       ? null : d.entry;
        const theirs  = isEntryEmpty(d.partnerEntry) ? null : d.partnerEntry;
        setMyEntry(mine);
        setPartnerEntry(theirs);
        if (!mine && theirs) setTab('partner');
      })
      .catch(() => addToast('error', 'Не удалось загрузить запись'))
      .finally(() => setLoading(false));
  }, [date]);

  const formattedDate = date ? formatDate(date) : '';
  const isFuture = date ? date > new Date().toISOString().slice(0, 10) : false;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: 'row' }}>
        <button className="cal-nav" onClick={() => navigate('/calendar')} style={{ flexShrink: 0 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 className="page-title" style={{ fontSize: '1.1rem' }}>{formattedDate}</h1>
        </div>
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      <div className="page-body">
        {partner && (
          <div className="mood-tags" style={{ marginBottom: '4px' }}>
            <button
              className={`mood-tag${tab === 'mine' ? ' selected' : ''}`}
              onClick={() => setTab('mine')}
            >
              Моя запись
            </button>
            <button
              className={`mood-tag${tab === 'partner' ? ' selected' : ''}`}
              onClick={() => setTab('partner')}
            >
              {partner.name}
            </button>
          </div>
        )}

        {loading ? <Loader text="Загрузка..." /> : (
          <>
            {tab === 'mine' && (
              myEntry
                ? <>
                    <EntryView entry={myEntry} isMine partnerName={partner?.name} />
                    {!isFuture && (
                      <button
                        className="btn-ghost"
                        onClick={() => navigate('/today', { state: { date } })}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}
                      >
                        <Pencil size={14} /> Редактировать
                      </button>
                    )}
                  </>
                : <div className="partner-empty">
                    <p className="partner-empty-text">Запись за этот день не заполнена</p>
                    {!isFuture && (
                      <button
                        className="btn-save"
                        onClick={() => navigate('/today', { state: { date } })}
                        style={{ marginTop: '16px' }}
                      >
                        Заполнить
                      </button>
                    )}
                  </div>
            )}

            {tab === 'partner' && (
              partnerEntry
                ? <EntryView entry={partnerEntry} isMine={false} partnerName={partner?.name} />
                : <div className="partner-empty">
                    <p className="partner-empty-text">
                      {partner?.name} не заполнил(а) дневник в этот день
                    </p>
                  </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
      <ToastContainer />
    </div>
  );
}
