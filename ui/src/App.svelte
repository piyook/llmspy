<script lang="ts">
import { onMount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
// The proxy's own counts, so the cards and `GET /api/stats` agree.
import { toCounts } from '../../proxy/src/stats.js';
import ConfirmDialog from './ConfirmDialog.svelte';
import DayHeader from './DayHeader.svelte';
import Detail from './Detail.svelte';
import EmptyList from './EmptyList.svelte';
import FailedChip from './FailedChip.svelte';
import { previousCall } from './lib/compare.js';
import {
	type DayGroup,
	dayKey,
	dayLabel,
	groupByDay,
	withinLast,
} from './lib/days.js';
import { exportUrl } from './lib/export.js';
import {
	countByProject,
	countSince,
	DEFAULT_PROJECT,
	projectNames,
} from './lib/projects.js';
import { fullRecord } from './lib/record.svelte.js';
import {
	callState,
	countFailed,
	isShown,
	newestFirst,
	onlyFailed,
} from './lib/requests.js';
import { statsCards } from './lib/stats.js';
import type { CallSummary, Tab } from './lib/types.js';
import ProjectTabs from './ProjectTabs.svelte';
import RecentChips from './RecentChips.svelte';
import RequestRow from './RequestRow.svelte';
import StatsCards from './StatsCards.svelte';
import Toolbar from './Toolbar.svelte';

/** How long to wait before reopening `/events` after the browser gives up on it. */
const RECONNECT_MS = 3000;
/** How long typing must pause before the proxy is asked for the search. */
const SEARCH_DELAY_MS = 250;

// The summary of each call, from `/events`. Keyed by id, so an update to a
// running call replaces its row.
const requests = new SvelteMap<string, CallSummary>();
let search = $state('');
let selectedId = $state<string>();
// Whether `/events` is open: it is served by the proxy that forwards
// traffic, so this is also whether LLMSpy is listening.
let connected = $state(false);
// Where the proxy listens, e.g. `127.0.0.1:8080`, shown in the status tooltip.
let address = $state<string>();
// The proxy's version, shown in Settings.
let version = $state<string>();

async function loadPing() {
	try {
		const ping = await (await fetch('/ping')).json();
		if (typeof ping.port === 'number') {
			address = `${location.hostname}:${ping.port}`;
		}
		if (typeof ping.version === 'string') version = ping.version;
	} catch {
		// Only details: without them the icon just says "Listening" and
		// Settings shows no version.
	}
}

const projects = $derived(projectNames(requests.values()));
let chosenProject = $state(DEFAULT_PROJECT);
// A project's tab goes once its last call is deleted or cleared.
const project = $derived(
	projects.includes(chosenProject) ? chosenProject : DEFAULT_PROJECT,
);
// When each project was last viewed, for the count of new calls on its tab.
// Calls from before the page opened are not new.
const openedAt = Date.now();
const lastViewed = new SvelteMap<string, number>();
const unseen = (name: string) =>
	countSince(requests.values(), name, lastViewed.get(name) ?? openedAt);

function chooseProject(name: string) {
	if (name === project) return;
	const now = Date.now();
	lastViewed.set(project, now);
	lastViewed.set(name, now);
	chosenProject = name;
	selectedId = undefined;
	pickedId = undefined;
	picking = false;
}

// Looked up by id, so the selection stays put as new requests arrive.
const selected = $derived(selectedId ? requests.get(selectedId) : undefined);
// The detail pane shows the full record, fetched again as the call runs.
const selectedRecord = fullRecord(() => selected);

let tab = $state<Tab>('conversation');
// The call the Compare tab compares the selected one with: the one picked
// in the list, or else the previous call to the same upstream.
let pickedId = $state<string>();
// Whether the next click in the list picks that call instead of selecting.
let picking = $state(false);
const other = $derived.by(() => {
	if (!selected) return undefined;
	const picked = pickedId ? requests.get(pickedId) : undefined;
	return picked ?? previousCall(requests.values(), selected);
});
const comparing = $derived(selected !== undefined && tab === 'compare');
// Only the Compare tab needs the other call's body.
const otherRecord = fullRecord(() => (comparing ? other : undefined));
// Whether the pane is waiting for a record, rather than showing an older one.
const loading = $derived(
	!selectedRecord.current ||
		(comparing && other !== undefined && !otherRecord.current),
);

function onrowclick(id: string) {
	if (picking) {
		picking = false;
		if (id !== selectedId) pickedId = id;
		return;
	}
	selectedId = id;
	pickedId = undefined;
}

function onkeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') picking = false;
}

