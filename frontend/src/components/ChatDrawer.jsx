import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, User, MessageSquare } from 'lucide-react';
import { reviewService } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { openExternalLink } from '../utils/link';

const ChatDrawer = ({ isOpen, onClose, reviewId, prTitle }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { text: input, isBot: false, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await reviewService.chatWithPR(reviewId, input);
            const botMessage = { text: response.answer, isBot: true, timestamp: new Date() };
            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
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
                <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-4">
                        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center">
                            <Bot className="w-6 h-6 text-slate-400" />
                        </div>
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
                        <div className={`flex gap-2 max-w-[98%] ${msg.isBot ? 'flex-row' : 'flex-row-reverse'}`}>

                            <div className={`p-2.5 rounded-xl text-xs ${msg.isBot
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                                    : 'bg-primary-600 text-white rounded-tr-none shadow-sm shadow-primary-200 dark:shadow-none'
                                } ${msg.isError ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30' : ''}`}>
                                <div className="whitespace-pre-wrap break-words">
                                    <ReactMarkdown
                                        children={msg.text}
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '')
                                                return !inline && match ? (
                                                    <SyntaxHighlighter
                                                        {...props}
                                                        children={String(children).replace(/\n$/, '')}
                                                        style={oneDark}
                                                        language={match[1]}
                                                        PreTag="div"
                                                        customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.75rem' }}
                                                    />
                                                ) : (
                                                    <code {...props} className={`${className} bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-inherit`}>
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
                                            table: ({ node, ...props }) => <div className="overflow-x-auto my-2"><table {...props} className="min-w-full divide-y divide-slate-300 dark:divide-slate-700 border border-slate-300 dark:border-slate-700" /></div>,
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
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                                <Bot className="w-4 h-4" />
                            </div>
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
                <form onSubmit={handleSend} className="relative flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 text-slate-900 dark:text-white transition-all"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="p-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-lg transition-all shadow-sm shadow-primary-200 dark:shadow-none"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatDrawer;
