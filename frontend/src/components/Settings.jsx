import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings as SettingsIcon,
    Save,
    RefreshCw,
    Loader2,
    CheckCircle,
    AlertCircle,
    Link2,
    Unplug,
    X,
    Pencil,
} from 'lucide-react';
import githubBrand from '../../assets/github.svg';
import gitlabBrand from '../../assets/gitlab-icon.svg';
import ollamaBrand from '../../assets/ollama.svg';
import geminiBrand from '../../assets/gemini-color.svg';
import openaiBrand from '../../assets/openai.svg';
import anthropicBrand from '../../assets/anthropic.svg';
import { settingsService, oauthService, appInfoService } from '../services/api';
import { openExternalLink } from '../utils/link';

const GITHUB_OAUTH_CALLBACK = 'http://127.0.0.1:47685/api/oauth/github/callback';
const GITLAB_OAUTH_CALLBACK = 'http://127.0.0.1:47685/api/oauth/gitlab/callback';

async function pollOAuthStatus(pollFn, { intervalMs = 1000, maxAttempts = 120 } = {}) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const row = await pollFn();
            if (row.status === 'success' || row.status === 'error') {
                return row;
            }
        } catch {
            return { status: 'error', message: 'Lost connection to the backend (poll failed). Try again.' };
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { status: 'error', message: 'Timed out waiting for authorization. Close the browser tab and try again.' };
}

function buildSettingsPayload(s) {
    return {
        gitlab_url: s.gitlab_url,
        gitlab_token: s.gitlab_token,
        github_token: s.github_token,
        github_client_id: s.github_client_id,
        github_client_secret: s.github_client_secret,
        gitlab_client_id: s.gitlab_client_id,
        gitlab_client_secret: s.gitlab_client_secret,
        ai_provider: s.ai_provider,
        ai_model: s.ai_model,
        ai_api_key: s.ai_api_key,
        ai_base_url: s.ai_base_url,
        max_tokens: s.max_tokens,
        review_runs: s.review_runs,
    };
}

