package org.vef.mlkitlab;

import java.text.Normalizer;
import java.util.*;

/** Additional observed header evidence only; never edits any data token or quantity. */
public final class HeaderRuntime {
    private HeaderRuntime() {}
    static String key(String text) {
        String upper=Normalizer.normalize(text,Normalizer.Form.NFC).toUpperCase(Locale.ROOT);
        StringBuilder out=new StringBuilder();
        for(int i=0;i<upper.length();i++){char c=upper.charAt(i);if(c>='A'&&c<='Z'||c>='0'&&c<='9')out.append(c);}
        return out.toString();
    }
    private static int prefix(String s) {
        if(s.equals("SHIPS")||s.equals("SHIP")||s.equals("VESSEL"))return 3;
        if(s.equals("BL")||s.equals("BOL")||s.equals("BIL")||s.equals("SHORE"))return 4;
        return -1;
    }
    private static boolean oldAdjacent(TableParser.Token a,TableParser.Token b) {
        float h=Math.max(a.height(),b.height());
        return b.left>=a.right&&b.left-a.right<=2f*h&&Math.abs(a.y()-b.y())<=.5f*h
            ||b.top>=a.bottom&&b.top-a.bottom<=3f*h&&Math.abs(a.x()-b.x())<.5f*Math.max(a.width(),b.width());
    }
    private static boolean canJoin(TableParser.Token a,TableParser.Token b,float pitch,boolean alias) {
        float h=Math.max(a.height(),b.height());
        if(alias&&b.left>=a.right&&b.left-a.right<=2f*h&&Math.abs(a.y()-b.y())<=.5f*h)return true;
        if(b.top<a.bottom)return false;
        float overlap=Math.min(a.right,b.right)-Math.max(a.left,b.left);
        return overlap>=.5f*Math.min(a.width(),b.width())
            &&Math.abs(a.x()-b.x())<.5f*Math.max(a.width(),b.width())
            &&b.top-a.bottom<=Math.max(3f*h,3f*pitch);
    }
    private static String geometryKey(TableParser.Token t) {
        return key(t.text)+":"+t.left+":"+t.top+":"+t.right+":"+t.bottom;
    }
    @SuppressWarnings({"unchecked", "rawtypes"}) // recovered bridge descriptors are deliberately erased
    public static List<?> headerCandidates(List<TableParser.Token> words,List<TableParser.Token> lines) {
        List<Object> result=new ArrayList<>(TableParser.diagnosticHeaderCandidates(words,lines));
        List<TableParser.Token> dates=TableParser.diagnosticDateColumn(words);
        if(dates.size()<2)return result;
        List<Float> gaps=new ArrayList<>();
        for(int i=1;i<dates.size();i++){float gap=dates.get(i).y()-dates.get(i-1).y();if(gap>0)gaps.add(gap);}
        if(gaps.isEmpty())return result;
        Collections.sort(gaps);int n=gaps.size();float pitch=n%2==0?(gaps.get(n/2-1)+gaps.get(n/2))/2:gaps.get(n/2);
        TableParser.Token first=dates.get(0);
        // The original parser already limits its header search to this observed band.
        Map<String,TableParser.Token> unique=new LinkedHashMap<>();
        for(List<TableParser.Token> source:Arrays.asList(words,lines))for(TableParser.Token t:source)
            if(t.top<first.top&&t.y()<=first.y()&&t.bottom<=first.y()+.6f*pitch&&first.y()-t.y()<=6f*pitch)
                unique.putIfAbsent(geometryKey(t),t); // words first: keep their original IDs/confidence
        List<TableParser.Token> observed=new ArrayList<>(unique.values());
        for(TableParser.Token a:observed) {
            String ak=key(a.text);
            if(ak.equals("BILFIGURES"))result.add(TableParser.diagnosticHead(4,Collections.singletonList(a)));
            int field=prefix(ak);if(field<0)continue;
            List<TableParser.Token> matches=new ArrayList<>();
            for(TableParser.Token b:observed) {
                if(a!=b&&key(b.text).equals("FIGURES")&&canJoin(a,b,pitch,ak.equals("BIL")))matches.add(b);
            }
            // No guessing if more than one distinct lower fragment could complete a header.
            if(matches.size()!=1)continue;
            TableParser.Token b=matches.get(0);
            boolean alias=ak.equals("BIL");
            if(!alias&&oldAdjacent(a,b))continue; // the unchanged original already supplies this candidate
            // A suffix shared by distinct upper fragments is also ambiguous.
            boolean conflict=false;
            for(TableParser.Token other:observed)if(other!=a&&prefix(key(other.text))>=0
                    &&canJoin(other,b,pitch,key(other.text).equals("BIL"))){
                if(!geometryKey(other).equals(geometryKey(a))){conflict=true;break;}
            }
            if(!conflict)result.add(TableParser.diagnosticHead(field,Arrays.asList(a,b)));
        }
        return result;
    }
    public static void annotate(TableParser.Result result) {
        boolean changed=false;
        for(int c=0;c<result.headers.size();c++) {
            Map<String,Object> header=result.headers.get(c);
            if(!key(String.valueOf(header.getOrDefault("joinedText",""))).equals("BILFIGURES"))continue;
            changed=true;
            if(!result.warnings.contains("HEADER_OCR_ALIAS_REQUIRES_REVIEW:"+TableParser.LABELS[c]))result.warnings.add("HEADER_OCR_ALIAS_REQUIRES_REVIEW:"+TableParser.LABELS[c]);
            header.put("requiresReview",true);header.put("headerReviewReason","HEADER_OCR_ALIAS_REQUIRES_REVIEW");
            for(int r=0;r<result.rowCount;r++) {
                if(result.cells[r][c].isEmpty())continue;
                if(result.status[r][c].equals("candidate")){result.coherentCells--;result.reviewCells++;result.status[r][c]="review_required";}
                String why=result.reasons[r][c];
                if(!why.contains("HEADER_OCR_ALIAS_REQUIRES_REVIEW"))result.reasons[r][c]=why+";HEADER_OCR_ALIAS_REQUIRES_REVIEW";
            }
        }
        if(changed)result.diagnostic=result.rowCount+" observed rows; "+result.associatedCells+" associated cells; "+result.coherentCells+" coherent candidates, "+result.reviewCells+" uncertain, "+result.invalidCells+" invalid. No values automatically approved.";
    }
}
