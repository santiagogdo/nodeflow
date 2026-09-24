import { buildExamples } from "./build.ts";
import { serve } from "./serve.ts";

// Deno's --watch restarts this module; only serve once the build succeeds.
await buildExamples();
const revision = crypto.randomUUID();
const reloadScript = `<script type="module">
const updates = new EventSource("/__reload");
updates.onmessage = ({ data }) => {
  if (data !== ${JSON.stringify(revision)}) {
    updates.close();
    location.reload();
  }
};
</script>`;

export default {
  async fetch(request) {
    if (
      request.method === "GET" &&
      new URL(request.url).pathname === "/__reload"
    ) {
      return new Response(
        new ReadableStream({
          start(controller) {
            // EventSource reconnects after a restart. A new revision reloads
            // even a page whose first connection was delayed until this build.
            controller.enqueue(
              new TextEncoder().encode(`retry: 300\ndata: ${revision}\n\n`),
            );
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
          },
        },
      );
    }
    const response = await serve(request);
    if (
      request.method === "GET" && response.ok &&
      response.headers.get("content-type")?.startsWith("text/html")
    ) {
      return new Response(
        (await response.text()).replace("</body>", `${reloadScript}</body>`),
        { headers: response.headers },
      );
    }
    return response;
  },
} satisfies Deno.ServeDefaultExport;
