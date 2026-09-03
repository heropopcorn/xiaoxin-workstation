import { randomUUID } from 'node:crypto';
import type { StreamImageAttachment } from '../../../src/lib/codex/api-types';
import type { OverlayUserAttachment } from '../shared/ipc.js';

export function toOverlayStreamImageAttachments(
  attachments: OverlayUserAttachment[],
): StreamImageAttachment[] {
  return attachments.flatMap((attachment) => {
    if (attachment.kind !== 'image' || !attachment.dataUrl) {
      return [];
    }
    return [{
      id: attachment.id,
      kind: 'image',
      name: attachment.name,
      mimeType: attachment.mimeType || 'image/png',
      dataUrl: attachment.dataUrl,
    }];
  });
}

export function createOverlayScreenshotStreamAttachment(params: {
  id?: string;
  name: string;
  base64: string;
}): StreamImageAttachment {
  return {
    id: params.id ?? `overlay-screenshot-${randomUUID()}`,
    kind: 'image',
    name: params.name,
    mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${params.base64}`,
  };
}
