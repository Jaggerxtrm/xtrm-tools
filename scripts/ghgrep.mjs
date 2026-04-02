#!/usr/bin/env node

const ENDPOINT = 'https://mcp.grep.app';
const DEFAULT_LIMIT = 10;

function printUsage() {
  console.log(`ghgrep <query> [options]

Options:
  --lang <langs>       Filter by language (comma-separated): TypeScript,TSX,Python
  --repo <repo>        Filter by repo: facebook/react
  --path <path>        Filter by file path pattern
  --regexp             Treat query as regex (auto-prefixes (?s) for multiline)
  --case               Case-sensitive match
  --words              Match whole words only
  --json               Raw JSON output
  --limit <n>          Max results (default: 10)
  -h, --help           Show help
`);
}

function parseCliArgs(argv) {
  const options = {
    caseSensitive: false,
    json: false,
    languages: [],
    limit: DEFAULT_LIMIT,
    path: undefined,
    regexp: false,
    repo: undefined,
    wholeWords: false,
  };

  const queryParts = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--regexp') {
      options.regexp = true;
      continue;
    }

    if (arg === '--case') {
      options.caseSensitive = true;
      continue;
    }

    if (arg === '--words') {
      options.wholeWords = true;
      continue;
    }

    if (arg === '--lang' || arg === '--repo' || arg === '--path' || arg === '--limit') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === '--lang') {
        options.languages = value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (arg === '--repo') {
        options.repo = value;
      }

      if (arg === '--path') {
        options.path = value;
      }

      if (arg === '--limit') {
        const parsedLimit = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
          throw new Error(`Invalid --limit value: ${value}`);
        }
        options.limit = parsedLimit;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    queryParts.push(arg);
  }

  return {
    options,
    query: queryParts.join(' ').trim(),
  };
}

function parseSseChunk(chunk, state, events) {
  state.buffer += chunk;
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (line === '') {
      if (state.eventData.length > 0) {
        const payload = state.eventData.join('\n').trim();
        if (payload && payload !== '[DONE]') {
          events.push(payload);
        }
      }
      state.eventData = [];
      continue;
    }

    if (line.startsWith('data:')) {
      state.eventData.push(line.slice(5).trimStart());
    }
  }
}

async function parseMcpResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return [await response.json()];
  }

  if (!contentType.includes('text/event-stream')) {
    const body = await response.text();
    throw new Error(`Unexpected response type: ${contentType || 'unknown'}\n${body}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response stream is empty');
  }

  const decoder = new TextDecoder();
  const events = [];
  const state = { buffer: '', eventData: [] };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    parseSseChunk(decoder.decode(value, { stream: true }), state, events);
  }

  const trailingChunk = decoder.decode();
  if (trailingChunk) {
    parseSseChunk(trailingChunk, state, events);
  }

  if (state.eventData.length > 0) {
    const payload = state.eventData.join('\n').trim();
    if (payload && payload !== '[DONE]') {
      events.push(payload);
    }
  }

  return events.map((event) => {
    try {
      return JSON.parse(event);
    } catch {
      return { raw: event };
    }
  });
}

async function callMcp(method, params) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: '2.0',
      method,
      params,
    }),
  });

  const payloads = await parseMcpResponse(response);
  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
  }

  return payloads;
}

function parseSnippetSections(snippetsText) {
  const sections = snippetsText.split(/--- Snippet \d+ \(Line (\d+)\) ---\n/g);
  const snippets = [];

  for (let index = 1; index < sections.length; index += 2) {
    const line = Number.parseInt(sections[index], 10);
    const code = (sections[index + 1] ?? '').trimEnd();
    snippets.push({
      code,
      line: Number.isFinite(line) ? line : undefined,
    });
  }

  return snippets;
}

function parseResultBlock(text) {
  const match = text.match(
    /^Repository:\s*(.+)\nPath:\s*(.+)\nURL:\s*(.+)\nLicense:\s*(.+)\n\nSnippets:\n([\s\S]*)$/,
  );

  if (!match) {
    return null;
  }

  return {
    license: match[4].trim(),
    path: match[2].trim(),
    repo: match[1].trim(),
    snippets: parseSnippetSections(match[5]),
    url: match[3].trim(),
  };
}

function formatEntries(entries) {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const firstSnippetLine = entry.snippets[0]?.line;
    const location = firstSnippetLine ? `${entry.repo}/${entry.path}:${firstSnippetLine}` : `${entry.repo}/${entry.path}`;

    console.log(`${index + 1}. ${location}`);
    console.log(`   ${entry.url}`);
    console.log(`   License: ${entry.license}`);

    for (const snippet of entry.snippets) {
      const lineLabel = snippet.line ? `Line ${snippet.line}` : 'Snippet';
      console.log(`\n   --- ${lineLabel} ---`);
      const snippetLines = snippet.code.split('\n');
      for (const snippetLine of snippetLines) {
        console.log(`   ${snippetLine}`);
      }
    }

    if (index < entries.length - 1) {
      console.log('\n' + '-'.repeat(80) + '\n');
    }
  }
}

function getTextContent(resultPayload) {
  const content = resultPayload?.result?.content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text);
}

async function run() {
  const { options, query } = parseCliArgs(process.argv.slice(2));

  if (options.help || !query) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const requestArguments = {
    query: options.regexp && !query.startsWith('(?s)') ? `(?s)${query}` : query,
  };

  if (options.caseSensitive) {
    requestArguments.matchCase = true;
  }

  if (options.wholeWords) {
    requestArguments.matchWholeWords = true;
  }

  if (options.regexp) {
    requestArguments.useRegexp = true;
  }

  if (options.repo) {
    requestArguments.repo = options.repo;
  }

  if (options.path) {
    requestArguments.path = options.path;
  }

  if (options.languages.length > 0) {
    requestArguments.language = options.languages;
  }

  const payloads = await callMcp('tools/call', {
    arguments: requestArguments,
    name: 'searchGitHub',
  });

  if (options.json) {
    console.log(JSON.stringify(payloads, null, 2));
    return;
  }

  const resultPayload = payloads.find((payload) => payload?.result || payload?.error) ?? payloads[0];

  if (resultPayload?.error) {
    throw new Error(resultPayload.error.message ?? JSON.stringify(resultPayload.error));
  }

  const textBlocks = getTextContent(resultPayload);
  const isError = resultPayload?.result?.isError === true;

  if (isError) {
    throw new Error(textBlocks.join('\n\n') || 'searchGitHub returned an error');
  }

  const parsedEntries = textBlocks
    .map((block) => parseResultBlock(block))
    .filter((entry) => entry !== null)
    .slice(0, options.limit);

  if (parsedEntries.length > 0) {
    formatEntries(parsedEntries);
    return;
  }

  const plainText = textBlocks.join('\n\n').trim();
  if (!plainText) {
    console.log('No results.');
    return;
  }

  console.log(plainText);
}

run().catch((error) => {
  console.error(`ghgrep error: ${error.message}`);
  process.exit(1);
});
