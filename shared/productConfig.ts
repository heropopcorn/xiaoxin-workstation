import product from '../product.json';

export interface DistributionProductConfig {
  id: string;
  hostedApiBaseUrl: string;
  /**
   * OpenAI-compatible base URL of the distribution's own model gateway, e.g.
   * `https://gateway.example.com/llm-gateway/v1`. The runtime appends `/models`
   * and `/chat/completions` to it.
   *
   * This is deliberately separate from `hostedApiBaseUrl`: the hosted API
   * derives `{base}/v0/openrouter` and speaks the Responses wire API, while a
   * model gateway is a plain Chat Completions endpoint that also owns the model
   * catalog. A distribution that sets this field routes every model request
   * through its own service and never exposes upstream vendors or their
   * credentials to the client.
   */
  modelGatewayBaseUrl: string;
  auth: {
    provider: 'none' | 'supabase';
    url: string;
    anonKey: string;
    storageKey: string;
  };
  telemetry: {
    sentryDsn: string;
    eventsUrl: string;
    eventsAnonKey: string;
  };
  newsletterUrl: string;
  interviewBookingUrl: string;
  billingApiBaseUrl: string;
  updates: {
    provider: 'none' | 's3';
    bucket: string;
    endpoint: string;
    path: string;
    internalPath: string;
    region: string;
    acl: '' | 'private' | 'public-read';
  };
  documentEngine: {
    releaseRepository: string;
    installDirectoryName: string;
  };
}

type ProductWithDistribution = typeof product & {
  distribution: DistributionProductConfig;
};

export const distributionProductConfig = (product as ProductWithDistribution).distribution;

export function hasHostedAccountProvider(): boolean {
  const auth = distributionProductConfig.auth;
  return auth.provider !== 'none' && Boolean(auth.url && auth.anonKey);
}

export function hasHostedApi(): boolean {
  return Boolean(distributionProductConfig.hostedApiBaseUrl.trim());
}

// The model gateway accessor lives in `modelGateway.ts` because it also honours
// an environment override; a second predicate here that ignored the override
// would disagree with the URL actually used at runtime.

export function hasNewsletter(): boolean {
  return Boolean(distributionProductConfig.newsletterUrl.trim());
}

export function hasUpdateFeed(): boolean {
  const updates = distributionProductConfig.updates;
  return updates.provider === 's3'
    && Boolean(updates.bucket && updates.endpoint && updates.path && updates.region);
}
