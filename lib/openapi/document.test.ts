import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openApiDocument } from "./document";
import { getFixtureActivityData } from "@/lib/fixtures/activity";
import { toVisualizationResponse } from "@/app/api/activity/_handler";

describe("OpenAPI document", () => {
  it("declares OpenAPI 3.1 and the public routes", () => {
    assert.equal(openApiDocument.openapi, "3.1.0");
    assert.ok(openApiDocument.paths["/api/v1/activity"]?.get);
    assert.ok(openApiDocument.paths["/api/v1/timeseries"]?.get);
    assert.ok(openApiDocument.paths["/api/v1/flow"]?.get);
    assert.ok(openApiDocument.paths["/api/v1/snapshots"]?.post);
    assert.ok(openApiDocument.paths["/api/v1/snapshots/{id}"]?.get);
    assert.ok(openApiDocument.paths["/api/health"]?.get);
    assert.ok(openApiDocument.paths["/api/openapi.json"]?.get);
  });

  it("activity schema required keys match fixture visualization output", () => {
    const fixture = toVisualizationResponse(getFixtureActivityData("1d"));
    const required =
      openApiDocument.components.schemas.ActivityVisualizationResponse
        .required;
    for (const key of required) {
      assert.ok(
        key in fixture,
        `fixture visualization missing OpenAPI required key "${key}"`,
      );
    }
  });

  it("period enum matches runtime period values", () => {
    const enumValues =
      openApiDocument.components.schemas.Period.enum;
    assert.deepEqual([...enumValues].sort(), ["1d", "30d", "7d", "month"]);
  });
});
