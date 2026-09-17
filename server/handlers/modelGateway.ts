import { getModelGatewayBaseUrl } from '../../shared/modelGateway';
import type { SupportedOpenAIOAuthModel } from '../../shared/types/provider';

const REQUEST_TIMEOUT_MS = 8000;

/**
 * Raw `GET {base}/models` entry. OpenAI-compatible plus the optional fields our
 * own gateway adds; anything unknown is ignored.
 */
interface GatewayCatalogEntry {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  is_default?: unknown;
  supported_parameters?: unknown;
}

export interface ModelGatewayModel extends SupportedOpenAIOAuthModel {
  description?: string;
}

export interface ModelGatewayCatalog {
  /**
   * False when this build has no gateway endpoint at all. Reported rather than
   * thrown so the renderer never has to read the endpoint itself: the override
   * lives in the main process environment and is invisible to the renderer.
   */
  configured: boolean;
  models: ModelGatewayModel[];
  fetchedAt: number;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parameter = readString(entry);
    return parameter ? [parameter] : [];
  });
}

/**
 * Fetch the model catalog from the distribution's model gateway.
 *
 * The gateway is the source of truth for which models a user may select, so
 * there is no bundled fallback: a failure surfaces as an error and the caller
 * decides how to present it.
 *
 * Note this deliberately does not go through the runtime's
 * `interpreter/model/list`. That path only fetches a provider's `/models` when
 * the provider declares command-backed auth, and it then merges the result with
 * the runtime's own bundled catalog, which would put models we do not operate
 * into the picker. See `docs/hosted-gateway/t04-client-gateway-provider.md`.
 */
export async function listModelGatewayModels(): Promise<ModelGatewayCatalog> {
  const baseUrl = getModelGatewayBaseUrl();
  if (!baseUrl) {
    return { configured: false, models: [], fetchedAt: Date.now() };
  }

  const url = new URL('models', `${baseUrl}/`).href;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Model gateway model list request failed: HTTP ${response.status}`);
  }

  const body = await response.json() as { data?: unknown };
  const entries: GatewayCatalogEntry[] = Array.isArray(body.data) ? body.data : [];

  const models: ModelGatewayModel[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = readString(entry.id);
    if (!id || seen.has(id)) continue;

    // Tool calling is not optional for a desktop agent: a model that cannot
    // call tools cannot operate the machine, so offering it would only produce
    // turns that look successful while doing nothing. This mirrors the rule the
    // runtime applies to a provider catalog (`supported_parameters` without
    // "tools" is hidden), which keeps both model lanes consistent.
    if (!readStringArray(entry.supported_parameters).includes('tools')) continue;

    seen.add(id);
    const description = readString(entry.description);
    models.push({
      id,
      name: readString(entry.name) || id,
      // The gateway may mark a default; until it does, no model claims to be
      // one rather than the client silently promoting whichever came first.
      isDefault: entry.is_default === true,
      ...(description ? { description } : {}),
    });
  }

  if (models.length === 0) {
    throw new Error('Model gateway returned no usable models');
  }

  return { configured: true, models, fetchedAt: Date.now() };
}
