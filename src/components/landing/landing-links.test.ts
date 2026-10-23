import { describe, expect, it } from "vitest";
import { appLinks, DEMO_HREF } from "./landing-links";

describe("appLinks", () => {
  it("sends a visitor to the demo sign-in for every page that needs an account", () => {
    const links = appLinks(null);
    expect(links.upload).toBe(DEMO_HREF);
    expect(links.products).toBe(DEMO_HREF);
    expect(links.metrics).toBe(DEMO_HREF);
    expect(links.api).toBe(DEMO_HREF);
    expect(links.shop).toBe("/store/demo");
  });

  it("derives a signed-in merchant's pages from their upload page", () => {
    const links = appLinks("/app/demo/upload");
    expect(links.upload).toBe("/app/demo/upload");
    expect(links.products).toBe("/app/demo/products");
    expect(links.metrics).toBe("/app/demo/metrics");
    expect(links.api).toBe("/app/demo/settings#webhooks");
  });

  it("tolerates a trailing slash on the dashboard link", () => {
    expect(appLinks("/app/demo/upload/").products).toBe("/app/demo/products");
  });
});
