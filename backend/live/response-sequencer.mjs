export class ResponseCreateSequencer {
  constructor() { this.generation = 0; this.active = null; }
  begin(id) { const token = ++this.generation; this.active = { id, token }; return token; }
  isCurrent(id, token) { return this.active?.id === id && this.active?.token === token; }
  cancel(id = null) { if (!id || this.active?.id === id) { this.generation += 1; this.active = null; } }
  clear(id = null) { if (!id || this.active?.id === id) this.active = null; }
}
