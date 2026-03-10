import React, { useState, useEffect,useCallback  } from 'react';
import { Settings as SettingsIcon, Save,RefreshCw, Loader2, CheckCircle, AlertCircle, Shield, Github, GitBranch, Cpu } from 'lucide-react';
import { settingsService } from '../services/api';

const SectionHeader = ({ icon: Icon, title, description }) => (
    <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
            <Icon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h4>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
);

const InputField = ({ label, id, type = "text", value, onChange, placeholder, helpText, min, max, secondaryAction, disabled = false, readOnly = false }) => (
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
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
        {helpText && <p className="text-[10px] text-slate-400 font-medium">{helpText}</p>}
    </div>
);

const CATEGORIES = [
    { id: 'gitlab', label: 'GitLab', icon: GitBranch },
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'ai', label: 'AI / LLM', icon: Cpu }
];

const Settings = () => {
    const [activeCategory, setActiveCategory] = useState('gitlab');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [availableModels, setAvailableModels] = useState([]);
    const [settings, setSettings] = useState({
        gitlab_url: 'https://gitlab.com',
        gitlab_token: '',
        github_token: '',
        github_client_id: '',
        github_client_secret: '',
        ai_provider: 'ollama',
        ai_model: 'gemini-1.5-flash-latest',
        ai_api_key: '',
        ai_base_url: 'http://localhost:11434',
        max_tokens: 128000,
        review_runs: 1
    });

    const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com';

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
            const data = await settingsService.getSettings();
            setSettings(data);
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
        setSuccess(false);
        setError(null);

        try {
            await settingsService.updateSettings(settings);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
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
        setSettings(prev => ({ ...prev, [field]: nextValue }));
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center h-96 animate-fade-in">
                <div className="w-10 h-10 border-4 border-primary-100 dark:border-primary-900/30 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin"></div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 font-medium">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 transition-colors duration-300">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <SettingsIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                            Application Settings
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                            Configure your Git providers and local LLM environment.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {success && (
                        <div className="mb-6 p-3.5 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-lg flex items-center gap-3 animate-fade-in">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-xs font-bold text-green-700 dark:text-green-400">Settings saved successfully!</span>
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center gap-3 animate-fade-in">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            <span className="text-xs font-bold text-red-700 dark:text-red-400">{error}</span>
                        </div>
                    )}

                    {/* Category tabs */}
                    <div className="flex gap-1 p-1 mb-6 bg-slate-100 dark:bg-slate-800/50 rounded-lg w-fit">
                        {CATEGORIES.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setActiveCategory(id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeCategory === id
                                    ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-10 min-h-[360px]">
                        {/* GitLab Settings */}
                        {activeCategory === 'gitlab' && (
                        <section>
                                <SectionHeader
                                    icon={GitBranch}
                                    title="GitLab Configuration"
                                    description="Setup your GitLab credentials for merge request analysis."
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField
                                        label="GitLab URL"
                                        id="gitlab_url"
                                        type="url"
                                        value={settings.gitlab_url}
                                        onChange={handleChange('gitlab_url')}
                                        placeholder="https://gitlab.com"
                                        helpText="Default is gitlab.com"
                                    />
                                    <InputField
                                        label="Personal Access Token"
                                        id="gitlab_token"
                                        type="password"
                                        value={settings.gitlab_token}
                                        onChange={handleChange('gitlab_token')}
                                        placeholder="glpat-..."
                                        helpText="Token must have 'api' scope"
                                    />
                                </div>
                            </section>
                        )}

                        {/* GitHub Settings */}
                        {activeCategory === 'github' && (
                        <section>
                                <SectionHeader
                                    icon={Github}
                                    title="GitHub Configuration"
                                    description="Connect your GitHub account for pull request reviews."
                                />
                            <div className="space-y-5">
                                    <InputField
                                        label="Personal Access Token"
                                        id="github_token"
                                        type="password"
                                        value={settings.github_token}
                                        onChange={handleChange('github_token')}
                                        placeholder="ghp_..."
                                        helpText="Token with 'repo' and 'read:org' permissions"
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField
                                            label="OAuth Client ID (Optional)"
                                            id="github_client_id"
                                            value={settings.github_client_id}
                                            onChange={handleChange('github_client_id')}
                                            placeholder="OAuth ID"
                                        />
                                        <InputField
                                            label="OAuth Client Secret (Optional)"
                                            id="github_client_secret"
                                            value={settings.github_client_secret}
                                            onChange={handleChange('github_client_secret')}
                                            placeholder="OAuth Secret"
                                        />
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* LLM Settings */}
                        {activeCategory === 'ai' && (
                        <section>
                                <SectionHeader
                                    icon={Cpu}
                                    title="AI Provider Configuration"
                                    description="Configure your AI engine and model parameters."
                                />
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <SelectField
                                            label="AI Provider"
                                            id="ai_provider"
                                            value={settings.ai_provider}
                                            onChange={(e) => {
                                                const newProvider = e.target.value;
                                                setSettings(prev => {
                                                    const next = { ...prev, ai_provider: newProvider };
                                                    if (newProvider === 'ollama_cloud') {
                                                        next.ai_base_url = OLLAMA_CLOUD_BASE_URL;
                                                    } else if (newProvider === 'ollama' && (!prev.ai_base_url || prev.ai_base_url === OLLAMA_CLOUD_BASE_URL)) {
                                                        next.ai_base_url = 'http://localhost:11434';
                                                    }
                                                    return next;
                                                });
                                                const baseUrl = newProvider === 'ollama_cloud' ? OLLAMA_CLOUD_BASE_URL : settings.ai_base_url;
                                                fetchAvailableModels(newProvider, baseUrl, settings.ai_api_key);
                                            }}
                                            options={[
                                                { value: 'ollama', label: 'Ollama (Local)' },
                                                { value: 'ollama_cloud', label: 'Ollama Cloud' },
                                                { value: 'openai', label: 'OpenAI' },
                                                { value: 'anthropic', label: 'Anthropic (Claude)' },
                                                { value: 'gemini', label: 'Google Gemini' }
                                            ]}
                                        />

                                        {availableModels.length > 0 ? (
                                            <SelectField
                                                label="Model Selection"
                                                id="ai_model"
                                                value={settings.ai_model}
                                                onChange={handleChange('ai_model')}
                                                options={[
                                                    ...availableModels.map(m => ({ value: m, label: m })),
                                                    { value: settings.ai_model, label: `Current: ${settings.ai_model}` }
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
                                                label="Model Name"
                                                id="ai_model"
                                                value={settings.ai_model}
                                                onChange={handleChange('ai_model')}
                                                placeholder={settings.ai_provider.includes('ollama') ? "qwen2.5-coder:32b" : "gpt-4o"}
                                                secondaryAction={
                                                    <button
                                                        type="button"
                                                        onClick={() => fetchAvailableModels(settings.ai_provider, settings.ai_base_url, settings.ai_api_key)}
                                                        className="text-[10px] font-bold text-accent hover:text-accent-glow flex items-center gap-1 transition-colors"
                                                        disabled={fetchingModels}
                                                    >
                                                        <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                                                        {fetchingModels ? 'Fetch Models' : 'Fetch Models'}
                                                    </button>
                                                }
                                            />
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField
                                            label={settings.ai_provider.includes('ollama') ? "Ollama URL" : "API Base URL (Optional)"}
                                            id="ai_base_url"
                                            type="url"
                                            value={settings.ai_base_url}
                                            onChange={handleChange('ai_base_url')}
                                            placeholder={settings.ai_provider === 'ollama_cloud' ? OLLAMA_CLOUD_BASE_URL : (settings.ai_provider.includes('ollama') ? "http://localhost:11434" : "https://api.openai.com/v1")}
                                            helpText={settings.ai_provider === 'ollama_cloud' ? "Ollama Cloud endpoint is fixed to https://ollama.com" : ""}
                                            secondaryAction={settings.ai_provider === 'ollama_cloud' ? (
                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Fixed</span>
                                            ) : null}
                                            disabled={settings.ai_provider === 'ollama_cloud'}
                                        />

                                        <InputField
                                            label="API Key"
                                            id="ai_api_key"
                                            type="password"
                                            value={settings.ai_api_key}
                                            onChange={handleChange('ai_api_key')}
                                            placeholder={settings.ai_provider.includes('ollama') ? "Optional for local" : "sk-..."}
                                            helpText={settings.ai_provider === 'ollama_cloud' ? "Required for Ollama Cloud" : ""}
                                        />

                                        <InputField
                                            label="Max Context Tokens"
                                            id="max_tokens"
                                            type="number"
                                            value={settings.max_tokens}
                                            onChange={handleChange('max_tokens')}
                                            min={1000}
                                            max={1000000}
                                            helpText="Limits the amount of code sent to the AI"
                                        />

                                        <InputField
                                            label="Review runs per PR"
                                            id="review_runs"
                                            type="number"
                                            value={settings.review_runs}
                                            onChange={handleChange('review_runs')}
                                            min={1}
                                            max={5}
                                            helpText="How many independent AI review passes to run (higher = slower, more thorough)"
                                        />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="mt-12 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary-200 dark:shadow-none transition-all duration-200"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="animate-spin w-4 h-4" />
                                    <span>Saving Settings...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    <span>Save Configuration</span>
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
