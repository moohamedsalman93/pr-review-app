/**
 * Utility to export PR review data to a self-contained HTML file.
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import * as Diff from 'diff';

export const exportPRToHTML = async (review) => {
    if (!review) return;

    const {
        pr_title,
        pr_author,
        pr_number,
        project_name,
        provider,
        source_branch,
        target_branch,
        pr_url,
        score,
        effort,
        security_concerns,
        suggestions = [],
        pr_description
    } = review;

    const criticalIssues = suggestions.filter(s => s.severity?.toLowerCase() === 'error' || s.score >= 9).length;

    // Helper to format category names
    const formatCategory = (cat) => (cat || 'best_practice').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Prepare diffs for each suggestion
    const suggestionsWithDiffs = suggestions.map(s => {
        let diffHtml = '';
        if (s.original_code && s.improved_code) {
            const diff = Diff.diffLines(s.original_code, s.improved_code);
            diffHtml = diff.map(part => {
                const color = part.added ? 'bg-green-500/10 text-green-700' :
                    part.removed ? 'bg-red-500/10 text-red-700' : 'text-slate-600';
                const prefix = part.added ? '+' : part.removed ? '-' : ' ';
                const bgClass = part.added ? 'diff-added' : part.removed ? 'diff-removed' : '';
                
                return part.value.split('\n').filter(l => l).map(line => `
                    <div class="diff-line ${bgClass}">
                        <span class="diff-prefix select-none">${prefix}</span>
                        <span class="diff-content">${line}</span>
                    </div>
                `).join('');
            }).join('');
        }
        return { ...s, diffHtml };
    });

    // Group suggestions
    const groupedSuggestions = suggestionsWithDiffs.reduce((acc, s) => {
        const cat = formatCategory(s.category);
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(s);
        return acc;
    }, {});

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PR Review: ${pr_title || 'Request'} - ${project_name || 'Project'}</title>
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    
    <!-- PrismJS (Syntax Highlighting) -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-one-light.min.css" rel="stylesheet" id="prism-theme" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.css" rel="stylesheet" />

    <!-- Marked (Markdown Parsing) -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    
    <!-- Lucide Icons -->
    <script src="https://unpkg.com/lucide@latest"></script>

    <style>
        :root {
            --primary: #2563eb;
            --primary-bg: #eff6ff;
            --secondary: #64748b;
            --bg: #f8fafc;
            --card-bg: #ffffff;
            --border: #e2e8f0;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --tag-bg: #f1f5f9;
            --tag-text: #475569;
            --error: #ef4444;
            --error-bg: #fef2f2;
            --warning: #f59e0b;
            --warning-bg: #fffbeb;
            --success: #10b981;
            --success-bg: #f0fdf4;
            --info: #3b82f6;
            --info-bg: #eff6ff;
            --diff-added-bg: #ecfdf5;
            --diff-removed-bg: #fef2f2;
            --diff-added-text: #059669;
            --diff-removed-text: #dc2626;
            --code-bg: #f6f8fa;
            --header-bg: #fafafa;
        }

        [data-theme="dark"] {
            --primary: #3b82f6;
            --primary-bg: #1e3a8a30;
            --secondary: #94a3b8;
            --bg: #0f172a;
            --card-bg: #1e293b;
            --border: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --tag-bg: #334155;
            --tag-text: #cbd5e1;
            --error: #f87171;
            --error-bg: #450a0a;
            --warning: #fbbf24;
            --warning-bg: #451a03;
            --success: #34d399;
            --success-bg: #064e3b;
            --info: #60a5fa;
            --info-bg: #1e3a8a;
            --diff-added-bg: #064e3b30;
            --diff-removed-bg: #450a0a30;
            --diff-added-text: #34d399;
            --diff-removed-text: #f87171;
            --code-bg: #0f172a;
            --header-bg: #1e293b;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.6;
            padding: 40px 20px;
        }

        .container { max-width: 900px; margin: 0 auto; }

        /* Typography */
        h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.025em; margin-bottom: 16px; color: var(--text-main); }
        h2 { font-size: 20px; font-weight: 700; color: var(--text-main); margin-bottom: 16px; }
        h3 { font-size: 16px; font-weight: 600; color: var(--text-main); margin-bottom: 12px; }
        
        /* Components */
        .breadcrumb { font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        
        .meta-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
        .tag { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .tag-provider { background: var(--text-main); color: var(--bg); }
        .tag-status { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-bg); }
        .tag-info { background: var(--tag-bg); color: var(--tag-text); }

        .details-bar {
            display: flex; flex-wrap: wrap; gap: 20px; padding: 16px;
            background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px;
            margin-bottom: 32px; font-size: 13px; font-weight: 500; color: var(--text-muted);
        }
        .details-bar strong { color: var(--text-main); }

        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .metric-card {
            background: var(--card-bg); padding: 20px; border-radius: 12px; border: 1px solid var(--border); text-align: left;
        }
        .metric-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 6px; }
        .metric-value { font-size: 24px; font-weight: 800; color: var(--text-main); }
        .metric-value small { font-size: 14px; font-weight: 500; color: var(--text-muted); }

        .section {
            background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 32px; overflow: hidden;
        }
        .section-header { padding: 20px 24px; border-bottom: 1px solid var(--border); background: var(--header-bg); display: flex; justify-content: space-between; align-items: center; }
        .section-content { padding: 24px; }

        /* Markdown Styles */
        .markdown-body { font-size: 14px; line-height: 1.6; color: var(--text-main); }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 700; color: var(--text-main); }
        .markdown-body p { margin-bottom: 1em; }
        .markdown-body ul, .markdown-body ol { padding-left: 2em; margin-bottom: 1em; }
        .markdown-body code { background: var(--tag-bg); padding: 0.2em 0.4em; border-radius: 4px; font-size: 85%; font-family: 'JetBrains Mono', monospace; color: var(--text-main); }
        .markdown-body pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 1em; border: 1px solid var(--border); }
        .markdown-body pre code { background: transparent; padding: 0; font-size: 12px; color: inherit; }
        .markdown-body blockquote { border-left: 4px solid var(--border); padding-left: 1em; color: var(--text-muted); margin-bottom: 1em; }
        .markdown-body a { color: var(--primary); text-decoration: none; }
        .markdown-body a:hover { text-decoration: underline; }

        /* Suggestions & Diff Styles */
        .suggestion-group { margin-bottom: 24px; }
        .group-title {
            font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
            margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border);
        }
        .suggestion-item { margin-bottom: 32px; padding-left: 0; }
        
        .suggestion-header {
            display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px;
        }
        .suggestion-text { font-size: 15px; font-weight: 600; color: var(--text-main); }
        
        .impact-badge {
            font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;
        }
        .impact-high { background: var(--error-bg); color: var(--error); border: 1px solid var(--error-bg); }
        .impact-medium { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-bg); }
        .impact-low { background: var(--tag-bg); color: var(--tag-text); border: 1px solid var(--border); }

        .explanation { font-size: 14px; color: var(--text-muted); margin-bottom: 16px; }
        .file-path { font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--primary); margin-bottom: 8px; display: block; font-weight: 500; }

        /* Diff View */
        .diff-container {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            margin-top: 12px;
        }
        .diff-header {
            background: var(--header-bg);
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            display: flex; justify-content: space-between;
        }
        .diff-content { display: block; overflow-x: auto; padding: 0; color: var(--text-main); }
        .diff-line { display: flex; line-height: 1.5; padding: 0 4px; }
        .diff-line:hover { background-color: var(--tag-bg); }
        .diff-prefix { width: 20px; color: var(--text-muted); user-select: none; text-align: center; margin-right: 8px; }
        .diff-added { background-color: var(--diff-added-bg); }
        .diff-removed { background-color: var(--diff-removed-bg); }
        .diff-added .diff-prefix { color: var(--diff-added-text); }
        .diff-removed .diff-prefix { color: var(--diff-removed-text); }
        .diff-added .diff-content { color: var(--diff-added-text); }
        .diff-removed .diff-content { color: var(--diff-removed-text); }

        /* Theme Toggle */
        .theme-toggle {
            position: absolute;
            top: 40px;
            right: 20px;
            padding: 8px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            cursor: pointer;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .theme-toggle:hover {
            color: var(--text-main);
            background: var(--tag-bg);
        }

        footer { margin-top: 60px; text-align: center; font-size: 12px; color: var(--text-muted); padding-bottom: 40px; }
        
        @media print {
            body { padding: 0; background-color: white; color: black; }
            .container { max-width: 100%; }
            .section { page-break-inside: avoid; border: none; }
            .metric-card { border: 1px solid #eee; }
            .theme-toggle { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <button class="theme-toggle" id="theme-toggle" title="Toggle Theme">
            <i data-lucide="moon" id="moon-icon"></i>
            <i data-lucide="sun" id="sun-icon" style="display: none;"></i>
        </button>

        <header>
            <div class="breadcrumb">
                <span>${project_name || 'Project'}</span>
                <span>/</span>
                <span>PR #${pr_number}</span>
            </div>
            <h1>${pr_title || 'Review Report'}</h1>
            <div class="meta-tags">
                <span class="tag tag-provider">${provider || 'Git'}</span>
                <span class="tag tag-status">Completed</span>
                <span class="tag tag-info">By ${pr_author || 'AI Agent'}</span>
            </div>

            <div class="details-bar">
                <div>Source: <strong>${source_branch}</strong></div>
                <div>Target: <strong>${target_branch}</strong></div>
                <div>Created: <strong>${new Date().toLocaleDateString()}</strong></div>
                <a href="${pr_url}" style="color: var(--primary); text-decoration: none;">View Original PR &rarr;</a>
            </div>
        </header>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Review Score</div>
                <div class="metric-value">${score || 'N/A'}<small>/100</small></div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Review Effort</div>
                <div class="metric-value">${effort || 'N/A'}<small>/5</small></div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Critical Issues</div>
                <div class="metric-value" style="color: ${criticalIssues > 0 ? 'var(--error)' : 'var(--success)'}">${criticalIssues}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Suggestions</div>
                <div class="metric-value">${suggestions.length}</div>
            </div>
        </div>

        ${security_concerns ? `
        <div class="security-alert">
            <h3>Security Concerns Identified</h3>
            <p>${security_concerns}</p>
        </div>
        ` : ''}

        ${pr_description ? `
        <div class="section">
            <div class="section-header">
                <h2>AI Generated Description</h2>
            </div>
            <div class="section-content">
                <div id="pr-description-content" class="markdown-body"></div>
                <script>
                    document.getElementById('pr-description-content').innerHTML = marked.parse(\`${pr_description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
                </script>
            </div>
        </div>
        ` : ''}

        <div class="section" style="border: none; background: transparent;">
            <div class="section-header" style="background: transparent; border: none; padding-left: 0;">
                <h2 style="font-size: 20px; font-weight: 800;">Review Suggestions</h2>
            </div>
            
            ${Object.entries(groupedSuggestions).map(([category, items]) => `
                <div class="suggestion-group">
                    <div class="group-title">${category}</div>
                    ${items.map(s => `
                        <div class="suggestion-item">
                            <div class="suggestion-header">
                                <div class="suggestion-text">${s.suggestion.split('\n')[0]}</div>
                                <span class="impact-badge ${s.score >= 9 ? 'impact-high' : s.score >= 7 ? 'impact-medium' : 'impact-low'}">
                                    ${s.score >= 9 ? 'High' : s.score >= 7 ? 'Medium' : 'Low'}
                                </span>
                            </div>
                            <div class="explanation">${s.explanation || s.suggestion}</div>
                            <span class="file-path">${s.file_path}:${s.line_start}</span>
                            
                            ${s.improved_code ? `
                            <div class="diff-container">
                                <div class="diff-header">
                                    <span>Improved Code</span>
                                </div>
                                <pre class="line-numbers" style="margin: 0; border: none; border-radius: 0;"><code class="language-javascript">${s.improved_code}</code></pre>
                            </div>
                            ` : ''}

                            ${s.diffHtml ? `
                            <div class="diff-container">
                                <div class="diff-header">
                                    <span>Suggested Change</span>
                                    <span>${s.file_path}</span>
                                </div>
                                <div class="diff-content">
                                    ${s.diffHtml}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `).join('')}

            ${suggestions.length === 0 ? `
                <div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px;">
                    No issues detected. Your code changes look solid!
                </div>
            ` : ''}
        </div>

        <footer>
            <p>Generated by PR Review Agent &bull; ${new Date().toLocaleString()}</p>
        </footer>
    </div>
    
    <!-- Initialize Prism -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <script>
        // Theme Toggle Logic
        const themeToggle = document.getElementById('theme-toggle');
        const html = document.documentElement;
        const moonIcon = document.getElementById('moon-icon');
        const sunIcon = document.getElementById('sun-icon');
        const prismTheme = document.getElementById('prism-theme');

        const updateIcons = (isDark) => {
            if (isDark) {
                moonIcon.style.display = 'none';
                sunIcon.style.display = 'block';
                // Switch Prism to dark theme
                prismTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css";
            } else {
                moonIcon.style.display = 'block';
                sunIcon.style.display = 'none';
                // Switch Prism to light theme
                prismTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-one-light.min.css";
            }
            lucide.createIcons();
        };

        const toggleTheme = () => {
            const isDark = html.getAttribute('data-theme') === 'dark';
            if (isDark) {
                html.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                updateIcons(false);
            } else {
                html.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                updateIcons(true);
            }
        };

        // Initialize Theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            html.setAttribute('data-theme', 'dark');
            updateIcons(true);
        } else {
            updateIcons(false);
        }

        themeToggle.addEventListener('click', toggleTheme);

        // Configure markdown parser to highlight code blocks
        marked.setOptions({
            highlight: function(code, lang) {
                if (Prism.languages[lang]) {
                    return Prism.highlight(code, Prism.languages[lang], lang);
                } else {
                    return code;
                }
            }
        });
        
        // Re-run highlighting after finding markdown content
        Prism.highlightAll();
        lucide.createIcons();
    </script>
</body>
</html>
    `;

    try {
        // Open save dialog
        const textContent = htmlContent;
        const defaultPath = `PR-Review-${pr_number || pr_title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().getTime()}.html`;

        const filePath = await save({
            defaultPath,
            filters: [{
                name: 'HTML File',
                extensions: ['html']
            }]
        });

        if (filePath) {
            await writeTextFile(filePath, textContent);
            console.log('File saved to:', filePath);
        }
    } catch (error) {
        console.error('Failed to export file:', error);
        alert('Failed to save file. Please try again.');
    }
};

