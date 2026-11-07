const API_BASE_URL = '';

const requestCache = new Map<string, Promise<unknown>>();

export async function apiCall<T>(endpoint: string, options?: RequestInit & { timeout?: number }): Promise<T> {
    const isGet = !options?.method || options.method.toUpperCase() === 'GET';
    // Don't deduplicate requests that have a caller-provided signal — each caller manages its own lifecycle
    const cacheKey = (isGet && !options?.signal) ? endpoint : null;

    if (cacheKey && requestCache.has(cacheKey)) {
        return requestCache.get(cacheKey)! as Promise<T>;
    }

    const promise = (async () => {
        let timeout = options?.timeout ?? 30000;
        if (endpoint.includes('/api/index')) timeout = 8000;
        else if (endpoint.includes('/api/jarvis') || endpoint.includes('/api/quant') || endpoint.includes('/api/risk-metrics')) timeout = 60000;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        if (options?.signal) {
            // If the caller's signal is already aborted, abort our controller immediately
            if (options.signal.aborted) {
                clearTimeout(id);
                controller.abort(options.signal.reason);
            } else {
                options.signal.addEventListener('abort', () => {
                    controller.abort(options.signal?.reason);
                    clearTimeout(id);
                });
            }
        }

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
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
        } catch (err) {
            const error = err as Error;
            if (error.name === 'AbortError') {
                if (options?.signal?.aborted) {
                    // Intentional abort by the caller — re-throw as AbortError so components ignore it silently
                    throw error;
                }
                // Timeout from our internal timer
                const timeoutErr = new Error(`Timeout na requisição para ${endpoint}`);
                timeoutErr.name = 'TimeoutError';
                throw timeoutErr;
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
