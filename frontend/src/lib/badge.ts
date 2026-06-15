// App-icon badge (Badging API). Set from the service worker on push; cleared
// here when the user opens/focuses the app, since they've now seen it.
type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count?: number) => Promise<void>;
};

export function clearAppBadge(): void {
  const nav = navigator as BadgeNavigator;
  nav.clearAppBadge?.().catch(() => { /* unsupported / not installed */ });
}
