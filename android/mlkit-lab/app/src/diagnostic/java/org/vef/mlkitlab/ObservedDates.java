package org.vef.mlkitlab;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;
/** Recognizes observed dates without rewriting text or inferring a century. */
public final class ObservedDates {
 private static final Pattern NAMED=Pattern.compile("^([0-9]{1,2})-([A-Za-z]{3})-([0-9]{2}|[0-9]{4})$");
 private static final List<String> MONTHS=Arrays.asList("JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC");
 public static boolean named(String text){
  if(text==null)return false;
  Matcher m=NAMED.matcher(text.trim().replace('–','-').replace('—','-').replace('−','-').replace('‑','-'));
  if(!m.matches())return false;
  int month=MONTHS.indexOf(m.group(2).toUpperCase(Locale.ROOT))+1;
  if(month==0)return false;
  int day=Integer.parseInt(m.group(1)),year=Integer.parseInt(m.group(3));
  if(m.group(3).length()==4){try{LocalDate.of(year,month,day);return true;}catch(java.time.DateTimeException e){return false;}}
  // No century inference. February 29 in year 00 remains ambiguous.
  int max=month==2?(year!=0&&year%4==0?29:28):Arrays.asList(4,6,9,11).contains(month)?30:31;
  return day>=1&&day<=max;
 }
 public static boolean iso(String text){
        if(text==null||!text.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))return false;
        try{LocalDate.parse(text);return true;}catch(java.time.DateTimeException e){return false;}
    }
    public static boolean extended(String text){return named(text)||iso(text);}
    public static boolean requiresReview(String text){
        if(named(text))return text.substring(text.lastIndexOf('-')+1).length()==2;
        if(TableParser.date(text)){String[] p=text.split("[./-]");return Integer.parseInt(p[0])<=12&&Integer.parseInt(p[1])<=12&&!p[0].equals(p[1]);}
        return false;
    }
    public static boolean valid(String text){return TableParser.date(text)||extended(text);}
 public static List<TableParser.Token> anchors(List<TableParser.Token> words){
  List<TableParser.Token> legacy=new ArrayList<>();
  for(Object t:TableParser.diagnosticDateColumn(words))legacy.add((TableParser.Token)t);
  List<TableParser.Token> candidates=new ArrayList<>();boolean hasNamed=false;
  for(TableParser.Token t:words){if(extended(t.text)){hasNamed=true;candidates.add(t);}else if(TableParser.date(t.text))candidates.add(t);}
  if(!hasNamed)return legacy;
  candidates.sort(Comparator.comparingDouble(TableParser.Token::x));
  List<Double> widths=new ArrayList<>();for(TableParser.Token t:candidates)widths.add((double)t.width());
  double tolerance=ColumnLayout.median(widths)*.6;
  List<List<TableParser.Token>> groups=new ArrayList<>();
  for(TableParser.Token t:candidates){
   List<TableParser.Token> g=groups.isEmpty()?null:groups.get(groups.size()-1);
   List<Double> centers=new ArrayList<>();if(g!=null)for(TableParser.Token a:g)centers.add((double)a.x());
   if(g==null||t.x()-ColumnLayout.median(centers)>tolerance){g=new ArrayList<>();groups.add(g);}g.add(t);
  }
  groups.sort((a,b)->Integer.compare(b.size(),a.size()));
  if(groups.isEmpty()||groups.get(0).size()<2)return legacy;
  if(groups.size()>1&&groups.get(0).size()==groups.get(1).size())throw new IllegalArgumentException("Multiple date columns have equal row support. Review the table bounds; no rows were invented.");
  return groups.get(0);
 }
 private ObservedDates(){}
}
