// app/utils/apiClient.ts
import { API_BASE_URL } from '../config/api';

export async function apiCall<T>(endpoint: string, options?: RequestInit & { timeout?: number }): Promise<T> {
    const timeout = options?.timeout ?? 10000; // Timeout padrão de 10 segundos
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
            throw new Error(errorData.message || `Erro HTTP! Status: ${response.status}`);
        }

        // Se a resposta for vazia (ex: status 204), retorna objeto vazio tipado
        if (response.status === 204) return {} as T;

        return await response.json();
    } catch (error: unknown) { // 🧼 Substituído 'any' por 'unknown' para tipagem estrita
        clearTimeout(id);
        // 🛡️ Validação segura de instância antes de acessar propriedades dinâmicas do erro
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('A requisição excedeu o tempo limite de resposta (Timeout de 10s).');
        }
        throw error;
    }
}

export const secureStorage = {
    set: (key: string, value: unknown): void => { // 🧼 Substituído 'any' por 'unknown'
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            const encrypted = btoa(stringValue);
            localStorage.setItem(key, encrypted);
        } catch (e) {
            console.error("Erro ao salvar no secureStorage", e);
        }
    },
    get: (key: string): string | null => {
        try {
            const encrypted = localStorage.getItem(key);
            if (!encrypted) return null;

            // Tenta decodificar o Base64 de forma segura
            try {
                return atob(encrypted);
            } catch {
                // Se o atob falhar, significa que o dado é antigo/texto puro (ex: "true")
                // Retornamos o próprio dado bruto para não quebrar a aplicação
                return encrypted;
            }
        } catch (e) {
            console.error("Erro ao ler do secureStorage", e);
            return null;
        }
    }
};
