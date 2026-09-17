import { describe, expect, test } from 'bun:test';

import type { Profile } from '../../../shared/types/profile';
import type { v2 } from '../../../server/handlers/codex-generated-types';
import {
  buildProviderMenuEntries,
  profileToOixProviderId,
} from './interpreterProviderMenu';

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: 'profile-1',
    name: 'Profile',
    provider: 'api',
    modelId: 'model-1',
    isBuiltin: false,
    ...overrides,
  };
}

describe('profileToOixProviderId', () => {
  test('maps app profile lanes to OIX provider ids', () => {
    expect(profileToOixProviderId(profile({
      provider: 'openai-oauth',
    }))).toBe('openai');
    expect(profileToOixProviderId(profile({
      provider: 'api',
      codexProfileId: 'openai-api',
    }))).toBe('openai');
    expect(profileToOixProviderId(profile({
      provider: 'api',
      codexProfileId: 'openrouter',
    }))).toBe('openrouter');
    expect(profileToOixProviderId(profile({
      provider: 'local',
      codexProfileId: 'lmstudio',
    }))).toBe('lmstudio');
  });

  test('does not invent runtime providers for app-owned lanes', () => {
    expect(profileToOixProviderId(profile({ provider: 'hosted' }))).toBeUndefined();
    expect(profileToOixProviderId(profile({ provider: 'terminal' }))).toBeUndefined();
  });
});

describe('buildProviderMenuEntries', () => {
  test('presents both OpenAI auth experiences over the unified OIX provider', () => {
    const provider: v2.InterpreterProvider = {
      id: 'openai',
      name: 'OpenAI',
      description: 'OpenAI models',
      isCurrent: true,
      configured: true,
      isDefault: true,
    };

    const openAiEntries = buildProviderMenuEntries([provider])
      .filter((entry) => entry.oixProviderId === 'openai');
    expect(openAiEntries).toHaveLength(2);
    expect(openAiEntries.map((entry) => entry.appProviderType).sort())
      .toEqual(['api', 'openai-oauth']);
  });

  test('passes unknown OIX providers through without a Workstation allowlist', () => {
    const provider: v2.InterpreterProvider = {
      id: 'future-provider',
      name: 'Future Provider',
      description: 'Added by a newer OIX release',
      isCurrent: false,
      configured: true,
      isDefault: false,
      baseUrl: 'https://future.example/v1',
      wireApi: 'chat',
      envKey: 'FUTURE_API_KEY',
    };

    const entry = buildProviderMenuEntries([provider])
      .find((candidate) => candidate.oixProviderId === provider.id);
    expect(entry).toMatchObject({
      appProviderType: 'api',
      displayName: 'Future Provider',
      baseUrl: 'https://future.example/v1',
      wireApi: 'chat',
      envKey: 'FUTURE_API_KEY',
    });
    expect(entry?.isDocumentedFallback).not.toBe(true);
  });

  test('offers the model gateway only when the build has one', () => {
    const withoutGateway = buildProviderMenuEntries([])
      .filter((entry) => entry.appProviderType === 'gateway');
    expect(withoutGateway).toEqual([]);

    const withGateway = buildProviderMenuEntries([], { includeModelGateway: true })
      .filter((entry) => entry.appProviderType === 'gateway');
    expect(withGateway).toHaveLength(1);
    expect(withGateway[0]).toMatchObject({
      oixProviderId: '__app:model-gateway',
      configured: true,
    });
  });

  test('never presents the gateway as a runtime provider id', () => {
    // '__app:*' ids must not reach the app-server; the gateway entry is app-only
    // by construction because the runtime cannot enumerate an operator service.
    const gateway = buildProviderMenuEntries([], { includeModelGateway: true })
      .find((entry) => entry.appProviderType === 'gateway');
    expect(gateway?.oixProviderId.startsWith('__app:')).toBe(true);
    expect(profileToOixProviderId(profile({ provider: 'gateway' }))).toBeUndefined();
  });
});
