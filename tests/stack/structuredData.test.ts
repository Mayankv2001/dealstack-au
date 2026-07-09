import { describe, expect, it } from "vitest";
import {
  buildOrganizationJsonLd,
  buildStoreBreadcrumbJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from "@/lib/structuredData";

const SITE = "https://dealstack.example";

/**
 * Recursively assert an object graph contains no `undefined`, `null` or
 * empty-string values — JSON-LD builders must never emit hollow properties that
 * validators flag or that silently misrepresent the site.
 */
function assertNoEmptyValues(value: unknown, path = "$"): void {
  if (value === undefined || value === null) {
    throw new Error(`Empty (undefined/null) value at ${path}`);
  }
  if (typeof value === "string") {
    expect(value, `empty string at ${path}`).not.toBe("");
    return;
  }
  if (Array.isArray(value)) {
    expect(value.length, `empty array at ${path}`).toBeGreaterThan(0);
    value.forEach((v, i) => assertNoEmptyValues(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      assertNoEmptyValues(v, `${path}.${k}`);
    }
  }
}

describe("buildWebSiteJsonLd", () => {
  const site = buildWebSiteJsonLd(SITE);

  it("is a WebSite with the brand name and absolute url", () => {
    expect(site["@context"]).toBe("https://schema.org");
    expect(site["@type"]).toBe("WebSite");
    expect(site.name).toBe("DealStack AU");
    expect(site.url).toBe(SITE);
  });

  it("exposes a SearchAction targeting the real /search?q= param", () => {
    const action = site.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    const target = action.target as Record<string, unknown>;
    expect(target.urlTemplate).toBe(`${SITE}/search?q={search_term_string}`);
    // The exact, fixed value schema.org requires — the tripwire if `q` is renamed.
    expect(action["query-input"]).toBe("required name=search_term_string");
  });

  it("stringifies with the search template intact", () => {
    expect(JSON.stringify(site)).toContain("/search?q={search_term_string}");
  });

  it("does not double the slash when the site url has a trailing slash", () => {
    const withSlash = buildWebSiteJsonLd(`${SITE}/`);
    expect(withSlash.url).toBe(SITE);
    const target = (withSlash.potentialAction as Record<string, unknown>)
      .target as Record<string, unknown>;
    expect(target.urlTemplate).toBe(`${SITE}/search?q={search_term_string}`);
  });

  it("emits no empty properties", () => {
    assertNoEmptyValues(site);
  });
});

describe("buildOrganizationJsonLd", () => {
  const org = buildOrganizationJsonLd(SITE);

  it("is an Organization with name and absolute url", () => {
    expect(org["@context"]).toBe("https://schema.org");
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("DealStack AU");
    expect(org.url).toBe(SITE);
  });

  it("does not assert a logo it does not have", () => {
    expect("logo" in org).toBe(false);
  });

  it("emits no empty properties", () => {
    assertNoEmptyValues(org);
  });
});

describe("buildStoreBreadcrumbJsonLd", () => {
  const crumb = buildStoreBreadcrumbJsonLd(SITE, { id: "myer", name: "Myer" });
  const items = crumb.itemListElement as Array<Record<string, unknown>>;

  it("is a two-level BreadcrumbList: Home -> store", () => {
    expect(crumb["@type"]).toBe("BreadcrumbList");
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("Home");
    expect(items[1].name).toBe("Myer");
  });

  it("numbers positions 1..n in order", () => {
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });

  it("uses absolute item URLs under the passed site origin", () => {
    for (const item of items) {
      expect(String(item.item).startsWith(SITE)).toBe(true);
    }
    expect(items[0].item).toBe(SITE);
    expect(items[1].item).toBe(`${SITE}/stores/myer`);
  });

  it("never links a non-existent /stores index crumb", () => {
    // There is no /stores index route; no crumb may point at it.
    for (const item of items) {
      expect(item.item).not.toBe(`${SITE}/stores`);
      expect(item.item).not.toBe(`${SITE}/stores/`);
    }
  });

  it("emits no empty properties", () => {
    assertNoEmptyValues(crumb);
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so a </script> in a store name cannot break out", () => {
    const malicious = buildStoreBreadcrumbJsonLd(SITE, {
      id: "evil",
      name: "Bad</script><script>alert(1)</script>",
    });
    const html = serializeJsonLd(malicious);
    expect(html).not.toContain("</script>");
    expect(html).toContain("\\u003c");
  });

  it("still round-trips through JSON.parse (escape is JSON-valid)", () => {
    const data = buildStoreBreadcrumbJsonLd(SITE, {
      id: "x",
      name: "A < B & C",
    });
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("round-trips every site-level builder", () => {
    for (const data of [
      buildWebSiteJsonLd(SITE),
      buildOrganizationJsonLd(SITE),
      buildStoreBreadcrumbJsonLd(SITE, { id: "myer", name: "Myer" }),
    ]) {
      expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
    }
  });
});
