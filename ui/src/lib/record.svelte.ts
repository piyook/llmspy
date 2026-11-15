import type { CallSummary, CapturedRequest } from './types.js';

/** The full record of a call, or undefined when the proxy no longer holds it. */
async function fetchRecord(id: string): Promise<CapturedRequest | undefined> {
	try {
		const res = await fetch(`/api/requests/${id}`);
		return res.ok ? await res.json() : undefined;
	} catch (err) {
		console.error('Failed to load request:', err);
		return undefined;
	}
}

/**
 * The full record of the call `summary()` names, fetched again each time its
 * summary changes (every update while it runs). `current` is undefined until
 * the record of that call has arrived, and keeps the last one meanwhile, so
 * a running call does not flicker. Call it while a component initialises.
 */
export function fullRecord(summary: () => CallSummary | undefined): {
	readonly current: CapturedRequest | undefined;
} {
	let record = $state.raw<CapturedRequest>();
	let sent = 0;
	let applied = 0;

	$effect(() => {
		const call = summary();
		if (!call) return;
		const order = ++sent;
		fetchRecord(call.id).then((loaded) => {
			// An answer to an older fetch must not replace a newer one.
			if (order < applied) return;
			applied = order;
			record = loaded;
		});
	});

	return {
		get current() {
			const call = summary();
			return call && record?.id === call.id ? record : undefined;
		},
	};
}
