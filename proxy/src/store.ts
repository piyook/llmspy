import type { InterceptedRequest } from './types';

export class RequestStore {
	private requests: InterceptedRequest[] = [];
	private maxRequests: number;

	constructor(maxRequests: number = 500) {
		this.maxRequests = maxRequests;
	}

	public addRequest(request: InterceptedRequest): void {
		this.requests.unshift(request);
		if (this.requests.length > this.maxRequests) {
			this.requests = this.requests.slice(0, this.maxRequests);
		}
	}

	public getRequests(): InterceptedRequest[] {
		return [...this.requests];
	}

	public clear(): void {
		this.requests = [];
	}

	public updateRequest(
		id: string,
		updates: Partial<InterceptedRequest>,
	): void {
		const index = this.requests.findIndex((req) => req.id === id);
		if (index !== -1) {
			this.requests[index] = { ...this.requests[index], ...updates };
		}
	}
}
