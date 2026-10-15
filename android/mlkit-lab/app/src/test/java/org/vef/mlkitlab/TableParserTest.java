package org.vef.mlkitlab;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class TableParserTest {
    private TableParser.Token t(String s,float x,float y){return new TableParser.Token(s,x-15,y-4,x+15,y+4,.99f);}
    private List<TableParser.Token> headers(){return new ArrayList<>(Arrays.asList(t("Port",100,20),t("B/L Date",300,20),t("Cargo",500,20),t("Ship's Figures",700,20),t("B/L Figures",900,20)));}
    private List<TableParser.Token> words(){List<TableParser.Token> w=new ArrayList<>();for(int i=0;i<20;i++){float y=60+i*25;w.add(t("PORT"+i,100,y));w.add(t(String.format(Locale.ROOT,"%02d.01.2026",i+1),300,y));w.add(t("CARGO",500,y));w.add(t("1000.125",700,y));w.add(t("1001.125",900,y));}return w;}
    @Test public void mapsTwentyRowsAndFiveColumns(){TableParser.Result r=TableParser.parse(words(),headers());assertEquals("PORT19",r.cells[19][0]);assertEquals("1000.125",r.cells[0][3]);assertEquals("20.01.2026",r.cells[19][1]);for(String[] row:r.cells)for(String c:row)assertFalse(c.isEmpty());}
    @Test public void missingDateNeverShiftsRows(){List<TableParser.Token>w=words();w.remove(6);TableParser.Result r=TableParser.parse(w,headers());for(String[] row:r.cells)for(String c:row)assertEquals("",c);}
    @Test public void missingHeaderReturnsBlanks(){List<TableParser.Token> h=headers();h.remove(4);assertEquals("",TableParser.parse(words(),h).cells[0][3]);}
    @Test public void uncertainHeaderReturnsBlanks(){List<TableParser.Token> h=headers();h.set(4,new TableParser.Token("B/L Figures",885,16,915,24,.5f));assertEquals("",TableParser.parse(words(),h).cells[0][3]);}
    @Test public void respectsReorderedColumns(){List<TableParser.Token> h=headers();Collections.reverse(h);assertEquals("1001.125",TableParser.parse(words(),h).cells[0][4]);}
    @Test public void respectsPhysicallyReorderedColumns(){List<TableParser.Token> h=new ArrayList<>(),w=new ArrayList<>();for(TableParser.Token a:headers())h.add(t(a.text,a.x()==100?500:a.x()==500?100:a.x(),a.y()));for(TableParser.Token a:words())w.add(t(a.text,a.x()==100?500:a.x()==500?100:a.x(),a.y()));TableParser.Result r=TableParser.parse(w,h);assertEquals("PORT0",r.cells[0][0]);assertEquals("CARGO",r.cells[0][2]);}
    @Test public void extraDateDoesNotTruncate(){List<TableParser.Token> w=words();w.add(t("21.01.2026",300,560));assertEquals("",TableParser.parse(w,headers()).cells[0][0]);}
    @Test public void supportsObservedSplitHeaders(){List<TableParser.Token> h=headers();h.remove(3);h.add(t("Ship's",700,14));h.add(t("Figures",700,25));assertEquals("1000.125",TableParser.parse(words(),h).cells[0][3]);}
    @Test public void lowConfidenceCellIsBlank(){List<TableParser.Token>w=words();w.set(3,new TableParser.Token("1000.125",685,56,715,64,.5f));TableParser.Result r=TableParser.parse(w,headers());assertEquals("",r.cells[0][3]);assertEquals("1001.125",r.cells[0][4]);}
    @Test public void crossingColumnEdgeIsBlank(){List<TableParser.Token>w=words();w.set(3,new TableParser.Token("1000.125",590,56,715,64,.99f));assertEquals("",TableParser.parse(w,headers()).cells[0][3]);}
    @Test public void repeatedNumericTokensAreNotMerged(){List<TableParser.Token>w=words();w.add(t("9",730,60));assertEquals("",TableParser.parse(w,headers()).cells[0][3]);}
    @Test public void rejectsInventedCorrections(){assertFalse(TableParser.quantity("1O00.125"));assertFalse(TableParser.date("31.02.2026"));assertTrue(TableParser.date("29.02.2024"));}
    @Test public void rejectsIrregularRowGeometry(){List<TableParser.Token>w=words();w.set(6,t("02.01.2026",300,65));assertEquals("",TableParser.parse(w,headers()).cells[0][0]);}
    @Test public void scoreUsesFrozenOcrOnlyAfterConfirmation(){String[][] p=new TableParser.Result().cells,ref=new TableParser.Result().cells;boolean[] c=new boolean[20];p[0][0]="A";ref[0][0]="A";p[0][1]="B";ref[0][1]="C";assertArrayEquals(new int[]{0,0,0,100},TableParser.score(p,ref,c));c[0]=true;assertArrayEquals(new int[]{1,1,3,95},TableParser.score(p,ref,c));assertEquals("B",p[0][1]);}
}
