/**
 * Utility to export PR review data to a self-contained HTML file.
 */

export const exportPRToHTML = (review) => {
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

    // Group suggestions
    const groupedSuggestions = suggestions.reduce((acc, s) => {
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
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
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.6;
            padding: 40px 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        header {
            margin-bottom: 32px;
        }

        .breadcrumb {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-muted);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        h1 {
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.025em;
            margin-bottom: 16px;
            color: var(--text-main);
        }

        .meta-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 24px;
        }

        .tag {
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .tag-provider { background: #000; color: #fff; }
        .tag-status { background: var(--success-bg); color: var(--success); border: 1px solid #dcfce7; }
        .tag-info { background: var(--tag-bg); color: var(--tag-text); }

        .details-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            padding: 16px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 32px;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-muted);
        }

        .details-bar strong {
            color: var(--text-main);
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .metric-card {
            background: var(--card-bg);
            padding: 20px;
            border-radius: 12px;
            border: 1px solid var(--border);
            text-align: left;
        }

        .metric-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.05em;
            margin-bottom: 6px;
        }

        .metric-value {
            font-size: 24px;
            font-weight: 800;
            color: var(--text-main);
        }

        .metric-value small {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-muted);
        }

        .security-alert {
            background: var(--error-bg);
            border: 1px solid #fee2e2;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 32px;
        }

        .security-alert h3 {
            font-size: 12px;
            font-weight: 700;
            color: #b91c1c;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .security-alert p {
            font-size: 13px;
            color: #991b1b;
            font-weight: 500;
        }

        .section {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 32px;
            overflow: hidden;
        }

        .section-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border);
            background: #fafafa;
        }

        .section-header h2 {
            font-size: 16px;
            font-weight: 700;
            color: var(--text-main);
        }

        .section-content {
            padding: 24px;
        }

        .description-markdown {
            font-size: 14px;
            color: var(--text-main);
            overflow-x: auto;
        }

        .description-markdown h1, .description-markdown h2, .description-markdown h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        .description-markdown ul, .description-markdown ol { padding-left: 20px; margin: 12px 0; }
        .description-markdown li { margin-bottom: 4px; }
        .description-markdown p { margin-bottom: 12px; }
        .description-markdown blockquote { border-left: 4px solid var(--border); padding-left: 16px; color: var(--text-muted); font-style: italic; }

        .suggestion-group {
            margin-bottom: 24px;
        }

        .group-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--text-muted);
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
        }

        .suggestion-item {
            margin-bottom: 24px;
            padding-left: 16px;
            border-left: 2px solid var(--border);
        }

        .suggestion-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .suggestion-text {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-main);
        }

        .impact-badge {
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            text-transform: uppercase;
        }

        .impact-high { background: var(--error-bg); color: var(--error); border: 1px solid #fee2e2; }
        .impact-medium { background: var(--warning-bg); color: var(--warning); border: 1px solid #fef3c7; }
        .impact-low { background: var(--tag-bg); color: var(--tag-text); border: 1px solid var(--border); }

        .explanation {
            font-size: 13px;
            color: var(--text-muted);
            margin-bottom: 16px;
        }

        .code-block {
            background: #0f172a;
            color: #f8fafc;
            border-radius: 8px;
            padding: 16px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            overflow-x: auto;
            margin-bottom: 12px;
        }

        .diff {
            display: grid;
            grid-template-columns: 32px 1fr;
        }

        .diff-added { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
        .diff-removed { color: #f87171; background: rgba(248, 113, 113, 0.1); }
        .diff-line-no { text-align: right; padding-right: 12px; color: #475569; user-select: none; }

        .file-path {
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            color: var(--primary);
            margin-bottom: 8px;
            display: block;
        }

        footer {
            margin-top: 48px;
            text-align: center;
            font-size: 12px;
            color: var(--text-muted);
            padding-bottom: 40px;
        }

        @media print {
            body { padding: 0; background-color: white; }
            .container { max-width: 100%; }
            .section { page-break-inside: avoid; border: none; }
            .metric-card { border: 1px solid #eee; }
        }
    </style>
</head>
<body>
    <div class="container">
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
                <div class="description-markdown">
                    ${pr_description.replace(/\n/g, '<br>')}
                </div>
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
                            <div class="code-block">
                                <div style="color: #64748b; margin-bottom: 8px; font-size: 10px; text-transform: uppercase; font-weight: 700;">Improved Code</div>
                                ${s.improved_code.split('\n').map((line, i) => `
                                    <div class="diff">
                                        <div class="diff-line-no">${i + 1}</div>
                                        <div>${line}</div>
                                    </div>
                                `).join('')}
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
</body>
</html>
    `;

    // Trigger download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PR-Review-${pr_number || id}-${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
