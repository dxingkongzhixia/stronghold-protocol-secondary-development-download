// i18n-ignore-file: standalone marketplace theme labels (Chinese-first; a language pack can wrap it later)
// Shared light/dark theme for the standalone marketplace pages.
export function initMarketTheme(buttonId = 'themeToggle') {
  const button = document.getElementById(buttonId);
  const apply = (theme) => {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('sp_market_theme', t); } catch { /* private mode */ }
    if (button) button.textContent = t === 'light' ? '深色' : '浅色';
  };
  let saved = 'dark';
  try { saved = localStorage.getItem('sp_market_theme') || 'dark'; } catch { /* private mode */ }
  apply(saved);
  button?.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
}
