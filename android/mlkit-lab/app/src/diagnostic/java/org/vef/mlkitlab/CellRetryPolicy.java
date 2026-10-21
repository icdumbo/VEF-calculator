package org.vef.mlkitlab;

import java.util.*;
import org.json.*;

/** Bounded diagnostic rereads. Never writes to a parser result. */
public final class CellRetryPolicy {
    public static final int MAX_CELLS = 4, MAX_VARIANTS = 2;
    public static final long BUDGET_MS = 4500, RESERVE_MS = 3000, CALL_MS = 1700;
    public interface Engine { JSONObject read(int[] crop, int variant, long timeoutMs) throws Exception; }
    public interface Control { long now(); long elapsed(); boolean running(); void persist(JSONObject state) throws Exception; }
    public static boolean valid(int col, String text) {
        return col == 1 ? ObservedDates.valid(text) : col >= 3 ? TableParser.quantity(text) : !text.trim().isEmpty();
    }
    /** Existing evidence only; padding is clipped before neighbouring evidence. No table reassignment. */
    public static int[] crop(TableParser.Result r, int row, int col, int width, int height) {
        int[] confirmed=MappingCellCrops.get(row,col);
        if(confirmed!=null){if(confirmed[0]<0||confirmed[1]<0||confirmed[2]>width||confirmed[3]>height||confirmed[2]<=confirmed[0]||confirmed[3]<=confirmed[1]||(long)(confirmed[2]-confirmed[0])*(confirmed[3]-confirmed[1])>1000000)return null;return confirmed;}
        List<TableParser.Token> evidence=r.evidence[row][col];
        if(evidence==null||evidence.isEmpty()) return null;
        float l=width,t=height,rr=0,b=0;
        for(TableParser.Token token:evidence){l=Math.min(l,token.left);t=Math.min(t,token.top);rr=Math.max(rr,token.right);b=Math.max(b,token.bottom);}
        if(!Float.isFinite(l+t+rr+b)||rr<=l||b<=t) return null;
        float pad=Math.min(12,Math.max(2,(b-t)*.15f));
        float left=l-pad,right=rr+pad,top=t-pad,bottom=b+pad;
        for(int i=0;i<r.rowCount;i++) for(int j=0;j<5;j++) {
            if(i==row&&j==col)continue;
            for(TableParser.Token n:r.evidence[i][j]) {
                if(n.bottom>t&&n.top<b) {
                    if(n.right<=l)left=Math.max(left,(n.right+l)/2);
                    if(n.left>=rr)right=Math.min(right,(rr+n.left)/2);
                }
                if(n.right>l&&n.left<rr) {
                    if(n.bottom<=t)top=Math.max(top,(n.bottom+t)/2);
                    if(n.top>=b)bottom=Math.min(bottom,(b+n.top)/2);
                }
            }
        }
        int[] box={Math.max(0,(int)Math.floor(left)),Math.max(0,(int)Math.floor(top)),Math.min(width,(int)Math.ceil(right)),Math.min(height,(int)Math.ceil(bottom))};
        if(box[2]<=box[0]||box[3]<=box[1]||(long)(box[2]-box[0])*(box[3]-box[1])>1000000) return null;
        return box;
    }
    public static JSONObject run(TableParser.Result r,int width,int height,Engine engine,Control ctl)throws Exception {
        long start=ctl.now(); int calls=0,triggered=0,invalid=0; boolean exhausted=false;
        JSONArray cells=new JSONArray();
        JSONObject state=new JSONObject().put("policy","invalid-only; inspector confirmation required; original unchanged")
            .put("cells",cells).put("wholeDocumentOcrCalls",1).put("automaticApproval",false);
        for(int row=0;row<r.rowCount;row++) for(int col=0;col<5;col++) {
            if(!"invalid".equals(r.status[row][col]))continue;
            invalid++;
            JSONObject cell=new JSONObject().put("row",row+1).put("column",TableParser.LABELS[col])
                .put("initialValue",r.cells[row][col]).put("initialStatus",r.status[row][col]).put("initialReason",r.reasons[row][col])
                .put("reviewRequired",true).put("attempts",new JSONArray());
            cells.put(cell);
            int[] box=crop(r,row,col,width,height);
            if(box==null){cell.put("skipReason","NO_SAFE_ORIGINAL_EVIDENCE_CROP");continue;}
            cell.put("cropInOrientedOriginalPixels",new JSONArray(box));
            if(triggered>=MAX_CELLS||exhausted){cell.put("skipReason","REREAD_BUDGET_EXHAUSTED");continue;}
            boolean cellTriggered=false;
            for(int variant=0;variant<MAX_VARIANTS;variant++) {
                long remaining=Math.min(BUDGET_MS-(ctl.now()-start),15000-RESERVE_MS-ctl.elapsed());
                if(!ctl.running()||remaining<250){cell.put("skipReason","CANCELLED_OR_DEADLINE_RESERVE");exhausted=true;break;}
                if(!cellTriggered){triggered++;cellTriggered=true;}
                JSONObject attempt=new JSONObject().put("variant",variant==0?"original_crop":"upscale_2x_contrast_1.12")
                    .put("status","started").put("automaticApproval",false);
                cell.getJSONArray("attempts").put(attempt); calls++;
                state.put("cellOcrCalls",calls).put("triggeredCells",triggered).put("elapsedMs",ctl.now()-start);
                ctl.persist(state); long attemptStart=ctl.now();
                try {
                    JSONObject result=engine.read(box,variant,Math.min(CALL_MS,remaining));
                    String text=result.optString("rawText","");
                    attempt.put("result",result).put("status","completed").put("syntacticallyValid",valid(col,text))
                        .put("differsFromInitial",!text.equals(r.cells[row][col])).put("reviewRequired",true);
                } catch(java.util.concurrent.TimeoutException e) {
                    attempt.put("status","timeout").put("reason","Native task may still be running; no further calls");exhausted=true;
                } catch(InterruptedException e) {
                    Thread.currentThread().interrupt();attempt.put("status","cancelled");exhausted=true;
                } catch(Exception e) {attempt.put("status","error").put("error",e.toString());exhausted=true;}
                attempt.put("elapsedMs",ctl.now()-attemptStart);ctl.persist(state);
                if(exhausted)break;
            }
        }
        state.put("invalidCells",invalid).put("triggeredCells",triggered).put("cellOcrCalls",calls)
            .put("totalOcrCalls",1+calls).put("elapsedMs",ctl.now()-start);
        ctl.persist(state);return state;
    }
    private CellRetryPolicy(){}
}
