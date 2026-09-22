import { Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";
import { DesignVersionHistory } from "../panels/DesignVersionHistory.jsx";
import { DesignGallery } from "../panels/DesignGallery.jsx";
import { addNotif } from "../AuthSystem";
import { LeaderboardPanel, getPublicDesign } from "../CommunityFeatures";
import { readDesignRecord, recordFromRow } from "../lib/designfile.js";
import { recordFromHistoryEntry } from "../lib/history.js";

/* Tab 16 — Community.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function CommunityTab(ctx) {
  const { SR, U, customAFData, handleAuth, openDesignSafely, params, set, setParams, tab, user } = ctx;
  return (
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* ── Design Version History ── */}
                <Panel title="Design Version History">
                  <DesignVersionHistory
                    params={params} SR={SR} SC={SC} customAirfoil={customAFData}
                    onLoadVersion={entry=>openDesignSafely(()=>recordFromHistoryEntry(entry),`version ${entry.label}`)}
                    user={user} onAuth={handleAuth} U={U}/>
                </Panel>

                {/* ── Reference Aircraft Database — read-only comparison set ── */}
                <Panel title="Reference Aircraft Database">
                  <DesignGallery SC={SC} customAirfoil={customAFData} onLoadDesign={(p,name)=>openDesignSafely(()=>readDesignRecord(p),name||"reference design")} SR={SR} params={params} user={user} onAuth={handleAuth} U={U}/>
                </Panel>

                {/* ── Published Configurations — community-submitted reference data ── */}
                <Panel title="Published Configurations">
                  <LeaderboardPanel C={SC} onLoadDesign={(row)=>{
                    /* Leaderboard rows carry no params (evtol_leaderboard has no
                       such column), so this used to parse "{}" and silently load
                       nothing. The row names the published design; fetch that. */
                    const name=row.name||"published configuration";
                    const load=d=>openDesignSafely(()=>{
                      if(!d) throw new Error("The published design behind this entry was not found.");
                      return recordFromRow(d.params,d.results);
                    },name);
                    if(row.params) load(row);
                    else if(row.share_id) getPublicDesign(row.share_id).then(load);
                    else load(null);
                  }}/>
                </Panel>
              </div>
  );
}
