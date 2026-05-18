import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../api';
import { useAuthStore, useUIStore } from '../../store';
import { PageLayout } from '../../components/layout/PageLayout';
import { Loader } from '../../components/ui/Loader';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PartnerPage() {
  const { partner } = useAuthStore();
  const { addToast } = useUIStore();
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getEntry(today())
      .then((d) => setEntry(d.partnerEntry))
      .catch(() => addToast('error', 'Не удалось загрузить запись'))
      .finally(() => setLoading(false));
  }, []);

  if (!partner) return (
    <PageLayout title="Партнёр">
      <div className="partner-empty">
        <Users size={48} style={{ color: 'var(--partner-accent)', opacity: .7 }} />
        <p className="partner-empty-text">Партнёр ещё не подключён.<br />Пригласи его в настройках.</p>
      </div>
    </PageLayout>
  );

  if (loading) return <PageLayout title={partner.name}><Loader /></PageLayout>;

  if (!entry) return (
    <PageLayout title={partner.name}>
      <div className="partner-empty">
        <p className="partner-empty-text">{partner.name} ещё не заполнил(а) дневник сегодня</p>
      </div>
    </PageLayout>
  );

  const noticed = [entry.noticed_1, entry.noticed_2, entry.noticed_3].filter(Boolean);
  const gratitude = [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3].filter(Boolean);

  return (
    <PageLayout title={partner.name}>
      {entry.mood_text && (
        <div className="card">
          <p className="entry-field-label">Настроение</p>
          <p className="entry-field-value">{entry.mood_text}</p>
        </div>
      )}

      {noticed.length > 0 && (
        <div className="card">
          <p className="entry-field-label">Что заметил(а) в тебе</p>
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
          <p className="entry-field-label">Записка тебе</p>
          <p className="note-text">{entry.note_to_partner}</p>
        </div>
      )}
    </PageLayout>
  );
}
