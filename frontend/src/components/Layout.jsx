import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { openExternalLink } from '../utils/link';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {

    GitPullRequest,
    History,
    Settings as SettingsIcon,
    ChevronLeft,
    ChevronRight,
    LayoutDashboard,
    ExternalLink,
    Github,
    Cpu,
    Moon,
    Sun,
    X,
    Minus,
    Square,
    BookOpen,
    Download
} from 'lucide-react';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

const WindowControls = () => {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const updateMaximized = async () => {
            setIsMaximized(await appWindow.isMaximized());
        };

        updateMaximized();
        const unlisten = appWindow.onResized(() => {
            updateMaximized();
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    return (
        <div className="flex items-center h-full no-drag">
            <button
                onClick={() => appWindow.minimize()}
                className="flex items-center justify-center w-12 h-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="Minimize"
            >
                <Minus className="w-4 h-4" />
            </button>
            <button
                onClick={async () => {
                    if (await appWindow.isMaximized()) {
                        await appWindow.unmaximize();
                    } else {
                        await appWindow.maximize();
                    }
                }}
                className="flex items-center justify-center w-12 h-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title={isMaximized ? "Restore" : "Maximize"}
            >
                <Square className="w-3 h-3" />
            </button>
            <button
                onClick={() => appWindow.close()}
                className="flex items-center justify-center w-12 h-full hover:bg-red-500 hover:text-white transition-colors"
                title="Close"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

const NavItem = ({ to, icon: Icon, label, collapsed, active }) => (
    <Link
        to={to}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative ${active
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-200 dark:shadow-primary-900/20'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
    >
        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
        {!collapsed && <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>}
        {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                {label}
            </div>
        )}
    </Link>
);

const Layout = ({ children }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [newVersion, setNewVersion] = useState(null);
    const [pendingUpdate, setPendingUpdate] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateProgress, setUpdateProgress] = useState(null); // 0-100 or null
    const [updateError, setUpdateError] = useState(null);
    const [backendReady, setBackendReady] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const BACKEND_URL = 'http://localhost:47685';
        let cancelled = false;
        const check = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
                if (res.ok && !cancelled) setBackendReady(true);
            } catch {
                if (!cancelled) setTimeout(check, 800);
            }
        };
        check();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                console.log('Checking for updates...');
                const update = await check();
                if (update) {
                    console.log(`Update available: ${update.version}`);
                    setUpdateAvailable(true);
                    setNewVersion(update.version);
                    setPendingUpdate(update);
                } else {
                    console.log('No updates available (app is up to date).');
                }
            } catch (error) {
                console.error('Failed to check for updates:', error);
                if (error.toString().includes('404')) {
                    console.warn('The update endpoint returned a 404. Ensure a release has been published with a latest.json file.');
                }
            }
        };

        checkUpdate();
    }, []);

    const startUpdate = async () => {
        if (!pendingUpdate || isUpdating) return;
        setIsUpdating(true);
        setUpdateError(null);
        setUpdateProgress(0);
        let downloadedBytes = 0;
        let contentLength = null;
        try {
            await pendingUpdate.downloadAndInstall((event) => {
                if (event.event === 'Started' && event.data?.contentLength != null) {
                    contentLength = event.data.contentLength;
                } else if (event.event === 'Progress' && event.data?.chunkLength != null) {
                    downloadedBytes += event.data.chunkLength;
                    const pct = contentLength != null && contentLength > 0
                        ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
                        : null;
                    setUpdateProgress(pct);
                } else if (event.event === 'Finished') {
                    setUpdateProgress(100);
                }
            });
            await relaunch();
        } catch (err) {
            setUpdateError(err?.message || String(err));
            setIsUpdating(false);
            setUpdateProgress(null);
        }
    };

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    if (!backendReady) {
        return (
            <div className="flex w-screen h-screen bg-slate-50 dark:bg-slate-950 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Starting backend…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-screen h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl m-px">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out ${collapsed ? 'w-14' : 'w-56'
                    }`}
            >

                {/* Logo Area */}
                <div className="flex items-center h-14 px-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                        <img src="/logo.png" alt="PR Agent Logo" className="w-8 h-8 rounded-lg shadow-lg shadow-primary-100 dark:shadow-primary-900/20 ml-1" />
                        {!collapsed && (
                            <div className="flex flex-col">
                                <span className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">PR Agent</span>
                                <span className="text-[9px] font-bold text-primary-600 uppercase tracking-wider text-nowrap">Advanced Review</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-5 space-y-1 overflow-x-hidden overflow-y-hidden">
                    <NavItem
                        to="/"
                        icon={GitPullRequest}
                        label="New Review"
                        collapsed={collapsed}
                        active={location.pathname === '/'}
                    />
                    <NavItem
                        to="/history"
                        icon={History}
                        label="Review History"
                        collapsed={collapsed}
                        active={location.pathname === '/history'}
                    />
                    <NavItem
                        to="/rules"
                        icon={BookOpen}
                        label="Review Rules"
                        collapsed={collapsed}
                        active={location.pathname === '/rules'}
                    />
                    <NavItem
                        to="/settings"
                        icon={SettingsIcon}
                        label="Settings"
                        collapsed={collapsed}
                        active={location.pathname === '/settings'}
                    />
                </nav>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <button
                        onClick={toggleTheme}
                        className="flex items-center gap-3 w-full p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all"
                    >
                        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        {!collapsed && <span className="text-xs font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
                    </button>

                </div>

                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center justify-center pointer-events-auto w-fit absolute top-1/2 -translate-y-1/2 -right-4.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm transition-colors z-50"
                >
                    {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </aside>

            {/* Main Content */}
            <main
                className={`w-full max-w-full transition-all duration-300 ${collapsed ? 'pl-14' : 'pl-56'
                    }`}
            >
                <header
                    data-tauri-drag-region
                    className="sticky top-0 z-40 flex items-center justify-between h-8 px-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800"
                >
                    <div className="flex items-center gap-3 px-6 pointer-events-none">
                        <h2 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            {location.pathname === '/' ? 'New Review' :
                                location.pathname.startsWith('/review') ? 'Review Details' :
                                    location.pathname === '/history' ? 'History' :
                                        location.pathname === '/rules' ? 'Rules' : 'Settings'}
                        </h2>
                    </div>

                    <div className="flex items-center h-full ml-auto no-drag gap-3"> {/* Container for chip and window controls */}
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-[9px] font-medium text-slate-600 dark:text-slate-300">
                            <Cpu className="w-2.5 h-2.5" />
                            <span>Ollama Powered</span>
                        </div>
                        <a
                            href="https://github.com/Codium-ai/pr-agent"
                            onClick={(e) => {
                                e.preventDefault();
                                openExternalLink('https://github.com/Codium-ai/pr-agent');
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <Github className="w-3.5 h-3.5" />
                        </a>
                        {updateAvailable && (
                            <div className="flex flex-col items-end gap-0.5 mx-2">
                                {updateError && (
                                    <span className="text-[9px] text-red-600 dark:text-red-400">{updateError}</span>
                                )}
                                <button
                                    type="button"
                                    onClick={startUpdate}
                                    disabled={isUpdating}
                                    className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[9px] font-medium border border-amber-200 dark:border-amber-800 animate-in fade-in zoom-in duration-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 disabled:opacity-80 disabled:cursor-wait transition-colors min-w-[120px] justify-center"
                                >
                                    {isUpdating ? (
                                        <>
                                            <div className="w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />
                                            <span>
                                                {updateProgress != null ? `Downloading ${updateProgress}%` : 'Downloading…'}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-3 h-3 shrink-0" />
                                            <span>Update Available {newVersion && `(${newVersion})`}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                        <div className='h-[60%] w-[1px] bg-slate-200 dark:bg-slate-700'></div>
                        <WindowControls />
                    </div>
                </header>

                <div className={`h-[calc(100vh-2rem)] ${location.pathname.startsWith('/review') ? 'overflow-hidden p-0' : 'overflow-y-auto p-6 max-w-7xl mx-auto scrollbar-none'}`}>
                    {children}
                </div>
            </main >
        </div >
    );
};

export default Layout;
