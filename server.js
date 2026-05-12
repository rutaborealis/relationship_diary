require('dotenv').config();
const express = require('express');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
  'mailto:' + process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

async function sendPushToUser(userId, payload) {
  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId);

  if (!rows?.length) return;

  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId);
      } else {
        console.error('Push send error:', err.message);
      }
    }
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// VAPID public key (needed by frontend to subscribe)
app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// Save or update push subscription
app.post('/api/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.status(400).json({ error: 'missing fields' });

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, subscription, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Update reminder time
app.post('/api/reminder', async (req, res) => {
  const { userId, reminderTime } = req.body;
  if (!userId) return res.status(400).json({ error: 'missing userId' });

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ reminder_time: reminderTime || null })
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Called after saving entry — notify partner
app.post('/api/notify-partner', async (req, res) => {
  const { userId, date } = req.body;
  if (!userId || !date) return res.status(400).json({ error: 'missing fields' });

  const { data: users } = await supabase.from('users').select('id, name, gender');
  if (!users || users.length < 2) return res.json({ ok: true });

  const sender = users.find(u => u.id === userId);
  const partner = users.find(u => u.id !== userId);
  if (!sender || !partner) return res.json({ ok: true });

  // Idempotency — send only once per day
  const { data: existing } = await supabase
    .from('notification_log')
    .select('id')
    .eq('sender_id', userId)
    .eq('recipient_id', partner.id)
    .eq('date', date)
    .eq('type', 'entry_saved')
    .maybeSingle();

  if (existing) return res.json({ ok: true, skipped: true });

  await supabase.from('notification_log').insert({
    sender_id: userId,
    recipient_id: partner.id,
    date,
    type: 'entry_saved',
  });

  const pronoun = sender.gender === 'f' ? 'Она' : 'Он';
  const verb    = sender.gender === 'f' ? 'заполнила' : 'заполнил';

  await sendPushToUser(partner.id, {
    title: `${pronoun} ${verb} дневник 💌`,
    body: `${sender.name} уже написал${sender.gender === 'f' ? 'а' : ''} сегодня`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: '/',
  });

  res.json({ ok: true });
});

// ── Cron: daily reminders ───────────────────────────────────────────────────

cron.schedule('* * * * *', async () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;
  const today = todayStr();

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription')
    .eq('reminder_time', currentTime);

  if (!subs?.length) return;

  for (const sub of subs) {
    // Skip if already filled today
    const { data: entry } = await supabase
      .from('entries')
      .select('id')
      .eq('user_id', sub.user_id)
      .eq('date', today)
      .maybeSingle();
    if (entry) continue;

    // Skip if reminder already sent today
    const { data: logged } = await supabase
      .from('notification_log')
      .select('id')
      .eq('sender_id', sub.user_id)
      .eq('recipient_id', sub.user_id)
      .eq('date', today)
      .eq('type', 'reminder')
      .maybeSingle();
    if (logged) continue;

    await supabase.from('notification_log').insert({
      sender_id:    sub.user_id,
      recipient_id: sub.user_id,
      date:         today,
      type:         'reminder',
    });

    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({
        title: 'Дневник ждёт 📖',
        body:  'Не забудь написать сегодня',
        icon:  '/icons/icon-192.png',
        url:   '/',
      }));
    } catch (err) {
      console.error('Reminder send error:', err.message);
    }
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Couples Diary server → http://localhost:${PORT}`);
});