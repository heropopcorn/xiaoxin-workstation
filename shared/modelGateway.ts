import { distributionProductConfig } from './productConfig';

/**
 * Distribution model gateway: an OpenAI-compatible endpoint operated by the
 * distribution that owns both the model catalog and the upstream credentials.
 *
 * A distribution that configures a gateway routes every model request through
 * it. The client never learns which upstream vendors are behind it and never
 * holds an upstream API key. The model list is whatever `GET {base}/models`
 * returns, so the operator can add or revoke models without shipping a client
 * release.
 *
 * This is intentionally separate from the hosted API in `hostedApi.ts`: that one
 * derives `{base}/v0/openrouter` and speaks the Responses wire API, while a
 * gateway is a plain Chat Completions base URL. Reusing the hosted path would
 * also miss the catalog, because the hosted model picker reads the runtime's
 * bundled `openrouter` catalog rather than asking any server.
 */
export const MODEL_GATEWAY_BASE_URL_ENV_VAR = 'INTERPRETER_MODEL_GATEWAY_BASE_URL';

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }

  return process.env[name];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Environment override, for pointing a dev build at a gateway running locally
 * without editing a distribution overlay.
 */
export function getModelGatewayOverrideBaseUrl(): string | null {
  const override = readEnv(MODEL_GATEWAY_BASE_URL_ENV_VAR)?.trim();
  if (!override) {
    return null;
  }

  return normalizeBaseUrl(override);
}

/**
 * The gateway base URL, or an empty string when this distribution has no
 * gateway configured. The runtime appends `/models` and `/chat/completions`.
 */
export function getModelGatewayBaseUrl(): string {
  const override = getModelGatewayOverrideBaseUrl();
  if (override) {
    return override;
  }

  return normalizeBaseUrl(distributionProductConfig.modelGatewayBaseUrl ?? '');
}
