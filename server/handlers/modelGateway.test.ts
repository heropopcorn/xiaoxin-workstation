import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { MODEL_GATEWAY_BASE_URL_ENV_VAR } from '../../shared/modelGateway';

type Responder = (path: string) => { status: number; body: string; contentType?: string };

let server: Server;
let respond: Responder;
const originalEnv = process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR];

async function startGateway(): Promise<string> {
  server = createServer((request, response) => {
    const result = respond(request.url ?? '');
    response.writeHead(result.status, {
      'Content-Type': result.contentType ?? 'application/json;charset=UTF-8',
    });
    response.end(result.body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/llm-gateway/v1`;
}

/** Mirrors the shape the SupplyChain gateway actually serves. */
function catalogEntry(id: string, name: string, supportsTools: boolean) {
  return {
    id,
    object: 'model',
    owned_by: 'xiaoxin',
    name,
    description: 'tool calling',
    supported_parameters: supportsTools
      ? ['temperature', 'top_p', 'stream', 'tools', 'tool_choice']
      : ['temperature', 'top_p', 'stream'],
    architecture: { input_modalities: ['text', 'image'] },
  };
}

// Imported lazily so each test observes the env var set in its own body.
async function listModels() {
  const { listModelGatewayModels } = await import('./modelGateway');
  return listModelGatewayModels();
}

beforeEach(() => {
  respond = () => ({ status: 404, body: '{}' });
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (originalEnv === undefined) delete process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR];
  else process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR] = originalEnv;
});

describe('listModelGatewayModels', () => {
  test('requests /models on the configured base and keeps non-ASCII display names', async () => {
    let requestedPath = '';
    respond = (path) => {
      requestedPath = path;
      return {
        status: 200,
        body: JSON.stringify({
          object: 'list',
          data: [catalogEntry('qwen3.8-max', '千问3.8-Max（推荐）', true)],
        }),
      };
    };
    process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR] = await startGateway();

    const { models } = await listModels();

    expect(requestedPath).toBe('/llm-gateway/v1/models');
    expect(models).toEqual([
      {
        id: 'qwen3.8-max',
        name: '千问3.8-Max（推荐）',
        isDefault: false,
        description: 'tool calling',
      },
    ]);
  });

  test('drops models that do not advertise tool calling', async () => {
    respond = () => ({
      status: 200,
      body: JSON.stringify({
        object: 'list',
        data: [
          catalogEntry('with-tools', 'With tools', true),
          catalogEntry('no-tools', 'No tools', false),
        ],
      }),
    });
    process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR] = await startGateway();

    const { models } = await listModels();

    expect(models.map((model) => model.id)).toEqual(['with-tools']);
  });

  test('honours an explicit default marker from the gateway', async () => {
    respond = () => ({
      status: 200,
      body: JSON.stringify({
        object: 'list',
        data: [
          catalogEntry('first', 'First', true),
          { ...catalogEntry('second', 'Second', true), is_default: true },
        ],
      }),
    });
    process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR] = await startGateway();

    const { models } = await listModels();

    // No model is promoted by position: only the marked one claims the default.
    expect(models.map((model) => [model.id, model.isDefault])).toEqual([
      ['first', false],
      ['second', true],
    ]);
  });

  test('fails instead of falling back when the gateway errors', async () => {
    respond = () => ({ status: 502, body: '{"error":{"message":"upstream"}}' });
    process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR] = await startGateway();

    await expect(listModels()).rejects.toThrow('HTTP 502');
  });

  test('fails when the catalog has no tool-capable model', async () => {
    respond = () => ({
      status: 200,
      body: JSON.stringify({
        object: 'list',
        data: [catalogEntry('no-tools', 'No tools', false)],
      }),
    });
    process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR] = await startGateway();

    await expect(listModels()).rejects.toThrow('no usable models');
  });

  test('reports an unconfigured build instead of throwing', async () => {
    delete process.env[MODEL_GATEWAY_BASE_URL_ENV_VAR];

    // The renderer cannot see the endpoint, so "no gateway" has to travel back
    // as data; throwing would be indistinguishable from a gateway outage.
    const catalog = await listModels();

    expect(catalog.configured).toBe(false);
    expect(catalog.models).toEqual([]);
  });
});
