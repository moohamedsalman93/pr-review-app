import { open } from '@tauri-apps/plugin-shell';

/**
 * Opens a URL in the user's default external browser.
 * @param {string} url - The URL to open.
 */
export const openExternalLink = async (url) => {
    try {
        await open(url);
    } catch (error) {
        console.error('Failed to open external link:', error);
        // Fallback for non-Tauri environment or if opening fails
        window.open(url, '_blank', 'noopener,noreferrer');
    }
};
