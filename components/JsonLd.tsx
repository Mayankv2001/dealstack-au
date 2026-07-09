import { serializeJsonLd } from "@/lib/structuredData";

/**
 * Renders one JSON-LD block. Server component (no hooks / no client state), so
 * it can be rendered from any server page. The payload is escaped via
 * `serializeJsonLd` to prevent a `</script>` breakout — see that helper.
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
