import React, { useMemo, useEffect, useRef, useState } from 'react';
import yaml from 'js-yaml';
import mermaid from 'mermaid';
import { 
    FileCode, 
    Tag, 
    Type, 
    GitBranch,
    AlertCircle,
    CheckCircle2,
    AlertTriangle,
    Info,
    FileText,
    Loader2
} from 'lucide-react';

// Component to render Mermaid diagrams
const MermaidDiagram = ({ diagram }) => {
    const mermaidRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Initialize Mermaid once
        mermaid.initialize({ 
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
                primaryColor: '#6366f1',
                primaryTextColor: '#fff',
                primaryBorderColor: '#818cf8',
                lineColor: '#94a3b8',
                secondaryColor: '#475569',
                tertiaryColor: '#1e293b'
            }
        });
    }, []);

    useEffect(() => {
        if (!diagram || !mermaidRef.current) return;

        const renderDiagram = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Extract mermaid code (remove ```mermaid wrapper if present)
                let mermaidCode = diagram.trim();
                if (mermaidCode.startsWith('```mermaid')) {
                    mermaidCode = mermaidCode.replace(/^```mermaid\s*/i, '').replace(/\s*```\s*$/, '');
                } else if (mermaidCode.startsWith('```')) {
                    mermaidCode = mermaidCode.replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
                }
                mermaidCode = mermaidCode.trim();

                if (!mermaidCode) {
                    throw new Error('Empty diagram code');
                }

                // Generate unique ID for this diagram
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                // Clear previous content
                mermaidRef.current.innerHTML = '';
                
                // Ensure ref is attached and element exists
                if (!mermaidRef.current) {
                    throw new Error('Container element not available');
                }

                // Render the diagram using render API - this doesn't require DOM attachment
                const { svg } = await mermaid.render(`${id}-svg`, mermaidCode);
                
                // Insert the rendered SVG directly
                mermaidRef.current.innerHTML = svg;
                
                setIsLoading(false);
            } catch (err) {
                console.error('Failed to render Mermaid diagram:', err);
                setError(err.message);
                setIsLoading(false);
            }
        };

        renderDiagram();

        // Cleanup function
        return () => {
            if (mermaidRef.current) {
                mermaidRef.current.innerHTML = '';
            }
        };
    }, [diagram]);

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    <span>Failed to render diagram: {error}</span>
                </div>
                <pre className="mt-2 text-xs text-red-600 dark:text-red-500 font-mono whitespace-pre-wrap overflow-x-auto">
                    {diagram}
                </pre>
            </div>
        );
    }

    return (
        <div className="relative">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 dark:bg-black/50 rounded-lg z-10">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                        <span className="text-xs text-slate-400">Rendering diagram...</span>
                    </div>
                </div>
            )}
            <div 
                ref={mermaidRef} 
                className="mermaid-container bg-white dark:bg-slate-900 p-4 rounded-lg overflow-x-auto flex justify-center"
            />
        </div>
    );
};

const PRDescriptionViewer = ({ description }) => {
    const parsedData = useMemo(() => {
        if (!description) return null;

        try {
            // Try to parse the YAML
            const parsed = yaml.load(description);
            return parsed;
        } catch (error) {
            // If parsing fails, return null to show raw text
            console.error('Failed to parse YAML:', error);
            return null;
        }
    }, [description]);

    if (!parsedData) {
        // Fallback to raw display if parsing fails
        return (
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-lg border border-slate-100 dark:border-slate-800 font-mono text-xs whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {description}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Title */}
            {parsedData.title && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <Type className="w-4 h-4" />
                        Title
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100 bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-100 dark:border-primary-900/30">
                        {parsedData.title}
                    </div>
                </div>
            )}

            {/* Type */}
            {parsedData.type && Array.isArray(parsedData.type) && parsedData.type.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <Tag className="w-4 h-4" />
                        Type
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {parsedData.type.map((type, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            >
                                {type === 'Bug fix' && <AlertCircle className="w-3 h-3 text-red-500" />}
                                {type === 'Enhancement' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                {type === 'Tests' && <CheckCircle2 className="w-3 h-3 text-blue-500" />}
                                {type === 'Documentation' && <FileText className="w-3 h-3 text-blue-500" />}
                                {type === 'Other' && <Info className="w-3 h-3 text-slate-500" />}
                                {type}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Description */}
            {parsedData.description && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <FileText className="w-4 h-4" />
                        Description
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                        {typeof parsedData.description === 'string' ? (
                            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {parsedData.description.split('\n').map((line, idx) => {
                                    // Handle bullet points
                                    if (line.trim().startsWith('-')) {
                                        return (
                                            <div key={idx} className="flex items-start gap-2 mb-2">
                                                <span className="text-primary-600 dark:text-primary-400 mt-1">•</span>
                                                <span className="flex-1">{line.trim().substring(1).trim()}</span>
                                            </div>
                                        );
                                    }
                                    return <div key={idx} className="mb-1">{line || '\u00A0'}</div>;
                                })}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-700 dark:text-slate-300">
                                {parsedData.description}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Changes Diagram (Mermaid) */}
            {parsedData.changes_diagram && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <GitBranch className="w-4 h-4" />
                        Changes Diagram
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                        <MermaidDiagram diagram={parsedData.changes_diagram} />
                    </div>
                </div>
            )}

            {/* PR Files */}
            {parsedData.pr_files && Array.isArray(parsedData.pr_files) && parsedData.pr_files.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <FileCode className="w-4 h-4" />
                        Changed Files ({parsedData.pr_files.length})
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                            File Path
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                            Description
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-32">
                                            Type
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {parsedData.pr_files.map((file, idx) => (
                                        <tr 
                                            key={idx}
                                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <FileCode className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                                                    <code className="text-xs font-mono text-slate-900 dark:text-slate-100 break-all">
                                                        {file.filename}
                                                    </code>
                                                </div>
                                                {file.changes_summary && (
                                                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                        {typeof file.changes_summary === 'string' ? (
                                                            file.changes_summary.split('\n').slice(0, 2).map((line, lineIdx) => {
                                                                if (line.trim().startsWith('-')) {
                                                                    return (
                                                                        <div key={lineIdx} className="flex items-start gap-2 mb-1">
                                                                            <span className="text-primary-600 dark:text-primary-400 mt-0.5">•</span>
                                                                            <span className="flex-1">{line.trim().substring(1).trim()}</span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return line.trim() ? <div key={lineIdx} className="mb-1">{line}</div> : null;
                                                            }).filter(Boolean)
                                                        ) : null}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {file.changes_title ? (
                                                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                        {file.changes_title}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">No description</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {file.label ? (
                                                    <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                                        file.label.toLowerCase().includes('bug') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30' :
                                                        file.label.toLowerCase().includes('enhancement') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30' :
                                                        file.label.toLowerCase().includes('test') ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' :
                                                        'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                                    }`}>
                                                        {file.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PRDescriptionViewer;
