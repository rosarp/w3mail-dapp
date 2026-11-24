(() => {
  const root = document.documentElement;
  let theme;
  try {
    theme = localStorage.getItem('theme');
  } catch {}
  root.dataset.theme = theme === 'light' || theme === 'dark' ? theme : root.dataset.defaultTheme;
})();
