package org.vef.mlkitlab;

import android.app.Service;
import android.content.Intent;
import android.net.Uri;
import android.os.*;
import android.graphics.*;
import com.google.mlkit.common.MlKit;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.*;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.google.android.gms.tasks.Tasks;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.*;

/** Source-based mapping worker. Same bundled OCR and validators as the legacy diagnostic. */
public final class MappingOcrService extends Service {
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final ScheduledExecutorService watchdog=Executors.newSingleThreadScheduledExecutor();
 private final AtomicBoolean stopped=new AtomicBoolean();
 private volatile RunJournal journal;
 private volatile com.google.android.gms.tasks.Task<Text> documentTask;
 private ResultReceiver receiver;private String session,job;private File logs,cache;private boolean active;
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onCreate(){super.onCreate();logs=new File(getFilesDir(),"diagnostics");cache=new File(getFilesDir(),"mapping-cache");logs.mkdirs();cache.mkdirs();}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(intent==null)return START_NOT_STICKY;
  if("cancel".equals(intent.getAction())){if(active&&Objects.equals(session,intent.getStringExtra("session")))watchdog.execute(()->finish("USER_CANCELLED",null));else if(!active)stopSelf();return START_NOT_STICKY;}
  if(active){ResultReceiver next=intent.getParcelableExtra("receiver");if(next!=null){Bundle b=new Bundle();b.putString("session",intent.getStringExtra("session"));b.putString("message","Previous mapping worker is finishing. Try again shortly.");next.send(3,b);}return START_NOT_STICKY;}
  session=intent.getStringExtra("session");if(session==null||!session.matches("map-[A-Za-z0-9-]+")){stopSelf();return START_NOT_STICKY;}
  job=session+"-"+System.currentTimeMillis();receiver=intent.getParcelableExtra("receiver");active=true;
  worker.execute(()->process(intent));
  watchdog.scheduleWithFixedDelay(()->{RunJournal j=journal;if(j!=null&&!stopped.get()){String reason=j.deadlineReason();if(!reason.isEmpty())finish(reason,null);}},100,100,TimeUnit.MILLISECONDS);
  return START_NOT_STICKY;
 }
 private void begin(String stage,long limit)throws Exception {check();journal.begin(stage,limit);send(1,"Stage: "+stage,null);}
 private void check()throws InterruptedException {if(stopped.get()||Thread.currentThread().isInterrupted())throw new InterruptedException("Mapping job stopped");}
 public static void save(File file,JSONObject data)throws IOException {File tmp=new File(file.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(data.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}java.nio.file.Files.move(tmp.toPath(),file.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
 public static JSONObject read(File file)throws Exception {return new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8));}
 private File budget(){return new File(cache,session+"-budget.json");}
 private void process(Intent intent){Bitmap bitmap=null;TextRecognizer recognizer=null;
  try {
   boolean detect="detect".equals(intent.getAction());JSONObject previous=budget().exists()?read(budget()):null;
   long prior=previous==null?0:previous.optBoolean("pending")?15000:previous.optLong("usedActiveMs");
   journal=new RunJournal(new File(logs,job+".jsonl"),ProcessingBudget.clock(()->System.nanoTime()/1000000,prior));
   if(prior>=15000)throw new TimeoutException("Session processing budget exhausted. Start a new photograph session.");
   save(budget(),new JSONObject().put("pending",true).put("usedActiveMs",prior));
   if(detect){
    begin("LOAD_PHOTOGRAPH",3000);Uri uri=intent.getParcelableExtra("uri");File input=new File(cache,session+".input");long bytes=0;
    try(InputStream in=getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(input)){if(in==null)throw new IOException("Photograph access failed.");byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){check();bytes+=n;if(bytes>67108864)throw new IOException("Photograph exceeds the 64 MB local file limit.");out.write(buffer,0,n);}out.getFD().sync();}
    journal.end("Original photograph copied privately; bytes="+bytes);
    begin("DECODE_AND_ORIENT",4000);bitmap=MappingImage.decode(input,8192);journal.end("Oriented pixels="+bitmap.getWidth()+"x"+bitmap.getHeight());
    begin("MLKIT_INITIALIZATION",3000);MlKit.initialize(getApplicationContext());recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);InputImage image=InputImage.fromBitmap(bitmap,0);journal.end("Bundled offline recognizer initialized in isolated mapping process");
    begin("MLKIT_OCR",10000);long ocrStart=journal.elapsed();documentTask=recognizer.process(image);Text text=Tasks.await(documentTask,Math.max(1,Math.min(10000,15000-journal.elapsed())),TimeUnit.MILLISECONDS);long ocrMs=journal.elapsed()-ocrStart;journal.end("One whole-document OCR call; durationMs="+ocrMs);
    begin("EXTRACT_AND_SAVE_RAW",3000);JSONArray tokens=new JSONArray(),lines=new JSONArray();int blockCount=text.getTextBlocks().size(),lineCount=0,elementCount=0;
    for(Text.TextBlock block:text.getTextBlocks())for(Text.Line line:block.getLines()){lineCount++;Rect lb=line.getBoundingBox();if(lb!=null)lines.put(new JSONObject().put("text",line.getText()).put("left",lb.left).put("top",lb.top).put("right",lb.right).put("bottom",lb.bottom).put("confidence",Float.isFinite(line.getConfidence())?line.getConfidence():JSONObject.NULL));for(Text.Element e:line.getElements()){int id=elementCount++;Rect b=e.getBoundingBox();if(b!=null)tokens.put(new JSONObject().put("id",id).put("text",e.getText()).put("left",b.left).put("top",b.top).put("right",b.right).put("bottom",b.bottom).put("confidence",Float.isFinite(e.getConfidence())?e.getConfidence():JSONObject.NULL));}}
    JSONObject raw=new JSONObject().put("session",session).put("prototype","VEF ML Kit Lab Column Mapping").put("rawText",text.getText()).put("tokensInOrientedOcrPixels",tokens).put("linesInOrientedOcrPixels",lines).put("blockCount",blockCount).put("lineCount",lineCount).put("elementCount",elementCount).put("ocrWidth",bitmap.getWidth()).put("ocrHeight",bitmap.getHeight()).put("ocrCalls",1).put("ocrMs",ocrMs);
    save(new File(logs,session+"-mapping-raw.json"),raw);journal.end("Original OCR fragments persisted before layout detection");
    begin("DETECT_PHYSICAL_COLUMNS",3000);ColumnLayout layout=ColumnLayout.detect(ColumnLayout.tokens(tokens),bitmap.getWidth(),bitmap.getHeight());raw.put("layout",layout.json());journal.end(layout.rows.size()+" rows; "+layout.columns()+" tentative physical columns; no semantic header dictionary");
    raw.put("usedActiveMs",journal.elapsed()).put("trace",new JSONObject(journal.snapshot()));String file=session+"-mapping-detect.json";save(new File(logs,file),raw);finish("WAITING_FOR_INSPECTOR_MAPPING",file);
   }else if("apply".equals(intent.getAction())){
    begin("LOAD_CACHED_OCR_AND_MAPPING",2000);JSONObject raw=read(new File(logs,session+"-mapping-raw.json"));JSONObject selection=read(new File(cache,session+"-selection.json"));ColumnLayout layout=ColumnLayout.restore(selection.getJSONObject("layout"),ColumnLayout.tokens(raw.getJSONArray("tokensInOrientedOcrPixels")));JSONArray a=selection.getJSONArray("choices");int[] choices=new int[a.length()];for(int i=0;i<a.length();i++)choices[i]=a.getInt(i);ColumnLayout.validateMapping(choices,layout.columns());journal.end("Confirmed mapping loaded; no whole-document OCR repeated");
    begin("ASSOCIATE_AND_VALIDATE",3000);MappingRows mapped=new MappingRows(layout,choices);JSONObject result=mapped.report().put("session",session).put("rawOcrFile",session+"-mapping-raw.json").put("mapping",selection).put("ocrCalls",1).put("initialOcrMs",raw.getLong("ocrMs"));journal.end(mapped.result.diagnostic);
    boolean invalid=mapped.result.invalidCells>0;
    if(invalid){begin("DECODE_ORIGINAL_FOR_INVALID_CELLS",4000);bitmap=MappingImage.decode(new File(cache,session+".input"),8192);if(bitmap.getWidth()!=layout.width||bitmap.getHeight()!=layout.height)throw new IOException("Original image coordinates changed; reread refused.");journal.end("Same original oriented pixels; no document OCR");
     begin("LOCAL_INVALID_CELL_REREAD",6000);MlKit.initialize(getApplicationContext());recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);MappingCellCrops.set(mapped);try{CellReread.run(bitmap,recognizer,mapped.result,journal,result,logs,job);}finally{MappingCellCrops.clear();}journal.end("Rereads retain every initial value and require inspector confirmation");
    }else result.put("cellOcrCalls",0).put("totalOcrCalls",1);
    result.put("usedActiveMs",journal.elapsed()).put("trace",new JSONObject(journal.snapshot()));String file=job+"-mapping-result.json";save(new File(logs,file),result);finish("COMPLETED_UNCONFIRMED_VALUES",file);
   }else throw new IllegalArgumentException("Unknown mapping operation.");
  }catch(Exception e){finish(e instanceof InterruptedException?"USER_CANCELLED":"FAILED: "+e,null);}
  finally{if(recognizer!=null)recognizer.close();if(bitmap!=null&&!bitmap.isRecycled()&&(documentTask==null||documentTask.isComplete()))bitmap.recycle();MappingCellCrops.clear();}
 }
 private void send(int code,String message,String file){if(receiver==null)return;Bundle b=new Bundle();b.putString("session",session);b.putString("message",message);b.putInt("workerPid",android.os.Process.myPid());if(file!=null)b.putString("resultFile",file);RunJournal j=journal;if(j!=null)b.putString("trace",j.snapshot());receiver.send(code,b);}
 private void finish(String reason,String file){if(!stopped.compareAndSet(false,true))return;try{if(journal!=null){journal.stop(reason);save(budget(),new JSONObject().put("pending",false).put("usedActiveMs",Math.min(15000,journal.elapsed())));}}catch(Exception ignored){}send(file==null?3:2,reason,file);new Handler(Looper.getMainLooper()).postDelayed(()->{stopSelf();android.os.Process.killProcess(android.os.Process.myPid());},150);}
 @Override public void onDestroy(){worker.shutdownNow();watchdog.shutdownNow();super.onDestroy();}
}
