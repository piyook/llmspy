import type { CapturedRequest } from './types.js';

/** Captured requests in memory, newest first, capped at `maxRequests`. */
export class RequestStore {
	private requests: CapturedRequest[] = [];
	private readonly maxRequests: number;

	constructor(maxRequests = 500) {
		this.maxRequests = maxRequests;
	}

	public addRequest(request: CapturedRequest): void {
		this.requests.unshift(request);
		if (this.requests.length > this.maxRequests) {
			this.requests.length = this.maxRequests;
		}
	}

	public getRequests(): CapturedRequest[] {
		return [...this.requests];
	}

	public clear(): void {
		this.requests = [];
	}
}
