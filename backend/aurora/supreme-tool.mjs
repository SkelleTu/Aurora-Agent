import { createAuraBridge } from "./bridge.mjs";

export const SUPREME_OPERATOR_TOOL = {
  name: "supreme_operator",
  version: "1.0.0",
  description: "Operator bridge for Aurora, Universal Server and IntegrateSystem.",
  input: {
    type: "object",
    required: ["target", "operation"],
    properties: {
      target: { type: "string", enum: ["aurora", "universal", "integratesystem"] },
      operation: { type: "string", enum: ["health", "capabilities", "diagnostics", "action"] },
      domain: { type: "string" },
      action: { type: "string" },
      args: { type: "object" },
      traceId: { type: "string" },
      requestId: { type: "string" },
    },
  },
};

export function createSupremeOperatorTool(config = {}) {
  const bridge = createAuraBridge({ ...config, operatorMode: "supreme" });

  return {
    definition: SUPREME_OPERATOR_TOOL,
    async execute(input = {}) {
      const target = String(input.target ?? "universal").trim().toLowerCase();
      const operation = String(input.operation ?? "action").trim().toLowerCase();
      const traceId = input.traceId;
      const requestId = input.requestId;

      if (operation === "health") return bridge.health();
      if (operation === "capabilities") return bridge.capabilities();
      if (operation === "diagnostics") return bridge.diagnostics(traceId);
      if (operation === "action") {
        return bridge.dispatch({
          domain: input.domain,
          action: input.action,
          args: input.args ?? {},
          traceId,
          requestId,
          target: target === "aurora" ? "aura" : "gateway",
        });
      }
      return { ok: false, executed: false, reason: `Unsupported supreme operation: ${operation}` };
    },
  };
}
