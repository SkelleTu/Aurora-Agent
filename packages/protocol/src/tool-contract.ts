export type ToolEffect = 'read' | 'write' | 'execute' | 'destructive';

export type OperatorMode = 'supreme' | 'moderate';
export type ToolTarget = 'universal' | 'aura';

export interface ToolRequest {
  id: string;
  tool: string;
  effect: ToolEffect;
  args: Record<string, unknown>;
  source: 'aurora';
  mode?: OperatorMode;
  target?: ToolTarget;
  traceId?: string;
  sessionId?: string;
  requestedAt: string;
}

export interface ToolResponse<T = unknown> {
  id: string;
  ok: boolean;
  tool: string;
  result?: T;
  error?: {
    code: string;
    message: string;
  };
  durationMs?: number;
  completedAt: string;
}

export interface ToolEvent<T = Record<string, unknown>> {
  type: 'tool.requested' | 'tool.started' | 'tool.completed' | 'tool.failed';
  timestamp: string;
  traceId?: string;
  requestId: string;
  payload: T;
}

export const AURA_TOOL_NAMES = [
  'system.health',
  'system.status',
  'system.capabilities',
  'memory.list',
  'memory.save',
  'memory.update',
  'settings.get',
  'settings.set',
  'avatar.state',
  'avatar.look',
  'avatar.walk',
  'avatar.sit',
  'avatar.gesture',
  'avatar.speak',
  'avatar.setexpression',
  'avatar.setoutfit',
  'scene.state',
  'scene.set',
  'scene.transition',
  'animation.state',
  'animation.play',
  'animation.stop',
  'voice.state',
  'voice.speak',
  'voice.stop',
  'interface.state',
  'interface.notify',
  'interface.setPanel',
  'interface.setStatus',
  'integratesystem.health',
  'integratesystem.status',
  'integratesystem.diagnostics',
] as const;

export type AuraToolName = (typeof AURA_TOOL_NAMES)[number];
