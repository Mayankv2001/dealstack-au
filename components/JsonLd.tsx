import { serializeJsonLd } from "@/lib/structuredData";
import { headers } from "next/headers";

/**
 * Renders one JSON-LD block. Server component (no hooks / no client state), so
 * it can be rendered from any server page. The payload is escaped via
 * `serializeJsonLd` to prevent a `</script>` breakout — see that helper.
 */
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      nonce={nonce}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

export default JsonLd;
