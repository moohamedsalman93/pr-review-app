import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Loader2,
    Github,
    GitBranch,
    ArrowRight,
    CheckCircle2,
    AlertCircle,
    Info,
    Sparkles,
    ChevronDown,
    BookOpen,
    RefreshCw
} from 'lucide-react';
import { reviewService, ruleSetService } from '../services/api';

const PRForm = () => {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [ruleSets, setRuleSets] = useState([]);
    const [selectedRuleSet, setSelectedRuleSet] = useState('');
    const [loadingRuleSets, setLoadingRuleSets] = useState(true);
    const [recentPRs, setRecentPRs] = useState([]);
    const [loadingRecentPRs, setLoadingRecentPRs] = useState(false);
    const [recentError, setRecentError] = useState('');
    const [showRecentPopup, setShowRecentPopup] = useState(false);
    const [recentTargetType, setRecentTargetType] = useState('pr');
    const recentPopupRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const loadRuleSets = async () => {
            try {
                const data = await ruleSetService.getRuleSets();
                setRuleSets(data);
            } catch (err) {
                console.error('Failed to load rule sets:', err);
            } finally {
                setLoadingRuleSets(false);
            }
        };
        loadRuleSets();
    }, []);

    const fetchRecentPRs = async (targetType = recentTargetType) => {
        setLoadingRecentPRs(true);
        setRecentError('');
        try {
            const data = await reviewService.getRecentPRs(3, null, targetType);
            setRecentPRs((data.items || []).slice(0, 3));
        } catch (err) {
            console.error('Failed to fetch recent PRs:', err);
            setRecentError(`Unable to fetch recent ${targetType === 'commit' ? 'commits' : 'PRs'} right now. Check provider connection in Settings.`);
        } finally {
            setLoadingRecentPRs(false);
        }
    };

    // Detect provider from URL
    const detectedProvider = useMemo(() => {
        if (!url) return null;
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('github.com')) return 'github';
        if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab')) return 'gitlab';
        return null;
    }, [url]);

    const isValidUrl = useMemo(() => {
        if (!url) return true;
        try {
            new URL(url);
            const lowerUrl = url.toLowerCase();
            const isProvider = lowerUrl.includes('github.com') || lowerUrl.includes('gitlab');
            const isPrOrMr = lowerUrl.includes('/pull/') || lowerUrl.includes('/merge_requests/');
            const isCommit = lowerUrl.includes('/commit/');
            return isProvider && (isPrOrMr || isCommit);
        } catch {
            return false;
        }
    }, [url]);

    const detectTargetType = (rawUrl) => {
        const lowerUrl = (rawUrl || '').toLowerCase();
        if (lowerUrl.includes('/commit/')) return 'commit';
        return 'pr';
    };

    const extractTargetRef = (rawUrl, targetType) => {
        if (!rawUrl) return null;
        if (targetType === 'commit') {
            const match = rawUrl.match(/\/commit\/([0-9a-fA-F]+)/);
            return match ? match[1] : null;
        }
        const match = rawUrl.match(/\/pull\/(\d+)|\/merge_requests\/(\d+)/);
        return match ? (match[1] || match[2]) : null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isValidUrl || !url) return;

        setLoading(true);
        setError(null);

        try {
            const ruleSetId = selectedRuleSet ? parseInt(selectedRuleSet) : null;
            const targetType = detectTargetType(url);
            const targetRef = extractTargetRef(url, targetType);
            await reviewService.submitReview(url, ruleSetId, targetType, targetRef);
            navigate('/history');
        } catch (err) {
            setError('Failed to submit review. Please check the URL and try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (recentPopupRef.current && !recentPopupRef.current.contains(event.target)) {
                setShowRecentPopup(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleToggleRecentPopup = async () => {
        const nextOpenState = !showRecentPopup;
        setShowRecentPopup(nextOpenState);
        if (nextOpenState && recentPRs.length === 0 && !loadingRecentPRs) {
            await fetchRecentPRs(recentTargetType);
        }
    };

    const switchRecentTab = async (targetType) => {
        if (targetType === recentTargetType) return;
        setRecentTargetType(targetType);
        setRecentPRs([]);
        setRecentError('');
        await fetchRecentPRs(targetType);
    };

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-50 dark:bg-primary-900/20 rounded-xl mb-4">
                    <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">New Code Review</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Submit a Pull Request URL and let our AI agent analyze your code for bugs, performance, and security.
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-visible transition-colors duration-300">
                <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="url" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Pull Request / Merge Request / Commit URL
                            </label>
                            <div className="relative group" ref={recentPopupRef}>
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <Search className={`h-4 w-4 transition-colors ${url ? 'text-primary-500' : 'text-slate-400'}`} />
                                </div>
                                <input
                                    type="url"
                                    name="url"
                                    id="url"
                                    className={`block w-full pl-10 pr-24 py-3 bg-slate-50 dark:bg-slate-800/50 border-2 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all duration-200 ${!isValidUrl && url
                                            ? 'border-red-200 dark:border-red-900/50 focus:border-red-500 focus:ring-4 focus:ring-red-50 dark:focus:ring-red-900/10'
                                            : 'border-transparent focus:border-primary-500 focus:ring-4 focus:ring-primary-50 dark:focus:ring-primary-900/10'
                                        }`}
                                    placeholder="https://github.com/owner/repo/pull/123 or /commit/<sha>"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    required
                                />

                                <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                                    <button
                                        type="button"
                                        onClick={handleToggleRecentPopup}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        Recent PRs
                                    </button>
                                </div>

                                {showRecentPopup && (
                                    <div className="absolute top-[calc(100%+8px)] right-0 w-full sm:w-[430px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-20 overflow-hidden">
                                        <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">Recent {recentTargetType === 'commit' ? 'Commits' : 'PRs'}</h3>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Pick one to add quickly</p>
                                            </div>
                                            <div className="inline-flex items-center gap-1 shrink-0">
                                                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                                                    <button
                                                        type="button"
                                                        onClick={() => switchRecentTab('pr')}
                                                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${recentTargetType === 'pr' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-300'}`}
                                                    >
                                                        PR
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => switchRecentTab('commit')}
                                                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${recentTargetType === 'commit' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-300'}`}
                                                    >
                                                        Commit
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => fetchRecentPRs(recentTargetType)}
                                                    disabled={loadingRecentPRs}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {loadingRecentPRs ? 'Loading...' : 'Reload'}
                                                </button>
                                            </div>
                                        </div>

                                        {recentError && (
                                            <div className="px-3 py-2 text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
                                                {recentError}
                                            </div>
                                        )}

                                        {!loadingRecentPRs && recentPRs.length === 0 ? (
                                            <div className="px-3 py-3 text-[11px] text-slate-500 dark:text-slate-400">
                                                No recent {recentTargetType === 'commit' ? 'commits' : 'PRs'} found.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                                                {recentPRs.map((pr) => (
                                                    <div key={`${pr.provider}-${pr.project_name}-${pr.pr_number}-${pr.web_url}`} className="px-3 py-2 flex items-start justify-between gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setUrl(pr.web_url);
                                                                setShowRecentPopup(false);
                                                            }}
                                                            className="min-w-0 text-left cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${pr.provider === 'github' ? 'bg-slate-900 dark:bg-slate-700 text-white' : 'bg-orange-500 text-white'}`}>
                                                                    {pr.provider === 'github' ? <Github className="w-2.5 h-2.5" /> : <GitBranch className="w-2.5 h-2.5" />}
                                                                    {pr.provider}
                                                                </span>
                                                                <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 truncate">
                                                                    {pr.title || 'Untitled PR'}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                                {recentTargetType === 'commit'
                                                                    ? `${pr.project_name} • ${pr.author || 'Unknown'}`
                                                                    : `${pr.project_name} #${pr.pr_number}`}
                                                            </p>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setUrl(pr.web_url);
                                                                setShowRecentPopup(false);
                                                            }}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-bold transition-colors shrink-0 cursor-pointer"
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isValidUrl && url && (
                                <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1.5 animate-fade-in">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Please enter a valid GitHub/GitLab PR, MR, or commit URL
                                </p>
                            )}
                        </div>

                        {/* Rule Set Selector */}
                        <div>
                            <label htmlFor="ruleSet" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Review Rules (Optional)
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <BookOpen className={`h-4 w-4 ${selectedRuleSet ? 'text-primary-500' : 'text-slate-400'}`} />
                                </div>
                                <select
                                    id="ruleSet"
                                    value={selectedRuleSet}
                                    onChange={(e) => setSelectedRuleSet(e.target.value)}
                                    disabled={loadingRuleSets}
                                    className="block w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-50 dark:focus:ring-primary-900/10 transition-all duration-200 appearance-none cursor-pointer"
                                >
                                    <option value="">No custom rules</option>
                                    {ruleSets.map((rs) => (
                                        <option key={rs.id} value={rs.id}>
                                            {rs.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <ChevronDown className="h-4 w-4 text-slate-400" />
                                </div>
                            </div>
                            {selectedRuleSet && ruleSets.find(rs => rs.id === parseInt(selectedRuleSet))?.description && (
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    {ruleSets.find(rs => rs.id === parseInt(selectedRuleSet))?.description}
                                </p>
                            )}
                        </div>

                        {error && (
                            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-start gap-3 animate-fade-in">
                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-red-700 dark:text-red-400 font-medium">{error}</div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !url || !isValidUrl}
                            className="w-full relative flex justify-center items-center py-3 px-5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg shadow-lg shadow-primary-200 dark:shadow-none transition-all duration-200 group"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-white" />
                                    <span>Analyzing PR...</span>
                                </>
                            ) : (
                                <>
                                    <span>Start AI Review</span>
                                    <ArrowRight className="ml-1.5 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Info Footer */}
                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors duration-300">
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span>Security Audit</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span>Performance</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span>Best Practices</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <Info className="w-3 h-3" />
                        <span>Qodo Merge</span>
                    </div>
                </div>
            </div>

            {/* Recent Activity Placeholder or Tips */}
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center gap-2">
                        <Github className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        GitHub Support
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Full support for public and private repositories. Requires a personal access token.
                    </p>
                </div>
                <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-orange-400" />
                        GitLab Support
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Supports GitLab.com and self-hosted instances. Configure URL in settings.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PRForm;
