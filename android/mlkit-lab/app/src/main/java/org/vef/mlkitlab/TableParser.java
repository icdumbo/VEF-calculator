package org.vef.mlkitlab;

import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;

/** Pure geometry parser. No row interpolation, dictionaries of document values or VEF calculation. */
public final class TableParser {
    public static final int ROWS=20, COLS=5;
    public static final String[] LABELS={"Port/Terminal","B/L Date","Cargo","Ship's Figures","B/L Figures"};
    public static final class Token {
        public final String text; public final float left,top,right,bottom,confidence;
        public Token(String text,float left,float top,float right,float bottom,float confidence) {
            this.text=text;this.left=left;this.top=top;this.right=right;this.bottom=bottom;this.confidence=confidence;
        }
        public float x(){return (left+right)/2;} public float y(){return (top+bottom)/2;}
    }
    public static final class Result {
        public final String[][] cells=new String[ROWS][COLS];
        public String diagnostic="";
        public Result(){for(String[] r:cells)Arrays.fill(r,"");}
    }
    private static String key(String s){return s.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]","");}
    private static int header(String s){
        String k=key(s);
        if(k.equals("PORT")||k.equals("TERMINAL")||k.equals("PORTTERMINAL"))return 0;
        if(k.equals("DATE")||k.equals("BLDATE")||k.equals("BILLDATE"))return 1;
        if(k.equals("CARGO")||k.equals("PRODUCT"))return 2;
        if(k.equals("SHIPSFIGURES")||k.equals("SHIPFIGURES")||k.equals("VESSELFIGURES")||k.equals("SFTCV"))return 3;
        if(k.equals("BLFIGURES")||k.equals("BOLFIGURES")||k.equals("SHOREFIGURES")||k.equals("SHOREQTY")||k.equals("BLTCV"))return 4;
        return -1;
    }
    public static boolean date(String s){
        Matcher m=Pattern.compile("^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$").matcher(s.trim());
        if(!m.matches())return false;
        try{LocalDate.of(Integer.parseInt(m.group(3)),Integer.parseInt(m.group(2)),Integer.parseInt(m.group(1)));return true;}catch(Exception e){return false;}
    }
    public static boolean quantity(String s){
        // Keep the printed string; do not guess decimal/thousands separators or repair OCR characters.
        return s.matches("[0-9]+(?:[.,][0-9]+)*");
    }
    public static Result parse(List<Token> words,List<Token> lines){
        Result out=new Result();
        Token[] heads=new Token[COLS];
        List<Token> candidates=new ArrayList<>(lines);candidates.addAll(words);
        // Some headers are split into two physical lines. Combine only observed nearby
        // lines whose combined text is itself a known header, never document values.
        for(Token a:lines)for(Token b:lines){
            float height=Math.max(a.bottom-a.top,b.bottom-b.top);
            if(b.top>=a.bottom&&b.top-a.bottom<height*1.5f&&Math.abs(a.x()-b.x())<Math.max(a.right-a.left,b.right-b.left)*.5f&&header(a.text+b.text)>=0)
                candidates.add(new Token(a.text+" "+b.text,Math.min(a.left,b.left),a.top,Math.max(a.right,b.right),b.bottom,Math.min(a.confidence,b.confidence)));
        }
        List<Token> namedHeaders=new ArrayList<>();
        for(Token t:candidates)if(header(t.text)>=0&&Float.isFinite(t.confidence)&&t.confidence>=.80f)namedHeaders.add(t);
        candidates=namedHeaders;
        // Select a complete header band, not isolated DATE words from unrelated page content.
        for(Token seed:candidates){
            Token[] trial=new Token[COLS];
            for(Token t:candidates){int c=header(t.text);if(c<0||!Float.isFinite(t.confidence)||t.confidence<.80f||Math.abs(t.y()-seed.y())>Math.max(40,3*(seed.bottom-seed.top)))continue;
                if(trial[c]==null||t.text.length()>trial[c].text.length())trial[c]=t;}
            boolean complete=true;for(Token t:trial)if(t==null)complete=false;
            if(complete){heads=trial;break;}
        }
        for(Token t:heads)if(t==null){out.diagnostic="Header columns are uncertain. All cells left blank; inspect/correct the reference manually.";return out;}
        Integer[] order={0,1,2,3,4};final Token[] h=heads;
        Arrays.sort(order,Comparator.comparingDouble(c->h[c].x()));
        float[] left=new float[COLS],right=new float[COLS];float headerBottom=0;
        for(Token t:heads)headerBottom=Math.max(headerBottom,t.bottom);
        for(int i=0;i<COLS;i++){
            if(i>0&&heads[order[i]].x()-heads[order[i-1]].x()<20){out.diagnostic="Header positions overlap. All cells left blank.";return out;}
            int c=order[i];left[c]=i==0?0:(heads[order[i-1]].x()+heads[c].x())/2;
            right[c]=i==COLS-1?Float.MAX_VALUE:(heads[c].x()+heads[order[i+1]].x())/2;
            if(right[c]-left[c]<10){out.diagnostic="Overlapping headers. All cells left blank.";return out;}
        }
        List<Token> anchors=new ArrayList<>();
        for(Token t:words)if(t.top>headerBottom&&t.left>=left[1]&&t.right<=right[1]&&Float.isFinite(t.confidence)&&t.confidence>=.80f&&date(t.text))anchors.add(t);
        anchors.sort(Comparator.comparingDouble(Token::y));
        if(anchors.size()!=ROWS){out.diagnostic="Found "+anchors.size()+" complete date anchors; require exactly 20 to avoid shifting or inventing rows. All cells left blank.";return out;}
        List<Float> gaps=new ArrayList<>();for(int i=1;i<ROWS;i++)gaps.add(anchors.get(i).y()-anchors.get(i-1).y());
        Collections.sort(gaps);float pitch=gaps.get(gaps.size()/2);
        for(float gap:gaps)if(pitch<5||gap<pitch*.65f||gap>pitch*1.45f){out.diagnostic="Irregular date-row geometry. All cells left blank.";return out;}
        for(int r=0;r<ROWS;r++){
            float y=anchors.get(r).y(),top=r==0?y-pitch*.5f:(y+anchors.get(r-1).y())/2;
            float bottom=r==ROWS-1?y+pitch*.5f:(y+anchors.get(r+1).y())/2;
            for(int c=0;c<COLS;c++){
                List<Token> cell=new ArrayList<>();boolean unsafe=false;
                for(Token t:words){
                    if(t.x()<left[c]||t.x()>=right[c]||t.y()<top||t.y()>=bottom)continue;
                    if(t.left<left[c]||t.right>right[c]||t.top<top||t.bottom>bottom||!Float.isFinite(t.confidence)||t.confidence<.80f)unsafe=true;
                    cell.add(t);
                }
                cell.sort(Comparator.comparingDouble(Token::y).thenComparingDouble(t->t.left));
                // Sort words on one line left-to-right; reject ambiguous multi-line cells rather than joining rows.
                if(!cell.isEmpty()){
                    float minY=cell.get(0).y(),maxY=cell.get(cell.size()-1).y();
                    float height=cell.stream().map(t->t.bottom-t.top).max(Float::compare).orElse(1f);
                    if(maxY-minY>height*.65f)unsafe=true;
                }
                cell.sort(Comparator.comparingDouble(t->t.left));
                StringJoiner join=new StringJoiner(" ");for(Token t:cell)join.add(t.text);
                String value=join.toString().trim();
                if(c==1&&!date(value))unsafe=true;
                if(c>=3&&(cell.size()!=1||!quantity(value)))unsafe=true;
                if(!unsafe)out.cells[r][c]=value;
            }
        }
        out.diagnostic="20 observed date rows mapped to five detected columns. All values still require inspector review; blanks indicate missing/uncertain evidence.";
        return out;
    }
    public static int[] score(String[][] predicted,String[][] reference,boolean[] confirmed){
        int[] n=new int[4]; // correct, wrong, blank, unreviewed; denominator always 100
        for(int r=0;r<ROWS;r++)for(int c=0;c<COLS;c++){
            if(!confirmed[r])n[3]++;
            else if(predicted[r][c].trim().isEmpty())n[2]++;
            else if(predicted[r][c].trim().equals(reference[r][c].trim()))n[0]++;
            else n[1]++;
        }return n;
    }
}
