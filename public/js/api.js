/**
 * Chronos Planner - REST API Client
 * Targets: https://chronos-planner-app.onrender.com or custom host
 */

import { ENV } from './env.js';

export class ApiClient {
  constructor() {
    this.DEFAULT_BASE_URL = ENV.DEFAULT_API_BASE_URL || 'https://chronos-planner-app.onrender.com';
    this.storageKeyBaseUrl = 'chronos_base_url';
    this.storageKeyToken = 'chronos_api_token';
    this.token = '';
    this.baseUrl = this.DEFAULT_BASE_URL;

    // Load initial in-memory cache from browser storage if present
    try {
      const storedUrl = localStorage.getItem(this.storageKeyBaseUrl);
      if (storedUrl && storedUrl.trim()) this.baseUrl = storedUrl.trim().replace(/\/+$/, '');
      const storedToken = localStorage.getItem(this.storageKeyToken);
      if (storedToken && storedToken.trim()) this.token = storedToken.trim().replace(/^["']|["']$/g, '');
    } catch (e) {}
  }

  getBaseUrl() {
    return this.baseUrl || this.DEFAULT_BASE_URL;
  }

  setBaseUrl(url) {
    const cleanUrl = url && url.trim() ? url.trim().replace(/\/+$/, '') : this.DEFAULT_BASE_URL;
    this.baseUrl = cleanUrl;
    try {
      if (url && url.trim()) {
        localStorage.setItem(this.storageKeyBaseUrl, cleanUrl);
      } else {
        localStorage.removeItem(this.storageKeyBaseUrl);
      }
    } catch (e) {}
  }

  getToken() {
    return this.token ? this.token.trim().replace(/^["']|["']$/g, '') : '';
  }

  setToken(token) {
    if (token && token.trim()) {
      const cleanToken = token.trim().replace(/^["']|["']$/g, '');
      this.token = cleanToken;
      try {
        localStorage.setItem(this.storageKeyToken, cleanToken);
      } catch (e) {}
    } else {
      this.token = '';
      try {
        localStorage.removeItem(this.storageKeyToken);
      } catch (e) {}
    }
  }

  hasToken() {
    return !!this.getToken();
  }

  getHeaders(customToken = null) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    const rawToken = customToken !== null ? customToken : this.getToken();
    const token = rawToken ? rawToken.trim().replace(/^["']|["']$/g, '') : '';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-API-Token'] = token;
    }
    return headers;
  }

  /**
   * Internal fetch wrapper targeting Chronos domain
   * @param {string} endpoint 
   * @param {RequestInit} [options={}] 
   * @param {number} [timeoutMs=70000] - Render cold start can take up to 60s
   * @param {string|null} [customToken=null]
   * @param {string|null} [customBaseUrl=null]
   */
  async request(endpoint, options = {}, timeoutMs = 70000, customToken = null, customBaseUrl = null) {
    const baseUrl = customBaseUrl !== null ? customBaseUrl : this.getBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const config = {
      ...options,
      headers: {
        ...this.getHeaders(customToken),
        ...(options.headers || {})
      },
      signal: controller.signal
    };

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        // Detect HTML redirect (e.g. redirected to /auth/login or error page)
        if (text.includes('<!DOCTYPE') || text.includes('<html') || contentType.includes('text/html')) {
          const err = new Error(
            response.status === 401 || response.status === 403
              ? 'Unauthorized: Invalid API token provided.'
              : `Received HTML response from server (HTTP ${response.status}). Expected JSON API response.`
          );
          err.status = (response.status === 200) ? 401 : response.status;
          err.isHtml = true;
          throw err;
        }
        data = { message: text };
      }

      if (!response.ok) {
        const error = new Error(data.message || data.error || `HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out (Render cold start took longer than expected). Please retry.');
      }

      if (err.name === 'TypeError' && err.message && err.message.includes('Failed to fetch')) {
        throw new Error('Network / CORS Error: Could not connect to backend. Ensure backend is running and CORS is enabled.');
      }

      throw err;
    }
  }

  /**
   * Ping server to test connection & token validity against /api/daily
   * @param {string|null} [testToken=null]
   * @param {string|null} [testBaseUrl=null]
   * @returns {Promise<{valid: boolean, latencyMs: number, info: any, error?: string}>}
   */
  async pingConnection(testToken = null, testBaseUrl = null) {
    const startTime = performance.now();
    try {
      // Test directly with /api/daily (which authenticates Bearer token)
      const info = await this.request('/api/daily', { method: 'GET' }, 65000, testToken, testBaseUrl);
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        valid: true,
        latencyMs,
        info
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        valid: false,
        latencyMs,
        error: err.message || 'Connection failed'
      };
    }
  }

  /**
   * 3.1 View Daily Plan & Tasks
   * @param {string} date - Format: YYYY-MM-DD
   */
  async getDailyPlan(date) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return await this.request(`/api/daily${query}`, { method: 'GET' });
  }

  /**
   * 3.2 Add New Task
   * @param {object} taskData
   */
  async addTask(taskData) {
    return await this.request('/api/daily/task/add', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  }

  /**
   * 3.3 Edit Task
   * @param {object} taskData - Must include date and task_id
   */
  async editTask(taskData) {
    return await this.request('/api/daily/task/edit', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  }

  /**
   * 3.4 Toggle Task Status
   * @param {string} date 
   * @param {string} taskId 
   */
  async toggleTask(date, taskId) {
    return await this.request('/api/daily/task/toggle', {
      method: 'POST',
      body: JSON.stringify({ date, task_id: taskId })
    });
  }

  /**
   * 3.5 Delete Task
   * @param {string} date 
   * @param {string} taskId 
   */
  async deleteTask(date, taskId) {
    return await this.request('/api/daily/task/delete', {
      method: 'POST',
      body: JSON.stringify({ date, task_id: taskId })
    });
  }

  /**
   * 3.6 Duplicate Task
   * @param {string} date 
   * @param {string} taskId 
   */
  async duplicateTask(date, taskId) {
    return await this.request('/api/daily/task/duplicate', {
      method: 'POST',
      body: JSON.stringify({ date, task_id: taskId })
    });
  }

  /**
   * 3.7 Reorder Tasks
   * @param {string} date 
   * @param {string[]} taskIds 
   */
  async reorderTasks(date, taskIds) {
    return await this.request('/api/daily/task/reorder', {
      method: 'POST',
      body: JSON.stringify({ date, task_ids: taskIds })
    });
  }

  /**
   * 3.8 Update Hourly Schedule Slot
   * @param {object} slotData - date, slot, activity, mood, is_default
   */
  async updateScheduleSlot(slotData) {
    return await this.request('/api/daily/schedule/update', {
      method: 'POST',
      body: JSON.stringify(slotData)
    });
  }

  /**
   * 3.9 Update Daily Notes
   * @param {string} date 
   * @param {string} notes 
   */
  async updateDailyNotes(date, notes) {
    return await this.request('/api/daily/notes/update', {
      method: 'POST',
      body: JSON.stringify({ date, notes })
    });
  }

  /**
   * Generate new API Token
   */
  async generateApiToken() {
    return await this.request('/auth/generate-api-token', { method: 'POST' });
  }

  /**
   * Revoke current API Token
   */
  async revokeApiToken() {
    return await this.request('/auth/revoke-api-token', { method: 'POST' });
  }
}

export const api = new ApiClient();
