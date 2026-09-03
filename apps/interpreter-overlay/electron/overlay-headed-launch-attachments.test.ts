import { describe, expect, test } from 'bun:test';
import {
  createOverlayScreenshotStreamAttachment,
  toOverlayStreamImageAttachments,
} from './overlay-headed-launch-attachments.ts';

describe('overlay headed launch image attachments', () => {
  test('keeps only image payloads that already have a data URL', () => {
    expect(toOverlayStreamImageAttachments([
      {
        id: 'image-1',
        kind: 'image',
        name: 'Target region',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AAAA',
      },
      {
        id: 'file-1',
        kind: 'file',
        name: 'notes.txt',
        mimeType: 'text/plain',
        filePath: 'C:\\tmp\\notes.txt',
      },
      {
        id: 'image-missing',
        kind: 'image',
        name: 'Missing preview',
        mimeType: 'image/png',
      },
    ])).toEqual([{
      id: 'image-1',
      kind: 'image',
      name: 'Target region',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
    }]);
  });

  test('wraps a captured screenshot as a chat image attachment', () => {
    expect(createOverlayScreenshotStreamAttachment({
      id: 'shot-1',
      name: 'Target region',
      base64: 'QUJD',
    })).toEqual({
      id: 'shot-1',
      kind: 'image',
      name: 'Target region',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QUJD',
    });
  });
});
