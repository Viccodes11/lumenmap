import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIncident, type ReadinessHealth } from "./incident-health";

function health(
  status: ReadinessHealth["status"],
  message?: string,
): ReadinessHealth {
  return {
    status,
    checks: {
      bigquery: {
        status: status === "healthy" ? "ok" : status === "degraded" ? "degraded" : "unavailable",
        message,
      },
    },
  };
}

describe("classifyIncident", () => {
  it("returns no incident for a healthy readiness response", () => {
    assert.equal(classifyIncident(health("healthy")), null);
  });

  it("distinguishes missing local credentials from an upstream incident", () => {
    assert.equal(
      classifyIncident(
        health("degraded", "BigQuery credentials are not configured"),
      )?.kind,
      "credentials-missing",
    );
  });

  it("maps degraded and unavailable responses to distinct incidents", () => {
    assert.equal(classifyIncident(health("degraded", "Ping timed out"))?.kind, "degraded");
    assert.equal(classifyIncident(health("unavailable", "Ping failed"))?.kind, "down");
  });

  it("treats a failed status request as unavailable", () => {
    assert.equal(classifyIncident(null, true)?.kind, "down");
  });
});
