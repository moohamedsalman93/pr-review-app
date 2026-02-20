import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, FileCode, Trash2, XCircle } from 'lucide-react';
import { reviewService } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { openExternalLink } from '../utils/link';

const ChatDrawer = ({ isOpen, onClose, reviewId, prTitle, activeSuggestion, onClearSuggestion }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const abortControllerRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const buildContextFromSuggestion = () => {
        if (!activeSuggestion) return '';

        const parts = [];
        if (activeSuggestion.category) parts.push(`Category: ${activeSuggestion.category}`);
        if (activeSuggestion.severity) parts.push(`Severity: ${activeSuggestion.severity}`);
        if (activeSuggestion.file_path) {
            const lineInfo = activeSuggestion.line_start
                ? `:${activeSuggestion.line_start}${activeSuggestion.line_end && activeSuggestion.line_end !== activeSuggestion.line_start ? `-${activeSuggestion.line_end}` : ''}`
                : '';
            parts.push(`Location: ${activeSuggestion.file_path}${lineInfo}`);
        }
        if (activeSuggestion.suggestion) parts.push(`Suggestion: ${activeSuggestion.suggestion}`);
        if (activeSuggestion.explanation) parts.push(`Explanation: ${activeSuggestion.explanation}`);
        if (activeSuggestion.original_code) {
            parts.push(`Original code:\n${activeSuggestion.original_code}`);
        }
        if (activeSuggestion.improved_code) {
            parts.push(`Suggested code:\n${activeSuggestion.improved_code}`);
        }

        return parts.join('\n');
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    };

    const handleClearChat = () => {
        if (isLoading) {
            handleCancel();
        }
        setMessages([]);
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userInput = input.trim();
        const contextText = buildContextFromSuggestion();
        const finalQuestion = contextText
            ? `${userInput}\n\nAdditional context from selected suggestion:\n${contextText}`
            : userInput;

        // Display only the user's input in the message bubble
        const userMessage = { text: userInput, isBot: false, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Create AbortController for this request
        abortControllerRef.current = new AbortController();

        try {
            // Send the full question with context to the API
            const response = await reviewService.chatWithPR(reviewId, finalQuestion, abortControllerRef.current.signal);
            const botMessage = { text: response.answer, isBot: true, timestamp: new Date() };
            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            if (error.name === 'AbortError') {
                // Request was cancelled, remove the last user message
                setMessages(prev => prev.slice(0, -1));
                return;
            }
            console.error('Error sending message:', error);
            const errorMessage = {
                text: "Sorry, I encountered an error while processing your request. Please try again.",
                isBot: true,
                isError: true,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };


    return (
        <div className={` ${isOpen ? 'w-[33%] opacity-100' : 'w-[0%] opacity-0'} transform-gpu transition-all duration-300 ease-in-out flex-shrink-0 absolute right-0 top-[39px] h-[calc(100vh-39px)] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-right duration-300 `}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-1  border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">

                    <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">PR Assistant</h2>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                            {prTitle}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Clear chat"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Close chat"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-4">
                        <div>
                            <p className="text-sm text-slate-900 dark:text-white font-medium">Ask me anything about this PR</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 w-full pt-2">
                            {[
                                "Summarize the main changes",
                                "Are there any security risks?",
                                "Explain the logic in this PR"
                            ].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => setInput(suggestion)}
                                    className="text-left px-3 py-2 text-[11px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}
                    >
                        <div className={`flex gap-2 ${msg.isBot ? 'flex-row max-w-[85%]' : 'flex-row-reverse max-w-[98%]'}`}>

                            <div className={`p-2.5 rounded-xl text-xs ${msg.isBot
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                                    : 'bg-primary-600 text-white rounded-tr-none shadow-sm shadow-primary-200 dark:shadow-none'
                                } ${msg.isError ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30' : ''} ${msg.isBot ? 'w-full max-w-full' : ''}`}>
                                <div className="whitespace-pre-wrap break-words overflow-hidden w-full">
                                    <ReactMarkdown
                                        children={msg.text}
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '')
                                                return !inline && match ? (
                                                    <div className="overflow-x-auto max-w-full">
                                                        <SyntaxHighlighter
                                                            {...props}
                                                            children={String(children).replace(/\n$/, '')}
                                                            style={oneDark}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.75rem', maxWidth: '100%', overflowX: 'auto' }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <code {...props} className={`${className} bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-inherit break-words`}>
                                                        {children}
                                                    </code>
                                                )
                                            },
                                            p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                                            ul: ({ node, ...props }) => <ul {...props} className="list-disc ml-4 mb-2" />,
                                            ol: ({ node, ...props }) => <ol {...props} className="list-decimal ml-4 mb-2" />,
                                            li: ({ node, ...props }) => <li {...props} className="mb-0.5" />,
                                            a: ({ node, ...props }) => (
                                                <a
                                                    {...props}
                                                    className="text-blue-500 hover:underline cursor-pointer"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        openExternalLink(props.href);
                                                    }}
                                                />
                                            ),
                                            h1: ({ node, ...props }) => <h1 {...props} className="text-lg font-bold mb-2" />,
                                            h2: ({ node, ...props }) => <h2 {...props} className="text-md font-bold mb-2" />,
                                            h3: ({ node, ...props }) => <h3 {...props} className="text-sm font-bold mb-1" />,
                                            blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-2 border-slate-300 dark:border-slate-600 pl-2 italic my-2 opacity-80" />,
                                            table: ({ node, ...props }) => <div className="overflow-x-auto my-2 max-w-full"><table {...props} className="min-w-full divide-y divide-slate-300 dark:divide-slate-700 border border-slate-300 dark:border-slate-700 max-w-full" /></div>,
                                            thead: ({ node, ...props }) => <thead {...props} className="bg-slate-200 dark:bg-slate-700" />,
                                            tbody: ({ node, ...props }) => <tbody {...props} className="divide-y divide-slate-200 dark:divide-slate-800" />,
                                            tr: ({ node, ...props }) => <tr {...props} />,
                                            th: ({ node, ...props }) => <th {...props} className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider" />,
                                            td: ({ node, ...props }) => <td {...props} className="px-3 py-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-300" />,
                                        }}
                                    />
                                </div>
                                <div className={`text-[9px] mt-1 opacity-50 ${msg.isBot ? 'text-slate-500' : 'text-primary-100'}`}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="flex gap-2 max-w-[90%]">
                            <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl rounded-tl-none flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">Thinking...</span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {activeSuggestion && (
                    <div className="mb-2 flex items-start gap-2 animate-fade-in">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
                            <FileCode className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wider mb-0.5">
                                    Context: {activeSuggestion.category || 'Suggestion'}
                                </div>
                                <div className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-1">
                                    {activeSuggestion.suggestion?.split('\n')[0] || 'Selected suggestion'}
                                </div>
                                {activeSuggestion.file_path && (
                                    <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                                        {activeSuggestion.file_path.split('/').pop()}
                                        {activeSuggestion.line_start && `:${activeSuggestion.line_start}`}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={onClearSuggestion}
                                className="p-1 hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors flex-shrink-0"
                                title="Remove context"
                            >
                                <X className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                            </button>
                        </div>
                    </div>
                )}
                <form onSubmit={handleSend} className="relative flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 text-slate-900 dark:text-white transition-all"
                        disabled={isLoading}
                    />
                    {isLoading ? (
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all shadow-sm shadow-red-200 dark:shadow-none"
                            title="Cancel request"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="p-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-lg transition-all shadow-sm shadow-primary-200 dark:shadow-none"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ChatDrawer;
