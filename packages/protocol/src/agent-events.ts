export type AgentEventType =
  | 'agent.status'
  | 'agent.message'
  | 'agent.speech'
  | 'agent.emotion'
  | 'agent.gaze'
  | 'agent.action'
  | 'avatar.state'
  | 'system.tool';

export interface AgentEvent<T = Record<string, unknown>> {
  type: AgentEventType;
  timestamp: string;
  payload: T;
}

export interface AgentAction {
  id: string;
  action: 'look' | 'walk' | 'sit' | 'gesture' | 'speak' | 'setOutfit' | 'setExpression';
  args: Record<string, unknown>;
}
