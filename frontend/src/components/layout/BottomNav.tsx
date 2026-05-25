import { NavLink } from 'react-router-dom';
import { BookHeart, Users, Calendar, Sparkles, Settings } from 'lucide-react';

const tabs = [
  { to: '/today',     icon: BookHeart, label: 'Сегодня'  },
  { to: '/partner',   icon: Users,     label: 'Партнёр'  },
  { to: '/calendar',  icon: Calendar,  label: 'Календарь'},
  { to: '/qualities', icon: Sparkles,  label: 'Качества' },
  { to: '/settings',  icon: Settings,  label: 'Настройки'},
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon"><Icon size={22} /></span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
