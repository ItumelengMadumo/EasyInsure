/**
 * API Client — handles all HTTP requests to the FastAPI backend.
 */

const API_BASE = 'http://localhost:8000/api/v1';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('token') || '';
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    clearToken() {
        this.token = '';
        localStorage.removeItem('token');
    }

    headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this.token) h['Authorization'] = `Bearer ${this.token}`;
        return h;
    }

    async request(method, path, body = null) {
        const opts = { method, headers: this.headers() };
        if (body) opts.body = JSON.stringify(body);

        try {
            const res = await fetch(`${API_BASE}${path}`, opts);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Request failed');
            return data;
        } catch (err) {
            console.error(`API ${method} ${path}:`, err);
            throw err;
        }
    }

    // Auth
    login(username, password) {
        return this.request('POST', '/auth/login', { username, password });
    }
    register(data) {
        return this.request('POST', '/auth/register', data);
    }
    getMe() {
        return this.request('GET', '/auth/me');
    }

    // Assets
    getAssets() {
        return this.request('GET', '/assets/');
    }
    getAsset(id) {
        return this.request('GET', `/assets/${id}`);
    }
    registerAsset(data) {
        return this.request('POST', '/assets/', data);
    }
    updateAsset(id, data) {
        return this.request('PATCH', `/assets/${id}`, data);
    }
    getAssetValuation(id) {
        return this.request('GET', `/assets/${id}/valuation`);
    }
    addManualValuation(id, data) {
        return this.request('POST', `/assets/${id}/valuations`, data);
    }
    getAssetHistory(id) {
        return this.request('GET', `/assets/${id}/history`);
    }

    // Claims
    getClaims() {
        return this.request('GET', '/claims/');
    }
    getClaim(id) {
        return this.request('GET', `/claims/${id}`);
    }
    submitClaim(data) {
        return this.request('POST', '/claims/', data);
    }
    processClaim(id) {
        return this.request('POST', `/claims/${id}/process`);
    }
    approveClaim(id, approved_payout) {
        return this.request('POST', `/claims/${id}/approve`, { approved_payout });
    }
    rejectClaim(id, reason) {
        return this.request('POST', `/claims/${id}/reject`, { reason });
    }

    // Policies
    getPolicies() {
        return this.request('GET', '/policies/');
    }
    getPolicy(id) {
        return this.request('GET', `/policies/${id}`);
    }
    createPolicy(data) {
        return this.request('POST', '/policies/', data);
    }

    // Tools
    calculateRisk(data) {
        return this.request('POST', '/tools/calculate-risk', data);
    }
    calculateDepreciation(data) {
        return this.request('POST', '/tools/calculate-depreciation', data);
    }
    getAssetFullValuation(id) {
        return this.request('GET', `/tools/asset-valuation/${id}`);
    }
}

const api = new ApiClient();
