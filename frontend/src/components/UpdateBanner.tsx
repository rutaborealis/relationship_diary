import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // каждые 5 минут

/**
 * Сверяет build-id запущенного приложения (__BUILD_ID__) с актуальным из
 * /version.json. При расхождении показывает баннер с кнопкой «Обновить».
 * Перезагрузку инициирует пользователь — чтобы не потерять несохранённый ввод.
 */
export function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function check() {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (buildId && buildId !== __BUILD_ID__) setUpdateReady(true);
      } catch {
        /* офлайн / временная ошибка — игнорируем, проверим позже */
      }
    }

    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="update-banner" role="status">
      <span>Доступна новая версия</span>
      <button onClick={() => window.location.reload()}>Обновить</button>
    </div>
  );
}
