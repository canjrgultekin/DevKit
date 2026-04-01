export declare function devkitApi<T = Record<string, unknown>>(endpoint: string, method?: "GET" | "POST" | "PUT" | "DELETE", data?: unknown): Promise<T>;
export declare function formatResult(data: unknown): string;
