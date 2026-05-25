import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { PageLayout } from '../../components/layout/PageLayout';
import { Loader } from '../../components/ui/Loader';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

interface CalDay {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasMine: boolean;
  hasPartner: boolean;
}

function buildGrid(year: number, month: number, calMap: Record<string, { mine?: boolean; theirs?: boolean }>): CalDay[] {
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startPad = (firstDow === 0 ? 6 : firstDow - 1);   // shift to Mon=0
  const daysInMonth = new Date(year, month, 0).getDate();
  const grid: CalDay[] = [];

  for (let i = 0; i < startPad; i++) {
    grid.push({ day: 0, isCurrentMonth: false, isToday: false, hasMine: false, hasPartner: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const info = calMap[ds] ?? {};
    grid.push({ day: d, isCurrentMonth: true, isToday: ds === todayStr, hasMine: !!info.mine, hasPartner: !!info.theirs });
  }
  return grid;
}

export function CalendarPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [grid, setGrid]   = useState<CalDay[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.getCalendar(year, month)
      .then((calMap) => setGrid(buildGrid(year, month, calMap)))
      .catch(() => setGrid([]))
      .finally(() => setLoading(false));
  }, [year, month]);

  function prev() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  function toDateStr(day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return (
    <PageLayout title="Календарь">
      <div className="card">
        <div className="calendar-header">
          <button className="cal-nav" onClick={prev}><ChevronLeft size={18} /></button>
          <span className="cal-month">{MONTHS[month - 1]} {year}</span>
          <button className="cal-nav" onClick={next}><ChevronRight size={18} /></button>
        </div>

        {loading ? <Loader /> : (
          <div className="cal-grid">
            {DAY_NAMES.map(d => <div key={d} className="cal-day-name">{d}</div>)}
            {grid.map((day, i) => (
              <div
                key={i}
                className={[
                  'cal-cell',
                  day.isToday       ? 'today'       : '',
                  !day.isCurrentMonth ? 'other-month' : '',
                  day.isCurrentMonth && (day.hasMine || day.hasPartner) ? 'has-entry' : '',
                ].join(' ').trim()}
                onClick={() => day.isCurrentMonth && navigate(`/day/${toDateStr(day.day)}`)}
              >
                {day.isCurrentMonth ? day.day : ''}
                {day.isCurrentMonth && (
                  <div className="cal-dots">
                    {day.hasMine    && <div className="cal-dot mine" />}
                    {day.hasPartner && <div className="cal-dot theirs" />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px', fontSize: '.75rem', color: 'var(--text-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className="cal-dot mine" style={{ position: 'static' }} /> Моя запись
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className="cal-dot theirs" style={{ position: 'static' }} /> Запись партнёра
        </div>
      </div>
    </PageLayout>
  );
}
