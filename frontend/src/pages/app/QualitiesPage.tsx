import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { useUIStore } from '../../store';
import { PageLayout } from '../../components/layout/PageLayout';
import { Loader } from '../../components/ui/Loader';

interface Quality {
  id: string;
  text: string;
  created_at: string;
}

export function QualitiesPage() {
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [loading, setLoading]     = useState(true);
  const [newText, setNewText]     = useState('');
  const [adding, setAdding]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editText, setEditText]   = useState('');
  const { addToast }              = useUIStore();

  useEffect(() => {
    api.getQualities()
      .then((items) => setQualities(items ?? []))
      .catch(() => addToast('error', 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, []);

  async function add() {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const item = await api.createQuality(newText.trim());
      setQualities((q) => [...q, item]);
      setNewText('');
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setAdding(false);
    }
  }

  async function save(id: string) {
    try {
      await api.updateQuality(id, editText);
      setQualities((q) => q.map((x) => x.id === id ? { ...x, text: editText } : x));
      setEditId(null);
    } catch (err: any) {
      addToast('error', err.message);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteQuality(id);
      setQualities((q) => q.filter((x) => x.id !== id));
    } catch (err: any) {
      addToast('error', err.message);
    }
  }

  if (loading) return <PageLayout title="Качества партнёра"><Loader /></PageLayout>;

  return (
    <PageLayout title="Качества партнёра">
      <div className="card">
        {qualities.length === 0 ? (
          <div className="qualities-empty">
            <Sparkles size={36} style={{ color: 'var(--accent)', opacity: .55 }} />
            <p className="qualities-empty-text">Добавь качества, которые ценишь в партнёре</p>
          </div>
        ) : (
          <div className="qualities-list">
            {qualities.map((q, i) => (
              <div key={q.id} className="quality-item">
                <span className="quality-num">{i + 1}</span>
                {editId === q.id ? (
                  <>
                    <input
                      className="input quality-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && save(q.id)}
                    />
                    <button className="quality-del" onClick={() => save(q.id)} style={{ color: 'var(--success)', opacity: 1 }}><Check size={15} /></button>
                    <button className="quality-del" onClick={() => setEditId(null)} style={{ opacity: .6 }}><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span className="quality-text">{q.text}</span>
                    <button className="quality-del" onClick={() => { setEditId(q.id); setEditText(q.text); }}><Pencil size={14} /></button>
                    <button className="quality-del" onClick={() => remove(q.id)}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="quality-add">
          <input
            className="input"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Новое качество..."
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-add" onClick={add} disabled={adding}>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
