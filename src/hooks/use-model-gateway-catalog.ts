import { useCallback, useEffect, useRef, useState } from 'react';

import { providers as providersIpc } from '../ipc';
import type { ModelGatewayCatalog } from '../../server/handlers/modelGateway';

export interface ModelGatewayCatalogState {
  catalog: ModelGatewayCatalog | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch the model catalog from the distribution's model gateway.
 *
 * The gateway decides which models a user may select, so there is no bundled
 * fallback: on failure the catalog stays null and `error` is set, and callers
 * surface that plus retry via `refresh`. A build with no gateway configured
 * resolves to `catalog.configured === false` with no error.
 */
export function useModelGatewayCatalog(): ModelGatewayCatalogState {
  const [catalog, setCatalog] = useState<ModelGatewayCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await providersIpc.listModelGatewayModels();
      if (requestId !== requestIdRef.current) return;
      setCatalog(result);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[model-gateway] listModelGatewayModels failed: ${message}`);
      setCatalog(null);
      setError(message);
    }

    if (requestId === requestIdRef.current) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { catalog, loading, error, refresh: () => void load() };
}
