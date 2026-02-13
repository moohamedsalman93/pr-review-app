import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reviewService } from '../services/api';
import {
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    GitMerge,
    Github,
    GitBranch,
    AlertCircle,
    ChevronRight,
    Calendar,
    User,
    ArrowUpRight,
    Search,
    Trash2
} from 'lucide-react';

const PRHistory = () => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        loadReviews();
        const interval = setInterval(loadReviews, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadReviews = async () => {
        try {
            const data = await reviewService.getReviews();
            setReviews(data.items || []);
        } catch (err) {
            console.error('Failed to load reviews:', err);
        } finally {
            setLoading(false);
        }
    };

    const [deletingId, setDeletingId] = useState(null);

    const handleDelete = async (id, e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm('Are you sure you want to delete this PR review? This action cannot be undone.')) {
            return;
        }

        setDeletingId(id);
        try {
            await reviewService.deleteReview(id);
            setReviews(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error('Failed to delete review:', err);
            alert('Failed to delete review. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    const getStatusStyles = (status) => {
        switch (status) {
            case 'completed':
                return {
                    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
                    bg: 'bg-green-50 dark:bg-green-900/20',
                    text: 'text-green-700 dark:text-green-400',
                    border: 'border-green-100 dark:border-green-900/30',
                    label: 'Completed'
                };
            case 'reviewing':
            case 'processing':
                return {
                    icon: <Loader2 className="h-4 w-4 text-primary-500 animate-spin" />,
                    bg: 'bg-primary-50 dark:bg-primary-900/20',
                    text: 'text-primary-700 dark:text-primary-400',
                    border: 'border-primary-100 dark:border-primary-900/30',
                    label: 'Analyzing'
                };
            case 'failed':
                return {
                    icon: <XCircle className="h-4 w-4 text-red-500" />,
                    bg: 'bg-red-50 dark:bg-red-900/20',
                    text: 'text-red-700 dark:text-red-400',
                    border: 'border-red-100 dark:border-red-900/30',
                    label: 'Failed'
                };
            default:
                return {
                    icon: <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />,
                    bg: 'bg-slate-50 dark:bg-slate-800/50',
                    text: 'text-slate-600 dark:text-slate-400',
                    border: 'border-slate-100 dark:border-slate-800',
                    label: 'Pending'
                };
        }
    };

    const filteredReviews = reviews.filter(r =>
        (r.pr_title || '').toLowerCase().includes(filter.toLowerCase()) ||
        (r.project_name || '').toLowerCase().includes(filter.toLowerCase()) ||
        (r.pr_url || '').toLowerCase().includes(filter.toLowerCase())
    );

    if (loading && reviews.length === 0) {
        return (
            <div className="flex flex-col justify-center items-center h-96 animate-fade-in">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-primary-100 dark:border-primary-900/30 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Search className="w-6 h-6 text-primary-600 dark:text-primary-500" />
                    </div>
                </div>
                <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">Loading your review history...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Review History</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Track and manage all your AI-powered code reviews.</p>
                </div>

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search reviews..."
                        className="block w-full md:w-72 pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-50 dark:focus:ring-primary-900/10 focus:border-primary-500 dark:focus:border-primary-500 transition-all"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pull Request</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Details</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredReviews.map((review) => {
                                const styles = getStatusStyles(review.status);
                                return (
                                    <tr key={review.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col gap-0.5 max-w-sm">
                                                <Link
                                                    to={`/review/${review.id}`}
                                                    className="text-[13px] font-bold text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate"
                                                >
                                                    {review.pr_title || "Untitled Pull Request"}
                                                </Link>
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${review.provider === 'github' ? 'bg-slate-900 dark:bg-slate-700 text-white' : 'bg-orange-500 text-white'
                                                        }`}>
                                                        {review.provider === 'github' ? <Github className="w-2.5 h-2.5" /> : <GitBranch className="w-2.5 h-2.5" />}
                                                        {review.provider}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                                                        #{review.pr_number || review.id}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${styles.bg} ${styles.text} ${styles.border}`}>
                                                {React.cloneElement(styles.icon, { className: 'w-3 h-3' })}
                                                <span className="text-[10px] font-bold">{styles.label}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-400">
                                                <GitMerge className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                <span className="font-medium truncate max-w-[150px]">
                                                    {review.project_name || 'Unknown'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                                    <User className="w-2.5 h-2.5" />
                                                    <span className="font-medium">{review.pr_author || 'Unknown'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                                    <Calendar className="w-2.5 h-2.5" />
                                                    <span>{new Date(review.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => handleDelete(review.id, e)}
                                                    disabled={deletingId === review.id}
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all group-hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Delete review"
                                                >
                                                    {deletingId === review.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                                <Link
                                                    to={`/review/${review.id}`}
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-900/50 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group-hover:shadow-sm"
                                                    title="View details"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredReviews.length === 0 && (
                    <div className="py-16 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-full mb-4">
                            <Search className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No reviews found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">
                            {filter ? `We couldn't find any reviews matching "${filter}"` : "You haven't requested any reviews yet."}
                        </p>
                        {!filter && (
                            <Link
                                to="/"
                                className="inline-flex items-center gap-2 mt-6 text-primary-600 dark:text-primary-400 font-bold hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                            >
                                Start your first review <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PRHistory;
