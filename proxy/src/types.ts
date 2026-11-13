export interface InterceptedRequest {
	id: string;
	timestamp: Date;
	host: string;
	method: string;
	path: string;
	headers: Record<string, string>;
	body: string;
	response?: {
		status: number;
		headers: Record<string, string>;
		body: string;
	};
	latency?: number;
	error?: string;
}

export interface ProxyConfig {
	port: number;
	uiPort: number;
	llmHosts: string[];
	maxRequests: number;
}
