import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ModelGatewayCatalog } from '../../server/handlers/modelGateway';
import {
  MODEL_GATEWAY_PICKER_ERROR_ID,
  MODEL_GATEWAY_PICKER_ID,
  MODEL_GATEWAY_PICKER_OPTION_ITEM_ID,
  MODEL_GATEWAY_PICKER_RETRY_BUTTON_ID,
} from '../../shared/element-ids';
import { Button } from './ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from './ui/field';

interface ModelGatewayPickerProps {
  label: string;
  description?: string;
  modelId?: string;
  catalog: ModelGatewayCatalog | null;
  loading: boolean;
  error?: string | null;
  onModelChange: (modelId: string, name?: string) => void;
  onRefresh: () => void;
}

const OPTION_CLASS = '[background-color:var(--picker-card-bg)] transition-[background-color] duration-150 hover:[background-color:var(--picker-card-hover-bg)]';
const OPTION_BG = 'color-mix(in srgb, var(--oa-bg-app, var(--background)) 96%, var(--oa-bg-subtle, var(--muted)) 4%)';
const OPTION_HOVER_BG = 'color-mix(in srgb, var(--oa-bg-subtle, var(--muted)) 20%, var(--oa-bg-app, var(--background)) 80%)';
const OPTION_SELECTED_BG = 'color-mix(in srgb, var(--oa-bg-subtle, var(--muted)) 24%, var(--oa-bg-app, var(--background)) 76%)';
const OPTION_SELECTED_HOVER_BG = 'color-mix(in srgb, var(--oa-bg-subtle, var(--muted)) 32%, var(--oa-bg-app, var(--background)) 68%)';

/**
 * Model picker for a distribution-operated gateway.
 *
 * Deliberately not the hosted picker: this list is short, operator-curated, and
 * already carries display names and descriptions, so it needs no search, no
 * provider grouping, and no recommended grid. It is also the only model surface
 * for a gateway profile, which is why an outage renders an explicit error with
 * a retry rather than an empty dropdown the user cannot explain.
 */
export function ModelGatewayPicker({
  label,
  description,
  modelId,
  catalog,
  loading,
  error = null,
  onModelChange,
  onRefresh,
}: ModelGatewayPickerProps) {
  const { t } = useTranslation();
  const models = catalog?.models ?? [];

  return (
    <FieldGroup className="gap-3" data-testid={MODEL_GATEWAY_PICKER_ID}>
      <Field>
        <FieldLabel>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </Field>

      {loading && models.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-ui-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : null}

      {error ? (
        <div
          data-testid={MODEL_GATEWAY_PICKER_ERROR_ID}
          className="flex flex-col items-start gap-2 rounded-[var(--control-radius)] px-3 py-3"
          style={{
            border: 'var(--border-width) solid var(--border)',
            background: 'color-mix(in srgb, var(--oa-bg-subtle, var(--muted)) 30%, transparent)',
          }}
        >
          <p className="text-ui-sm text-destructive">
            {t('settings.profiles.provider.modelGateway.unavailable')}
          </p>
          <Button
            type="button"
            variant="utility"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            data-testid={MODEL_GATEWAY_PICKER_RETRY_BUTTON_ID}
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.tryAgain')}
          </Button>
        </div>
      ) : null}

      {!error && !loading && models.length === 0 ? (
        <p className="py-2 text-ui-sm text-muted-foreground">
          {t('settings.profiles.provider.modelGateway.empty')}
        </p>
      ) : null}

      {models.length > 0 ? (
        <div className="flex flex-col gap-2">
          {models.map((model) => {
            const isSelected = modelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                data-testid={MODEL_GATEWAY_PICKER_OPTION_ITEM_ID}
                data-model-id={model.id}
                onClick={() => onModelChange(model.id, model.name)}
                className={`flex items-center gap-3 rounded-[var(--control-radius)] px-3 py-2.5 text-left ${OPTION_CLASS}`}
                style={{
                  border: 'var(--border-width) solid var(--border)',
                  '--picker-card-bg': isSelected ? OPTION_SELECTED_BG : OPTION_BG,
                  '--picker-card-hover-bg': isSelected ? OPTION_SELECTED_HOVER_BG : OPTION_HOVER_BG,
                } as React.CSSProperties}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui-sm font-medium text-foreground">
                    {model.name}
                  </div>
                  <div className="truncate text-ui-xs text-muted-foreground">
                    {model.description || model.id}
                  </div>
                </div>
                {isSelected ? <Check className="size-4 shrink-0 text-foreground" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </FieldGroup>
  );
}
