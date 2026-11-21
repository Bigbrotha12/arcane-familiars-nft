/**
 * Same-origin API proxy (Cloudflare Pages Function).
 *
 * Every /api/* request to the Pages site is forwarded unchanged to the backend
 * Worker through the `API` service binding (configured per environment in
 * frontend/pages-config/*.wrangler.json, copied to frontend/wrangler.json by
 * CI before `wrangler pages deploy`).
 *
 * Why: the SPA (*.pages.dev) and the Worker (*.workers.dev) are different
 * sites, so session cookies set by the Worker were third-party cookies — Safari
 * drops them and Chrome is phasing them out. Served through this proxy the API
 * is same-origin and its cookies are first-party (see docs P0.28).
 *
 * The original request (method, headers incl. Cookie / Origin /
 * CF-Connecting-IP, body) is passed through as-is, and the Worker's response
 * (incl. Set-Cookie) is returned as-is.
 */

interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  API: ServiceBinding;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  return env.API.fetch(request);
};
