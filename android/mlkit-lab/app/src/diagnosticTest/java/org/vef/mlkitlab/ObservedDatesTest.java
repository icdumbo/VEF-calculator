package org.vef.mlkitlab;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import java.nio.file.*;
import org.json.*;
public class ObservedDatesTest {
 @Test public void allMonthsAndCasesAreRecognized(){for(String month:new String[]{"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"}){assertTrue(ObservedDates.named("12-"+month+"-27"));assertTrue(ObservedDates.named("12-"+month.toUpperCase(Locale.ROOT)+"-2027"));}}
 @Test public void impossibleAndAmbiguousDatesAreNotRepaired(){for(String s:new String[]{"31-Apr-26","29-Feb-25","29-Feb-00","00-Jan-26","12-Abc-26","12-Sep-2O","32-Jan-26","29-Feb-1900"})assertFalse(s,ObservedDates.named(s));assertTrue(ObservedDates.named("29-Feb-24"));assertTrue(ObservedDates.named("29-Feb-2000"));assertTrue(ObservedDates.named("12–Sep–26"));}
 @Test public void existingNumericFormatsRemainValid(){for(String s:new String[]{"12/09/2026","12-09-2026","12.09.2026"})assertTrue(CellRetryPolicy.valid(1,s));assertFalse(CellRetryPolicy.valid(1,"31/02/2026"));}
 static List<TableParser.Token> namedTable(int count){List<TableParser.Token> out=new ArrayList<>();for(TableParser.Token t:ColumnMappingTest.table(count)){String s=t.text.contains("/01/2026")?t.text.substring(0,2)+"-Jan-26":t.text;out.add(new TableParser.Token(s,t.left,t.top,t.right,t.bottom,t.confidence,t.id));}return out;}
 @Test public void namedDatesAnchorObservedRowsWithoutRewritingValues()throws Exception{List<TableParser.Token> words=namedTable(20);ColumnLayout l=ColumnLayout.detect(words,1100,1100);assertEquals(20,l.rows.size());assertEquals(7,l.columns());MappingRows m=new MappingRows(l,ColumnMappingTest.mapping);assertEquals(100,m.result.associatedCells);for(int r=0;r<20;r++){assertEquals(String.format(Locale.ROOT,"%02d-Jan-26",r+1),m.result.cells[r][1]);assertNotEquals("invalid",m.result.status[r][1]);}assertEquals(0,m.result.invalidCells);}
 @Test public void missingDateDoesNotInventAnotherRow(){List<TableParser.Token> words=namedTable(5);words.removeIf(t->t.text.equals("03-Jan-26"));assertEquals(4,ColumnLayout.detect(words,1100,1100).rows.size());}
 @Test public void rowCapStillApplies(){ColumnLayout l=ColumnLayout.detect(namedTable(25),1100,1100);assertEquals(25,l.observedRows);assertEquals(20,l.rows.size());}
 @Test public void tiedDateColumnsAreNotGuessed(){List<TableParser.Token> words=namedTable(5);for(int i=0;i<5;i++)words.add(new TableParser.Token("12-Feb-26",1000,100+i*30,1090,112+i*30,.99f,200+i));try{ColumnLayout.detect(words,1200,1100);fail();}catch(IllegalArgumentException expected){assertTrue(expected.getMessage().contains("equal row support"));}}
 @Test public void realPinkReportRetainsObservedDates()throws Exception{
  Path p=Paths.get("build/private-fixtures/pink-device-raw.json");assertTrue("Real pink device fixture required",Files.exists(p));JSONObject raw=new JSONObject(new String(Files.readAllBytes(p),java.nio.charset.StandardCharsets.UTF_8));List<TableParser.Token> words=ColumnLayout.tokens(raw.getJSONArray("tokensInOrientedOcrPixels"));
  assertTrue(TableParser.diagnosticDateColumn(words).size()<2);
  long start=System.nanoTime();ColumnLayout l=ColumnLayout.detect(words,raw.getInt("ocrWidth"),raw.getInt("ocrHeight"));assertEquals(20,l.observedRows);assertEquals(20,l.rows.size());
  Set<Integer> rows=new HashSet<>();int dates=0;for(TableParser.Token t:words)if(ObservedDates.named(t.text)){assertTrue(l.rowOf(t)>=0);assertTrue(rows.add(l.rowOf(t)));dates++;}assertEquals(20,dates);
  System.out.println("PINK REPLAY rows="+l.rows.size()+" columns="+l.columns()+" layoutMs="+(System.nanoTime()-start)/1e6);for(int c=0;c<l.columns();c++)System.out.println("PHYSICAL "+c+" HEADER="+l.header(c)+" SAMPLES="+l.samples(c));
 }

@Test public void isoDatesAndInvalidCalendar(){assertTrue(ObservedDates.valid("2028-02-29"));assertFalse(ObservedDates.valid("2027-02-29"));assertFalse(ObservedDates.valid("2026-13-01"));assertFalse(ObservedDates.valid("2026-02-30"));}
@Test public void ambiguousDatesRequireReviewWithoutRewrite(){assertTrue(ObservedDates.requiresReview("12-Jan-26"));assertTrue(ObservedDates.requiresReview("03/04/2026"));assertFalse(ObservedDates.requiresReview("2026-04-03"));assertFalse(ObservedDates.requiresReview("23-Jan-2026"));}
@Test public void isoDatesAnchorRows()throws Exception{List<TableParser.Token> words=new ArrayList<>();for(TableParser.Token t:namedTable(20)){String value=ObservedDates.named(t.text)?"2026-01-"+t.text.substring(0,2):t.text;words.add(new TableParser.Token(value,t.left,t.top,t.right,t.bottom,t.confidence,t.id));}ColumnLayout l=ColumnLayout.detect(words,1100,1100);assertEquals(20,l.rows.size());assertEquals(100,new MappingRows(l,ColumnMappingTest.mapping).result.associatedCells);}
@Test public void realPinkCellsAreComparedAfterExtraction()throws Exception{
 JSONObject raw=new JSONObject(new String(Files.readAllBytes(Paths.get("build/private-fixtures/pink-device-raw.json")),java.nio.charset.StandardCharsets.UTF_8));
 ColumnLayout l=ColumnLayout.detect(ColumnLayout.tokens(raw.getJSONArray("tokensInOrientedOcrPixels")),raw.getInt("ocrWidth"),raw.getInt("ocrHeight"));
 assertEquals(7,l.columns());MappingRows m=new MappingRows(l,new int[]{-1,1,2,0,3,4,-1});assertEquals(100,m.result.associatedCells);
 JSONArray expected=new JSONArray(new String(Files.readAllBytes(Paths.get("build/private-fixtures/pink-photo-oracle.json")),java.nio.charset.StandardCharsets.UTF_8));
 int correct=0,invalid=0;for(int row=0;row<20;row++)for(int col=0;col<5;col++){
 String got=m.result.cells[row][col].replaceAll("\\s+","");String want=expected.getJSONArray(row).getString(col).replaceAll("\\s+","");
 if(got.equals(want))correct++;else {System.out.println("PINK DIFFERENCE row="+(row+1)+" field="+col+" observed="+got+" expected="+want+" status="+m.result.status[row][col]);assertEquals("invalid",m.result.status[row][col]);invalid++;}
 assertNotEquals("confirmed",m.result.status[row][col]);
 }
 assertEquals(98,correct);assertEquals(2,invalid);assertEquals(100,correct+invalid);System.out.println("PINK CELL COMPARISON correct="+correct+" invalidRetained="+invalid+" associated="+m.result.associatedCells);
 ColumnLayout restored=ColumnLayout.restore(l.json(),l.words);MappingRows again=new MappingRows(restored,new int[]{-1,1,2,0,3,4,-1});for(int row=0;row<20;row++)assertArrayEquals(m.result.cells[row],again.result.cells[row]);
}
}
