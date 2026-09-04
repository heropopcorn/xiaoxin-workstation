import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { __test__ } from './overlay';

function readOverlayRenderer(): string {
  return fs.readFileSync(
    path.join(import.meta.dir, 'overlay.tsx'),
    'utf8',
  );
}

describe('overlay profile selection', () => {
  test('uses the configured overlay text profile when available', () => {
    const { resolvePreferredProfileId } = __test__;

    expect(resolvePreferredProfileId({
      profiles: [
        { id: 'default-profile', kind: 'agent' },
        { id: 'configured-profile', kind: 'agent' },
      ],
      preferredProfileId: 'configured-profile',
      defaultProfileId: 'default-profile',
    })).toBe('configured-profile');
  });

  test('falls back to the bootstrap default profile without an in-panel override', () => {
    const { resolvePreferredProfileId } = __test__;

    expect(resolvePreferredProfileId({
      profiles: [
        { id: 'old-default', kind: 'agent' },
        { id: 'new-default', kind: 'agent' },
      ],
      preferredProfileId: null,
      defaultProfileId: 'new-default',
    })).toBe('new-default');
  });

  test('falls back to the first agent profile when settings/default are unavailable', () => {
    const { resolvePreferredProfileId } = __test__;

    expect(resolvePreferredProfileId({
      profiles: [
        { id: 'terminal-profile', kind: 'terminal' },
        { id: 'first-agent', kind: 'agent' },
      ],
      preferredProfileId: null,
      defaultProfileId: null,
    })).toBe('first-agent');
  });

  test('refreshes bootstrap at typed submit time before resolving profile', () => {
    const source = readOverlayRenderer();
    const submitStart = source.indexOf('const sendOverlaySubmit = async');
    expect(submitStart).toBeGreaterThanOrEqual(0);
    const submitEnd = source.indexOf('\n  const handleInputSubmit', submitStart);
    expect(submitEnd).toBeGreaterThan(submitStart);
    const submitSource = source.slice(submitStart, submitEnd);

    expect(submitSource).toContain('const submitBootstrap = await window.overlay.getBootstrap();');
    expect(submitSource).toContain('setOverlayBootstrap(submitBootstrap);');
    expect(submitSource).not.toContain('overlayBootstrap ?? await window.overlay.getBootstrap()');
  });
});

describe('overlay interaction pill anchoring', () => {
  const pillSize = { width: 220, height: 44 };
  const viewport = { width: 1512, height: 982 };

  test('anchors the pill bottom-center of the viewport when no workArea is known', () => {
    const { getBottomPillAnchor } = __test__;
    const anchor = getBottomPillAnchor(pillSize, viewport, null);

    expect(anchor.left).toBe((viewport.width - pillSize.width) / 2);
    expect(anchor.top).toBe(viewport.height - pillSize.height - 24);
  });

  test('keeps the pill inside the display workArea above the Dock', () => {
    const { getBottomPillAnchor } = __test__;
    // Menu bar/notch takes the top 38px, the Dock the bottom 76px.
    const workArea = { x: 0, y: 38, width: 1512, height: 982 - 38 - 76 };
    const anchor = getBottomPillAnchor(pillSize, viewport, workArea);

    expect(anchor.top + pillSize.height).toBeLessThanOrEqual(workArea.y + workArea.height);
    expect(anchor.top).toBe(workArea.y + workArea.height - pillSize.height - 24);
    expect(anchor.left).toBe(workArea.x + (workArea.width - pillSize.width) / 2);
  });

  test('never places the pill above the workArea top (menu bar / notch)', () => {
    const { getBottomPillAnchor } = __test__;
    const workArea = { x: 0, y: 38, width: 800, height: 40 };
    const anchor = getBottomPillAnchor(pillSize, { width: 800, height: 600 }, workArea);

    expect(anchor.top).toBeGreaterThanOrEqual(workArea.y);
  });

  test('the single pill is always bottom-anchored: no separate review anchor path', () => {
    const source = readOverlayRenderer();
    expect(source).not.toContain('getReviewPillAnchor');
    const anchorAssignments = source.match(/const pillAnchor = /g) ?? [];
    expect(anchorAssignments).toHaveLength(1);
    const anchorStart = source.indexOf('const pillAnchor = ');
    const anchorSource = source.slice(anchorStart, source.indexOf(';', anchorStart));
    expect(anchorSource).toContain('getBottomPillAnchor(pillSize, viewportSize, state.displayWorkArea)');
  });
});

