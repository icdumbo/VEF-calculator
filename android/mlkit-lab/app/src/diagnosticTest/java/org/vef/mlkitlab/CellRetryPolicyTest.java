package org.vef.mlkitlab;
import org.junit.*;import static org.junit.Assert.*;import org.json.*;import java.util.*;import java.util.concurrent.TimeoutException;
public class CellRetryPolicyTest {
 static class Control implements CellRetryPolicy.Control {
   long time,elapsed;boolean running=true;int writes;JSONObject saved;
   public long now(){return time;}public long elapsed(){return elapsed+time;}public boolean running(){return running;}
   public void persist(JSONObject state)throws Exception{writes++;saved=new JSONObject(state.toString());}
 }
 static TableParser.Result result(){TableParser.Result r=new TableParser.Result();r.rowCount=1;r.cells[0][3]="1234.5678";r.status[0][3]="invalid";r.reasons[0][3]="INVALID_QUANTITY_NO_AUTOMATIC_REPAIR";r.evidence[0][3].add(new TableParser.Token("1234.5678",100,50,200,70,.8f,1));return r;}
 static JSONObject read(String s)throws Exception{return new JSONObject().put("rawText",s).put("fragments",new JSONArray());}
 @Test public void differingCandidateRemainsUnconfirmedAndOriginalUnchanged()throws Exception {
   TableParser.Result r=result();Control c=new Control();JSONObject state=CellRetryPolicy.run(r,500,500,(b,v,t)->{c.time+=10;return read(v==0?"1234.5678":"1234.567");},c);
   assertEquals(2,state.getInt("cellOcrCalls"));assertEquals(1,state.getInt("triggeredCells"));assertEquals(20,state.getLong("elapsedMs"));
   assertEquals("1234.5678",r.cells[0][3]);assertEquals("invalid",r.status[0][3]);
   JSONArray a=state.getJSONArray("cells").getJSONObject(0).getJSONArray("attempts");assertFalse(a.getJSONObject(0).getBoolean("syntacticallyValid"));assertTrue(a.getJSONObject(1).getBoolean("syntacticallyValid"));assertTrue(a.getJSONObject(1).getBoolean("reviewRequired"));assertFalse(a.getJSONObject(1).getBoolean("automaticApproval"));assertEquals(5,c.writes);
 }
 @Test public void correctOrReviewCellsNeverTriggerOcr()throws Exception {
   TableParser.Result r=result();r.status[0][3]="candidate";Control c=new Control();assertEquals(0,CellRetryPolicy.run(r,500,500,(b,v,t)->{fail("Must not reread valid cells");return null;},c).getInt("cellOcrCalls"));
   r.status[0][3]="review";assertEquals(0,CellRetryPolicy.run(r,500,500,(b,v,t)->{fail();return null;},c).getInt("cellOcrCalls"));
 }
 @Test public void conflictingCandidatesBothRetained()throws Exception {
   JSONObject s=CellRetryPolicy.run(result(),500,500,(b,v,t)->read(v==0?"1234.567":"1234.568"),new Control());
   JSONArray a=s.getJSONArray("cells").getJSONObject(0).getJSONArray("attempts");assertEquals(2,a.length());for(int i=0;i<2;i++)assertTrue(a.getJSONObject(i).getBoolean("reviewRequired"));
 }
 @Test public void nativeTimeoutStopsFurtherCallsAndPersists()throws Exception {
   Control c=new Control();JSONObject s=CellRetryPolicy.run(result(),500,500,(b,v,t)->{throw new TimeoutException();},c);
   assertEquals(1,s.getInt("cellOcrCalls"));assertEquals("timeout",c.saved.getJSONArray("cells").getJSONObject(0).getJSONArray("attempts").getJSONObject(0).getString("status"));
 }
 @Test public void noCallsAfterCancellationOrDeadline()throws Exception {
   Control c=new Control();c.running=false;assertEquals(0,CellRetryPolicy.run(result(),500,500,(b,v,t)->{fail();return null;},c).getInt("cellOcrCalls"));
   c.running=true;c.elapsed=11900;assertEquals(0,CellRetryPolicy.run(result(),500,500,(b,v,t)->{fail();return null;},c).getInt("cellOcrCalls"));
 }
 @Test public void cropClipsPaddingToAdjacentEvidenceAndImage() {
   TableParser.Result r=result();r.evidence[0][4].add(new TableParser.Token("100.000",202,50,300,70,.9f,2));int[] box=CellRetryPolicy.crop(r,0,3,500,500);assertTrue(box[2]<=202);assertTrue(box[0]>=0);assertTrue(box[3]<=500);
 }
 @Test public void noCropWithoutEvidence()throws Exception {TableParser.Result r=result();r.evidence[0][3].clear();assertEquals(0,CellRetryPolicy.run(r,500,500,(b,v,t)->{fail();return null;},new Control()).getInt("cellOcrCalls"));}
 @Test public void noDigitRepairAndRealCalendarValidation() {assertFalse(CellRetryPolicy.valid(3,"1234.5678"));assertFalse(CellRetryPolicy.valid(3,"1234567"));assertTrue(CellRetryPolicy.valid(3,"1234.567"));assertFalse(CellRetryPolicy.valid(1,"31/02/2026"));assertTrue(CellRetryPolicy.valid(1,"28/02/2026"));}
 @Test public void boundedCellsAndAttempts()throws Exception {TableParser.Result r=result();for(int i=0;i<5;i++){r.status[0][i]="invalid";r.evidence[0][i].add(new TableParser.Token("bad",10+i*60,20,40+i*60,40,.8f,i));}JSONObject s=CellRetryPolicy.run(r,500,500,(b,v,t)->read("bad"),new Control());assertEquals(4,s.getInt("triggeredCells"));assertEquals(8,s.getInt("cellOcrCalls"));}
 @Test public void replayActualHeaderfixReportOnlyTargetsInvalidAndPreservesAllCells()throws Exception {
   String path=System.getenv("MLKIT_HEADERFIX_RESULT");if(path==null||path.isEmpty())path=System.getProperty("mlkit.headerfix.result","");assertFalse("Real headerfix fixture required",path.isEmpty());
   JSONObject source=new JSONObject(new String(java.nio.file.Files.readAllBytes(java.nio.file.Path.of(path)),java.nio.charset.StandardCharsets.UTF_8));
   TableParser.Result r=new TableParser.Result();JSONArray rows=source.getJSONArray("rows");r.rowCount=rows.length();StringBuilder before=new StringBuilder();
   for(int row=0;row<rows.length();row++)for(int col=0;col<5;col++) {JSONObject cell=rows.getJSONObject(row).getJSONObject("cells").getJSONObject(TableParser.LABELS[col]);r.cells[row][col]=cell.getString("value");r.status[row][col]=cell.getString("status");r.reasons[row][col]=cell.getString("reason");JSONArray fragments=cell.getJSONArray("originalFragments");for(int i=0;i<fragments.length();i++){JSONObject f=fragments.getJSONObject(i);r.evidence[row][col].add(new TableParser.Token(f.getString("text"),(float)f.getDouble("left"),(float)f.getDouble("top"),(float)f.getDouble("right"),(float)f.getDouble("bottom"),(float)f.getDouble("confidence"),f.getInt("id")));}before.append(r.cells[row][col]).append('|').append(r.status[row][col]).append(';');}
   JSONObject s=CellRetryPolicy.run(r,source.getInt("ocrWidth"),source.getInt("ocrHeight"),(b,v,t)->read("unreadable"),new Control());assertEquals(1,s.getInt("triggeredCells"));assertEquals(2,s.getInt("cellOcrCalls"));StringBuilder after=new StringBuilder();for(int row=0;row<r.rowCount;row++)for(int col=0;col<5;col++)after.append(r.cells[row][col]).append('|').append(r.status[row][col]).append(';');assertEquals(before.toString(),after.toString());
 }
}
