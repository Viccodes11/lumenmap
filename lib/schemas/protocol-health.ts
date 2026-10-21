import { z } from "zod";
import {
  PROTOCOL_HEALTH_DISPLAY_LIMIT,
  PROTOCOL_HEALTH_METHODOLOGY_HREF,
  PROTOCOL_HEALTH_METHODOLOGY_VERSION,
  PROTOCOL_HEALTH_MISSING_INPUT,
  PROTOCOL_HEALTH_WEIGHTS,
} from "@/lib/protocol-health/constants";
import {
  dataSourceSchema,
  finiteNumberSchema,
  isoTimestampSchema,
  periodSchema,
} from "@/lib/schemas/activity-response";

const componentSchema = z.object({
  id: z.enum(["ops", "wallets", "volume", "tvl"]),
  weight: finiteNumberSchema,
  status: z.enum(["available", "unavailable"]),
  value: finiteNumberSchema.nullable(),
  unit: z.string().min(1),
  score: finiteNumberSchema.min(0).max(100).nullable(),
});

export const protocolHealthCardSchema = z
  .object({
    protocol: z.string().min(1),
    rank: z.number().int().positive(),
    score: finiteNumberSchema.min(0).max(100).nullable(),
    components: z.object({
      ops: componentSchema,
      wallets: componentSchema,
      volume: componentSchema,
      tvl: componentSchema,
    }),
    timeseries: z.array(finiteNumberSchema).min(2).optional(),
    detail: z.object({
      context: z.enum(["protocol", "entity"]),
      href: z.string().min(1),
      entityId: z.string().min(1).optional(),
    }),
  })
  .superRefine((card, ctx) => {
    const tvl = card.components.tvl;
    if (tvl.status === "unavailable" && (tvl.score !== null || tvl.value !== null)) {
      ctx.addIssue({
        code: "custom",
        message: "Unavailable TVL must not carry a numeric value or score",
        path: ["components", "tvl"],
      });
    }
    if (tvl.status === "available" && (tvl.score === null || tvl.value === null)) {
      ctx.addIssue({
        code: "custom",
        message: "Available TVL requires a value and a component score",
        path: ["components", "tvl"],
      });
    }
  });

export const protocolHealthResponseSchema = z.object({
  period: periodSchema,
  start: isoTimestampSchema,
  end: isoTimestampSchema,
  source: dataSourceSchema,
  sourceTimestamp: isoTimestampSchema,
  isPeriodComplete: z.boolean(),
  fixture: z.boolean().optional(),
  displayLimit: z.literal(PROTOCOL_HEALTH_DISPLAY_LIMIT),
  methodology: z.object({
    version: z.literal(PROTOCOL_HEALTH_METHODOLOGY_VERSION),
    href: z.literal(PROTOCOL_HEALTH_METHODOLOGY_HREF),
    weights: z.object({
      ops: z.literal(PROTOCOL_HEALTH_WEIGHTS.ops),
      wallets: z.literal(PROTOCOL_HEALTH_WEIGHTS.wallets),
      volume: z.literal(PROTOCOL_HEALTH_WEIGHTS.volume),
      tvl: z.literal(PROTOCOL_HEALTH_WEIGHTS.tvl),
    }),
    missingInput: z.literal(PROTOCOL_HEALTH_MISSING_INPUT),
  }),
  protocols: z.array(protocolHealthCardSchema),
});

export type ProtocolHealthResponseBody = z.infer<
  typeof protocolHealthResponseSchema
>;

export class ProtocolHealthValidationError extends Error {
  readonly path: string;
  readonly diagnostic: string;

  constructor(path: string, message: string) {
    super(`Protocol health response validation failed at ${path}: ${message}`);
    this.name = "ProtocolHealthValidationError";
    this.path = path;
    this.diagnostic = `schema path "${path || "(root)"}": ${message}`;
  }
}

function formatIssuePath(path: PropertyKey[]): string {
  return path
    .map((segment) => String(segment))
    .join(".")
    .replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}

export function validateProtocolHealthResponse(
  data: unknown,
): ProtocolHealthResponseBody {
  const result = protocolHealthResponseSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  const path = formatIssuePath(issue?.path ?? []);
  const message = issue?.message ?? "Unknown validation error";
  throw new ProtocolHealthValidationError(path, message);
}

export function publicProtocolHealthValidationErrorBody(): {
  code: string;
  message: string;
} {
  return {
    code: "INTERNAL_ERROR",
    message: "Protocol health response failed validation",
  };
}
