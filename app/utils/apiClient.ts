// app/utils/apiClient.ts
import { API_BASE_URL } from '../config/api';

export async function apiCall<T>(endpoint: string, options?: RequestInit & { timeout?: number }): Promise<T> {
    const timeout = options?.timeout ?? 180000; // Timeout padrão de 180 segundos
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

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
            throw new Error(errorData.msg || errorData.message || `Erro HTTP! Status: ${response.status}`);
        }

        // Se a resposta for vazia (ex: status 204), retorna objeto vazio tipado
        if (response.status === 204) return {} as T;

        return await response.json();
    } catch (error: unknown) { // 🧼 Substituído 'any' por 'unknown' para tipagem estrita
        clearTimeout(id);
        // 🛡️ Validação segura de instância antes de acessar propriedades dinâmicas do erro
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`A requisição excedeu o tempo limite de resposta (Timeout de ${timeout / 1000}s).`);
        }
        throw error;
    }
}
