import { describe, expect, test } from "bun:test";
import {
  mapGoogleUrl,
  renderMapPlaceholder,
  renderMapsClientScript,
  type MapEmbed,
} from "../src/core/maps";

function mapFixture(overrides: Partial<MapEmbed> = {}): MapEmbed {
  return {
    id: 1,
    title: "Tokyo route",
    slug: "tokyo-route",
    provider: "openstreetmap",
    displayMode: "route",
    startLat: 35.681236,
    startLng: 139.767125,
    startLabel: "Tokyo Station",
    endLat: 35.658034,
    endLng: 139.701636,
    endLabel: "Shibuya Station",
    travelMode: "driving",
    zoom: 14,
    height: 480,
    status: "published",
    createdBy: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("managed map snippets", () => {
  test("builds official Google Maps URLs for routes and pinpoint markers", () => {
    const route = mapGoogleUrl(mapFixture());
    expect(route).toStartWith("https://www.google.com/maps/dir/?api=1");
    expect(route).toContain("origin=35.681236%2C139.767125");
    expect(route).toContain("destination=35.658034%2C139.701636");

    const marker = mapGoogleUrl(mapFixture({ displayMode: "marker", endLat: null, endLng: null }));
    expect(marker).toStartWith("https://www.google.com/maps/search/?api=1");
    expect(marker).toContain("query=35.681236%2C139.767125");
  });

  test("renders a reusable placeholder and generated public loader", () => {
    const map = mapFixture();
    const placeholder = renderMapPlaceholder(map);
    expect(placeholder).toContain('data-hsc-map="tokyo-route"');
    expect(placeholder).toContain("min-height:480px");

    const script = renderMapsClientScript([map]);
    expect(script).toContain("tokyo-route");
    expect(script).toContain("tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(script).toContain("router.project-osrm.org");
    expect(script).toContain("https://www.google.com/maps/embed/v1/");
    expect(script).toContain("window.HybridStaticCMSMaps");
    expect(() => new Function(script)).not.toThrow();
  });

  test("escapes labels before passing them to Leaflet popups", () => {
    const script = renderMapsClientScript([mapFixture({ startLabel: '<img src=x onerror="alert(1)">' })]);
    expect(script).not.toContain("<img src=x");
    expect(script).toContain("&lt;img");
  });
});
