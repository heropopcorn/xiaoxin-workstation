import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

function readOverlayService(): string {
  return fs.readFileSync(
    path.join(import.meta.dir, 'service.ts'),
    'utf8',
  );
}

function extractSubmitHandler(serviceSource: string): string {
  const submitStart = serviceSource.indexOf("case 'submit':");
  expect(submitStart).toBeGreaterThanOrEqual(0);
  const nextMethod = serviceSource.indexOf('\n  private ', submitStart + 1);
  expect(nextMethod).toBeGreaterThan(submitStart);
  return serviceSource.slice(submitStart, nextMethod);
}

function extractMethod(serviceSource: string, methodName: string): string {
  const methodStart = serviceSource.indexOf(methodName);
  expect(methodStart).toBeGreaterThanOrEqual(0);
  const methodEnd = serviceSource.indexOf('\n  private ', methodStart + 1);
  expect(methodEnd).toBeGreaterThan(methodStart);
  return serviceSource.slice(methodStart, methodEnd);
}

describe('overlay text controller routing contract', () => {
  test('keeps typed submit on the text-controller route instead of the realtime audio route', () => {
    const submitHandler = extractSubmitHandler(readOverlayService());

    expect(submitHandler).toContain('buildOverlayTextControllerRequest');
    expect(submitHandler).toContain('executeOverlayTextControllerDirectCommand');
    expect(submitHandler).toContain('startAgentTask');
    expect(submitHandler).toContain('buildOverlayHeadedAgentLaunchParts');
    expect(submitHandler).toContain('includeAvailableTools: false');
    expect(submitHandler).toContain('captureOverlayScreenshotAttachment');
    expect(submitHandler).toContain('startupAttachments');
    expect(submitHandler).toContain('toOverlayStreamImageAttachments');
    expect(submitHandler).toContain('focusOverlayTargetWorkstationWindow');
    expect(submitHandler).toContain('dismissOverlayPresentationAfterSubmit');
    expect(submitHandler).toContain('dismissOverlaySelectionForHeadedWorkspaceLaunch');
    expect(submitHandler).toContain('message: launchParts.userMessage');
    expect(submitHandler).not.toContain('message: prependOverlayMentions(effectivePrompt, imageMentions)');
    expect(submitHandler).not.toContain('captureOverlayScreenshotMention');
    expect(submitHandler).not.toContain('postAdvancedVoiceCreateCall');
    expect(submitHandler).not.toContain('ADVANCED_VOICE_CREATE_CALL');
    expect(submitHandler).not.toContain('/realtime/calls');
  });

  test('keeps attached-target typed runs open for overlay tool review', () => {
    const submitHandler = extractSubmitHandler(readOverlayService());
    const targetBranchStart = submitHandler.indexOf('const session = await this.createAgentToolSession');
    expect(targetBranchStart).toBeGreaterThanOrEqual(0);
    const launchRecordStart = submitHandler.indexOf('this.lastWorkspaceAgentLaunch = {', targetBranchStart);
    expect(launchRecordStart).toBeGreaterThan(targetBranchStart);
    const launchRecordEnd = submitHandler.indexOf('};', launchRecordStart);
    expect(launchRecordEnd).toBeGreaterThan(launchRecordStart);
    const afterTargetLaunch = submitHandler.slice(launchRecordEnd, submitHandler.indexOf('showOverlayAgentNotification', launchRecordEnd));
    const targetWindowResolve = submitHandler.slice(
      submitHandler.indexOf('const targetWindow = await this.resolveOverlayTargetWindow'),
      targetBranchStart,
    );

    expect(afterTargetLaunch).not.toContain("finishDebugRun('completed', '', 'background_agent_started')");
    expect(afterTargetLaunch).not.toContain("notePresentationCloseRequested('background_agent_started')");
    expect(afterTargetLaunch).not.toContain('this.runStartedAt = null');
    expect(afterTargetLaunch).not.toContain('this.lastRunInputMethod = null');
    expect(targetWindowResolve).toContain('{ background: !canControlSelectedTarget }');
    expect(submitHandler.slice(targetBranchStart, launchRecordStart)).toContain('activate: true');
  });

  test('hydrates executable selected-target refs before typed prompt and session launch', () => {
    const submitHandler = extractSubmitHandler(readOverlayService());
    const hydrationStart = submitHandler.indexOf('await this.ensureExecutableContextForTarget');
    const promptStart = submitHandler.indexOf('const effectivePrompt = buildOverlayTextControllerContextPrompt');
    const sessionStart = submitHandler.indexOf('const session = await this.createAgentToolSession');

    expect(hydrationStart).toBeGreaterThanOrEqual(0);
    expect(promptStart).toBeGreaterThan(hydrationStart);
    expect(sessionStart).toBeGreaterThan(hydrationStart);
  });

  test('typed submit dismisses overlay chrome before target hydration can redraw selection frames', () => {
    const serviceSource = readOverlayService();
    const submitHandler = extractSubmitHandler(serviceSource);
    const dismissMethod = extractMethod(serviceSource, 'private dismissOverlayPresentationAfterSubmit');
    const sendMethod = extractMethod(serviceSource, 'private send(');
    const ensureMethod = extractMethod(serviceSource, 'private async ensureExecutableContextForTarget');
    const dismissStart = submitHandler.indexOf('this.dismissOverlayPresentationAfterSubmit()');
    const snapshotStart = submitHandler.indexOf('const serviceContextSnapshot = [...this.overlayState.contextItems]');
    const hydrationStart = submitHandler.indexOf('await this.ensureExecutableContextForTarget');
    const waitStart = submitHandler.indexOf("await this.waitForPendingHotkeyContext('submit'");
    const workingSendStart = submitHandler.indexOf("mode: 'working'");

    expect(snapshotStart).toBeGreaterThanOrEqual(0);
    expect(dismissStart).toBeGreaterThan(snapshotStart);
    expect(waitStart).toBeGreaterThan(dismissStart);
    expect(hydrationStart).toBeGreaterThan(dismissStart);
    expect(submitHandler).toContain('awaitTargetHydration: false');
    expect(submitHandler).toContain('presentSelection: false');
    expect(submitHandler).toContain('serviceContextItems: serviceContextSnapshot');
    expect(submitHandler).toContain('submittedContextItems: submittedContextSnapshot');
    expect(workingSendStart).toBeGreaterThan(hydrationStart);
    expect(dismissMethod).toContain('this.suppressDesktopAgentDashboard = true');
    expect(dismissMethod).toContain('this.dismissOverlaySelectionForHeadedWorkspaceLaunch()');
    expect(dismissMethod).toContain('this.send({ ...DEFAULT_OVERLAY_STATE })');
    expect(dismissMethod).toContain('this.overlay.hide()');
    expect(sendMethod).toContain('if (this.suppressDesktopAgentDashboard)');
    expect(sendMethod).toContain('this.overlay.hide()');
    expect(sendMethod).toContain('!this.suppressDesktopAgentDashboard');
    expect(ensureMethod).toContain('presentSelection');
    expect(ensureMethod).toContain('this.suppressDesktopAgentDashboard');
  });

  test('records typed agent launch attempts in managed overlay context', () => {
    const serviceSource = readOverlayService();
    const submitHandler = extractSubmitHandler(serviceSource);
    const helper = extractMethod(serviceSource, 'private buildOverlayAgentLaunchManagedToolCall');

    expect(helper).toContain("serverId: 'builtin-agent-windows'");
    expect(helper).toContain("toolName: 'launch_agent_window'");
    expect(helper).toContain('completion_disposition');
    expect(submitHandler).toContain('toolCalls: [this.buildOverlayAgentLaunchManagedToolCall({');
    expect(submitHandler).toContain('recordOverlayTextControllerAgentLaunchResult');
    expect(submitHandler).toContain('recordOverlayTextControllerAgentFailureResult');
  });

  test('reuses an existing workstation window for no-workspace overlay agent launches', () => {
    const resolver = extractMethod(readOverlayService(), 'private async resolveOverlayTargetWindow');
    const reuseBranch = resolver.slice(
      resolver.indexOf('const windowSessions = listWindowSessions();'),
      resolver.indexOf('const createdWindow = await this.createWorkstationWindow'),
    );

    expect(reuseBranch).toContain('workspacePath === null');
    expect(reuseBranch).toContain('windowSessions[0]');
    expect(reuseBranch).toContain("windowSessions.find((record) => record.workspacePath === workspacePath)");
  });

  test('attempts the typed fast path before launching the attached-target agent', () => {
    const submitHandler = extractSubmitHandler(readOverlayService());

    const backgroundBranchStart = submitHandler.indexOf('if (!canControlSelectedTarget) {');
    const fastPathGuardStart = submitHandler.indexOf('if (trimmedText && hasExecutableTargetRefs(targetContext)) {');
    const fastPathCallStart = submitHandler.indexOf('await this.attemptOverlayTypedFastPathSubmit({');
    const agentSessionStart = submitHandler.indexOf('const session = await this.createAgentToolSession');

    // No target goes straight to the agent path; the fast path only runs for a
    // hydrated target with executable refs plus text input, and it runs before
    // the agent tool session/agent launch.
    expect(backgroundBranchStart).toBeGreaterThanOrEqual(0);
    expect(fastPathGuardStart).toBeGreaterThan(backgroundBranchStart);
    expect(fastPathCallStart).toBeGreaterThan(fastPathGuardStart);
    expect(agentSessionStart).toBeGreaterThan(fastPathCallStart);
    const betweenFastPathAndAgent = submitHandler.slice(fastPathCallStart, agentSessionStart);
    // A handled loop ends the submit; a handoff falls through to the
    // unchanged agent path with the loop conversation summarized into the
    // agent prompt.
    expect(betweenFastPathAndAgent).toContain('if (fastPath.handled) {');
    expect(betweenFastPathAndAgent).toContain('break;');
    expect(betweenFastPathAndAgent).toContain('fastPath.handoffSummary');
    expect(submitHandler).toContain('agentLaunchPrompt');
  });

  test('fast path runs the typed controller loop through the shared realtime bridge and hands off on failure', () => {
    const serviceSource = readOverlayService();
    const method = extractMethod(serviceSource, 'private async attemptOverlayTypedFastPathSubmit');

    // Same loop as the realtime voice bridge, in text: shared bridge
    // executor, reviewed selected-target batches, touched-window diffs in
    // tool results (never a full context dump), no agent thread, and no
    // realtime audio transport.
    expect(method).toContain('runOverlayTextControllerLoop');
    expect(method).toContain('createOverlayTextControllerLoopChatTransport');
    expect(method).toContain('callOverlayComputerBatchBridgeTool');
    expect(method).toContain('formatTouchedWindowDiff(batchOutcome.touchedWindowDiff)');
    expect(method).not.toContain('appendSelectedTargetContextToBridgeOutput');
    expect(method).toContain('overlaySessionManager.computerBatch(session.agentId, params)');
    expect(method).toContain('callHiddenAgentTool.handler');
    expect(method).toContain('queryOverlayAttachments(options.contextItems, argumentsJson)');
    expect(method).toContain('executeReadAgentAssistantMessages');
    expect(method).toContain('lastDelegatedAssistantText');
    expect(method).toContain("[FAST_PATH] handoff to agent:");
    expect(method).toContain("this.finishDebugRun('completed', result.summary, 'fast_path_completed')");
    expect(method).toContain("await this.detachAttachedToolSession(fastPathSession, 'agent_complete')");
    expect(method).not.toContain('startAgentTask');
    expect(method).not.toContain('postAdvancedVoiceCreateCall');
    expect(method).not.toContain('/realtime/calls');

    // Handoffs return unhandled with the loop conversation summary; genuine
    // post-execution failures stay on the fast path and surface loudly
    // instead of falling back.
    expect(method).toContain('handoffSummary: result.conversationSummary || null');
    expect(method).toContain("error instanceof OverlayTargetWindowClosedError ? 'target_window_closed' : 'fast_path_failed'");
    expect(method).toContain("pill: { kind: 'error', message }");

    // Dead committed targets are model data, not an automatic hard failure:
    // the lap-1 user content carries the observation at submit, the shared
    // bridge turns mid-loop batches into target_window_closed tool results,
    // delegation is blocked the same way, and the model's plain-text decision
    // surfaces in the message pill before teardown.
    expect(method).toContain('committedTargetWindowClosedMessage(options.targetContext)');
    expect(method).toContain('targetWindowClosedMessage: closedAtSubmitMessage');
    expect(method).toContain('<target_window_error>');
    expect(method).toContain("JSON.stringify({ status: 'target_window_closed', message: closedMessage })");
    expect(method).toContain('result.targetWindowClosedObserved');
    expect(method).toContain("pill: { kind: 'message', message: result.summary }");
    expect(method).not.toContain('throw new OverlayTargetWindowClosedError');
  });

  test('the agent handoff path carries a dead-target observation into the agent prompt instead of failing', () => {
    const serviceSource = readOverlayService();
    const submitHandler = extractSubmitHandler(serviceSource);
    expect(submitHandler).toContain('<target_window_closed>');
    expect(submitHandler).toContain('committedTargetWindowClosedMessage(targetContext)');
    expect(submitHandler).not.toContain('throw new OverlayTargetWindowClosedError(closedTargetMessage)');
  });

  test('fast loop profile resolution works under the scenario harness and user settings', () => {
    const serviceSource = readOverlayService();
    const method = extractMethod(serviceSource, 'private async resolveOverlayFastLoopProfile');

    expect(method).toContain('FORM_TESTS_MODE');
    expect(method).toContain('createFormTestsAdvancedVoiceAgentProfile()');
    expect(method).toContain('resolveOverlayModelTaskProfileIds(this.effectiveSettings)');
    expect(method).toContain('preferredTextProfileId');
  });

  test('scenario profiles inherit provider credentials without persisting secret values', () => {
    const serviceSource = readOverlayService();
    expect(serviceSource).toContain('environmentKey: resolveFormTestsApiEnvironmentKey(baseURL)');
    expect(serviceSource).not.toContain('apiKey: resolveFormTestsApiKey(baseURL)');
  });

  test('reveals headed overlay agents by focusing the workstation window', () => {
    const serviceSource = readOverlayService();
    const revealMethod = extractMethod(serviceSource, 'private revealOverlayAgentWindow');
    const revealCaseStart = serviceSource.indexOf("case 'reveal-agent-window':");
    const revealCase = serviceSource.slice(revealCaseStart, serviceSource.indexOf('break;', revealCaseStart));

    expect(revealMethod).toContain('agentTabManager.requestAgentWindowReveal(agentId)');
    expect(revealMethod).toContain('this.focusOverlayTargetWorkstationWindow');
    expect(revealMethod).toContain('this.overlay.hide()');
    expect(revealMethod).toContain('this.suppressDesktopAgentDashboard = true');
    expect(revealCase).toContain('this.revealOverlayAgentWindow(action.agentId)');
    expect(revealCase).not.toContain('agentTabManager.requestAgentWindowReveal(action.agentId)');
  });

  test('keeps overlay hotkey selection import on the builtin selection tool path', () => {
    const serviceSource = readOverlayService();
    const methodStart = serviceSource.indexOf('private async readInitialHotkeyContextItems');
    expect(methodStart).toBeGreaterThanOrEqual(0);
    const methodEnd = serviceSource.indexOf('\n  private ', methodStart + 1);
    expect(methodEnd).toBeGreaterThan(methodStart);
    const methodSource = serviceSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain("serverId: 'builtin-selection'");
    expect(methodSource).toContain("toolName: 'read_current_selection'");
    expect(methodSource).toContain("args: { format: 'json' }");
    expect(methodSource).toContain('buildOverlayContextItemsFromSelectionToolJson');
    expect(serviceSource).not.toContain("from './selected-file-context.js'");
    expect(serviceSource).not.toContain("from './selected-file-source.js'");
    expect(serviceSource).not.toContain('getFocusedSelectionContext');
  });
});
