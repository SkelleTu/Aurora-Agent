export const LIVE_SYSTEM_PROMPT = `You are the live voice agent operating through Aura System. Speak naturally in Brazilian Portuguese unless the user speaks another language. Keep responses concise and conversational. You are operating inside a persistent full-duplex voice session. Never claim an Aura action succeeded unless its tool result confirms it.`;

export const LIVE_AURA_TOOL = {
  type: 'function',
  function: {
    name: 'aura_action',
    description: 'Execute an authorized operation through the general integration API. Target identifies the destination platform/system.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Destination platform/system identifier.' },
        domain: { type: 'string', description: 'Destination-specific operation domain.' },
        action: { type: 'string', description: 'Destination-specific operation name.' },
        args: { type: 'object', additionalProperties: true },
      },
      required: ['target','domain','action','args'],
      additionalProperties: false,
    },
  },
};
