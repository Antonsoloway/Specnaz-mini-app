import {createTeamLive} from './team-live.js';
import currentWorker from './entry-v1410.js';
import {authorizeAdmin} from './entry-v1380.js';
import {createSosiskaApi} from './sosiska-api.js';
import {downloadHistoryExport} from './sosiska-export.js';
const teamLive = createTeamLive({crm:currentWorker.fetch.bind(currentWorker)});
const agent = createSosiskaApi({authorizeAdmin});
export {SosiskaAnalysisJobs,SosiskaKingdomAnalysisJobs} from './sosiska-analysis-jobs.js';
export {SosiskaKingdomMonitor} from './sosiska-rk-monitor.js';
export default {
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(path==='/team-live'||path==='/admin-team-live')return teamLive(request,env,ctx);
    if(path==='/admin-agent')return agent(request,env);
    if(path==='/admin-agent-export')return downloadHistoryExport(request,env);
    return currentWorker.fetch(request,env,ctx);
  }
};
