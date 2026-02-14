import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { reviewService } from '../services/api';
import SuggestionCard from './SuggestionCard';
import DiffView from './DiffView';
import PRDescriptionViewer from './PRDescriptionViewer';
import ChatDrawer from './ChatDrawer';
import { exportPRToHTML } from '../utils/exportUtils';
import {
    ArrowLeft,
    GitMerge,
    User,
    Code,
    Loader2,
    Github,
    GitBranch,
    AlertCircle,
    Info,
    CheckCircle2,
    XCircle,
    Clock,
    Activity,
    FileCode,
    BarChart3,
    ExternalLink,
    AlertTriangle,
    ShieldCheck,
    ShieldAlert,
    Zap,
    Layout as LayoutIcon,
    ChevronDown,
    ChevronUp,
    MessageSquare,
    Download
} from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

const PRDetail = () => {
    const { id } = useParams();
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [extending, setExtending] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('description');
    const prevStatusRef = useRef(null);

    useEffect(() => {
        const initNotification = async () => {
            let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) {
                const permission = await requestPermission();
                permissionGranted = permission === 'granted';
            }
        };
        initNotification();
    }, []);

    useEffect(() => {
        const notifyCompletion = async () => {
            if (review?.status === 'completed' && prevStatusRef.current && prevStatusRef.current !== 'completed') {
                const permissionGranted = await isPermissionGranted();
                if (permissionGranted) {
                    sendNotification({ title: 'PR Review Complete', body: `Review for ${review.pr_title || 'PR'} is ready!` });
                }
            }
            prevStatusRef.current = review?.status;
        };
        notifyCompletion();
    }, [review?.status]);

    useEffect(() => {
        loadReview();
        const interval = setInterval(() => {
            if (review?.status !== 'completed' && review?.status !== 'failed') {
                loadReview();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [id, review?.status]);

    const loadReview = async () => {
        try {
            const data = await reviewService.getReviewDetail(id);
            setReview(data);
        } catch (err) {
            console.error('Failed to load review:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExtend = async () => {
        if (!review || extending) return;

        setExtending(true);
        try {
            await reviewService.extendReview(id);
            // After triggering, reload review to show pending status
            await loadReview();
        } catch (err) {
            console.error('Failed to extend review:', err);
            alert('Failed to trigger additional suggestions. Please try again.');
        } finally {
            setExtending(false);
        }
    };

    const metrics = useMemo(() => {
        if (!review?.suggestions) return null;

        const counts = {
            error: 0,
            warning: 0,
            info: 0,
            security: 0,
            bug: 0,
            performance: 0,
            style: 0,
            best_practice: 0,
            score: review.score,
            effort: review.effort,
            security_concerns: review.security_concerns
        };

        review.suggestions.forEach(s => {
            const sev = (s.severity || 'info').toLowerCase();
            const cat = (s.category || 'best_practice').toLowerCase();

            if (counts.hasOwnProperty(sev)) counts[sev]++;
            if (counts.hasOwnProperty(cat)) counts[cat]++;
        });

        return counts;
    }, [review]);

    const groupedSuggestions = useMemo(() => {
        if (!review?.suggestions) return {};
        const groups = {};
        review.suggestions.forEach(s => {
            const cat = (s.category || 'best_practice').toLowerCase();
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(s);
        });
        return groups;
    }, [review]);

    const [expandedSuggestions, setExpandedSuggestions] = useState({});

    const toggleSuggestion = (id) => {
        setExpandedSuggestions(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    if (loading && !review) {
        return (
            <div className="flex flex-col justify-center items-center h-96 animate-fade-in">
                <div className="w-10 h-10 border-4 border-primary-100 dark:border-primary-900/30 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 font-medium">Fetching review details...</p>
            </div>
        );
    }

    if (!review) {
        return (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in transition-colors duration-300">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full mb-4">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Review not found</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">The review you're looking for doesn't exist or has been deleted.</p>
                <Link to="/history" className="mt-6 inline-flex items-center gap-2 text-primary-600 dark:text-primary-400 font-bold hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to History
                </Link>
            </div>
        );
    }

    const tabs = [
        { id: 'description', label: 'PR Description', icon: FileCode },
        { id: 'suggestions', label: 'Suggestions', icon: Zap }
    ];

    return (
        <div className='h-full overflow-hidden overflow-y-auto'>
            <div className={`flex h-fulloverflow-y-auto ${isChatOpen ? 'w-[67%]' : 'w-full'} `}>
                <div className="flex-1  p-6 space-y-6 animate-fade-in scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 max-w-6xl mx-auto w-full">
                    {/* Header Section */}
                    <div className="flex flex-col gap-4">
                        <Link to="/history" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors w-fit">
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to History
                        </Link>

                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                            <div className="p-6">
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                                    <div className="space-y-3.5 flex-1">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                                {review.pr_title || 'Analyzing Pull Request...'}
                                            </h1>
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${review.provider === 'github' ? 'bg-slate-900 dark:bg-slate-700 text-white' : 'bg-orange-500 text-white'
                                                }`}>
                                                {review.provider === 'github' ? <Github className="w-3 h-3" /> : <GitBranch className="w-3 h-3" />}
                                                {review.provider}
                                            </span>
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${review.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-900/30' :
                                                review.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/30' :
                                                    'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-100 dark:border-primary-900/30'
                                                }`}>
                                                {review.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> :
                                                    review.status === 'failed' ? <XCircle className="w-3 h-3" /> :
                                                        <Loader2 className="w-3 h-3 animate-spin" />}
                                                {review.status}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-y-2.5 gap-x-5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                            <div className="flex items-center gap-1.5">
                                                <GitMerge className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                <span className="text-slate-900 dark:text-slate-200">{review.source_branch}</span>
                                                <span className="text-slate-300 dark:text-slate-700">→</span>
                                                <span className="text-slate-900 dark:text-slate-200">{review.target_branch}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                <span>{review.pr_author || 'Unknown Author'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Code className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                <span>{review.project_name || 'Project'} #{review.pr_number}</span>
                                            </div>
                                            <a
                                                href={review.pr_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                                            >
                                                View Original <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Metrics */}
                                {review.status === 'completed' && metrics && (
                                    <div className="space-y-5 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors duration-300">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                                            <div className="p-3.5 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Review Score</span>
                                                    <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                                                </div>
                                                <div className="text-xl font-bold text-red-700 dark:text-red-300">{metrics.score || 'N/A'}<span className="text-xs font-normal text-red-400">/100</span></div>
                                            </div>
                                            <div className="p-3.5 bg-yellow-50/50 dark:bg-yellow-900/10 rounded-xl border border-yellow-100 dark:border-yellow-900/20">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Review Effort</span>
                                                    <Activity className="w-3.5 h-3.5 text-yellow-500" />
                                                </div>
                                                <div className="text-xl font-bold text-yellow-700 dark:text-yellow-300">{metrics.effort || 'N/A'}<span className="text-xs font-normal text-yellow-400">/5</span></div>
                                            </div>
                                            <div className="p-3.5 bg-primary-50/50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/20">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Critical Issues</span>
                                                    <AlertCircle className="w-3.5 h-3.5 text-primary-500" />
                                                </div>
                                                <div className="text-xl font-bold text-primary-700 dark:text-primary-300">{metrics.error}</div>
                                            </div>
                                            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Total Suggestions</span>
                                                    <BarChart3 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                                </div>
                                                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{review.suggestions.length}</div>
                                            </div>
                                        </div>

                                        {metrics.security_concerns && (
                                            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl animate-fade-in">
                                                <div className="flex items-start gap-2.5">
                                                    <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5" />
                                                    <div>
                                                        <h5 className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">Security Concerns Identified</h5>
                                                        <p className="text-xs text-red-600 dark:text-red-300 font-medium leading-relaxed">{metrics.security_concerns}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Content Tabs */}
                    <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit transition-colors duration-300">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-bold transition-all ${activeTab === tab.id
                                            ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm dark:shadow-none'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        <tab.icon className="w-3.5 h-3.5" />
                                        {tab.label}
                                        {tab.id === 'suggestions' && review.suggestions.length > 0 && (
                                            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === tab.id ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}>
                                                {review.suggestions.length}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-[400px]">
                            {activeTab === 'suggestions' && (
                                <div className="space-y-5 animate-fade-in">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex flex-col gap-0.5">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                                PR Code Suggestions ✨
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">Explore these optional code suggestions:</p>
                                        </div>

                                        {review.status === 'completed' && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => exportPRToHTML(review)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold transition-all shadow-sm"
                                                    title="Export PR details to HTML"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Export
                                                </button>
                                                <button
                                                    onClick={() => setIsChatOpen(true)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold transition-all shadow-sm"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                    Ask
                                                </button>
                                                <button
                                                    onClick={handleExtend}
                                                    disabled={extending}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-lg text-sm font-bold transition-all shadow-sm shadow-primary-200 dark:shadow-none"
                                                >
                                                    {extending ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            Requesting...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Zap className="w-4 h-4" />
                                                            Generate More Suggestions
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors duration-300">
                                        {review.suggestions.length === 0 ? (
                                            <div className="p-10 text-center">
                                                {review.status === 'reviewing' ? (
                                                    <div className="space-y-3.5">
                                                        <div className="w-10 h-10 border-4 border-primary-100 dark:border-primary-900/30 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin mx-auto"></div>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">AI is currently analyzing the code changes...</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="inline-flex items-center justify-center w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-full mb-2">
                                                            <ShieldCheck className="w-6 h-6 text-green-500" />
                                                        </div>
                                                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No issues detected!</h3>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">Your code changes look solid. No specific suggestions were generated by the AI agent.</p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
                                                            <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-r border-slate-200 dark:border-slate-800 w-28">Category</th>
                                                            <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-r border-slate-200 dark:border-slate-800">Suggestion</th>
                                                            <th className="px-5 py-3 text-center text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest w-28">Impact</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors duration-300">
                                                        {Object.entries(groupedSuggestions).map(([category, suggestions]) => (
                                                            <React.Fragment key={category}>
                                                                {suggestions.map((s, idx) => (
                                                                    <React.Fragment key={s.id}>
                                                                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                                            {idx === 0 && (
                                                                                <td
                                                                                    rowSpan={suggestions.length}
                                                                                    className="px-5 py-3 text-[13px] font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 capitalize align-top"
                                                                                >
                                                                                    {category.replace('_', ' ')}
                                                                                </td>
                                                                            )}
                                                                            <td className="px-5 py-3 border-r border-slate-200 dark:border-slate-800">
                                                                                <button
                                                                                    onClick={() => toggleSuggestion(s.id)}
                                                                                    className="flex items-center gap-2 w-full text-left font-medium text-[13px] text-slate-700 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group"
                                                                                >
                                                                                    {expandedSuggestions[s.id] ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                                                                                    <span className="flex-1">{s.suggestion.split('\n')[0]}</span>
                                                                                </button>

                                                                                {expandedSuggestions[s.id] && (
                                                                                    <div className="mt-3.5 pl-5 space-y-3.5 animate-fade-in">
                                                                                        <div className="h-px bg-slate-100 dark:bg-slate-800" />
                                                                                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                                                                            {s.explanation || s.suggestion}
                                                                                        </p>
                                                                                        <div className="flex items-center gap-4 text-[11px] font-mono">
                                                                                            <a
                                                                                                href={`${review.pr_url}/files#diff-${s.file_path}`}
                                                                                                target="_blank"
                                                                                                rel="noreferrer"
                                                                                                className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 hover:underline"
                                                                                            >
                                                                                                <FileCode className="w-3 h-3" />
                                                                                                {s.file_path}:{s.line_start}{s.line_end !== s.line_start ? `-${s.line_end}` : ''}
                                                                                            </a>
                                                                                        </div>
                                                                                        {(s.original_code || s.improved_code) && (
                                                                                            <DiffView oldCode={s.original_code} newCode={s.improved_code} />
                                                                                        )}
                                                                                        {s.score && (
                                                                                            <div className="pt-1.5">
                                                                                                <details className="text-[11px] group">
                                                                                                    <summary className="cursor-pointer font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                                                                                                        Suggestion importance[1-10]: {s.score}
                                                                                                    </summary>
                                                                                                    <div className="mt-1.5 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 leading-relaxed">
                                                                                                        {s.score_why || "The score reflects the impact of this change on code quality, security, or performance."}
                                                                                                    </div>
                                                                                                </details>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-5 py-3 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${(s.score >= 9) ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30' :
                                                                                    (s.score >= 7) ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-900/30' :
                                                                                        'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700'
                                                                                    }`}>
                                                                                    {s.score >= 9 ? 'High' : s.score >= 7 ? 'Medium' : 'Low'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    </React.Fragment>
                                                                ))}
                                                            </React.Fragment>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'description' && (
                                <div className="space-y-6 animate-fade-in">
                                    {/* PR Description Section */}
                                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                                        <div className="p-6">
                                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">AI Generated PR Description</h3>
                                            {review.pr_description ? (
                                                <PRDescriptionViewer description={review.pr_description} />
                                            ) : (
                                                <div className="text-center py-10">
                                                    <Info className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">No AI-generated description available for this review.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Timeline Section */}
                                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                                        <div className="p-6">
                                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-5">Processing Timeline</h3>
                                            <div className="space-y-6 relative before:absolute before:inset-0 before:left-[9px] before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                                                {review.processing_logs?.map((log, index) => (
                                                    <div key={index} className="relative pl-7">
                                                        <div className={`absolute left-0 top-1 w-5 h-5 rounded-full border-4 border-white dark:border-slate-900 shadow-sm flex items-center justify-center transition-colors duration-300 ${log.level === 'error' ? 'bg-red-500' :
                                                            log.level === 'warning' ? 'bg-yellow-500' : 'bg-primary-500'
                                                            }`}>
                                                            {log.level === 'error' ? <XCircle className="w-2.5 h-2.5 text-white" /> :
                                                                log.level === 'warning' ? <AlertTriangle className="w-2.5 h-2.5 text-white" /> :
                                                                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{log.message}</span>
                                                                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                            </div>
                                                            {log.level === 'error' && (
                                                                <div className="mt-1.5 p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg text-[11px] text-red-700 dark:text-red-400 font-mono border border-red-100 dark:border-red-900/30">
                                                                    {review.error_message}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}

                                                {(!review.processing_logs || review.processing_logs.length === 0) && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No timeline data available.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <ChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                reviewId={id}
                prTitle={review.pr_title}
            />
        </div>
    );
};

export default PRDetail;