// The calls of every project that match `search`, from the proxy, which
// holds the bodies; undefined until the first answer.
let found = $state.raw<CallSummary[]>();
// Without calls deleted since the answer.
const matched = $derived(found?.filter(({ id }) => requests.has(id)));
const matches = $derived(matched && new Set(matched.map(({ id }) => id)));
// How many matches each project has, for its tab.
const matchCounts = $derived(matched && countByProject(matched));
// The search is run again when a call ends, since its reply may match.
const finished = $derived(
	[...requests.values()].filter((call) => callState(call) === 'done').length,
);
$effect(() => {
	const term = search;
	void finished;
	if (!term) {
		found = undefined;
		return;
	}
	let stale = false;
	const timer = setTimeout(async () => {
		try {
			const res = await fetch(
				`/api/requests?${new URLSearchParams({ q: term })}`,
			);
			if (!res.ok) return;
			const calls: CallSummary[] = await res.json();
			if (!stale) found = calls;
		} catch (err) {
			console.error('Failed to search requests:', err);
		}
	}, SEARCH_DELAY_MS);
	return () => {
		stale = true;
		clearTimeout(timer);
	};
});

// The other projects with matches, named when the one shown has none.
const elsewhere = $derived(
	projects.flatMap((name): [string, number][] => {
		const count = matchCounts?.get(name) ?? 0;
		return name !== project && count > 0 ? [[name, count]] : [];
	}),
);

// Only the failed calls, on every tab, while the Failed chip is pressed.
let failedOnly = $state(false);

// The project's calls that match the search, failed or not.
const inView = $derived(
	[...requests.values()]
		.filter((call) =>
			isShown(call, { project, matches: search ? matches : undefined }),
		)
		.sort(newestFirst),
);
const visible = $derived(failedOnly ? onlyFailed(inView) : inView);

/** How often the day labels are brought up to date. */
const CLOCK_MS = 60_000;
// For the labels, so Today becomes Yesterday at midnight.
let now = $state(Date.now());
const today = $derived(dayKey(now));
// Days opened or closed by hand; any other day is open only if it is today.
const dayOpen = new SvelteMap<string, boolean>();
$effect(() => {
	const timer = setInterval(() => {
		const next = Date.now();
		// A day left at its default stays open after midnight.
		const before = dayKey(now);
		if (dayKey(next) !== before && !dayOpen.has(before)) {
			dayOpen.set(before, true);
		}
		now = next;
	}, CLOCK_MS);
	return () => clearInterval(timer);
});
const groups = $derived(groupByDay(visible));
// While searching or showing failed calls, every day with one is open.
const isOpen = (key: string) =>
	Boolean(search) || failedOnly || (dayOpen.get(key) ?? key === today);

/** How often the window of a recent-minutes chip moves on. */
const RECENT_TICK_MS = 5000;
// Today's calls narrowed to the last few minutes, for every project tab;
// undefined shows all of today. Not used while searching.
let recent = $state<number>();
const narrowing = $derived(recent !== undefined && !search);
// Its own clock, so the day clock still sees midnight go by.
let recentNow = $state(Date.now());
$effect(() => {
	if (!narrowing) return;
	recentNow = Date.now();
	const timer = setInterval(() => (recentNow = Date.now()), RECENT_TICK_MS);
	return () => clearInterval(timer);
});
// The chips sit under Today's heading while it is open, except while searching.
const hasChips = (key: string) => key === today && !search && isOpen(key);
// The calls of a day that are shown: all, or today's recent ones.
const shownCalls = (group: DayGroup) =>
	narrowing && recent !== undefined && group.key === today
		? withinLast(group.calls, recent, recentNow)
		: group.calls;
// Every call in the list, in closed days too, for the cards above it.
const listed = $derived(groups.flatMap(shownCalls));
const cards = $derived(statsCards(toCounts(listed)));
// Export saves the calls in the list; with nothing listed there is nothing to save.
const exportHref = $derived(
	listed.length === 0
		? undefined
		: exportUrl({
				project,
				search,
				failedOnly,
				since:
					narrowing && recent !== undefined
						? recentNow - recent * 60_000
						: undefined,
			}),
);
// The Failed chip counts what pressing it would list, so the chip, the list
// and the Failed card agree under a search or a minutes chip.
const failedCount = $derived(
	countFailed(groupByDay(inView).flatMap(shownCalls)),
);

