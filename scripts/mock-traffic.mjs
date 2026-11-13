// Sends one request of each kind through LLMSpy to the llmock servers that
// `npm run mock` starts, so the UI fills with known, synthetic traffic.
// The proxy must run with:
//   LLMSPY_UPSTREAMS=llmock=http://127.0.0.1:8001,llmock-openai=http://127.0.0.1:8002
// The markers (#tools, #max-tokens, ...) select the replies set in mock/.llmockrc.json.

const proxy = process.env.LLMSPY_URL ?? 'http://127.0.0.1:8080';
const anthropicUrl = `${proxy}/llmock/v1/messages`;
const openaiUrl = `${proxy}/llmock-openai/v1/chat/completions`;
// The OpenAI mock streams or not by its own setting, not the request's
// `stream`, so the script switches it through llmock's admin API.
const openaiMock = process.env.LLMOCK_OPENAI_URL ?? 'http://127.0.0.1:8002';

const anthropicHeaders = {
	'content-type': 'application/json',
	'x-api-key': 'sk-ant-test-mock',
	'anthropic-version': '2023-06-01',
};
const openaiHeaders = {
	'content-type': 'application/json',
	authorization: 'Bearer sk-test-mock',
};

const weatherTool = {
	name: 'get_weather',
	description: 'Current weather for a city',
	input_schema: {
		type: 'object',
		properties: { city: { type: 'string' } },
		required: ['city'],
	},
};

function anthropicBody(messages, extra = {}) {
	return {
		model: 'claude-mock',
		max_tokens: 1024,
		system: 'You are a helpful assistant.',
		messages,
		...extra,
	};
}

function openaiBody(content) {
	return {
		model: 'gpt-mock',
		messages: [
			{ role: 'system', content: 'You are a helpful assistant.' },
			{ role: 'user', content },
		],
	};
}

/** Sends one request and reads the whole response, reporting how it ended. */
async function send(label, url, headers, body) {
	let status = 'no response';
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
		});
		status = res.status;
		const text = await res.text();
		console.log(`${label.padEnd(40)} ${status} (${text.length} bytes)`);
		return text;
	} catch (error) {
		console.log(
			`${label.padEnd(40)} ${status}: ${error.cause?.code ?? error.message}`,
		);
		return undefined;
	}
}

async function setOpenaiStream(stream) {
	const res = await fetch(`${openaiMock}/admin/settings`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ stream }),
	});
	if (!res.ok) throw new Error(`llmock admin API: ${res.status}`);
}

async function anthropic() {
	const ask = (label, content, extra) =>
		send(
			label,
			anthropicUrl,
			anthropicHeaders,
			anthropicBody([{ role: 'user', content }], extra),
		);

	await ask('anthropic: plain', 'Write a short poem.');
	await ask('anthropic: streamed', 'Write a short poem.', { stream: true });

	// Tool loop: the first call returns a tool_use block, the second gets
	// its tool_result and answers.
	const question = {
		role: 'user',
		content: 'Plan a picnic in Paris. #tools',
	};
	const first = await send(
		'anthropic: tool loop, step 1',
		anthropicUrl,
		anthropicHeaders,
		anthropicBody([question], { tools: [weatherTool] }),
	);
	const reply = first && JSON.parse(first);
	const toolUse = reply?.content?.find((block) => block.type === 'tool_use');
	if (toolUse) {
		await send(
			'anthropic: tool loop, step 2 (stream)',
			anthropicUrl,
			anthropicHeaders,
			anthropicBody(
				[
					question,
					{ role: 'assistant', content: reply.content },
					{
						role: 'user',
						content: [
							{
								type: 'tool_result',
								tool_use_id: toolUse.id,
								content: 'sunny, 24C',
							},
						],
					},
				],
				{ tools: [weatherTool], stream: true },
			),
		);
	}

	await ask('anthropic: max_tokens', 'Explain everything. #max-tokens');
	await ask('anthropic: refusal (stream)', 'Do something bad. #refusal', {
		stream: true,
	});
	await ask('anthropic: 429', 'Hello. #rate-limit');
	await ask('anthropic: error mid-stream', 'Hello. #stream-error', {
		stream: true,
	});
	await ask('anthropic: dropped mid-stream', 'Hello. #stream-drop', {
		stream: true,
	});
}

async function openai() {
	const ask = (label, content) =>
		send(label, openaiUrl, openaiHeaders, openaiBody(content));

	await ask('openai: plain', 'Write a short poem.');
	await ask('openai: max_tokens', 'Explain everything. #max-tokens');
	await ask('openai: refusal', 'Do something bad. #refusal');
	await ask('openai: 429', 'Hello. #rate-limit');

	await setOpenaiStream(true);
	try {
		const stream = (label, content) =>
			send(label, openaiUrl, openaiHeaders, {
				...openaiBody(content),
				stream: true,
			});
		await stream('openai: streamed', 'Write a short poem.');
		await stream('openai: error mid-stream', 'Hello. #stream-error');
		await stream('openai: dropped mid-stream', 'Hello. #stream-drop');
	} finally {
		await setOpenaiStream(false);
	}
}

await anthropic();
await openai();
