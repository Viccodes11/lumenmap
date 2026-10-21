/**
 * OpenAPI 3.1 description of public LumenMap HTTP routes.
 * Kept in sync with Zod validators under lib/schemas and route handlers.
 */
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "LumenMap Public API",
    version: "1.0.0",
    description:
      "Machine-readable contracts for visualization activity, flow, timeseries, and health probes.",
    license: { name: "MIT" },
  },
  servers: [{ url: "/", description: "Current deployment" }],
  paths: {
    "/api/v1/activity": {
      get: {
        operationId: "getActivityVisualization",
        summary: "Compact visualization-ready network activity",
        parameters: [
          {
            name: "period",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["1d", "7d", "30d", "month"],
              default: "1d",
            },
            description: "Aggregation window for Hubble / fixture data.",
          },
        ],
        responses: {
          "200": {
            description: "Activity visualization payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ActivityVisualizationResponse" },
                examples: {
                  fixture: {
                    summary: "Fixture-mode shape",
                    value: {
                      period: "1d",
                      source: "fixture",
                      fixture: true,
                      isPeriodComplete: true,
                      kpis: {
                        totalOps: { kind: "operations", unit: "ops", value: 1 },
                        sorobanShare: {
                          kind: "share",
                          unit: "percent",
                          value: 40,
                        },
                        topCategory: "soroban",
                        activeContracts: {
                          kind: "entity_count",
                          unit: "count",
                          value: 1,
                        },
                        activeWallets: {
                          kind: "entity_count",
                          unit: "count",
                          value: 1,
                        },
                        activeDestinationAccounts: {
                          kind: "entity_count",
                          unit: "count",
                          value: 1,
                        },
                      },
                      treemaps: {},
                      metricProvenance: {},
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid period or data-source configuration",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
          "429": {
            description: "Rate limit exceeded",
            headers: {
              "Retry-After": {
                schema: { type: "integer" },
                description: "Seconds until the client may retry",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RateLimitError" },
              },
            },
          },
          "500": {
            description: "Upstream or validation failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
        },
      },
    },
    "/api/v1/flow": {
      get: {
        operationId: "getPaymentFlow",
        summary: "Period overview or 1-hop account payment flow",
        parameters: [
          { name: "period", in: "query", required: false, schema: { $ref: "#/components/schemas/Period" } },
          { name: "network", in: "query", required: false, schema: { type: "string", enum: ["mainnet", "testnet"], default: "mainnet" } },
          { name: "account", in: "query", required: false, schema: { type: "string", pattern: "^G[A-Z2-7]{55}$" } },
        ],
        responses: {
          "200": { description: "Flow graph", content: { "application/json": { schema: { $ref: "#/components/schemas/FlowResponse" } } } },
          "400": { description: "Invalid parameter", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
          "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/RateLimitError" } } } },
          "500": { description: "Flow provider failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        },
      },
    },
    "/api/v1/timeseries": {
      get: {
        operationId: "getActivityTimeseries",
        summary: "Bucketed activity timeseries for the selected period",
        parameters: [
          {
            name: "period",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["1d", "7d", "30d", "month"],
              default: "1d",
            },
          },
        ],
        responses: {
          "200": {
            description: "Timeseries payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TimeseriesResponse" },
              },
            },
          },
          "400": {
            description: "Invalid period",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
          "429": {
            description: "Rate limit exceeded",
            headers: {
              "Retry-After": { schema: { type: "integer" } },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RateLimitError" },
              },
            },
          },
        },
      },
    },
    "/api/v1/snapshots": {
      post: {
        operationId: "createResearchSnapshot",
        summary: "Store an immutable research snapshot",
        description:
          "Accepts period, metric, view, selected nodes, and the KPI payload. The server stores a SHA-256 KPI payload hash and a short opaque id. Default TTL is 604800 seconds (7 days). Default body cap is 65536 bytes; larger bodies return 413. Storage is process-local memory and does not query Hubble.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResearchSnapshotCreate" },
            },
          },
        },
        responses: {
          "201": {
            description: "Snapshot stored",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResearchSnapshotCreated" },
              },
            },
          },
          "400": {
            description: "Invalid snapshot body",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
          "413": {
            description: "Body exceeds SNAPSHOT_MAX_BYTES",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
        },
      },
    },
    "/api/v1/snapshots/{id}": {
      get: {
        operationId: "getResearchSnapshot",
        summary: "Fetch a frozen research snapshot",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Frozen snapshot payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResearchSnapshot" },
              },
            },
          },
          "404": {
            description: "Missing or expired snapshot",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        operationId: "getHealth",
        summary: "Liveness / readiness probe",
        parameters: [
          {
            name: "type",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["liveness", "readiness"],
              default: "readiness",
            },
          },
        ],
        responses: {
          "200": {
            description: "Healthy or degraded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
          "503": {
            description: "Unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/openapi.json": {
      get: {
        operationId: "getOpenApiDocument",
        summary: "This OpenAPI 3.1 document",
        responses: {
          "200": {
            description: "OpenAPI document",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Period: {
        type: "string",
        enum: ["1d", "7d", "30d", "month"],
      },
      ResearchSnapshotCreate: {
        type: "object",
        required: ["period", "metric", "view", "selectedNodes", "kpis"],
        properties: {
          period: { $ref: "#/components/schemas/Period" },
          metric: {
            type: "string",
            enum: ["ops", "xlm_volume", "usdc", "transactions", "protocol_tvl"],
          },
          view: {
            type: "string",
            enum: ["events", "actors", "actors_dest", "flow"],
          },
          selectedNodes: {
            type: "array",
            maxItems: 32,
            items: { type: "object", required: ["name"] },
          },
          kpis: { type: "object" },
          treemap: { type: "object" },
        },
      },
      ResearchSnapshot: {
        type: "object",
        required: [
          "id",
          "generatedAt",
          "expiresAt",
          "period",
          "metric",
          "view",
          "selectedNodes",
          "kpiPayloadHash",
          "kpis",
        ],
        properties: {
          id: { type: "string" },
          generatedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          period: { $ref: "#/components/schemas/Period" },
          metric: { type: "string" },
          view: { type: "string" },
          selectedNodes: { type: "array", items: { type: "object" } },
          kpiPayloadHash: { type: "string" },
          kpis: { type: "object" },
        },
      },
      ResearchSnapshotCreated: {
        type: "object",
        required: ["id", "url", "ttlSeconds", "snapshot"],
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          ttlSeconds: { type: "integer", description: "Default 604800 (7 days)." },
          maxBytes: { type: "integer", description: "Default 65536." },
          snapshot: { $ref: "#/components/schemas/ResearchSnapshot" },
        },
      },
      FlowResponse: {
        type: "object",
        required: ["period", "account", "source", "sampled", "nodes", "edges"],
        properties: {
          period: { $ref: "#/components/schemas/Period" },
          account: { type: ["string", "null"] },
          source: { type: "string", enum: ["hubble", "fixture"] },
          sampled: { type: "boolean" },
          nodes: { type: "array", items: { type: "object", required: ["id", "label"], properties: { id: { type: "string" }, label: { type: "string" }, category: { type: "string" } } } },
          edges: { type: "array", items: { type: "object", required: ["id", "source", "destination", "assetKey", "asset", "amount", "operationCount"], properties: { id: { type: "string" }, source: { type: "string" }, destination: { type: "string" }, assetKey: { type: "string" }, asset: { type: "object", required: ["code"], properties: { code: { type: "string" } } }, amount: { type: "string" }, amountComplete: { type: "boolean" }, operationCount: { type: "integer" } } } },
        },
      },
      ApiError: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
        additionalProperties: true,
      },
      RateLimitError: {
        type: "object",
        required: ["code", "message", "retryAfterSeconds"],
        properties: {
          code: { type: "string", const: "RATE_LIMITED" },
          message: { type: "string" },
          retryAfterSeconds: { type: "integer", minimum: 1 },
        },
      },
      MetricValue: {
        type: "object",
        required: ["kind", "unit", "value"],
        properties: {
          kind: { type: "string" },
          unit: { type: "string" },
          value: { type: "number" },
        },
      },
      ActivityVisualizationResponse: {
        type: "object",
        required: [
          "period",
          "start",
          "end",
          "source",
          "sourceTimestamp",
          "isPeriodComplete",
          "kpis",
          "treemaps",
          "metricProvenance",
        ],
        properties: {
          period: { $ref: "#/components/schemas/Period" },
          start: { type: "string", format: "date-time" },
          end: { type: "string", format: "date-time" },
          source: { type: "string", enum: ["hubble", "fixture"] },
          sourceTimestamp: { type: "string" },
          isPeriodComplete: { type: "boolean" },
          fixture: { type: "boolean" },
          kpis: { type: "object", additionalProperties: true },
          treemaps: { type: "object", additionalProperties: true },
          metricProvenance: { type: "object", additionalProperties: true },
          timeseries: { type: "object", additionalProperties: true },
          heatmap: { type: "object", additionalProperties: true },
          protocols: { type: "object", additionalProperties: true },
          assetVolumes: { type: "array", items: { type: "object" } },
        },
        additionalProperties: true,
      },
      TimeseriesResponse: {
        type: "object",
        required: ["period", "source", "timeseries"],
        properties: {
          period: { $ref: "#/components/schemas/Period" },
          source: { type: "string", enum: ["hubble", "fixture"] },
          timeseries: {
            type: "object",
            properties: {
              granularity: { type: "string", enum: ["hour", "day"] },
              buckets: { type: "array", items: { type: "object" } },
              totals: { type: "object" },
            },
            additionalProperties: true,
          },
          metricProvenance: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["ok", "degraded", "unavailable"],
          },
          checks: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
    },
  },
} as const;

export type OpenApiDocument = typeof openApiDocument;