onMount(() => {
	let events: EventSource | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;

	function connect() {
		events = new EventSource('/events');
		events.onopen = () => {
			connected = true;
			// `/events` replays the whole store after this, so start empty:
			// rows from before a proxy restart would otherwise stay forever.
			requests.clear();
			// Again on every reconnect: a restarted proxy may use another port.
			loadPing();
		};
		events.onmessage = (event) => {
			const call: CallSummary = JSON.parse(event.data);
			requests.set(call.id, call);
		};
		// Clear All in any tab, or a `POST /api/clear` from elsewhere: of one
		// project, or of every project when none is named.
		events.addEventListener('clear', (event) => {
			const { project } = JSON.parse(event.data);
			clearProject(typeof project === 'string' ? project : undefined);
		});
		// One call deleted, in any tab.
		events.addEventListener('delete', (event) => {
			const { id } = JSON.parse(event.data);
			if (typeof id === 'string') removeRequest(id);
		});
		// EventSource retries a dropped connection by itself. It stops for
		// good (CLOSED) only on an HTTP error, e.g. the Vite dev proxy's 5xx
		// while the proxy restarts, so only then open a new one.
		events.onerror = () => {
			connected = false;
			if (events?.readyState === EventSource.CLOSED) {
				retry = setTimeout(connect, RECONNECT_MS);
			}
		};
	}

	connect();
	return () => {
		clearTimeout(retry);
		events?.close();
	};
});

function removeRequest(id: string) {
	requests.delete(id);
	if (selectedId === id) {
		selectedId = undefined;
		picking = false;
	}
	if (pickedId === id) pickedId = undefined;
}

async function deleteRequest(id: string) {
	try {
		const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
		// 404: already gone, e.g. deleted in another tab.
		if (res.ok || res.status === 404) removeRequest(id);
	} catch (err) {
		console.error('Failed to delete request:', err);
	}
}

/** Drops the calls of `name`, or every call when it is undefined. */
function clearProject(name?: string) {
	for (const request of [...requests.values()]) {
		if (name === undefined || request.project === name) {
			removeRequest(request.id);
		}
	}
}

// Clear All asks first: it deletes from disk too, and is easy to click by accident.
let confirmingClear = $state(false);

/** Clear All, once confirmed: the project being viewed only. */
async function clearRequests() {
	confirmingClear = false;
	const name = project;
	try {
		await fetch(`/api/clear?project=${encodeURIComponent(name)}`, {
			method: 'POST',
		});
		clearProject(name);
	} catch (err) {
		console.error('Failed to clear requests:', err);
	}
}
</script>

<svelte:window {onkeydown} />

<Toolbar
  bind:search
  {connected}
  {address}
  {version}
  {exportHref}
  onclear={() => (confirmingClear = true)}
/>
<ConfirmDialog
  open={confirmingClear}
  title={`Clear all calls in ${project}?`}
  confirmLabel="Clear"
  onconfirm={clearRequests}
  oncancel={() => (confirmingClear = false)}
>
  <p>
    This deletes them from LLMSpy's file on disk too, and can't be undone.
    Other projects are not touched.
  </p>
</ConfirmDialog>
<ProjectTabs
  {projects}
  current={project}
  {unseen}
  matches={search ? matchCounts : undefined}
  onchoose={chooseProject}
/>
<StatsCards shown={listed.length > 0} {cards} />

<div class="panes">
  <section class="list" class:picking aria-label="Captured requests">
    {#if picking}
      <p class="pick-hint" role="status">
        Click the call to compare with.
        <button type="button" class="small-btn" onclick={() => (picking = false)}>Cancel</button>
      </p>
    {/if}
    <FailedChip
      pressed={failedOnly}
      count={failedCount}
      ontoggle={() => (failedOnly = !failedOnly)}
    />
    {#each groups as group (group.key)}
      {@const open = isOpen(group.key)}
      {@const calls = shownCalls(group)}
      <div class="day">
        <DayHeader
          label={dayLabel(group.key, now)}
          count={calls.length}
          total={group.calls.length}
          {open}
          ontoggle={() => dayOpen.set(group.key, !open)}
        />
        <RecentChips
          shown={hasChips(group.key)}
          minutes={recent}
          count={calls.length}
          onchoose={(minutes) => (recent = minutes)}
        />
        {#if open}
          {#each calls as request (request.id)}
            <RequestRow
              {request}
              selected={request.id === selectedId}
              {comparing}
              compared={comparing && request.id === other?.id}
              onselect={() => onrowclick(request.id)}
              ondelete={() => deleteRequest(request.id)}
            />
          {/each}
        {/if}
      </div>
    {:else}
      <EmptyList {project} {search} {failedOnly} {elsewhere} onchoose={chooseProject} />
    {/each}
  </section>

  <section class="detail" aria-label="Selected request">
    {#if selected && loading}
      <div class="no-requests">Loading…</div>
    {:else if selectedRecord.current}
      <Detail
        request={selectedRecord.current}
        other={otherRecord.current}
        {picking}
        onpick={() => (picking = !picking)}
        bind:chosen={tab}
      />
    {:else}
      <div class="no-requests">Select a request to see it here.</div>
    {/if}
  </section>
</div>
