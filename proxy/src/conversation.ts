import type { LlmExchange, LlmMessage, LlmPart } from './parsers/types.js';
import type { CapturedRequest } from './types.js';

const HEADINGS: Record<LlmMessage['role'], string> = {
	user: 'User',
	assistant: 'Assistant',
	tool: 'Tool',
};

/**
 * One call's conversation as Markdown, in full, for an agent to read: the
 * system prompt, tools, messages sent and the reply. `undefined` when the
 * call was not read as an LLM API call.
 */
export function toMarkdown(captured: CapturedRequest): string | undefined {
	const { llm } = captured;
	if (!llm || llm.parseError) return undefined;
	const sections = [header(captured, llm)];
	if (llm.system) sections.push(`## System\n\n${llm.system}`);
	if (llm.tools?.length) {
		const lines = llm.tools.map(({ name, description }) =>
			description ? `- \`${name}\`: ${description}` : `- \`${name}\``,
		);
		sections.push(`## Tools\n\n${lines.join('\n')}`);
	}
	for (const message of llm.messages) {
		sections.push(messageSection(HEADINGS[message.role], message.parts));
	}
	if (llm.output) {
		sections.push(messageSection('Assistant (reply)', llm.output.parts));
	}
	const errors = errorLines(captured, llm);
	if (errors.length) sections.push(`## Error\n\n${errors.join('\n\n')}`);
	return `${sections.join('\n\n')}\n`;
}

function header(captured: CapturedRequest, llm: LlmExchange): string {
	const facts = [captured.timestamp, `project ${captured.project}`];
	facts.push(status(captured));
	if (captured.latency !== undefined) facts.push(`${captured.latency} ms`);
	if (llm.usage) {
		const { input = '?', output = '?' } = llm.usage;
		facts.push(`${input} in / ${output} out tokens`);
	}
	if (llm.stopReason) facts.push(`stop ${llm.stopReason}`);
	return `# ${llm.model ?? 'unknown model'} · ${llm.format}\n\n${facts.join(' · ')}`;
}

function status(captured: CapturedRequest): string {
	if (captured.timings.end === undefined) return 'running';
	if (captured.response) return `status ${captured.response.status}`;
	return 'no response';
}

function errorLines(captured: CapturedRequest, llm: LlmExchange): string[] {
	const lines: string[] = [];
	if (llm.error) {
		const type = llm.error.type ? `${llm.error.type}: ` : '';
		lines.push(`${type}${llm.error.message}`);
	}
	if (captured.error) lines.push(captured.error);
	return lines;
}

function messageSection(heading: string, parts: LlmPart[]): string {
	const body = parts.map(renderPart).join('\n\n');
	return body ? `## ${heading}\n\n${body}` : `## ${heading}`;
}

function renderPart(part: LlmPart): string {
	switch (part.type) {
		case 'text':
			return part.text;
		case 'thinking':
			return quote(`*Thinking*\n\n${part.text}`);
		case 'tool_call':
			return `**Tool call** \`${part.name}\` (${part.id})\n\n${fence(json(part.input), 'json')}`;
		case 'tool_result': {
			const failed = part.isError ? ', error' : '';
			return `**Tool result** (${part.id}${failed})\n\n${fence(part.content)}`;
		}
		case 'image':
			return '[image]';
		case 'other':
			return fence(json(part.raw), 'json');
	}
}

function quote(text: string): string {
	return text
		.split('\n')
		.map((line) => (line ? `> ${line}` : '>'))
		.join('\n');
}

function json(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? 'undefined';
}

/** A code fence longer than any run of backticks in the content, so it cannot close early. */
function fence(content: string, lang = ''): string {
	const longest = Math.max(
		0,
		...(content.match(/`+/g) ?? []).map((run) => run.length),
	);
	const ticks = '`'.repeat(Math.max(3, longest + 1));
	return `${ticks}${lang}\n${content}\n${ticks}`;
}
