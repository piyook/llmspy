/** What the list shows, as the filters of `GET /api/export`. */
export interface ExportView {
	project: string;
	search: string;
	failedOnly: boolean;
	/** Epoch ms of the oldest call a minutes chip keeps; undefined without one. */
	since?: number;
}

/** The address of the export of the calls in the list. */
export function exportUrl({
	project,
	search,
	failedOnly,
	since,
}: ExportView): string {
	const params = new URLSearchParams({ project });
	if (search) params.set('q', search);
	if (failedOnly) params.set('failed', '1');
	if (since !== undefined) params.set('since', String(since));
	return `/api/export?${params}`;
}
