/**
 * Scripted OpenAI-compatible chat-completions server for the container E2E.
 *
 * - Auxiliary requests are answered automatically: the title request (no
 *   tools) and the compaction request (last user message asks for a summary).
 * - Every other ("main") request consumes the next scripted step; once the
 *   script is exhausted the model answers with plain text.
 * - Every request body is recorded so tests can assert on what OpenCode sent.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type Step =
  | { tool: string; args: Record<string, unknown> }
  | { text: string };

export interface RecordedRequest {
  kind: 'title' | 'compaction' | 'main';
  tools: string[];
  messages: Array<{ role: string; text: string }>;
}

const SUMMARY =
  '## Objective\n- e2e\n\n## Work State\n### Completed\n- (none)\n\n## Next Move\n1. (none)';

function flatten(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';
  return JSON.stringify(content);
}

export class MockLlm {
  readonly requests: RecordedRequest[] = [];
  private server: http.Server | null = null;
  private script: Step[] = [];
  private callCounter = 0;

  /** Replace the script and forget earlier requests. */
  reset(script: Step[]) {
    this.script = [...script];
    this.requests.length = 0;
  }

  async start(): Promise<number> {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => this.handle(req, res, body));
    });
    this.server = server;
    await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve));
    return (server.address() as AddressInfo).port;
  }

  async stop() {
    await new Promise<void>(resolve => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  private handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string
  ) {
    if (!req.url?.includes('chat/completions')) {
      res.writeHead(404).end('{}');
      return;
    }
    const json = JSON.parse(body || '{}') as {
      tools?: Array<{ function?: { name?: string } }>;
      messages?: Array<{ role: string; content: unknown }>;
    };
    const messages = (json.messages ?? []).map(m => ({
      role: m.role,
      text: flatten(m.content),
    }));
    const tools = (json.tools ?? []).map(t => t.function?.name ?? '');
    const last = messages[messages.length - 1]?.text ?? '';

    let kind: RecordedRequest['kind'] = 'main';
    if (tools.length === 0) kind = 'title';
    else if (
      last.includes('MUST summarize') ||
      last.includes('did not fill in the required summary')
    ) {
      kind = 'compaction';
    }
    this.requests.push({ kind, tools, messages });

    if (kind === 'title') return this.text(res, 'E2E session');
    if (kind === 'compaction') return this.text(res, SUMMARY);

    const step = this.script.shift();
    if (step && 'tool' in step) return this.toolCall(res, step);
    return this.text(res, step?.text ?? 'done');
  }

  private sse(res: http.ServerResponse, chunks: unknown[]) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }

  private base = {
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'mock',
  };

  private text(res: http.ServerResponse, text: string) {
    this.sse(res, [
      {
        ...this.base,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: text },
            finish_reason: null,
          },
        ],
      },
      {
        ...this.base,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ]);
  }

  private toolCall(
    res: http.ServerResponse,
    step: { tool: string; args: Record<string, unknown> }
  ) {
    this.sse(res, [
      {
        ...this.base,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: `call_${++this.callCounter}`,
                  type: 'function',
                  function: {
                    name: step.tool,
                    arguments: JSON.stringify(step.args),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        ...this.base,
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      },
    ]);
  }
}
