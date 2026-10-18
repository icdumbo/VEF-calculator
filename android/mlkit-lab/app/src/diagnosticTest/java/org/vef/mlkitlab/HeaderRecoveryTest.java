package org.vef.mlkitlab;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

public class HeaderRecoveryTest {
    static TableParser.Token t(String text,float x,float y,int id){return new TableParser.Token(text,x-20,y-5,x+20,y+5,.99f,id);}
    static List<TableParser.Token> headers(String bl){return new ArrayList<>(Arrays.asList(t("PORT / TERMINAL",100,400,1000),t("B/L DATE",300,400,1001),t("CARGO",500,400,1002),t("SHIP'S",700,360,1003),t("FIGURES",700,430,1004),t(bl,900,360,1005),t("FIGURES",900,430,1006)));}
    static List<TableParser.Token> words(int rows){List<TableParser.Token> list=new ArrayList<>();for(int r=0;r<rows;r++)for(int c=0;c<5;c++){String v=c==0?"PORT "+r:c==1?String.format(Locale.ROOT,"%02d-01-2026",r+1):c==2?"PRODUCT "+r:String.format(Locale.ROOT,"%d.%03d",2000+r*10+c,r*5+c);list.add(t(v,100+200*c,460+25*r,r*5+c));}return list;}
    @Test public void twoLineHeadersAcrossLargeFontGapRecoverAllCells(){TableParser.Result r=TableParser.parse(words(20),headers("B/L"));assertEquals(20,r.rowCount);assertEquals(100,r.associatedCells);for(int row=0;row<20;row++)for(int c=0;c<5;c++)assertEquals(row*5+c,r.evidence[row][c].get(0).id);assertEquals(2,((List<?>)r.headers.get(3).get("fragments")).size());}
    @Test public void bilAliasRetainsOriginalHeaderAndMarksEveryAffectedCell(){TableParser.Result r=TableParser.parse(words(20),headers("BIL"));assertEquals(100,r.associatedCells);assertEquals("BIL FIGURES",r.headers.get(4).get("joinedText"));assertEquals(Boolean.TRUE,r.headers.get(4).get("requiresReview"));for(int row=0;row<20;row++){assertEquals("review_required",r.status[row][4]);assertTrue(r.reasons[row][4].contains("HEADER_OCR_ALIAS_REQUIRES_REVIEW"));assertEquals(words(20).get(row*5+4).text,r.cells[row][4]);}}
    @Test public void inlineBilAliasAlsoRequiresReview(){List<TableParser.Token> h=headers("BIL");h.set(5,t("BIL",870,400,1005));h.set(6,t("FIGURES",918,400,1006));TableParser.Result r=TableParser.parse(words(3),h);assertEquals(15,r.associatedCells);assertEquals("review_required",r.status[0][4]);}
    @Test public void conflictingLowerFragmentsRemainUnassigned(){List<TableParser.Token> h=headers("B/L");h.set(6,t("FIGURES",890,430,1006));h.add(t("FIGURES",910,430,1007));TableParser.Result r=TableParser.parse(words(3),h);assertEquals(12,r.associatedCells);assertEquals("",r.cells[0][4]);}
    @Test public void misalignedLowerFragmentIsNotBorrowedFromOtherColumn(){List<TableParser.Token> h=headers("B/L");h.set(6,t("FIGURES",1000,430,1006));TableParser.Result r=TableParser.parse(words(3),h);assertEquals(12,r.associatedCells);assertEquals("",r.cells[0][4]);}
    @Test public void headerSearchDoesNotUseFooterFigures(){List<TableParser.Token> h=headers("B/L");h.set(6,t("FIGURES",900,900,1006));TableParser.Result r=TableParser.parse(words(3),h);assertEquals(12,r.associatedCells);assertEquals("",r.cells[0][4]);}
    @Test public void headerJoiningUsesObservedPitchAcrossScaleAndTranslation(){List<TableParser.Token> w=new ArrayList<>(),h=new ArrayList<>();for(TableParser.Token a:words(7))w.add(scale(a));for(TableParser.Token a:headers("B/L"))h.add(scale(a));TableParser.Result r=TableParser.parse(w,h);assertEquals(7,r.rowCount);assertEquals(35,r.associatedCells);for(int row=0;row<7;row++)for(int c=0;c<5;c++)assertEquals(row*5+c,r.evidence[row][c].get(0).id);}
    static TableParser.Token scale(TableParser.Token t){return new TableParser.Token(t.text,t.left*1.7f+123,t.top*1.7f+87,t.right*1.7f+123,t.bottom*1.7f+87,t.confidence,t.id);}
    @Test public void newHeaderEvidenceKeepsFragmentConfidence(){List<TableParser.Token> h=headers("B/L");TableParser.Token a=h.get(3);h.set(3,new TableParser.Token(a.text,a.left,a.top,a.right,a.bottom,.31f,a.id));TableParser.Result r=TableParser.parse(words(3),h);List<?> fragments=(List<?>)r.headers.get(3).get("fragments");assertEquals(.31f,((Number)((Map<?,?>)fragments.get(0)).get("confidence")).floatValue(),0);assertEquals(1003,((Number)((Map<?,?>)fragments.get(0)).get("id")).intValue());}
    @Test public void realClearPhotoMatchesEveryIndependentOracleCell()throws Exception{
        String file=System.getProperty("mlkit.clear.report",""),oracle=System.getProperty("mlkit.clear.oracle","");org.junit.Assume.assumeTrue("Supply private report and independent photo transcription",!file.isEmpty()&&!oracle.isEmpty());
        JSONObject raw=new JSONObject(new String(Files.readAllBytes(Paths.get(file)),StandardCharsets.UTF_8));
        List<TableParser.Token> w=RecoveredDiagnosticTest.readTokens(raw.getJSONArray("tokensInOrientedOcrPixels")),lines=RecoveredDiagnosticTest.readTokens(raw.getJSONArray("linesInOrientedOcrPixels"));assertEquals(324,w.size());assertEquals(181,lines.size());
        // Only raw OCR tokens enter the extractor. The oracle is loaded AFTER extraction.
        long start=System.nanoTime();TableParser.Result result=TableParser.parse(w,lines);double ms=(System.nanoTime()-start)/1e6;
        JSONArray truth=new JSONArray(new String(Files.readAllBytes(Paths.get(oracle)),StandardCharsets.UTF_8));assertEquals(20,result.rowCount);assertEquals(100,result.associatedCells);assertEquals(66,result.coherentCells);assertEquals(34,result.reviewCells);assertEquals(0,result.invalidCells);
        int correct=0,wrong=0,blank=0;Set<Integer> used=new HashSet<>();
        StringBuilder csv=new StringBuilder("row,column,photo_value,ocr_value,status,reason,evidence_ids\n");
        for(int r=0;r<20;r++)for(int c=0;c<5;c++){
            String expected=truth.getJSONArray(r).getString(c),actual=result.cells[r][c];if(actual.isEmpty())blank++;else if(actual.equals(expected))correct++;else wrong++;
            assertEquals("photo row="+(r+1)+" column="+TableParser.LABELS[c],expected,actual);
            StringJoiner observed=new StringJoiner(" "),ids=new StringJoiner(" ");for(TableParser.Token token:result.evidence[r][c]){assertTrue("Duplicate raw token",used.add(token.id));observed.add(token.text);ids.add(Integer.toString(token.id));}
            String original=observed.toString();if(c==0||c==2)original=original.toUpperCase(Locale.ROOT);assertEquals("No value repair",original,actual);
            csv.append(r+1).append(',').append(q(TableParser.LABELS[c])).append(',').append(q(expected)).append(',').append(q(actual)).append(',').append(q(result.status[r][c])).append(',').append(q(result.reasons[r][c])).append(',').append(q(ids.toString())).append('\n');
        }
        String output=System.getProperty("mlkit.clear.comparison","");if(!output.isEmpty())Files.write(Paths.get(output),csv.toString().getBytes(StandardCharsets.UTF_8));
        System.out.printf(Locale.ROOT,"CLEAR PHOTO REPLAY: rows=%d associated=%d correct=%d incorrect=%d missing=%d candidate=%d review=%d invalid=%d parserMs=%.3f; 20/20 correct in each column. Oracle used only for evaluation, never for selection. JVM replay, not Android OCR.%n",result.rowCount,result.associatedCells,correct,wrong,blank,result.coherentCells,result.reviewCells,result.invalidCells,ms);
    }
    static String q(String s){return "\""+s.replace("\"","\"\"")+"\"";}
}
