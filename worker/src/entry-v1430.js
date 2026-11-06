import currentWorker from './entry-v1420.js';
import {createAdminBattleBaseApi} from './battle-base-api-v1.js';
import {authorizeAdmin} from './entry-v1380.js';

const battleBase = createAdminBattleBaseApi({authorizeAdmin});
async function verifyAdminSession(request, env) {
  if (request.method !== 'GET') return new Response(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}), {status:405,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
  try {
    await authorizeAdmin(request, env);
    return new Response(JSON.stringify({ok:true}), {status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) {
    const status = Number(error?.status || 403);
    return new Response(JSON.stringify({ok:false,error:String(error?.code || 'ADMIN_REQUIRED')}), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
}
export {
  SosiskaAnalysisJobs,
  SosiskaKingdomAnalysisJobs,
  SosiskaKingdomMonitor
} from './entry-v1420.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/verify-admin-session') return verifyAdminSession(request, env);
    if (url.pathname === '/admin-battle-base') return battleBase(request, env);
    const response = await currentWorker.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        const payload = await response.clone().json();
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        return new Response(JSON.stringify({
          ...payload,
          version: '1.43.0',
          adminBattleBase: 'admin-only-cached-d1-index-v1'
        }), {status:response.status,headers});
      } catch (_) {}
    }
    return response;
  }
};
