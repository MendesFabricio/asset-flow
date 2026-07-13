// app/utils/apiClient.ts
import { API_BASE_URL } from '../config/api';

const requestCache = new Map<string, Promise<any>>();

export async function apiCall<T>(endpoint: string, options?: RequestInit & { timeout?: number }): Promise<T> {
    const isGet = !options?.method || options.method.toUpperCase() === 'GET';
    const cacheKey = isGet ? endpoint : null;

    if (cacheKey && requestCache.has(cacheKey)) {
        return requestCache.get(cacheKey)!;
    }

    const promise = (async () => {
        let timeout = options?.timeout ?? 30000;
        if (endpoint.includes('/api/index')) timeout = 8000;
        else if (endpoint.includes('/api/jarvis')) timeout = 60000;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    ...options?.headers,
                },
            });

            clearTimeout(id);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.msg || errorData.message || `Erro HTTP! Status: ${response.status}`);
            }

            if (response.status === 204) return {} as T;
            return await response.json();
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error(`Timeout na requisição para ${endpoint}`);
            }
            throw error;
        } finally {
            if (cacheKey) requestCache.delete(cacheKey);
        }
    })();

    if (cacheKey) {
        requestCache.set(cacheKey, promise);
    }
    
    return promise;
}
