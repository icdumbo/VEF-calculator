package org.vef.mlkitlab;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.net.*;
import org.json.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public class RecoveredDiagnosticTest {
  private TableParser.Token t(String s,float x,float y){return new TableParser.Token(s,x-20,y-5,x+20,y+5,.99f);}
  private List<TableParser.Token> headers(){return new ArrayList<>(Arrays.asList(t("PORT / TERMINAL",100,20),t("B/L DATE",300,20),t("CARGO",500,20),t("SHIP'S FIGURES",700,20),t("B/L FIGURES",900,20)));}
  private List<TableParser.Token> words(){List<TableParser.Token> w=new ArrayList<>();for(int r=0;r<20;r++){float y=60+r*25;w.add(t("TEST PORT "+r,100,y));w.add(t(String.format(Locale.ROOT,"%02d.01.2026",r+1),300,y));w.add(t("TEST CARGO",500,y));w.add(t("1000.125",700,y));w.add(t("1001.125",900,y));}return w;}
  @Test public void twentyObservedRowsMapWithoutChangingNumbers(){TableParser.Result r=TableParser.parse(words(),headers());assertEquals(20,r.rowCount);assertEquals(100,r.associatedCells);assertEquals("1000.125",r.cells[0][3]);assertEquals("TEST PORT 19",r.cells[19][0]);}
  @Test public void blankInputDoesNotInventCells(){TableParser.Result r=TableParser.parse(Collections.emptyList(),Collections.emptyList());assertEquals(0,r.rowCount);assertEquals(0,r.associatedCells);}
  @Test public void neverRepairsLetterIntoQuantity(){assertFalse(TableParser.quantity("1O00.125"));assertTrue(TableParser.quantity("1000.125"));}
  @Test public void impossibleDateIsRejected(){assertFalse(TableParser.date("31.02.2026"));assertTrue(TableParser.date("29.02.2024"));}
  @Test public void invalidObservedQuantityIsRetainedForReview(){List<TableParser.Token>w=words();w.set(3,t("1O00.125",700,60));TableParser.Result r=TableParser.parse(w,headers());assertEquals("1O00.125",r.cells[0][3]);assertNotEquals("coherent",r.status[0][3]);assertFalse(r.reasons[0][3].isEmpty());}
  @Test public void lowConfidenceTextIsNotDiscarded(){List<TableParser.Token>w=words();w.set(0,new TableParser.Token("TEST PORT",80,55,120,65,.3f));TableParser.Result r=TableParser.parse(w,headers());assertEquals("TEST PORT",r.cells[0][0]);assertFalse(r.reasons[0][0].isEmpty());}
  @Test public void partialHeaderDoesNotBlankAllColumns(){List<TableParser.Token> h=headers();h.remove(4);TableParser.Result r=TableParser.parse(words(),h);assertEquals("TEST PORT 0",r.cells[0][0]);assertEquals("1000.125",r.cells[0][3]);}
  @Test public void journalPersistsStageAndFailure()throws Exception{Path p=Files.createTempFile("journal", ".jsonl");AtomicLong clock=new AtomicLong();RunJournal j=new RunJournal(p.toFile(),clock::get);j.begin("PREPARE_IMAGE",5000);clock.set(192);j.event("EXCEPTION","sample failure");j.stop("ERROR");String text=new String(Files.readAllBytes(p),java.nio.charset.StandardCharsets.UTF_8);assertTrue(text.contains("PREPARE_IMAGE"));assertTrue(text.contains("sample failure"));assertTrue(text.contains("RUN_STOP"));assertFalse(j.running());Files.delete(p);}
  @Test public void journalTotalDeadlineStaysFifteenSeconds()throws Exception{Path p=Files.createTempFile("journal", ".jsonl");AtomicLong clock=new AtomicLong();RunJournal j=new RunJournal(p.toFile(),clock::get);j.begin("MLKIT_OCR",10000);clock.set(15000);assertEquals("TOTAL_TIMEOUT at MLKIT_OCR",j.deadlineReason());Files.delete(p);}
  @Test public void journalStageDeadlineIsIndependent()throws Exception{Path p=Files.createTempFile("journal", ".jsonl");AtomicLong clock=new AtomicLong();RunJournal j=new RunJournal(p.toFile(),clock::get);j.begin("PREPARE_IMAGE",5000);clock.set(5000);assertEquals("STAGE_TIMEOUT at PREPARE_IMAGE",j.deadlineReason());Files.delete(p);}
  @Test public void stoppedJournalCannotRestartOrLoseOutcome()throws Exception{Path p=Files.createTempFile("journal", ".jsonl");RunJournal j=new RunJournal(p.toFile());j.stop("CANCELLED");j.stop("COMPLETED");assertTrue(j.snapshot().contains("CANCELLED"));assertEquals("",j.deadlineReason());try{j.begin("OTHER",100);fail();}catch(IllegalStateException expected){}Files.delete(p);}
  @Test public void initializationPrecedesEveryMlKitImageCreation()throws Exception{
    try(InputStream in=getClass().getResourceAsStream("/org/vef/mlkitlab/OcrDiagnosticService.class")){assertNotNull(in);ClassNode c=new ClassNode();new ClassReader(in).accept(c,0);int checked=0;for(MethodNode m:c.methods)if(m.name.equals("process")){int index=0,init=-1,image=-1,client=-1;for(AbstractInsnNode n:m.instructions){if(n instanceof MethodInsnNode){MethodInsnNode x=(MethodInsnNode)n;if(x.owner.equals("com/google/mlkit/common/MlKit")&&x.name.equals("initialize"))init=index;if(x.owner.equals("com/google/mlkit/vision/common/InputImage")&&x.name.equals("fromBitmap"))image=index;if(x.name.equals("getClient"))client=index;}index++;}assertTrue("Initialization must precede InputImage (Galaxy Fold regression)",init>=0&&init<image);assertTrue(init<client);checked++;}assertEquals(1,checked);}
  }
  @Test public void realReportReplaysWithUnchangedParser()throws Exception{
    String path=System.getProperty("mlkit.report","");org.junit.Assume.assumeTrue("Supply MLKIT_REPORT for private device replay",!path.isEmpty());JSONObject report=new JSONObject(new String(Files.readAllBytes(Paths.get(path)),java.nio.charset.StandardCharsets.UTF_8));List<TableParser.Token> words=readTokens(report.getJSONArray("tokensInOrientedOcrPixels")),lines=readTokens(report.getJSONArray("linesInOrientedOcrPixels"));assertEquals(267,words.size());assertEquals(183,lines.size());long start=System.nanoTime();TableParser.Result result=TableParser.parse(words,lines);double ms=(System.nanoTime()-start)/1e6;
    assertEquals(20,result.rowCount);assertEquals(100,result.associatedCells);assertEquals(66,result.coherentCells);assertEquals(32,result.reviewCells);assertEquals(2,result.invalidCells);
    // Run the same token objects through the unchanged prior diagnostic parser
    // in an isolated class loader. Compare every value, status and reason.
    try(URLClassLoader old=new URLClassLoader(new URL[]{Path.of("recovery/diagnostic-022-before.jar").toUri().toURL()},null)){
      Class<?> token=old.loadClass("org.vef.mlkitlab.TableParser$Token"),parser=old.loadClass("org.vef.mlkitlab.TableParser");java.lang.reflect.Constructor<?> ctor=token.getConstructor(String.class,float.class,float.class,float.class,float.class,float.class,int.class);List<Object> ow=copy(words,ctor),ol=copy(lines,ctor);Object previous=parser.getMethod("parse",List.class,List.class).invoke(null,ow,ol);
      for(String field:Arrays.asList("cells","status","reasons")){Object before=previous.getClass().getField(field).get(previous),after=TableParser.Result.class.getField(field).get(result);assertTrue(field,Arrays.deepEquals((Object[])before,(Object[])after));}
    }
    System.out.printf(Locale.ROOT,"PRIVATE DEVICE JSON REPLAY: words=%d lines=%d rows=%d associated=%d coherent=%d review=%d invalid=%d parserMs=%.3f; unchanged values/status/reasons. This is JVM replay, not on-device OCR.\n",words.size(),lines.size(),result.rowCount,result.associatedCells,result.coherentCells,result.reviewCells,result.invalidCells,ms);
  }
  private static List<Object> copy(List<TableParser.Token> ts,java.lang.reflect.Constructor<?> c)throws Exception{List<Object> out=new ArrayList<>();for(TableParser.Token t:ts)out.add(c.newInstance(t.text,t.left,t.top,t.right,t.bottom,t.confidence,t.id));return out;}
  static List<TableParser.Token> readTokens(JSONArray source)throws JSONException{List<TableParser.Token> out=new ArrayList<>();for(int i=0;i<source.length();i++){JSONObject t=source.getJSONObject(i);out.add(new TableParser.Token(t.getString("text"),(float)t.getDouble("left"),(float)t.getDouble("top"),(float)t.getDouble("right"),(float)t.getDouble("bottom"),(float)t.optDouble("confidence",0),t.optInt("id",i)));}return out;}
}
