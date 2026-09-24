import { resolve, sep } from "node:path";

const root = resolve("dist-demo");
const mime: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  png: "image/png",
};
export async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }
  if (url.pathname === "/") {
    return Response.redirect(new URL("/examples/workbench/", url), 302);
  }
  let path: string;
  try {
    path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!path.startsWith(root + sep)) {
    return new Response("Not found", { status: 404 });
  }
  if (url.pathname.endsWith("/")) path += `${sep}index.html`;
  try {
    const body = await Deno.readFile(path);
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": mime[path.split(".").at(-1)!] ??
          "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (
      error instanceof Deno.errors.NotFound ||
      error instanceof Deno.errors.IsADirectory
    ) {
      return new Response("Not found", { status: 404 });
    }
    console.error(error);
    return new Response("Server error", { status: 500 });
  }
}

export default { fetch: serve } satisfies Deno.ServeDefaultExport;
