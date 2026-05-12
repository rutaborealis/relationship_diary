/* ═══════════════════════════════════════════════════════════════════
   Relationship diary
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  const CFG = {
    DEMO: true,   // ← set to false and fill SUPABASE_* after real setup
    SUPABASE_URL: '__SUPABASE_URL__',
    SUPABASE_KEY: '__SUPABASE_ANON_KEY__',
    STORAGE_USER: 'diary_user_id',
    MOOD_LEVELS: [
      { key: 'good', label: 'Хорошее' },
      { key: 'ok',   label: 'Нормальное' },
      { key: 'bad',  label: 'Плохое' },
    ],
    MONTHS_RU:  ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
    MONTHS_GEN: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
    DAYS: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
    DAYS_FULL: ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'],
    DB_VERSION: '5',  // bump when localStorage schema changes
  };

  // ── SVG Icons ─────────────────────────────────────────────────────
  const IC = {
    // ── Nav icons (22×22, stroke-based) ───────────────────────────
    today: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h5.5A2.5 2.5 0 0 1 11 5.5V19a2 2 0 0 0-2-2H3V3z"/><path d="M19 3h-5.5A2.5 2.5 0 0 0 11 5.5V19a2 2 0 0 1 2-2h6V3z"/><line x1="5" y1="8" x2="8.5" y2="8"/><line x1="5" y1="11" x2="7.5" y2="11"/><path d="M15 9.5c-.45-.65-1.1-.65-1.1.3s1.1 1.55 1.1 1.55 1.1-.65 1.1-1.55-.65-.95-1.1-.3z" fill="currentColor" stroke="none"/></svg>`,

    calendar: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="18" height="16" rx="3"/><line x1="2" y1="9" x2="20" y2="9"/><line x1="7" y1="2" x2="7" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/><path d="M11 14.5c-.3-.55-.85-.55-.85.2s.85 1.35.85 1.35.85-.6.85-1.35-.55-.75-.85-.2z" fill="currentColor" stroke="none"/></svg>`,

    mail: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="18" height="13" rx="3"/><path d="M2 8.5l7.5 5a2.5 2.5 0 0 0 3 0L20 8.5"/></svg>`,

    star: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l2.7 5.6 6.1.85-4.4 4.3 1.05 6.1-5.45-2.9-5.45 2.9 1.05-6.1L2.2 8.45l6.1-.85L11 2z"/></svg>`,

    settings: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="2.8"/><path d="M11 2.2v1.8M11 18v1.8M4 4l1.3 1.3M15.7 15.7 17 17M2.2 11H4M18 11h1.8M4 18l1.3-1.3M15.7 6.3 17 5"/></svg>`,

    // ── Mood icons (40×40, illustrative) ──────────────────────────
    moodGood: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="20" cy="12" rx="4.5" ry="7" fill="#F8C8D4" transform="rotate(0,20,20)"/>
      <ellipse cx="20" cy="12" rx="4.5" ry="7" fill="#EDAEC0" transform="rotate(72,20,20)"/>
      <ellipse cx="20" cy="12" rx="4.5" ry="7" fill="#F8C8D4" transform="rotate(144,20,20)"/>
      <ellipse cx="20" cy="12" rx="4.5" ry="7" fill="#EDAEC0" transform="rotate(216,20,20)"/>
      <ellipse cx="20" cy="12" rx="4.5" ry="7" fill="#F8C8D4" transform="rotate(288,20,20)"/>
      <circle cx="20" cy="20" r="5.2" fill="#FDE8EC"/>
      <circle cx="20" cy="17.6" r="1.2" fill="#C4778A"/>
      <circle cx="22.3" cy="18.8" r="1.2" fill="#C4778A"/>
      <circle cx="21.4" cy="21.5" r="1.2" fill="#C4778A"/>
      <circle cx="18.6" cy="21.5" r="1.2" fill="#C4778A"/>
      <circle cx="17.7" cy="18.8" r="1.2" fill="#C4778A"/>
    </svg>`,

    moodOk: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="27" cy="15" r="7.5" fill="#FFD98A"/>
      <path d="M27 6.5v2M27 21.5v2M19 15h2M33 15h2M21.3 9.3l1.4 1.4M31.3 19.3l1.4 1.4M21.3 20.7l1.4-1.4M31.3 10.7l1.4-1.4" stroke="#F0B830" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M7 30C7 30 4 30 4 26C4 22 8 20 12.5 21.5C13.5 17 17.5 14 22.5 14C28.5 14 33.5 19 33.5 24.5C35.5 24.5 37 25.5 37 27.5C37 29.5 35 31 32.5 31H7Z" fill="#EEF3FA"/>
      <path d="M7 31 H32.5C35 31 37 29.5 37 27.5C37 29 35 32 32.5 32H7C5 32 4 30 4 28C4 29.5 5 31 7 31Z" fill="#D4DFE8" opacity="0.6"/>
    </svg>`,

    moodBad: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 26C8 26 5 26 5 22.5C5 19 9 17 13.5 18.5C14.5 14 18.5 11 23 11C29 11 34 16 34 21.5C36 21.5 37 22.5 37 25C37 27 35.5 28 33 28H8Z" fill="#B8C8D8"/>
      <path d="M8 28H33C35.5 28 37 27 37 25C37 27 35 29.5 33 29.5H8C6 29.5 5 28 5 26C5 27.5 6.5 28 8 28Z" fill="#9ABACC" opacity="0.7"/>
      <line x1="13" y1="31" x2="11.5" y2="37" stroke="#7AAABF" stroke-width="2" stroke-linecap="round"/>
      <line x1="20" y1="32.5" x2="18.5" y2="38.5" stroke="#7AAABF" stroke-width="2" stroke-linecap="round"/>
      <line x1="27" y1="31" x2="25.5" y2="37" stroke="#7AAABF" stroke-width="2" stroke-linecap="round"/>
      <line x1="16" y1="30.5" x2="15.2" y2="34" stroke="#7AAABF" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <line x1="23" y1="30.5" x2="22.2" y2="34" stroke="#7AAABF" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
    </svg>`,

    // ── Misc ───────────────────────────────────────────────────────
    heart: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M24 40C24 40 5 27 5 16C5 10 10 5 16.5 5C20 5 23 7.5 24 7.5C25 7.5 28 5 31.5 5C38 5 43 10 43 16C43 27 24 40 24 40Z" fill="#C4778A"/><path d="M24 40C24 40 5 27 5 16C5 10 10 5 16.5 5C20 5 23 7.5 24 7.5C25 7.5 28 5 31.5 5C38 5 43 10 43 16C43 27 24 40 24 40Z" fill="url(#hg)" opacity="0.4"/><defs><linearGradient id="hg" x1="24" y1="5" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="transparent"/></linearGradient></defs></svg>`,

    lock: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="10" height="7" rx="2"/><path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2"/><circle cx="7" cy="9.5" r="1" fill="currentColor" stroke="none"/></svg>`,

    check: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><path d="M6 9l2 2 4-4"/></svg>`,

    trash: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h12M7 5V3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V5M14 5l-.8 9.5a1 1 0 0 1-1 .9H5.8a1 1 0 0 1-1-.9L4 5"/></svg>`,

    waiting: `<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
      <path d="M9 5.5V9l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="9" cy="9" r="1.2" fill="currentColor" opacity=".25"/>
    </svg>`,
  };

  // ── LocalDB (demo mode — localStorage backend) ────────────────────
  class QueryBuilder {
    constructor(tables, save, table) {
      this._tables = tables; this._save = save; this._table = table;
      this._action = 'select'; this._filters = []; this._payload = null;
      this._conflict = null; this._orderBy = null; this._orderAsc = true;
    }
    select()           { return this; }
    eq(f, v)           { this._filters.push(r => r[f] === v);        return this; }
    in(f, vs)          { this._filters.push(r => vs.includes(r[f])); return this; }
    gte(f, v)          { this._filters.push(r => r[f] >= v);         return this; }
    lte(f, v)          { this._filters.push(r => r[f] <= v);         return this; }
    order(f, { ascending = true } = {}) { this._orderBy = f; this._orderAsc = ascending; return this; }
    insert(p)          { this._action = 'insert'; this._payload = p; return this; }
    upsert(p, o = {})  { this._action = 'upsert'; this._payload = p; this._conflict = o.onConflict; return this; }
    update(p)          { this._action = 'update'; this._payload = p; return this; }
    delete()           { this._action = 'delete';                     return this; }

    _uid() { return crypto.randomUUID?.() || 'id-' + Math.random().toString(36).slice(2); }

    _run() {
      const t = this._table;
      const rows = this._tables[t] || [];
      const match = r => this._filters.every(fn => fn(r));

      if (this._action === 'select') {
        let res = rows.filter(match);
        if (this._orderBy) {
          const f = this._orderBy, asc = this._orderAsc;
          res = [...res].sort((a, b) => {
            if (a[f] === b[f]) return 0;
            return (a[f] < b[f] ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        return { data: res, error: null };
      }
      if (this._action === 'insert') {
        const items = Array.isArray(this._payload) ? this._payload : [this._payload];
        const added = items.map(p => ({ id: this._uid(), created_at: new Date().toISOString(), ...p }));
        rows.push(...added);
        this._save(t);
        return { data: Array.isArray(this._payload) ? added : added[0], error: null };
      }
      if (this._action === 'upsert') {
        const items = Array.isArray(this._payload) ? this._payload : [this._payload];
        const cFields = (this._conflict || 'id').split(',').map(s => s.trim());
        for (const item of items) {
          const idx = rows.findIndex(r => cFields.every(f => r[f] === item[f]));
          if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
          else rows.push({ id: this._uid(), created_at: new Date().toISOString(), ...item });
        }
        this._save(t);
        return { data: null, error: null };
      }
      if (this._action === 'update') {
        rows.forEach((r, i) => { if (match(r)) rows[i] = { ...r, ...this._payload }; });
        this._save(t);
        return { data: null, error: null };
      }
      if (this._action === 'delete') {
        const keep = rows.filter(r => !match(r));
        rows.length = 0; rows.push(...keep);
        this._save(t);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    then(res, rej) { try { res(this._run()); } catch (e) { rej(e); } }
    async maybeSingle() {
      const { data, error } = this._run();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error };
    }
    async single() {
      const { data, error } = this._run();
      const row = Array.isArray(data) ? data[0] ?? null : data;
      return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
    }
  }

  function createLocalDb() {
    const load = k => JSON.parse(localStorage.getItem('ldb_' + k) || 'null');
    const dump = (k, v) => localStorage.setItem('ldb_' + k, JSON.stringify(v));

    // Clear stale data when schema version changes
    if (localStorage.getItem('ldb_version') !== CFG.DB_VERSION) {
      ['users','entries','qualities','push_subscriptions','notification_log']
        .forEach(t => localStorage.removeItem('ldb_' + t));
      localStorage.removeItem(CFG.STORAGE_USER);
      localStorage.setItem('ldb_version', CFG.DB_VERSION);
    }

    const TABLES = ['users', 'entries', 'qualities', 'push_subscriptions', 'notification_log'];
    const data = {};
    TABLES.forEach(t => { data[t] = load(t) || []; });

    // Seed demo users once
    if (!data.users.length) {
      const now = new Date().toISOString();
      data.users.push(
        { id: 'demo-user-a', name: 'Рута', gender: 'f', created_at: now },
        { id: 'demo-user-b', name: 'Женя', gender: 'm', created_at: now },
      );
      dump('users', data.users);
    }

    const save = t => dump(t, data[t]);
    return { from: t => new QueryBuilder(data, save, t) };
  }

  // ── State ─────────────────────────────────────────────────────────
  const S = {
    db: null,
    userId: null,
    user: null,
    partner: null,
    view: 'today',
    date: todayStr(),
    entry: null,
    partnerEntry: null,
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    calData: {},
    qualities: [],
    pushEnabled: false,
    partnerBadge: false,
    form: {
      moodLevel:    '',
      moodText:     '',
      noticed:      ['', '', ''],
      gratitude:    ['', '', ''],
      gratitudeSaid:'',
      closeness:    '',
      rituals:      [],
      freeThought:  '',
    },
  };

  // ── Utils ─────────────────────────────────────────────────────────
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatDate(str) {
    const d = new Date(str + 'T00:00:00');
    return `${d.getDate()} ${CFG.MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
  }

  function el(id) { return document.getElementById(id); }

  function genitive(name) {
    if (name.endsWith('я')) return name.slice(0, -1) + 'и';
    if (name.endsWith('а')) return name.slice(0, -1) + 'ы';
    return name;
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ── DB helpers ────────────────────────────────────────────────────
  async function dbUsers() {
    const { data } = await S.db.from('users').select('*');
    return data || [];
  }

  async function saveEntry(payload) {
    const { error } = await S.db.from('entries').upsert(payload, { onConflict: 'user_id,date' });
    return !error;
  }

  async function loadEntry(userId, date) {
    const { data } = await S.db.from('entries').select('*')
      .eq('user_id', userId).eq('date', date).maybeSingle();
    return data;
  }

  async function loadCalMonth(year, month) {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    const userIds = [S.userId, S.partner?.id].filter(Boolean);
    const { data } = await S.db.from('entries')
      .select('user_id, date').in('user_id', userIds).gte('date', from).lte('date', to);
    const map = {};
    (data || []).forEach(r => {
      map[r.date] = map[r.date] || {};
      if (r.user_id === S.userId) map[r.date].mine = true;
      else map[r.date].theirs = true;
    });
    return map;
  }

  async function computeStreak() {
    if (!S.partner) return 0;
    const { data } = await S.db.from('entries')
      .select('user_id, date').in('user_id', [S.userId, S.partner.id]).order('date', { ascending: false });
    if (!data) return 0;
    const byDate = {};
    data.forEach(r => {
      byDate[r.date] = byDate[r.date] || {};
      if (r.user_id === S.userId) byDate[r.date].mine = true;
      else byDate[r.date].theirs = true;
    });
    let streak = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().split('T')[0];
      if (byDate[key]?.mine && byDate[key]?.theirs) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  // ── Push notifications ────────────────────────────────────────────
  async function enablePush() {
    if (CFG.DEMO) { toast('Push-уведомления работают после подключения Supabase'); return false; }
    if (!('serviceWorker' in navigator)) { toast('Push не поддерживается в этом браузере'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Уведомления отклонены — разреши в настройках браузера'); return false; }
    const vapidRes = await fetch('/api/vapid-public-key').catch(() => null);
    if (!vapidRes?.ok) { toast('Ошибка сервера'); return false; }
    const { key } = await vapidRes.json();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const res = await fetch('/api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: S.userId, subscription: sub.toJSON() }),
    }).catch(() => null);
    if (res?.ok) { S.pushEnabled = true; toast('Уведомления включены 🔔'); return true; }
    toast('Не удалось сохранить подписку');
    return false;
  }

  async function disablePush() {
    if (CFG.DEMO) return;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    if (sub) await sub.unsubscribe();
    await S.db.from('push_subscriptions').delete().eq('user_id', S.userId);
    S.pushEnabled = false;
  }

  function urlBase64ToUint8Array(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function notifyPartner(date) {
    if (CFG.DEMO) return;
    await fetch('/api/notify-partner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: S.userId, date }),
    }).catch(() => null);
  }

  // ── Navigation ────────────────────────────────────────────────────
  async function navigate(view) { S.view = view; await render(); }

  // ── Setup screen ──────────────────────────────────────────────────
  function renderSetup(isSecond = false) {
    const partnerName = isSecond && S.partner ? S.partner.name : '';
    document.getElementById('app').innerHTML = `
      <div class="setup-page">
        <div class="setup-heart">${IC.heart}</div>
        <h1 class="setup-title">Relationship diary</h1>
        <p class="setup-desc">
          ${isSecond
            ? `${partnerName} уже создал${S.partner?.gender === 'f' ? 'а' : ''} профиль.<br>Теперь твоя очередь.`
            : 'Личное пространство для двоих.<br>Расскажи о себе.'}
        </p>
        <div class="setup-form">
          <input id="setup-name" class="input" type="text"
            placeholder="Твоё имя" maxlength="30" autocomplete="off">
          <div class="gender-row">
            <button class="gender-btn" data-g="f">Она ♀</button>
            <button class="gender-btn" data-g="m">Он ♂</button>
          </div>
          <button id="setup-submit" class="btn-save" disabled>Создать профиль</button>
          <p class="setup-note">Пароли не нужны — это только для вас двоих.</p>
        </div>
      </div>`;

    let gender = '';
    const nameInput = el('setup-name');
    const submitBtn = el('setup-submit');
    const checkReady = () => { submitBtn.disabled = !(nameInput.value.trim() && gender); };

    nameInput.addEventListener('input', checkReady);
    document.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        gender = btn.dataset.g;
        checkReady();
      });
    });

    submitBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name || !gender) return;
      submitBtn.disabled = true; submitBtn.textContent = 'Создаём…';
      const { data, error } = await S.db.from('users').insert({
        name, gender,
      }).select().single();
      if (error || !data) {
        toast('Ошибка создания профиля');
        submitBtn.disabled = false; submitBtn.textContent = 'Создать профиль';
        return;
      }
      localStorage.setItem(CFG.STORAGE_USER, data.id);
      S.userId = data.id; S.user = data;
      await loadPartner();
      navigate('today');
    });
  }

  async function loadPartner() {
    const users = await dbUsers();
    S.partner = users.find(u => u.id !== S.userId) || null;
  }

  async function loadTodayData() {
    [S.entry, S.partnerEntry] = await Promise.all([
      loadEntry(S.userId, S.date),
      S.partner ? loadEntry(S.partner.id, S.date) : Promise.resolve(null),
    ]);
    const e = S.entry;
    S.form = {
      moodLevel:    e?.mood_level    || '',
      moodText:     e?.mood_text     || '',
      noticed:      [e?.noticed_1 || '', e?.noticed_2 || '', e?.noticed_3 || ''],
      gratitude:    [e?.gratitude_1 || '', e?.gratitude_2 || '', e?.gratitude_3 || ''],
      gratitudeSaid:e?.gratitude_said || '',
      closeness:     e?.closeness_text   || '',
      noteToPartner: e?.note_to_partner  || '',
      freeThought:   e?.free_thought     || '',
    };
  }

  // ── Theme ─────────────────────────────────────────────────────────
  function applyUserTheme(gender) {
    document.body.classList.toggle('theme-m', gender === 'm');
  }

  // ── Today view ────────────────────────────────────────────────────
  async function renderToday() {
    await loadTodayData();
    renderTodayView();
  }

  function showMiniCal() {
    document.querySelector('.mini-cal-popup')?.remove();

    const sel = new Date(S.date + 'T00:00:00');
    let cy = sel.getFullYear(), cm = sel.getMonth();
    const today = todayStr();

    function localStr(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function buildPopup() {
      const popup = document.querySelector('.mini-cal-popup') || (() => {
        const p = document.createElement('div');
        p.className = 'mini-cal-popup';
        document.body.appendChild(p);
        return p;
      })();

      const firstDay = new Date(cy, cm, 1).getDay();
      const offset = firstDay === 0 ? 6 : firstDay - 1;
      const dim = new Date(cy, cm + 1, 0).getDate();
      const prevDim = new Date(cy, cm, 0).getDate();
      const cells = [];
      for (let i = offset - 1; i >= 0; i--) cells.push({ day: prevDim - i, cur: false });
      for (let d = 1; d <= dim; d++) {
        const mm = String(cm + 1).padStart(2, '0'), dd = String(d).padStart(2, '0');
        const date = `${cy}-${mm}-${dd}`;
        cells.push({ day: d, cur: true, date, future: date > today });
      }
      while (cells.length % 7) cells.push({ day: cells.length - dim - offset + 1, cur: false });

      const nextMonthFuture = (() => {
        const nm = cm === 11 ? `${cy+1}-01-01` : `${cy}-${String(cm+2).padStart(2,'0')}-01`;
        return nm > today;
      })();

      popup.innerHTML = `
        <div class="mc-header">
          <button class="mc-nav" id="mc-prev">‹</button>
          <span class="mc-month">${CFG.MONTHS_RU[cm]} ${cy}</span>
          <button class="mc-nav" id="mc-next"${nextMonthFuture ? ' disabled' : ''}>›</button>
        </div>
        <div class="mc-grid">
          ${CFG.DAYS.map(d => `<div class="mc-dn">${d}</div>`).join('')}
          ${cells.map(c => {
            if (!c.cur) return `<div class="mc-cell mc-other">${c.day}</div>`;
            if (c.future) return `<div class="mc-cell mc-future">${c.day}</div>`;
            const cls = c.date === S.date ? ' mc-sel' : c.date === today ? ' mc-today' : '';
            return `<div class="mc-cell${cls}" data-date="${c.date}">${c.day}</div>`;
          }).join('')}
        </div>`;

      popup.querySelector('#mc-prev').addEventListener('click', e => {
        e.stopPropagation();
        if (cm === 0) { cy--; cm = 11; } else cm--;
        buildPopup();
      });
      popup.querySelector('#mc-next').addEventListener('click', e => {
        e.stopPropagation();
        if (!nextMonthFuture) { if (cm === 11) { cy++; cm = 0; } else cm++; buildPopup(); }
      });
      popup.querySelectorAll('.mc-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', e => {
          e.stopPropagation();
          S.date = cell.dataset.date;
          popup.remove();
          renderToday();
        });
      });
    }

    buildPopup();

    setTimeout(() => {
      document.addEventListener('click', function outsideClose(e) {
        if (!document.querySelector('.mini-cal-popup')?.contains(e.target)) {
          document.querySelector('.mini-cal-popup')?.remove();
          document.removeEventListener('click', outsideClose);
        }
      });
    }, 0);
  }

  function renderTodayView() {
    const u = S.user;
    const p = S.partner;
    const gSuffix = u.gender === 'f' ? 'а' : '';
    const dateObj = new Date(S.date + 'T00:00:00');
    const dayName = CFG.DAYS_FULL[dateObj.getDay()];
    const isToday = S.date === todayStr();

    document.getElementById('app').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="page-title">${dayName}</div>
          <div class="date-nav-header">
            <button class="date-nav-arrow-sm" id="date-prev">‹</button>
            <button class="date-nav-label" id="date-display" type="button">
              <span class="date-nav-text">${formatDate(S.date)}</span>
              ${isToday ? '<span class="date-nav-today-tag">сегодня</span>' : ''}
            </button>
            <button class="date-nav-arrow-sm" id="date-next"${isToday ? ' disabled' : ''}>›</button>
          </div>
        </div>
        <div class="page-body">

          ${S.entry ? `
            <div class="status-banner saved">
              <span class="banner-svg">${IC.check}</span> Запись сохранена
            </div>` : ''}

          ${p && !S.partnerEntry ? `
            <div class="status-banner waiting">
              <span class="banner-svg">${IC.waiting}</span> ${p.name} ещё не написал${p.gender === 'f' ? 'а' : ''} сегодня
            </div>` : ''}

          ${p && S.partnerEntry ? `
            <div class="status-banner ready" id="open-partner-btn" style="cursor:pointer">
              <span class="banner-svg">${IC.mail}</span> ${p.name} написал${p.gender === 'f' ? 'а' : ''} сегодня — посмотреть →
            </div>` : ''}

          <!-- Mood -->
          <div class="card">
            <div class="card-label">Настроение</div>
            <div class="mood-tags" id="mood-tags">
              ${CFG.MOOD_LEVELS.map(m => `
                <button class="mood-tag${S.form.moodLevel === m.key ? ' selected' : ''}" data-level="${m.key}">
                  <span class="mood-svg">${IC['mood' + m.key[0].toUpperCase() + m.key.slice(1)]}</span>
                  <span class="mood-label">${m.label}</span>
                </button>`).join('')}
            </div>
            <input id="mood-text" class="input" type="text"
              placeholder="Что ещё хочется сказать о настроении?"
              value="${S.form.moodText}">
          </div>

          <!-- What I noticed -->
          <div class="card">
            <div class="card-label">Что я заметил${gSuffix} в партнёре сегодня</div>
            <div class="noticed-list">
              ${[0, 1, 2].map(i => `
                <div class="noticed-item">
                  <span class="noticed-num">${i + 1}</span>
                  <input class="input" id="noticed-${i}" type="text"
                    placeholder="…" value="${S.form.noticed[i]}" style="padding-left:30px">
                </div>`).join('')}
            </div>
          </div>

          <!-- Gratitude -->
          <div class="card">
            <div class="card-label">Благодарность партнёру</div>
            <div class="noticed-list">
              ${[0, 1, 2].map(i => `
                <div class="noticed-item">
                  <span class="noticed-num">${i + 1}</span>
                  <input class="input" id="gratitude-${i}" type="text"
                    placeholder="…" value="${S.form.gratitude[i]}"
                    style="padding-left:30px">
                </div>`).join('')}
            </div>
            <div style="margin-top:12px">
              <div class="card-label" style="margin-bottom:8px">Сказал${gSuffix} об этом вслух?</div>
              <div class="radio-row">
                ${[['yes','Да ✓'],['not_yet','Ещё нет'],['no_occasion','Не было случая']].map(([v, lbl]) => `
                  <button class="radio-btn${S.form.gratitudeSaid === v ? ' selected' : ''}" data-said="${v}">${lbl}</button>`).join('')}
              </div>
            </div>
          </div>

          <!-- Moment of closeness -->
          <div class="card">
            <div class="card-label">Момент близости</div>
            <textarea id="closeness-text" class="textarea"
              placeholder="Какой момент вы разделили вместе?">${S.form.closeness}</textarea>
          </div>

          <!-- Note to partner -->
          <div class="card">
            <div class="card-label">Записка партнёру</div>
            <textarea id="note-to-partner" class="textarea"
              placeholder="Необязательно — что-то тёплое, что хочется передать…">${S.form.noteToPartner}</textarea>
          </div>

          <!-- Free thought (private) -->
          <div class="card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <div class="card-label" style="margin:0">Свободная мысль</div>
              <span class="private-tag">${IC.lock} только я</span>
            </div>
            <textarea id="free-thought" class="textarea"
              placeholder="Личные мысли — партнёр этого не увидит…">${S.form.freeThought}</textarea>
          </div>

          <button id="save-btn" class="btn-save">
            ${S.entry ? 'Обновить запись' : 'Сохранить запись'}
          </button>

        </div>
      </div>
      ${renderNav()}`;

    bindNav();

    el('open-partner-btn')?.addEventListener('click', () => navigate('partner'));

    function localDateStr(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function shiftDate(delta) {
      const d = new Date(S.date + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      const next = localDateStr(d);
      if (delta > 0 && next > todayStr()) return;
      S.date = next;
      renderToday();
    }
    el('date-prev').addEventListener('click', () => shiftDate(-1));
    el('date-next').addEventListener('click', () => shiftDate(1));
    el('date-display').addEventListener('click', e => { e.stopPropagation(); showMiniCal(); });

    // Mood tags (single select)
    el('mood-tags').addEventListener('click', e => {
      const btn = e.target.closest('.mood-tag');
      if (!btn) return;
      const lv = btn.dataset.level;
      S.form.moodLevel = S.form.moodLevel === lv ? '' : lv;
      el('mood-tags').querySelectorAll('.mood-tag').forEach(b =>
        b.classList.toggle('selected', b.dataset.level === S.form.moodLevel));
    });
    el('mood-text').addEventListener('input', e => { S.form.moodText = e.target.value; });

    // Noticed
    [0, 1, 2].forEach(i => {
      el(`noticed-${i}`)?.addEventListener('input', e => { S.form.noticed[i] = e.target.value; });
    });

    // Gratitude fields
    [0, 1, 2].forEach(i => {
      el(`gratitude-${i}`)?.addEventListener('input', e => { S.form.gratitude[i] = e.target.value; });
    });

    // Gratitude said
    document.querySelectorAll('.radio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        S.form.gratitudeSaid = btn.dataset.said;
      });
    });

    el('closeness-text')?.addEventListener('input', e => { S.form.closeness = e.target.value; });

    el('note-to-partner')?.addEventListener('input', e => { S.form.noteToPartner = e.target.value; });

    el('free-thought')?.addEventListener('input', e => { S.form.freeThought = e.target.value; });

    // Save
    el('save-btn').addEventListener('click', async () => {
      const btn = el('save-btn');
      btn.disabled = true; btn.textContent = 'Сохраняем…';

      const payload = {
        user_id:        S.userId,
        date:           S.date,
        mood_level:     S.form.moodLevel || null,
        mood_text:      S.form.moodText  || null,
        noticed_1:      S.form.noticed[0],
        noticed_2:      S.form.noticed[1],
        noticed_3:      S.form.noticed[2],
        gratitude_1:    S.form.gratitude[0],
        gratitude_2:    S.form.gratitude[1],
        gratitude_3:    S.form.gratitude[2],
        gratitude_said: S.form.gratitudeSaid || null,
        closeness_text:  S.form.closeness,
        note_to_partner: S.form.noteToPartner || null,
        free_thought:    S.form.freeThought,
        updated_at:     new Date().toISOString(),
      };

      const ok = await saveEntry(payload);
      if (ok) {
        toast('Запись сохранена ✓');
        S.entry = payload;
        if (S.date === todayStr()) notifyPartner(S.date);
        renderToday();
      } else {
        toast('Ошибка сохранения');
        btn.disabled = false;
        btn.textContent = S.entry ? 'Обновить запись' : 'Сохранить запись';
      }
    });
  }

  // ── Partner entry view ────────────────────────────────────────────
  async function renderPartner() {
    if (!S.partner) {
      document.getElementById('app').innerHTML = `
        <div class="page">
          <div class="page-header"><div class="page-title">Запись партнёра</div></div>
          <div class="page-body">
            <div class="card" style="text-align:center;padding:40px 16px;color:var(--text-soft)">
              Партнёр ещё не добавлен.<br>Попроси его открыть дневник.
            </div>
          </div>
        </div>${renderNav()}`;
      bindNav();
      return;
    }

    const p = S.partner;
    const e = await loadEntry(p.id, S.date);
    S.partnerEntry = e;
    const sl = 'border-left:3px solid var(--partner-accent)';

    const moodCfg = CFG.MOOD_LEVELS.find(m => m.key === e?.mood_level);

    document.getElementById('app').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="page-title">Записи ${genitive(p.name)}</div>
          <div class="page-subtitle">${formatDate(S.date)}</div>
        </div>
        <div class="page-body">
          ${!e ? `
            <div class="partner-empty">
              <div class="partner-empty-icon">${IC.waiting}</div>
              <div class="partner-empty-text">${p.name} ещё не написал${p.gender === 'f' ? 'а' : ''}<br>за ${formatDate(S.date)}</div>
            </div>` : `

            ${moodCfg || e.mood_text ? `
              <div class="card" style="${sl}">
                <div class="entry-field-label">Настроение</div>
                ${moodCfg ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="display:inline-block;width:28px;height:28px">${IC['mood' + moodCfg.key[0].toUpperCase() + moodCfg.key.slice(1)]}</span>
                  <span style="font-size:.9rem;font-weight:500">${moodCfg.label}</span>
                </div>` : ''}
                ${e.mood_text ? `<div class="entry-field-value" style="color:var(--text-soft)">${escHtml(e.mood_text)}</div>` : ''}
              </div>` : ''}

            ${(e.noticed_1 || e.noticed_2 || e.noticed_3) ? `
              <div class="card" style="${sl}">
                <div class="entry-field-label">Что заметил${p.gender === 'f' ? 'а' : ''} в тебе</div>
                <ul class="entry-noticed-list">
                  ${[e.noticed_1, e.noticed_2, e.noticed_3].filter(Boolean)
                      .map(n => `<li>${escHtml(n)}</li>`).join('')}
                </ul>
              </div>` : ''}

            ${(e.gratitude_1 || e.gratitude_2 || e.gratitude_3) ? `
              <div class="card" style="${sl}">
                <div class="entry-field-label">Благодарность тебе</div>
                <ul class="entry-noticed-list">
                  ${[e.gratitude_1, e.gratitude_2, e.gratitude_3].filter(Boolean)
                      .map(n => `<li>${escHtml(n)}</li>`).join('')}
                </ul>
                ${e.gratitude_said ? `
                  <div style="margin-top:8px;font-size:.78rem;color:var(--text-soft)">
                    ${{ yes: 'Сказал' + (p.gender === 'f' ? 'а' : '') + ' вслух ✓',
                        not_yet: 'Ещё не сказал' + (p.gender === 'f' ? 'а' : ''),
                        no_occasion: 'Не было случая' }[e.gratitude_said] || ''}
                  </div>` : ''}
              </div>` : ''}

            ${e.closeness_text ? `
              <div class="card" style="${sl}">
                <div class="entry-field-label">Момент близости</div>
                <div class="entry-field-value">${escHtml(e.closeness_text)}</div>
              </div>` : ''}

            ${e.note_to_partner ? `
              <div class="card note-card">
                <div class="entry-field-label">Записка тебе</div>
                <div class="note-text">${escHtml(e.note_to_partner)}</div>
              </div>` : ''}
          `}
        </div>
      </div>${renderNav()}`;

    bindNav();
  }

  function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  // ── Calendar view ─────────────────────────────────────────────────
  async function renderCalendar() {
    S.calData = await loadCalMonth(S.calYear, S.calMonth);
    const streak = await computeStreak();
    const year = S.calYear, month = S.calMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const today = todayStr();
    const cells = [];
    for (let i = offset - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, '0'), dd = String(d).padStart(2, '0');
      cells.push({ day: d, current: true, date: `${year}-${mm}-${dd}` });
    }
    for (let d = 1; cells.length < 42; d++) cells.push({ day: d, current: false, date: null });

    document.getElementById('app').innerHTML = `
      <div class="page">
        <div class="page-header"><div class="page-title">Календарь</div></div>
        <div class="page-body">

          <div class="streak-badge">
            <div class="streak-num">${streak}</div>
            <div class="streak-text">
              ${streak === 1 ? 'день подряд' : streak >= 2 && streak <= 4 ? 'дня подряд' : 'дней подряд'}<br>
              <span style="font-size:.7rem">оба заполняли дневник</span>
            </div>
          </div>

          <div class="card">
            <div class="calendar-header">
              <button class="cal-nav" id="cal-prev">‹</button>
              <div class="cal-month">${CFG.MONTHS_RU[month]} ${year}</div>
              <button class="cal-nav" id="cal-next">›</button>
            </div>
            <div class="cal-grid">
              ${CFG.DAYS.map(d => `<div class="cal-day-name">${d}</div>`).join('')}
              ${cells.map(c => {
                const info = c.date ? S.calData[c.date] : null;
                const isToday = c.date === today;
                const cls = ['cal-cell', !c.current && 'other-month', isToday && 'today'].filter(Boolean).join(' ');
                const dots = info ? `<div class="cal-dots">
                  ${info.mine   ? '<div class="cal-dot mine"></div>'   : ''}
                  ${info.theirs ? '<div class="cal-dot theirs"></div>' : ''}
                </div>` : '';
                return `<div class="${cls}" ${c.date ? `data-date="${c.date}"` : ''}>${c.day}${dots}</div>`;
              }).join('')}
            </div>
            <div style="display:flex;gap:16px;margin-top:14px;font-size:.75rem;color:var(--text-soft);padding:0 4px">
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:4px;vertical-align:middle"></span>${S.user?.name || 'Ты'}</span>
              ${S.partner ? `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--partner-accent);margin-right:4px;vertical-align:middle"></span>${S.partner.name}</span>` : ''}
            </div>
          </div>

        </div>
      </div>${renderNav()}`;

    bindNav();
    el('cal-prev').addEventListener('click', () => {
      if (S.calMonth === 0) { S.calYear--; S.calMonth = 11; } else S.calMonth--;
      renderCalendar();
    });
    el('cal-next').addEventListener('click', () => {
      if (S.calMonth === 11) { S.calYear++; S.calMonth = 0; } else S.calMonth++;
      renderCalendar();
    });
    document.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => { S.date = cell.dataset.date; navigate('today'); });
    });
  }

  // ── Qualities view ────────────────────────────────────────────────
  async function renderQualities() {
    const { data } = await S.db.from('qualities').select('*').eq('user_id', S.userId).order('created_at');
    S.qualities = data || [];
    const u = S.user, p = S.partner;
    const targetGender = p?.gender || 'm';
    const title = u.gender === 'f'
      ? (targetGender === 'm' ? 'За что я его люблю' : 'За что я её люблю')
      : (targetGender === 'f' ? 'За что я её люблю'  : 'За что я его люблю');

    document.getElementById('app').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="page-title">${title}</div>
          <div class="page-subtitle">${S.qualities.length} ${S.qualities.length === 1 ? 'качество' : S.qualities.length >= 5 ? 'качеств' : 'качества'}</div>
        </div>
        <div class="page-body">
          <div class="card">
            <div class="qualities-list">
              ${S.qualities.length === 0
                ? `<div class="qualities-empty">
                    <div class="qualities-empty-icon">${IC.heart}</div>
                    <div class="qualities-empty-text">Запиши первое качество,<br>которое в нём/ней восхищает</div>
                  </div>`
                : S.qualities.map((q, i) => `
                    <div class="quality-item" data-id="${q.id}">
                      <span class="quality-num">${i + 1}</span>
                      <span class="quality-text">${escHtml(q.text)}</span>
                      <button class="quality-del" data-id="${q.id}">${IC.trash}</button>
                    </div>`).join('')}
            </div>
          </div>
          <div class="card">
            <div class="card-label">Добавить</div>
            <div class="quality-add">
              <input id="quality-input" class="input" type="text"
                placeholder="Что в нём/ней особенное?" maxlength="200">
              <button id="quality-add-btn" class="btn-add">+</button>
            </div>
          </div>
        </div>
      </div>${renderNav()}`;

    bindNav();

    // Add
    const input = el('quality-input'), addBtn = el('quality-add-btn');
    async function addQuality() {
      const text = input.value.trim();
      if (!text) return;
      addBtn.disabled = true;
      const { error } = await S.db.from('qualities').insert({ user_id: S.userId, text });
      if (!error) { input.value = ''; renderQualities(); }
      else { toast('Ошибка сохранения'); addBtn.disabled = false; }
    }
    addBtn.addEventListener('click', addQuality);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addQuality(); });

    // Edit & delete via delegation
    document.querySelector('.qualities-list')?.addEventListener('click', async e => {
      // Delete
      const delBtn = e.target.closest('.quality-del');
      if (delBtn) {
        await S.db.from('qualities').delete().eq('id', delBtn.dataset.id);
        renderQualities();
        return;
      }
      // Inline edit
      const textSpan = e.target.closest('.quality-text');
      if (!textSpan) return;
      const item = textSpan.closest('.quality-item');
      const qid = item.dataset.id;
      const orig = textSpan.textContent;
      const inp = document.createElement('input');
      inp.className = 'quality-edit-input input';
      inp.value = orig;
      textSpan.replaceWith(inp);
      inp.focus(); inp.select();
      async function commitEdit() {
        const val = inp.value.trim();
        if (val && val !== orig) {
          await S.db.from('qualities').update({ text: val }).eq('id', qid);
        }
        renderQualities();
      }
      inp.addEventListener('blur', commitEdit);
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') inp.blur();
        if (e.key === 'Escape') { inp.value = orig; inp.blur(); }
      });
    });
  }

  // ── Settings view ─────────────────────────────────────────────────
  async function renderSettings() {
    const { data: pushSub } = await S.db.from('push_subscriptions')
      .select('reminder_time').eq('user_id', S.userId).maybeSingle();
    const reminderTime = pushSub?.reminder_time || '';
    const u = S.user;

    document.getElementById('app').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="page-title">Настройки</div>
          <div class="page-subtitle">${u.name}</div>
        </div>
        <div class="page-body">

          <div class="section-tag">Уведомления</div>
          <div class="settings-section">
            <div class="settings-item">
              <div>
                <div class="settings-label">Push-уведомления</div>
                <div class="settings-sub">Когда партнёр заполнит дневник</div>
              </div>
              <div class="toggle${S.pushEnabled ? ' on' : ''}" id="push-toggle"></div>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-label">Напоминание</div>
                <div class="settings-sub">Если дневник не заполнен к этому времени</div>
              </div>
              <input id="reminder-time" type="time" class="time-input" value="${reminderTime}">
            </div>
          </div>

          <div class="section-tag" style="margin-top:8px">Профиль</div>
          <div class="settings-section">
            <div class="settings-item" id="switch-user-btn" style="cursor:pointer">
              <div>
                <div class="settings-label">Сменить пользователя</div>
                <div class="settings-sub">Для второго партнёра на этом устройстве</div>
              </div>
              <span style="color:var(--text-soft)">›</span>
            </div>
          </div>

        </div>
      </div>${renderNav()}`;

    bindNav();

    el('push-toggle').addEventListener('click', async () => {
      if (S.pushEnabled) await disablePush(); else await enablePush();
      renderSettings();
    });

    let reminderDebounce;
    el('reminder-time').addEventListener('change', e => {
      clearTimeout(reminderDebounce);
      reminderDebounce = setTimeout(async () => {
        await fetch('/api/reminder', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: S.userId, reminderTime: e.target.value || null }),
        });
        toast('Напоминание сохранено');
      }, 400);
    });

    el('switch-user-btn').addEventListener('click', showUserSwitch);
  }

  function showUserSwitch() {
    const users = [S.user, S.partner].filter(Boolean);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-title">Кто ты?</div>
        ${users.map(u => `
          <div data-uid="${u.id}" class="user-switch-item${u.id === S.userId ? ' active' : ''}">
            ${u.name} ${u.id === S.userId ? '← сейчас' : ''}
          </div>`).join('')}
        <button id="dismiss-switch" class="btn-ghost" style="width:100%;margin-top:8px">Отмена</button>
      </div>`;
    document.body.appendChild(overlay);
    el('dismiss-switch').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', async e => {
      const uid = e.target.closest('[data-uid]')?.dataset.uid;
      if (!uid || uid === S.userId) { overlay.remove(); return; }
      localStorage.setItem(CFG.STORAGE_USER, uid);
      overlay.remove();
      await initApp();
    });
  }

  // ── Bottom nav ────────────────────────────────────────────────────
  function renderNav() {
    const tabs = [
      { id: 'today',    icon: IC.today,    label: 'Сегодня' },
      { id: 'calendar', icon: IC.calendar, label: 'Календарь' },
      { id: 'partner',  icon: IC.mail,     label: S.partner?.name || 'Партнёр', badge: S.partnerBadge },
      { id: 'qualities',icon: IC.star,     label: 'Качества' },
      { id: 'settings', icon: IC.settings, label: 'Настройки' },
    ];
    return `
      <nav class="bottom-nav">
        ${tabs.map(t => `
          <div class="nav-item${S.view === t.id ? ' active' : ''}" data-view="${t.id}">
            <div class="nav-icon">${t.icon}${t.badge ? '<div class="nav-badge"></div>' : ''}</div>
            <span>${t.label}</span>
          </div>`).join('')}
      </nav>`;
  }

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.view));
    });
  }

  // ── Main render ───────────────────────────────────────────────────
  async function render() {
    switch (S.view) {
      case 'today':     await renderToday();    break;
      case 'partner':   await renderPartner();  break;
      case 'calendar':  await renderCalendar(); break;
      case 'qualities': await renderQualities();break;
      case 'settings':  await renderSettings(); break;
    }
  }

  // ── App init ──────────────────────────────────────────────────────
  async function initApp() {
    const storedId = localStorage.getItem(CFG.STORAGE_USER);
    if (storedId) {
      const users = await dbUsers();
      S.user = users.find(u => u.id === storedId) || null;
      if (S.user) {
        S.userId = S.user.id;
        applyUserTheme(S.user.gender);
        S.partner = users.find(u => u.id !== storedId) || null;
        if (!CFG.DEMO && 'serviceWorker' in navigator && 'PushManager' in window) {
          const reg = await navigator.serviceWorker.ready.catch(() => null);
          if (reg) {
            const sub = await reg.pushManager.getSubscription().catch(() => null);
            S.pushEnabled = !!sub;
          }
        }
        if (S.partner) {
          const pe = await loadEntry(S.partner.id, todayStr());
          S.partnerBadge = !!pe;
        }
        await render();
        return;
      }
    }
    const users = await dbUsers();
    if (users.length === 0) { renderSetup(false); }
    else if (users.length === 1) { S.partner = users[0]; renderSetup(true); }
    else { showUserPicker(users); }
  }

  function showUserPicker(users) {
    document.getElementById('app').innerHTML = `
      <div class="setup-page">
        <div class="setup-heart">${IC.heart}</div>
        <h1 class="setup-title">Кто ты?</h1>
        <p class="setup-desc">Выбери свой профиль</p>
        <div class="setup-form">
          ${users.map(u => `
            <button class="btn-save" data-uid="${u.id}"
              style="background:${u.gender === 'f' ? 'var(--accent-a)' : 'var(--accent-b)'}">
              ${u.name}
            </button>`).join('')}
        </div>
      </div>`;
    document.querySelectorAll('[data-uid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        localStorage.setItem(CFG.STORAGE_USER, btn.dataset.uid);
        await initApp();
      });
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────
  async function boot() {
    if (CFG.DEMO) {
      S.db = createLocalDb();
    } else {
      S.db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW:', err));
      }
    }
    await initApp();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
