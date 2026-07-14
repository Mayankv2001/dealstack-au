import { serializeJsonLd } from "@/lib/structuredData";

/**
 * Renders one JSON-LD block. Server component (no hooks / no client state), so
 * it can be rendered from any server page. The payload is escaped via
 * `serializeJsonLd` to prevent a `</script>` breakout — see that helper.
 *
 * No CSP nonce: `application/ld+json` is a data block, which CSP script-src
 * never executes or blocks, and browsers blank the `nonce` attribute in the
 * DOM, so a server-rendered nonce here caused a hydration mismatch on every
 * page that used it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

export default JsonLd;