const SectionHeader = ({ icon: Icon, title, description }) => (
    <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
            {Icon ? <Icon className="w-4 h-4 text-primary-600 dark:text-primary-400" /> : null}
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h4>
        </div>
        {description ? <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
    </div>
);

const InputField = ({ label, id, type = 'text', value, onChange, placeholder, helpText, min, max, secondaryAction, disabled = false, readOnly = false }) => (
    <div className="space-y-1.5">
        <div className="flex items-center justify-between">
            <label htmlFor={id} className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {label}
            </label>
            {secondaryAction}
        </div>
        <input
            type={type}
            id={id}
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            disabled={disabled}
            readOnly={readOnly}
            className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-primary-50 dark:focus:ring-primary-900/10 focus:border-primary-500 transition-all"
            placeholder={placeholder}
        />
        {helpText && <p className="text-[10px] text-slate-400 font-medium">{helpText}</p>}
    </div>
);

const SelectField = ({ label, id, value, onChange, options, helpText, secondaryAction }) => (
    <div className="space-y-1.5">
        <div className="flex items-center justify-between">
            <label htmlFor={id} className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {label}
            </label>
            {secondaryAction}
        </div>
        <select
            id={id}
            value={value}
            onChange={onChange}
            className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-50 dark:focus:ring-primary-900/10 focus:border-primary-500 transition-all appearance-none"
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
        {helpText && <p className="text-[10px] text-slate-400 font-medium">{helpText}</p>}
    </div>
);

const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com';

/** Brand marks from `frontend/assets` (Vite resolves imports to URLs). */
function BrandIcon({ src, alt, className, tone = 'color' }) {
    const monoDark =
        tone === 'mono' ? 'dark:brightness-0 dark:invert' : '';
    return (
        <img
            src={src}
            alt={alt ?? ''}
            className={[monoDark, className].filter(Boolean).join(' ')}
            draggable={false}
        />
    );
}

const LLM_PROVIDERS = [
    { id: 'ollama_cloud', label: 'Ollama Cloud', iconSrc: ollamaBrand, iconTone: 'mono' },
    { id: 'ollama', label: 'Ollama Local', iconSrc: ollamaBrand, iconTone: 'mono' },
    { id: 'gemini', label: 'Google Gemini', iconSrc: geminiBrand, iconTone: 'color' },
    { id: 'openai', label: 'OpenAI', iconSrc: openaiBrand, iconTone: 'mono' },
    { id: 'anthropic', label: 'Anthropic', iconSrc: anthropicBrand, iconTone: 'mono' },
];

function Modal({ title, children, onClose }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-lg max-h-[min(90vh,720px)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
                    <h2 id="settings-modal-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

const StatusChip = ({ tone, children }) => {
    const tones = {
        success: 'bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60',
        muted: 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        warn: 'bg-amber-100/90 dark:bg-amber-900/35 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/50',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${tones[tone] || tones.muted}`}>
            {children}
        </span>
    );
};

const Settings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [error, setError] = useState(null);
    const [availableModels, setAvailableModels] = useState([]);
    const [oauthGithubBusy, setOauthGithubBusy] = useState(false);
    const [oauthGitlabBusy, setOauthGitlabBusy] = useState(false);
    const [githubDisconnectBusy, setGithubDisconnectBusy] = useState(false);
    const [gitlabDisconnectBusy, setGitlabDisconnectBusy] = useState(false);
    const [oauthBridgeBaseUrl, setOauthBridgeBaseUrl] = useState('');
    const [connectionModal, setConnectionModal] = useState(null);
    const [llmModalOpen, setLlmModalOpen] = useState(false);

    const [settings, setSettings] = useState({
        gitlab_url: 'https://gitlab.com',
        gitlab_token: '',
        github_token: '',
        github_client_id: '',
        github_client_secret: '',
        gitlab_client_id: '',
        gitlab_client_secret: '',
        github_token_configured: false,
        gitlab_token_configured: false,
        github_client_secret_set: false,
        gitlab_client_secret_set: false,
        github_oauth_ready: false,
        gitlab_oauth_ready: false,
        github_publisher_oauth: false,
        gitlab_publisher_oauth: false,
        ai_provider: 'ollama',
        ai_model: 'gemini-1.5-flash-latest',
        ai_api_key: '',
        ai_base_url: 'http://localhost:11434',
        max_tokens: 128000,
        review_runs: 1,
    });

    const fetchAvailableModels = useCallback(async (provider, baseUrl, apiKey) => {
        if (!provider) return;
        setFetchingModels(true);
        try {
            const models = await settingsService.getAvailableModels(provider, baseUrl, apiKey);
            setAvailableModels(models || []);
        } catch (err) {
            console.error('Failed to fetch models:', err);
        } finally {
            setFetchingModels(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [data, info] = await Promise.all([settingsService.getSettings(), appInfoService.getInfo().catch(() => null)]);
            setSettings(data);
            if (info) {
                const base = String(info.oauth_bridge_base_url ?? '')
                    .trim()
                    .replace(/\/+$/, '');
                setOauthBridgeBaseUrl(base);
            } else {
                setOauthBridgeBaseUrl('');
            }
            if (data.ai_provider) {
                fetchAvailableModels(data.ai_provider, data.ai_base_url, data.ai_api_key);
            }
        } catch (err) {
            setError('Failed to load settings. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSuccessMessage(null);
        setError(null);

        try {
            const updated = await settingsService.updateSettings(buildSettingsPayload(settings));
            setSettings((prev) => ({ ...prev, ...updated }));
            setSuccessMessage('Settings saved successfully.');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError('Failed to save settings. Please check your inputs and try again.');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field) => (e) => {
        const raw = e.target.value;
        const numericFields = new Set(['max_tokens', 'review_runs']);
        const nextValue = numericFields.has(field) ? Number(raw) : raw;
        setSettings((prev) => ({ ...prev, [field]: nextValue }));
    };

    const formatOAuthError = (err) => {
        const d = err.response?.data?.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map((x) => x.msg || x).join('; ');
        return err.message || 'OAuth request failed.';
    };

    const selectAiProvider = (newProvider) => {
        setSettings((prev) => {
            const next = { ...prev, ai_provider: newProvider };
            if (newProvider === 'ollama_cloud') {
                next.ai_base_url = OLLAMA_CLOUD_BASE_URL;
            } else if (newProvider === 'ollama' && (!prev.ai_base_url || prev.ai_base_url === OLLAMA_CLOUD_BASE_URL)) {
                next.ai_base_url = 'http://localhost:11434';
            }
            return next;
        });
        const baseUrl =
            newProvider === 'ollama_cloud'
                ? OLLAMA_CLOUD_BASE_URL
                : newProvider === 'ollama' && (!settings.ai_base_url || settings.ai_base_url === OLLAMA_CLOUD_BASE_URL)
                  ? 'http://localhost:11434'
                  : settings.ai_base_url;
        fetchAvailableModels(newProvider, baseUrl, settings.ai_api_key);
    };

    const connectGithubOAuth = async () => {
        setOauthGithubBusy(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await settingsService.updateSettings(buildSettingsPayload(settings));
            const synced = await settingsService.getSettings();
            setSettings((prev) => ({ ...prev, ...synced }));
            const start = await oauthService.startGithub();
            const authorize_url = start?.authorize_url;
            const state = start?.state;
            if (typeof authorize_url !== 'string' || !authorize_url.startsWith('http')) {
                throw new Error(
                    'GitHub OAuth did not return a valid authorize URL. If you use a bridge, deploy the real oauth-bridge function (not a placeholder) and set PR_REVIEW_OAUTH_BRIDGE_URL on the backend.',
                );
            }
            if (typeof state !== 'string' || state.length < 8) {
                throw new Error('GitHub OAuth did not return a valid session state. Try Connect again.');
            }
            await openExternalLink(authorize_url);
            const result = await pollOAuthStatus(() => oauthService.pollGithub(state));
            if (result.status === 'success') {
                const data = await settingsService.getSettings();
                setSettings((prev) => ({ ...prev, ...data }));
                if (!data.github_token_configured) {
                    setError('OAuth reported success but no GitHub token was stored. Check the backend logs and bridge configuration.');
                } else {
                    setSuccessMessage('GitHub connected. Your token is stored on the server — the PAT field stays empty on purpose for security.');
                    setTimeout(() => setSuccessMessage(null), 6000);
                }
            } else {
                setError(result.message || 'GitHub authorization failed.');
            }
        } catch (err) {
            setError(formatOAuthError(err));
        } finally {
            setOauthGithubBusy(false);
        }
    };

    const connectGitlabOAuth = async () => {
        setOauthGitlabBusy(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await settingsService.updateSettings(buildSettingsPayload(settings));
            const synced = await settingsService.getSettings();
            setSettings((prev) => ({ ...prev, ...synced }));
            const start = await oauthService.startGitlab();
            const authorize_url = start?.authorize_url;
            const state = start?.state;
            if (typeof authorize_url !== 'string' || !authorize_url.startsWith('http')) {
                throw new Error('GitLab OAuth did not return a valid authorize URL. Check OAuth settings and backend configuration.');
            }
            if (typeof state !== 'string' || state.length < 8) {
                throw new Error('GitLab OAuth did not return a valid session state. Try Connect again.');
            }
            await openExternalLink(authorize_url);
            const result = await pollOAuthStatus(() => oauthService.pollGitlab(state));
            if (result.status === 'success') {
                const data = await settingsService.getSettings();
                setSettings((prev) => ({ ...prev, ...data }));
                if (!data.gitlab_token_configured) {
                    setError('OAuth reported success but no GitLab token was stored. Check the backend logs and OAuth app settings.');
                } else {
                    setSuccessMessage('GitLab connected. Your token is stored on the server — the token field stays empty on purpose for security.');
                    setTimeout(() => setSuccessMessage(null), 6000);
                }
            } else {
                setError(result.message || 'GitLab authorization failed.');
            }
        } catch (err) {
            setError(formatOAuthError(err));
        } finally {
            setOauthGitlabBusy(false);
        }
    };

    const handleDisconnectGithub = async () => {
        setGithubDisconnectBusy(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const updated = await settingsService.updateSettings({
                ...buildSettingsPayload(settings),
                disconnect_github: true,
            });
            setSettings((prev) => ({ ...prev, ...updated }));
            setSuccessMessage('GitHub disconnected.');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err) {
            setError(formatOAuthError(err));
        } finally {
            setGithubDisconnectBusy(false);
        }
    };

    const handleDisconnectGitlab = async () => {
        setGitlabDisconnectBusy(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const updated = await settingsService.updateSettings({
                ...buildSettingsPayload(settings),
                disconnect_gitlab: true,
            });
            setSettings((prev) => ({ ...prev, ...updated }));
            setSuccessMessage('GitLab disconnected.');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err) {
            setError(formatOAuthError(err));
        } finally {
            setGitlabDisconnectBusy(false);
        }
    };

    const llmNeedsApiKey = (id) => ['ollama_cloud', 'openai', 'anthropic', 'gemini'].includes(id);
    const isLlmConfigured = (id) => {
        if (settings.ai_provider !== id) return false;
        if (llmNeedsApiKey(id)) return Boolean(String(settings.ai_api_key || '').trim());
        if (id === 'ollama') return true;
        return true;
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center h-96 animate-fade-in">
                <div className="w-10 h-10 border-4 border-primary-100 dark:border-primary-900/30 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin"></div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 font-medium">Loading settings...</p>
            </div>
        );
    }

    const renderGitlabModalBody = () => (
        <div className="space-y-5">
            {settings.gitlab_token_configured ? (
                <div className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/25 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Connected to GitLab</p>
                            {settings.gitlab_url?.trim() && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-mono break-all">{settings.gitlab_url}</p>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleDisconnectGitlab}
                        disabled={gitlabDisconnectBusy}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 bg-white/80 dark:bg-slate-900/80 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 shrink-0"
                    >
                        {gitlabDisconnectBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                        Disconnect
                    </button>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4">
                        <InputField
                            label="GitLab URL"
                            id="modal_gitlab_url"
                            type="url"
                            value={settings.gitlab_url}
                            onChange={handleChange('gitlab_url')}
                            placeholder="https://gitlab.com"
                            helpText="Must match the instance where you registered the OAuth application."
                        />
                        <InputField
                            label="Personal Access Token (optional)"
                            id="modal_gitlab_token"
                            type="password"
                            value={settings.gitlab_token}
                            onChange={handleChange('gitlab_token')}
                            placeholder="glpat-..."
                            helpText="Or use Connect with GitLab below. Scope read_api matches OAuth; use api for broader access."
                        />
                    </div>
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Sign in with GitLab</p>
                        {settings.gitlab_publisher_oauth && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                This build includes GitLab.com OAuth—you only need to click Connect (GitLab URL must stay{' '}
                                <span className="font-mono">https://gitlab.com</span> unless your publisher configured another instance).
                            </p>
                        )}
                        {!settings.gitlab_oauth_ready && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400/90 leading-relaxed">
                                OAuth is not available yet. Use a personal access token above, or open &quot;Custom OAuth application&quot; below to register your own app.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={connectGitlabOAuth}
                            disabled={oauthGitlabBusy || !settings.gitlab_oauth_ready || !settings.gitlab_url?.trim()}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            {oauthGitlabBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                            {oauthGitlabBusy ? 'Waiting for browser…' : 'Connect with GitLab'}
                        </button>
                        <details className="group border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
                            <summary className="text-[11px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer list-none">Custom OAuth application (optional)</summary>
                            <div className="mt-3 space-y-3">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                    On your GitLab instance, create an OAuth application and set this redirect URI (exactly):
                                    <code className="block mt-1 p-2 rounded bg-slate-100 dark:bg-slate-900 text-[10px] break-all font-mono text-slate-800 dark:text-slate-200">
                                        {GITLAB_OAUTH_CALLBACK}
                                    </code>
                                </p>
                                <InputField
                                    label="Application ID"
                                    id="modal_gitlab_client_id"
                                    value={settings.gitlab_client_id}
                                    onChange={handleChange('gitlab_client_id')}
                                    placeholder="OAuth application ID"
                                />
                                <InputField
                                    label="Application Secret"
                                    id="modal_gitlab_client_secret"
                                    type="password"
                                    value={settings.gitlab_client_secret}
                                    onChange={handleChange('gitlab_client_secret')}
                                    placeholder={settings.gitlab_client_secret_set ? 'Unchanged if left blank — paste to replace' : 'Secret'}
                                />
                            </div>
                        </details>
                    </div>
                </>
            )}
        </div>
    );

    const renderGithubModalBody = () => (
        <div className="space-y-5">
            {settings.github_token_configured ? (
                <div className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/25 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Connected to GitHub</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">OAuth or personal access token is stored on the server.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleDisconnectGithub}
                        disabled={githubDisconnectBusy}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 bg-white/80 dark:bg-slate-900/80 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 shrink-0"
                    >
                        {githubDisconnectBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                        Disconnect
                    </button>
                </div>
            ) : (
                <>
                    <InputField
                        label="Personal Access Token (optional)"
                        id="modal_github_token"
                        type="password"
                        value={settings.github_token}
                        onChange={handleChange('github_token')}
                        placeholder="ghp_..."
                        helpText="Or use Connect with GitHub below. Needs repo (and read:org if applicable)."
                    />
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Sign in with GitHub</p>
                        {settings.github_publisher_oauth && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                This build can use GitHub OAuth without pasting a Client ID or Secret (bundled credentials or a hosted bridge configured by the publisher).
                            </p>
                        )}
                        {!settings.github_oauth_ready && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400/90 leading-relaxed">
                                OAuth is not configured. Use a personal access token above, or open &quot;Custom OAuth app&quot; below.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={connectGithubOAuth}
                            disabled={oauthGithubBusy || !settings.github_oauth_ready}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            {oauthGithubBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                            {oauthGithubBusy ? 'Waiting for browser…' : 'Connect with GitHub'}
                        </button>
                        <details className="group border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
                            <summary className="text-[11px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer list-none">Custom OAuth app (optional)</summary>
                            <div className="mt-3 space-y-3">
                                {oauthBridgeBaseUrl ? (
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        This build uses a hosted GitHub OAuth bridge. Set the authorization callback URL (exactly):
                                        <code className="block mt-1 p-2 rounded bg-slate-100 dark:bg-slate-900 text-[10px] break-all font-mono text-slate-800 dark:text-slate-200">
                                            {`${oauthBridgeBaseUrl}/github/callback`}
                                        </code>
                                    </p>
                                ) : (
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Create a GitHub OAuth App and set this authorization callback URL (exactly):
                                        <code className="block mt-1 p-2 rounded bg-slate-100 dark:bg-slate-900 text-[10px] break-all font-mono text-slate-800 dark:text-slate-200">
                                            {GITHUB_OAUTH_CALLBACK}
                                        </code>
                                    </p>
                                )}
                                <InputField
                                    label="Client ID"
                                    id="modal_github_client_id"
                                    value={settings.github_client_id}
                                    onChange={handleChange('github_client_id')}
                                    placeholder="Iv1.…"
                                />
                                <InputField
                                    label="Client Secret"
                                    id="modal_github_client_secret"
                                    type="password"
                                    value={settings.github_client_secret}
                                    onChange={handleChange('github_client_secret')}
                                    placeholder={settings.github_client_secret_set ? 'Unchanged if left blank — paste to replace' : 'Secret'}
                                />
                            </div>
                        </details>
                    </div>
                </>
            )}
        </div>
    );

    const renderLlmModalBody = () => {
        const providerMeta = LLM_PROVIDERS.find((p) => p.id === settings.ai_provider);
        return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                {providerMeta?.iconSrc ? (
                    <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
                        <BrandIcon
                            src={providerMeta.iconSrc}
                            alt=""
                            tone={providerMeta.iconTone}
                            className="w-6 h-6 object-contain"
                        />
                    </div>
                ) : null}
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Provider:{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-300">{providerMeta?.label || settings.ai_provider}</span>
                </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
                {availableModels.length > 0 ? (
                    <SelectField
                        label="Model"
                        id="modal_ai_model"
                        value={settings.ai_model}
                        onChange={handleChange('ai_model')}
                        options={[
                            ...availableModels.map((m) => ({ value: m, label: m })),
                            { value: settings.ai_model, label: `Current: ${settings.ai_model}` },
                        ]}
                        secondaryAction={
                            <button
                                type="button"
                                onClick={() => fetchAvailableModels(settings.ai_provider, settings.ai_base_url, settings.ai_api_key)}
                                className="text-[10px] font-bold text-accent hover:text-accent-glow flex items-center gap-1 transition-colors"
                                disabled={fetchingModels}
                            >
                                <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                                {fetchingModels ? 'Fetching...' : 'Refresh'}
                            </button>
                        }
                    />
                ) : (
                    <InputField
                        label="Model name"
                        id="modal_ai_model_text"
                        value={settings.ai_model}
                        onChange={handleChange('ai_model')}
                        placeholder={settings.ai_provider.includes('ollama') ? 'qwen2.5-coder:32b' : 'gpt-4o'}
                        secondaryAction={
                            <button
                                type="button"
                                onClick={() => fetchAvailableModels(settings.ai_provider, settings.ai_base_url, settings.ai_api_key)}
                                className="text-[10px] font-bold text-accent hover:text-accent-glow flex items-center gap-1 transition-colors"
                                disabled={fetchingModels}
                            >
                                <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                                {fetchingModels ? 'Fetching...' : 'Fetch models'}
                            </button>
                        }
                    />
                )}
                <InputField
                    label={settings.ai_provider.includes('ollama') ? 'Ollama URL' : 'API base URL (optional)'}
                    id="modal_ai_base_url"
                    type="url"
                    value={settings.ai_base_url}
                    onChange={handleChange('ai_base_url')}
                    placeholder={
                        settings.ai_provider === 'ollama_cloud'
                            ? OLLAMA_CLOUD_BASE_URL
                            : settings.ai_provider.includes('ollama')
                              ? 'http://localhost:11434'
                              : 'https://api.openai.com/v1'
                    }
                    helpText={settings.ai_provider === 'ollama_cloud' ? 'Ollama Cloud endpoint is fixed to https://ollama.com' : ''}
                    secondaryAction={
                        settings.ai_provider === 'ollama_cloud' ? (
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Fixed</span>
                        ) : null
                    }
                    disabled={settings.ai_provider === 'ollama_cloud'}
                />
                <InputField
                    label="API key"
                    id="modal_ai_api_key"
                    type="password"
                    value={settings.ai_api_key}
                    onChange={handleChange('ai_api_key')}
                    placeholder={settings.ai_provider.includes('ollama') ? 'Optional for local' : 'sk-...'}
                    helpText={settings.ai_provider === 'ollama_cloud' ? 'Required for Ollama Cloud' : ''}
                />
            </div>
        </div>
        );
    };

    const openLlmModalFor = (providerId) => {
        if (settings.ai_provider !== providerId) {
            selectAiProvider(providerId);
        }
        setLlmModalOpen(true);
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in pb-8">
            {connectionModal === 'github' && (
                <Modal title="GitHub connection" onClose={() => setConnectionModal(null)}>
                    {renderGithubModalBody()}
                </Modal>
            )}
            {connectionModal === 'gitlab' && (
                <Modal title="GitLab connection" onClose={() => setConnectionModal(null)}>
                    {renderGitlabModalBody()}
                </Modal>
            )}
            {llmModalOpen && (
                <Modal title="LLM provider details" onClose={() => setLlmModalOpen(false)}>
                    {renderLlmModalBody()}
                </Modal>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 transition-colors duration-300">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <SettingsIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                            Application Settings
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Configure Git providers, LLM, and review parameters in one place.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-10 max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {successMessage && (
                        <div className="p-3.5 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-lg flex items-center gap-3 animate-fade-in">
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            <span className="text-xs font-bold text-green-700 dark:text-green-400">{successMessage}</span>
                        </div>
                    )}

                    {error && (
                        <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center gap-3 animate-fade-in">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            <span className="text-xs font-bold text-red-700 dark:text-red-400">{error}</span>
                        </div>
                    )}

                    {/* Connection */}
                    <section>
                        <SectionHeader title="Connection" description="Git hosting credentials and OAuth." />
                        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 max-w-fit">
                            <button
                                type="button"
                                onClick={() => setConnectionModal('github')}
                                className="group relative flex flex-col items-stretch aspect-square max-w-[150px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-4 text-left shadow-sm hover:border-primary-300 dark:hover:border-primary-600 hover:bg-white dark:hover:bg-slate-800/80 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            >
                                <div className="p-2 rounded-xl bg-white dark:bg-slate-800/90 ring-1 ring-slate-200/80 dark:ring-slate-600 flex items-center justify-center w-fit shrink-0">
                                    <BrandIcon src={githubBrand} alt="GitHub" className="w-14 h-14 object-contain" />
                                </div>
                                <span className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100 text-left">GitHub</span>
                                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                                    {settings.github_token_configured ? (
                                        <StatusChip tone="success">Connected</StatusChip>
                                    ) : (
                                        <StatusChip tone="muted">Not configured</StatusChip>
                                    )}
                                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400 group-hover:underline shrink-0">Config</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setConnectionModal('gitlab')}
                                className="group relative flex flex-col items-stretch aspect-square max-w-[150px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-4 text-left shadow-sm hover:border-primary-300 dark:hover:border-primary-600 hover:bg-white dark:hover:bg-slate-800/80 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            >
                                <div className="p-2 rounded-xl bg-white dark:bg-slate-800/90 ring-1 ring-slate-200/80 dark:ring-slate-600 flex items-center justify-center w-fit shrink-0">
                                    <BrandIcon src={gitlabBrand} alt="GitLab" className="w-14 h-14 object-contain" />
                                </div>
                                <span className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100 text-left">GitLab</span>
                                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                                    {settings.gitlab_token_configured ? (
                                        <StatusChip tone="success">Connected</StatusChip>
                                    ) : (
                                        <StatusChip tone="muted">-</StatusChip>
                                    )}
                                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400 group-hover:underline shrink-0">Config</span>
                                </div>
                            </button>
                        </div>
                    </section>

                    {/* LLM Provider */}
                    <section>
                        <SectionHeader title="LLM provider" description="Choose the active model backend. Green border marks the selected provider." />
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {LLM_PROVIDERS.map(({ id, label, iconSrc, iconTone }) => {
                                const selected = settings.ai_provider === id;
                                const configured = isLlmConfigured(id);
                                return (
                                    <div
                                        key={id}
                                        className={`relative flex flex-col aspect-square justify-center items-center rounded-2xl border-2 p-3 transition-all ${
                                            selected
                                                ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm'
                                                : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => selectAiProvider(id)}
                                            className="absolute inset-0 rounded-2xl z-0 w-full h-full"
                                            aria-pressed={selected}
                                            aria-label={`Select ${label}`}
                                        />
                                        <div className="relative z-10 flex flex-col flex-1 min-h-0 h-full w-full justify-center items-center pointer-events-none">
                                            <div className="p-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 ring-1 ring-slate-200/70 dark:ring-slate-600 flex items-center justify-center w-fit shrink-0">
                                                <BrandIcon src={iconSrc} alt="" tone={iconTone} className="w-16 h-16 object-contain" />
                                            </div>
                                            <p className="mt-2 text-[11px] font-bold text-slate-900 dark:text-slate-100 leading-tight text-left">{label}</p>
                                            <div className="mt-auto flex items-center justify-between gap-1 pt-2 min-w-0 w-full">
                                                {configured ? (
                                                    <StatusChip tone="success">Configured</StatusChip>
                                                ) : selected && llmNeedsApiKey(id) ? (
                                                    <StatusChip tone="warn">Needs key</StatusChip>
                                                ) : (
                                                    <StatusChip tone="muted">{selected ? 'Active' : '—'}</StatusChip>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openLlmModalFor(id);
                                                    }}
                                                    className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors pointer-events-auto z-20"
                                                    title="Edit provider details"
                                                    aria-label={`Configure ${label}`}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Additional */}
                    <section>
                        <SectionHeader title="Additional settings" description="Context window and review behavior." />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <InputField
                                label="Context length (max tokens)"
                                id="max_tokens"
                                type="number"
                                value={settings.max_tokens}
                                onChange={handleChange('max_tokens')}
                                min={1000}
                                max={1000000}
                                helpText="Upper bound on how much code and context is sent to the model."
                            />
                            <InputField
                                label="Review runs per PR"
                                id="review_runs"
                                type="number"
                                value={settings.review_runs}
                                onChange={handleChange('review_runs')}
                                min={1}
                                max={5}
                                helpText="How many independent AI review passes to run (higher = slower, more thorough)."
                            />
                        </div>
                    </section>

                    <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary-200 dark:shadow-none transition-all duration-200"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="animate-spin w-4 h-4" />
                                    <span>Saving settings…</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    <span>Save configuration</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Settings;
