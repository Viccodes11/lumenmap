import { NextResponse } from "next/server";
import { getActivityData, CredentialsMissingError } from "@/lib/hubble/activity";
import { BigQueryLimitExceededError } from "@/lib/hubble/errors";
import { resolveDataSource } from "@/lib/data-source";
import {
  createCorrelationId,
  endTimer,
  logError,
  logInfo,
  startTimer,
} from "@/lib/log";
import {
  isDashboardNetworkId,
  resolveDashboardNetwork,
  type DashboardNetworkId,
} from "@/lib/network";
import { isValidPeriod, PERIOD_OPTIONS } from "@/lib/periods";
import { getFixtureProtocolHealth } from "@/lib/protocol-health/fixture";
import {
  inputsFromActivity,
  packageProtocolHealth,
  type ProtocolHealthResponse,
} from "@/lib/protocol-health/assemble";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  ProtocolHealthValidationError,
  publicProtocolHealthValidationErrorBody,
  validateProtocolHealthResponse,
} from "@/lib/schemas/protocol-health";
import { fetchProtocolTvlResults } from "@/lib/tvl/protocol-registry";
import type { ApiErrorResponse, Period } from "@/lib/types";

export type ProtocolHealthFetcher = (
  period: Period,
  correlationId?: string,
  network?: DashboardNetworkId,
) => Promise<ProtocolHealthResponse>;

const SUPPORTED_PERIODS = PERIOD_OPTIONS.map((period) => period.value);

export function parseProtocolHealthPeriod(
  periodParam: string | null,
): { ok: true; period: Period } | { ok: false; body: ApiErrorResponse; status: 400 } {
  if (periodParam === null) {
    return { ok: true, period: "1d" };
  }

  if (!isValidPeriod(periodParam)) {
    return {
      ok: false,
      body: {
        code: "INVALID_PERIOD",
        message: "Unsupported activity period.",
        supported: SUPPORTED_PERIODS,
      },
      status: 400,
    };
  }

  return { ok: true, period: periodParam };
}

export async function loadLiveProtocolHealth(
  period: Period,
  correlationId?: string,
  network: DashboardNetworkId = "mainnet",
): Promise<ProtocolHealthResponse> {
  const activity = await getActivityData(period, correlationId, network);
  const tvlResults = await fetchProtocolTvlResults();
  return packageProtocolHealth(
    {
      period: activity.period,
      start: activity.start,
      end: activity.end,
      source: activity.source,
      sourceTimestamp: activity.sourceTimestamp,
      isPeriodComplete: activity.isPeriodComplete,
    },
    inputsFromActivity(activity.accounts, activity.contracts, tvlResults),
  );
}

export async function handleProtocolHealthRequest(
  request: Request,
  fetchHealth: ProtocolHealthFetcher = loadLiveProtocolHealth,
) {
  const limited = enforceRateLimit(request, "v1");
  if (limited) return limited;

  const correlationId = createCorrelationId();
  const timer = startTimer();
  const { searchParams } = new URL(request.url);

  const parsedPeriod = parseProtocolHealthPeriod(searchParams.get("period"));
  if (!parsedPeriod.ok) {
    return NextResponse.json(parsedPeriod.body, { status: parsedPeriod.status });
  }

  const networkParam = searchParams.get("network");
  if (networkParam !== null && !isDashboardNetworkId(networkParam)) {
    const body: ApiErrorResponse = {
      code: "INVALID_NETWORK",
      message: "Unsupported network. Use mainnet or testnet.",
      supported: ["mainnet", "testnet"],
    };
    return NextResponse.json(body, { status: 400 });
  }
  const network = resolveDashboardNetwork(networkParam);

  logInfo({
    event: "protocol_health.request.start",
    correlationId,
    period: parsedPeriod.period,
  });

  let dataSourceMode: "live" | "fixture" = "live";
  try {
    dataSourceMode = resolveDataSource();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError({
      event: "protocol_health.request.error",
      correlationId,
      period: parsedPeriod.period,
      durationMs: endTimer(timer),
      errorClass: "validation",
      errorMessage: message,
    });
    return NextResponse.json(
      { code: "INVALID_DATA_SOURCE", message },
      { status: 400 },
    );
  }

  if (fetchHealth === loadLiveProtocolHealth && dataSourceMode === "fixture") {
    try {
      const validated = validateProtocolHealthResponse(
        getFixtureProtocolHealth(parsedPeriod.period),
      );
      logInfo({
        event: "protocol_health.request.complete",
        correlationId,
        period: parsedPeriod.period,
        durationMs: endTimer(timer),
      });
      return NextResponse.json(validated, {
        headers: { "Cache-Control": "public, max-age=900, s-maxage=900" },
      });
    } catch (error) {
      if (error instanceof ProtocolHealthValidationError) {
        logError({
          event: "protocol_health.request.error",
          correlationId,
          period: parsedPeriod.period,
          durationMs: endTimer(timer),
          errorClass: "validation",
          errorMessage: error.diagnostic,
        });
        return NextResponse.json(publicProtocolHealthValidationErrorBody(), {
          status: 500,
        });
      }
      throw error;
    }
  }

  try {
    const raw = await fetchHealth(parsedPeriod.period, correlationId, network);
    const validated = validateProtocolHealthResponse(raw);
    logInfo({
      event: "protocol_health.request.complete",
      correlationId,
      period: parsedPeriod.period,
      durationMs: endTimer(timer),
    });
    return NextResponse.json(validated, {
      headers: { "Cache-Control": "public, max-age=900, s-maxage=900" },
    });
  } catch (error) {
    if (error instanceof CredentialsMissingError) {
      logError({
        event: "protocol_health.request.error",
        correlationId,
        period: parsedPeriod.period,
        durationMs: endTimer(timer),
        errorClass: "validation",
        errorMessage: error.message,
      });
      return NextResponse.json(
        {
          code: "CREDENTIALS_MISSING",
          message: "BigQuery credentials are not configured.",
        } satisfies ApiErrorResponse,
        { status: 503 },
      );
    }

    if (error instanceof BigQueryLimitExceededError) {
      logError({
        event: "protocol_health.request.error",
        correlationId,
        period: parsedPeriod.period,
        durationMs: endTimer(timer),
        errorClass: "provider",
        errorMessage: error.message,
      });
      return NextResponse.json(
        {
          code: "LIMIT_EXCEEDED",
          message: error.message,
        } satisfies ApiErrorResponse,
        { status: 400 },
      );
    }

    if (error instanceof ProtocolHealthValidationError) {
      logError({
        event: "protocol_health.request.error",
        correlationId,
        period: parsedPeriod.period,
        durationMs: endTimer(timer),
        errorClass: "validation",
        errorMessage: error.diagnostic,
      });
      return NextResponse.json(publicProtocolHealthValidationErrorBody(), {
        status: 500,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch protocol health";
    logError({
      event: "protocol_health.request.error",
      correlationId,
      period: parsedPeriod.period,
      durationMs: endTimer(timer),
      errorClass: "provider",
      errorMessage: message,
    });

    return NextResponse.json(
      {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      } satisfies ApiErrorResponse,
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleProtocolHealthRequest(request);
}
