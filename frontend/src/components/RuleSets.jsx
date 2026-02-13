import React, { useState, useEffect } from 'react';
import { ruleSetService } from '../services/api';
import {
    BookOpen,
    Plus,
    Edit2,
    Trash2,
    Loader2,
    X,
    Save,
    AlertCircle,
    CheckCircle2,
    FileText
} from 'lucide-react';

const RuleSets = () => {
    const [ruleSets, setRuleSets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingRuleSet, setEditingRuleSet] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', instructions: '' });
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        loadRuleSets();
    }, []);

    const loadRuleSets = async () => {
        try {
            setLoading(true);
            const data = await ruleSetService.getRuleSets();
            setRuleSets(data);
            setError(null);
        } catch (err) {
            setError('Failed to load rule sets');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (ruleSet = null) => {
        if (ruleSet) {
            setEditingRuleSet(ruleSet);
            setFormData({
                name: ruleSet.name,
                description: ruleSet.description || '',
                instructions: ruleSet.instructions
            });
        } else {
            setEditingRuleSet(null);
            setFormData({ name: '', description: '', instructions: '' });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingRuleSet(null);
        setFormData({ name: '', description: '', instructions: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingRuleSet) {
                await ruleSetService.updateRuleSet(editingRuleSet.id, formData);
            } else {
                await ruleSetService.createRuleSet(formData);
            }
            handleCloseModal();
            loadRuleSets();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to save rule set');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await ruleSetService.deleteRuleSet(id);
            setDeleteConfirm(null);
            loadRuleSets();
        } catch (err) {
            setError('Failed to delete rule set');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center h-96 animate-fade-in">
                <div className="w-10 h-10 border-4 border-primary-100 dark:border-primary-900/30 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 font-medium">Loading rule sets...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                        <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        Review Rules
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Create custom rule sets to inject into PR reviews
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-primary-200 dark:shadow-none"
                >
                    <Plus className="w-4 h-4" />
                    New Rule Set
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm animate-fade-in">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Rule Sets List */}
            {ruleSets.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                        <FileText className="w-6 h-6 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">No Rule Sets Yet</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        Create your first rule set to customize PR reviews
                    </p>
                    <button
                        onClick={() => handleOpenModal()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create Rule Set
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {ruleSets.map((ruleSet) => (
                        <div
                            key={ruleSet.id}
                            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 transition-colors hover:border-primary-200 dark:hover:border-primary-800"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                                        {ruleSet.name}
                                    </h3>
                                    {ruleSet.description && (
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                            {ruleSet.description}
                                        </p>
                                    )}
                                    <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-3">
                                            {ruleSet.instructions}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => handleOpenModal(ruleSet)}
                                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(ruleSet.id)}
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Delete Confirmation */}
                            {deleteConfirm === ruleSet.id && (
                                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center justify-between animate-fade-in">
                                    <span className="text-sm text-red-700 dark:text-red-400">Delete this rule set?</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setDeleteConfirm(null)}
                                            className="px-3 py-1 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 rounded transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => handleDelete(ruleSet.id)}
                                            className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                {editingRuleSet ? 'Edit Rule Set' : 'New Rule Set'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., frontend-digiclass"
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 dark:focus:ring-primary-900/20"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Description (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Brief description of this rule set"
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 dark:focus:ring-primary-900/20"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Review Instructions
                                </label>
                                <textarea
                                    value={formData.instructions}
                                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                                    placeholder="Enter the rules/instructions for the AI reviewer...&#10;&#10;Example:&#10;- Always suggest using arrow functions instead of regular functions&#10;- Flag any use of 'var' and suggest 'const' or 'let'&#10;- Enforce PascalCase for component names"
                                    rows={8}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 dark:focus:ring-primary-900/20 resize-none"
                                    required
                                />
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    These instructions will be injected into the AI's review prompt
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !formData.name || !formData.instructions}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-lg text-sm font-bold transition-colors"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            {editingRuleSet ? 'Update' : 'Create'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RuleSets;
