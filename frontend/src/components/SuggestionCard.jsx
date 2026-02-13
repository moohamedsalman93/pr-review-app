import React, { useState } from 'react';
import { 
    AlertCircle, 
    AlertTriangle, 
    Info, 
    ChevronDown, 
    ChevronUp, 
    Copy, 
    Check, 
    FileText, 
    Hash,
    Code2,
    ShieldAlert,
    Zap,
    Bug,
    Palette,
    Lightbulb,
    Activity
} from 'lucide-react';

const SuggestionCard = ({ suggestion, index }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [copied, setCopied] = useState(false);

    const getSeverityStyles = (severity) => {
        switch (severity?.toLowerCase()) {
            case 'error':
                return {
                    border: 'border-red-200 dark:border-red-900/30',
                    accent: 'bg-red-500',
                    light: 'bg-red-50 dark:bg-red-900/10',
                    text: 'text-red-700 dark:text-red-400',
                    icon: <ShieldAlert className="h-5 w-5 text-red-500" />,
                    label: 'Critical'
                };
            case 'warning':
                return {
                    border: 'border-yellow-200 dark:border-yellow-900/30',
                    accent: 'bg-yellow-500',
                    light: 'bg-yellow-50 dark:bg-yellow-900/10',
                    text: 'text-yellow-700 dark:text-yellow-400',
                    icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
                    label: 'Warning'
                };
            case 'info':
            default:
                return {
                    border: 'border-blue-200 dark:border-blue-900/30',
                    accent: 'bg-blue-500',
                    light: 'bg-blue-50 dark:bg-blue-900/10',
                    text: 'text-blue-700 dark:text-blue-400',
                    icon: <Info className="h-5 w-5 text-blue-500" />,
                    label: 'Info'
                };
        }
    };

    const getCategoryIcon = (category) => {
        switch (category?.toLowerCase()) {
            case 'security': return <ShieldAlert className="w-3.5 h-3.5" />;
            case 'bug': return <Bug className="w-3.5 h-3.5" />;
            case 'performance': return <Zap className="w-3.5 h-3.5" />;
            case 'style': return <Palette className="w-3.5 h-3.5" />;
            default: return <Lightbulb className="w-3.5 h-3.5" />;
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(suggestion.suggestion);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const styles = getSeverityStyles(suggestion.severity);

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-xl border ${styles.border} shadow-sm overflow-hidden transition-all duration-300 animate-fade-in`} style={{ animationDelay: `${index * 50}ms` }}>
            {/* Card Header */}
            <div className={`px-5 py-3 flex items-center justify-between gap-4 border-b ${styles.border} ${styles.light}`}>
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-sm transition-colors duration-300`}>
                        {styles.icon}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${styles.text}`}>
                                {styles.label}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">•</span>
                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider transition-colors duration-300">
                                {getCategoryIcon(suggestion.category)}
                                {suggestion.category || 'Best Practice'}
                            </div>
                        </div>
                        <h4 className="text-[13px] font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {suggestion.suggestion.split('\n')[0].slice(0, 80)}...
                        </h4>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="hidden sm:flex flex-col items-end">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            <FileText className="w-2.5 h-2.5" />
                            {suggestion.file_path.split('/').pop()}
                        </div>
                        {suggestion.line_start && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 dark:text-slate-500">
                                <Hash className="w-2 h-2" />
                                Line {suggestion.line_start}
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Card Body */}
            {isExpanded && (
                <div className="p-5 space-y-5">
                    {/* Explanation */}
                    <div className="space-y-1.5">
                        <h5 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Lightbulb className="w-3 h-3" />
                            Description & Reasoning
                        </h5>
                        <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed font-medium">
                            {suggestion.explanation || suggestion.suggestion}
                        </p>
                    </div>

                    {/* Code Block / Diff */}
                    {(suggestion.original_code || suggestion.improved_code) && (
                        <div className="space-y-3">
                            {suggestion.original_code && suggestion.improved_code ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Code2 className="w-2.5 h-2.5" />
                                                Existing Code
                                            </h5>
                                        </div>
                                        <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shadow-inner">
                                            <pre className="p-3 overflow-x-auto text-[10px] sm:text-[11px] font-mono leading-relaxed text-red-300/80 bg-red-950/20 scrollbar-thin">
                                                <code>{suggestion.original_code}</code>
                                            </pre>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Zap className="w-2.5 h-2.5 text-primary-400" />
                                                Suggested Improvement
                                            </h5>
                                        </div>
                                        <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shadow-inner">
                                            <pre className="p-3 overflow-x-auto text-[10px] sm:text-[11px] font-mono leading-relaxed text-green-300/80 bg-green-950/20 scrollbar-thin">
                                                <code>{suggestion.improved_code}</code>
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Code2 className="w-3 h-3" />
                                            Code Context
                                        </h5>
                                        <div className="text-[9px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700 transition-colors duration-300">
                                            {suggestion.file_path}
                                        </div>
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={copyToClipboard}
                                                className="p-1.5 bg-slate-800/80 dark:bg-slate-700/80 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-lg backdrop-blur-sm transition-all border border-slate-700 dark:border-slate-600 shadow-xl"
                                                title="Copy suggestion"
                                            >
                                                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                        <div className="bg-slate-900 dark:bg-black rounded-lg overflow-hidden border border-slate-800 dark:border-slate-900 shadow-inner">
                                            <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/50 dark:bg-slate-900/50 border-b border-slate-800 dark:border-slate-900">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 dark:bg-slate-800"></div>
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 dark:bg-slate-800"></div>
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 dark:bg-slate-800"></div>
                                            </div>
                                            <pre className="p-4 overflow-x-auto text-[11px] sm:text-xs font-mono leading-relaxed text-slate-300 dark:text-slate-400 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                                                <code>{suggestion.original_code || suggestion.improved_code}</code>
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Footer */}
                    <div className="pt-3.5 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between transition-colors duration-300">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                <Activity className="w-3 h-3" />
                                Impact: <span className="text-slate-600 dark:text-slate-400 uppercase tracking-tight">Medium</span>
                            </div>
                        </div>
                        <button 
                            onClick={copyToClipboard}
                            className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all"
                        >
                            {copied ? (
                                <><Check className="w-3 h-3" /> Copied</>
                            ) : (
                                <><Copy className="w-3 h-3" /> Copy Suggestion</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuggestionCard;
