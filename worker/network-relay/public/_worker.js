const UPSTREAM = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
const FRONTEND = 'https://antonsoloway.github.io';

export default {
  async fetch(request, env) {
    const target = new URL(UPSTREAM);
    const source = new URL(request.url);
    target.pathname = source.pathname;
    target.search = source.search;
    try {
      // Service binding fixes the destination. Authentication and every role
      // decision remain in the original Worker; this relay has no secrets.
      const response = await env.CRM_API.fetch(new Request(target, request));
      const headers = new Headers(response.headers);
      headers.set('X-Royal-API-Relay', 'service-binding-v1');
      return new Response(response.body, {status:response.status,headers});
    } catch {
      const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
      if (request.headers.get('Origin') === FRONTEND) headers['Access-Control-Allow-Origin'] = FRONTEND;
      return new Response(JSON.stringify({ok:false,error:'API_RELAY_UNAVAILABLE'}), {status:503,headers});
    }
  }
};
