import type { CapturedRequest } from './types.js';

/** Captured requests in memory, newest first, capped at `maxRequests`. */
export class RequestStore {
	private requests: CapturedRequest[] = [];
	private readonly maxRequests: number;

	constructor(maxRequests = 500) {
		this.maxRequests = maxRequests;
	}

	/**
	 * Adds a request at the front, or replaces the one with the same id where
	 * it is: a call is stored while it runs and again when it ends.
	 */
	public addRequest(request: CapturedRequest): void {
		const index = this.requests.findIndex(({ id }) => id === request.id);
		if (index !== -1) {
			this.requests[index] = request;
			return;
		}
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
