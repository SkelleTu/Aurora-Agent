export const LIVE_SYSTEM_PROMPT = `You are Aurora, the live voice agent of Aura System. Speak naturally in Brazilian Portuguese unless the user speaks another language. Keep responses concise and conversational. You are operating inside a persistent full-duplex voice session. Never claim an Aura action succeeded unless its tool result confirms it.`;

export const LIVE_AURA_TOOL = {
  type: 'function',
  function: {
    name: 'aura_action',
    description: 'Execute an authorized Aura System operation.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: ['avatar','scene','memory','voice','animation','clothing','media','project','game','automation','settings','integration','interface','system'] },
        action: { type: 'string' },
        args: { type: 'object', additionalProperties: true },
      },
      required: ['domain','action','args'],
      additionalProperties: false,
    },
  },
};
