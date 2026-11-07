import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiCall } from './api';

// Mock the global fetch
const originalFetch = global.fetch;

describe('apiCall', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        global.fetch = originalFetch;
    });

    it('should successfully make a GET request and parse JSON', async () => {
        const mockData = { id: 1, name: 'Test' };
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockData,
        });

        const promise = apiCall('/api/test');
        // Because of fake timers, we don't need to advance them for a simple fetch mock
        const data = await promise;
        
        expect(global.fetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
        expect(data).toEqual(mockData);
    });

    it('should handle 204 No Content', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            status: 204,
        });

        const data = await apiCall('/api/empty');
        expect(data).toEqual({});
    });

    it('should deduplicate concurrent GET requests without an AbortSignal', async () => {
        const mockData = { ok: true };
        
        // We delay the response so both calls happen while the first is in-flight
        let resolver: (value: any) => void;
        const fetchPromise = new Promise(resolve => { resolver = resolve; });
        
        (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(fetchPromise);

        const promise1 = apiCall('/api/dedup');
        const promise2 = apiCall('/api/dedup');

        resolver!({
            ok: true,
            status: 200,
            json: async () => mockData,
        });

        const data1 = await promise1;
        const data2 = await promise2;

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(data1).toEqual(mockData);
        expect(data2).toEqual(mockData);
    });

    it('should NOT deduplicate GET requests if a signal is provided', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({}),
        });

        const controller1 = new AbortController();
        const controller2 = new AbortController();

        const promise1 = apiCall('/api/nodedup', { signal: controller1.signal });
        const promise2 = apiCall('/api/nodedup', { signal: controller2.signal });

        expect(promise1).not.toBe(promise2);

        await Promise.all([promise1, promise2]);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw an error with API message when response is not ok', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({ error: 'Bad Request Data' }),
        });

        await expect(apiCall('/api/fail')).rejects.toThrow('Bad Request Data');
    });

    it('should throw TimeoutError on internal timeout', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce((url, options) => {
            return new Promise((resolve, reject) => {
                if (options?.signal) {
                    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                }
            });
        });

        const promise = apiCall('/api/timeout', { timeout: 1000 });
        
        // Advance time to trigger internal timeout
        vi.advanceTimersByTime(1500);

        // We have to wait for the catch block to run
        await expect(promise).rejects.toThrow('Timeout na requisição para /api/timeout');
    });

    it('should throw AbortError when manually aborted', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce((url, options) => {
            return new Promise((resolve, reject) => {
                if (options?.signal) {
                    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                }
            });
        });
        
        const controller = new AbortController();
        const promise = apiCall('/api/abort', { signal: controller.signal });
        
        controller.abort();
        
        await expect(promise).rejects.toThrow('Aborted');
    });
});