describe('overlay executing pill progress', () => {
  test('derives current/total from the reviewed plan and remaining ghosts', () => {
    const { getExecutionPillProgress } = __test__;

    expect(getExecutionPillProgress({
      pillLabel: 'Typing...',
      hasActiveAction: true,
      ghostCount: 12,
      plannedActionCount: 15,
    })).toEqual({ label: 'Typing', current: 3, total: 15 });
  });

  test('falls back to the live plan when no reviewed plan is pinned', () => {
    const { getExecutionPillProgress } = __test__;

    expect(getExecutionPillProgress({
      pillLabel: 'Clicking...',
      hasActiveAction: true,
      ghostCount: 1,
      plannedActionCount: 0,
    })).toEqual({ label: 'Clicking', current: 1, total: 2 });
  });

  test('uses a generic label when the run engine gives none', () => {
    const { getExecutionPillProgress } = __test__;

    expect(getExecutionPillProgress({
      pillLabel: undefined,
      hasActiveAction: true,
      ghostCount: 0,
      plannedActionCount: 1,
    })).toEqual({ label: 'Executing', current: 1, total: 1 });
  });

  test('hides progress while no action is executing', () => {
    const { getExecutionPillProgress } = __test__;

    expect(getExecutionPillProgress({
      pillLabel: 'Executing...',
      hasActiveAction: false,
      ghostCount: 0,
      plannedActionCount: 3,
    })).toBeNull();
  });
});

describe('overlay scope resize handles', () => {
  test('attaches move/resize pointer listeners for the whole input session', () => {
    const source = readOverlayRenderer();
    const effectStart = source.indexOf('// Attach for the whole input session.');
    expect(effectStart).toBeGreaterThanOrEqual(0);
    const effectSource = source.slice(Math.max(0, effectStart - 120), source.indexOf('}, [displayBounds, send, showInput]);', effectStart));

    expect(effectSource).toContain('if (!showInput)');
    expect(effectSource).toContain("window.addEventListener('pointermove', handlePointerMove)");
    expect(effectSource).toContain("window.addEventListener('pointerup', handlePointerUp)");
    expect(effectSource).not.toContain('if (!showInput || !scopeEditorGestureRef.current)');
  });

  test('keeps a resized draft until the committed scope bounds arrive', () => {
    const source = readOverlayRenderer();
    const stateEffect = source.slice(
      source.indexOf('return window.overlay.onState((nextState) => {'),
      source.indexOf('const currentState = stateRef.current;'),
    );
    const completeStart = source.indexOf('const completeInteraction = (pointerId: number, restoreBlur: boolean) => {');
    const completeSource = source.slice(completeStart, source.indexOf('const handlePointerUp = (event: PointerEvent) => {', completeStart));

    expect(stateEffect).toContain('if (!scopeEditorGestureRef.current && !dragGestureRef.current)');
    expect(stateEffect).not.toContain('scopeEditorGestureRef.current = null');
    expect(completeSource).toContain('setDraftScopeBounds(nextBounds)');
    expect(completeSource).toContain("send({ type: 'region-selected', bounds: nextBounds");
    expect(completeSource).not.toContain('setDraftScopeBounds(null)');
  });

  test('resizes the selected region from the matching handle', () => {
    const { resizeScopeBounds } = __test__;
    const bounds = { x: 100, y: 80, width: 200, height: 120 };
    const container = { x: 0, y: 0, width: 1000, height: 800 };

    expect(resizeScopeBounds(bounds, 'se', 40, 20, container, false)).toEqual({
      x: 100,
      y: 80,
      width: 240,
      height: 140,
    });
    expect(resizeScopeBounds(bounds, 'nw', -20, -10, container, false)).toEqual({
      x: 80,
      y: 70,
      width: 220,
      height: 130,
    });
  });
});

describe('overlay thinking sheen lifecycle', () => {
  test('sheen stays on for the whole thinking window and stops when a trace is proposed', () => {
    const source = readOverlayRenderer();
    const start = source.indexOf('const showProcessingEffects =');
    expect(start).toBeGreaterThanOrEqual(0);
    const sheenSource = source.slice(start, source.indexOf(';', start));

    // Thinking = working mode with no proposed action. The condition must not
    // require a loading pill: during a live attached tool session the run
    // engine publishes a hidden pill while the model is still thinking, and
    // gating the sheen on pill kind is what previously killed it ~0.2s after
    // submit.
    expect(sheenSource).toContain("state.mode === 'working' && state.action === null");
    expect(sheenSource).not.toContain("state.pill.kind === 'loading'");
  });
});
