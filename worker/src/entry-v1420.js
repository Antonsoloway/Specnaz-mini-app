import currentWorker from './entry-v1410.js';
import {authorizeAdmin} from './entry-v1380.js';
import {createSosiskaApi} from './sosiska-api.js';
const agent = createSosiskaApi({authorizeAdmin});
export default {
  async fetch(request,env,ctx) {
    if(new URL(request.url).pathname==='/admin-agent')return agent(request,env);
    return currentWorker.fetch(request,env,ctx);
  }
};
