import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';

/**
 * Opens a URL in the user's default external browser.
 * In plain browser dev (Vite without Tauri), uses window.open — shell.open is not available / would fail.
 * @param {string} url - The URL to open.
 */
export const openExternalLink = async (url) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u || !/^https?:\/\//i.test(u)) {
        console.error('openExternalLink: invalid or missing URL', url);
        return;
    }

    if (!isTauri()) {
        window.open(u, '_blank', 'noopener,noreferrer');
        return;
    }

    try {
        await open(u);
    } catch (error) {
        console.error('Failed to open external link:', error);
        window.open(u, '_blank', 'noopener,noreferrer');
    }
};
