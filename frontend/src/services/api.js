import axios from 'axios';

const API_URL = 'http://localhost:47685/api';

const api = axios.create({
    baseURL: API_URL,
});

export const reviewService = {
    // Submit a PR for review
    submitReview: async (prUrl, ruleSetId = null) => {
        const payload = { pr_url: prUrl };
        if (ruleSetId) {
            payload.rule_set_id = ruleSetId;
        }
        const response = await api.post('/reviews', payload);
        return response.data;
    },

    // Get list of reviews
    getReviews: async (page = 1, status = null) => {
        const params = { page };
        if (status) params.status = status;
        const response = await api.get('/reviews', { params });
        return response.data;
    },

    // Get specific review details
    getReviewDetail: async (id) => {
        const response = await api.get(`/reviews/${id}`);
        return response.data;
    },

    // Delete a review
    deleteReview: async (id) => {
        const response = await api.delete(`/reviews/${id}`);
        return response.data;
    },

    // Generate more suggestions
    extendReview: async (id) => {
        const response = await api.post(`/reviews/${id}/extend`);
        return response.data;
    },
    
    // Chat with PR
    chatWithPR: async (id, question) => {
        const response = await api.post(`/reviews/ask`, { question, review_id: id });
        return response.data;
    }
};

export const settingsService = {
    // Get current settings
    getSettings: async () => {
        const response = await api.get('/settings');
        return response.data;
    },

    // Update settings
    updateSettings: async (settings) => {
        const response = await api.put('/settings', settings);
        return response.data;
    }
};

export const ruleSetService = {
    // Get all rule sets
    getRuleSets: async () => {
        const response = await api.get('/rule-sets');
        return response.data;
    },

    // Create a new rule set
    createRuleSet: async (data) => {
        const response = await api.post('/rule-sets', data);
        return response.data;
    },

    // Get a specific rule set
    getRuleSet: async (id) => {
        const response = await api.get(`/rule-sets/${id}`);
        return response.data;
    },

    // Update a rule set
    updateRuleSet: async (id, data) => {
        const response = await api.put(`/rule-sets/${id}`, data);
        return response.data;
    },

    // Delete a rule set
    deleteRuleSet: async (id) => {
        const response = await api.delete(`/rule-sets/${id}`);
        return response.data;
    }
};
