export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly { value: Theme; label: string }[] = [
	{ value: 'system', label: 'System' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' },
];

// Also read by the inline script in index.html, which sets the theme before the first paint.
const STORAGE_KEY = 'llmspy-theme';

/** The saved choice; System when nothing is saved or storage can't be read. */
export function loadTheme(): Theme {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'light' || saved === 'dark') return saved;
	} catch {}
	return 'system';
}

/** Applies a choice through `data-theme` on <html> (none means follow the system) and saves it. */
export function setTheme(theme: Theme): void {
	const root = document.documentElement;
	if (theme === 'system') delete root.dataset.theme;
	else root.dataset.theme = theme;
	try {
		if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, theme);
	} catch {}
}
