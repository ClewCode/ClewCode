import { jsx as _jsx } from "react/jsx-runtime";
import { feature } from 'bun:bundle';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import useStdin from '../../ink/hooks/use-stdin.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { getSystemThemeName } from '../../utils/systemTheme.js';
// Non-'auto' default so useTheme() works without a provider (tests, tooling).
const DEFAULT_THEME = 'dark';
const ThemeContext = createContext({
    themeSetting: DEFAULT_THEME,
    setThemeSetting: () => { },
    setPreviewTheme: () => { },
    savePreview: () => { },
    cancelPreview: () => { },
    currentTheme: DEFAULT_THEME,
});
function defaultInitialTheme() {
    return getGlobalConfig().theme;
}
function defaultSaveTheme(setting) {
    saveGlobalConfig(current => ({ ...current, theme: setting }));
}
export function ThemeProvider({ children, initialState, onThemeSave = defaultSaveTheme }) {
    const [themeSetting, setThemeSetting] = useState(initialState ?? defaultInitialTheme);
    const [previewTheme, setPreviewTheme] = useState(null);
    // Track terminal theme for 'auto' resolution. Seeds from $COLORFGBG (or
    // 'dark' if unset); the OSC 11 watcher corrects it on first poll.
    const [systemTheme, setSystemTheme] = useState(() => (initialState ?? themeSetting) === 'auto' ? getSystemThemeName() : 'dark');
    // The setting currently in effect (preview wins while picker is open)
    const activeSetting = previewTheme ?? themeSetting;
    const { internal_querier } = useStdin();
    // Watch for live terminal theme changes while 'auto' is active.
    // Positive feature() pattern so the watcher import is dead-code-eliminated
    // in external builds.
    useEffect(() => {
        if (feature('AUTO_THEME')) {
            if (activeSetting !== 'auto' || !internal_querier)
                return;
            let cleanup;
            let cancelled = false;
            void import('../../utils/systemThemeWatcher.js').then(({ watchSystemTheme }) => {
                if (cancelled)
                    return;
                cleanup = watchSystemTheme(internal_querier, setSystemTheme);
            });
            return () => {
                cancelled = true;
                cleanup?.();
            };
        }
    }, [activeSetting, internal_querier]);
    const currentTheme = activeSetting === 'auto' ? systemTheme : activeSetting;
    const value = useMemo(() => ({
        themeSetting,
        setThemeSetting: (newSetting) => {
            setThemeSetting(newSetting);
            setPreviewTheme(null);
            // Switching to 'auto' restarts the watcher (activeSetting dep), whose
            // first poll fires immediately. Seed from the cache so the OSC
            // round-trip doesn't flash the wrong palette.
            if (newSetting === 'auto') {
                setSystemTheme(getSystemThemeName());
            }
            onThemeSave?.(newSetting);
        },
        setPreviewTheme: (newSetting) => {
            setPreviewTheme(newSetting);
            if (newSetting === 'auto') {
                setSystemTheme(getSystemThemeName());
            }
        },
        savePreview: () => {
            if (previewTheme !== null) {
                setThemeSetting(previewTheme);
                setPreviewTheme(null);
                onThemeSave?.(previewTheme);
            }
        },
        cancelPreview: () => {
            if (previewTheme !== null) {
                setPreviewTheme(null);
            }
        },
        currentTheme,
    }), [themeSetting, previewTheme, currentTheme, onThemeSave]);
    return _jsx(ThemeContext.Provider, { value: value, children: children });
}
/**
 * Returns the resolved theme for rendering (never 'auto') and a setter that
 * accepts any ThemeSetting (including 'auto').
 */
export function useTheme() {
    const { currentTheme, setThemeSetting } = useContext(ThemeContext);
    return [currentTheme, setThemeSetting];
}
/**
 * Returns the raw theme setting as stored in config. Use this in UI that
 * needs to show 'auto' as a distinct choice (e.g., ThemePicker).
 */
export function useThemeSetting() {
    return useContext(ThemeContext).themeSetting;
}
export function usePreviewTheme() {
    const { setPreviewTheme, savePreview, cancelPreview } = useContext(ThemeContext);
    return { setPreviewTheme, savePreview, cancelPreview };
}
