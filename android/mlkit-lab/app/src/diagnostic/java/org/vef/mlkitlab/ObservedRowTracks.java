package org.vef.mlkitlab;
import java.util.*;
import org.json.*;
/** Local rows must be supported by observed text, not interpolated or invented. */
public final class ObservedRowTracks {
 final List<Double> bounds;
 final List<List<Double>> centers;
 ObservedRowTracks(List<Double> bounds,List<List<Double>> centers){this.bounds=bounds;this.centers=centers;}
 static ObservedRowTracks build(ColumnLayout layout,List<TableParser.Token> dates){
  int n=layout.rows.size();double first=dates.get(0).y(),last=dates.get(n-1).y(),pitch=layout.pitch;
  List<List<Double>> tracks=new ArrayList<>();
  for(int col=0;col<layout.columns();col++){
   List<TableParser.Token> parts=new ArrayList<>();int numeric=0;
   for(TableParser.Token t:layout.words)if(layout.columnOf(t)==col&&t.y()>first-pitch*.5&&t.y()<last+pitch){parts.add(t);if(t.text.matches("[0-9][0-9.,|]*"))numeric++;}
   if(numeric>parts.size()*.7)parts.removeIf(t->!t.text.matches("[0-9][0-9.,|]*"));
   parts.sort(Comparator.comparingDouble(TableParser.Token::y));
   List<List<Double>> lines=new ArrayList<>();List<Double> hs=new ArrayList<>();for(TableParser.Token t:parts)hs.add((double)t.height());double tolerance=Math.max(2,ColumnLayout.median(hs)*.6);
   for(TableParser.Token t:parts){if(lines.isEmpty()||t.y()-ColumnLayout.median(lines.get(lines.size()-1))>tolerance)lines.add(new ArrayList<>());lines.get(lines.size()-1).add((double)t.y());}
   List<Double> best=null;double bestScore=Double.POSITIVE_INFINITY;
   if(lines.size()>=n&&lines.size()<=n+2)for(int start=0;start+n<=lines.size();start++){
    List<Double> y=new ArrayList<>();for(int r=0;r<n;r++)y.add(ColumnLayout.median(lines.get(start+r)));
    double scale=(y.get(n-1)-y.get(0))/(last-first);if(scale<.8||scale>1.2||Math.abs(y.get(0)-first)>pitch*.9)continue;
    double max=0,sum=0;for(int r=0;r<n;r++){double residual=Math.abs(y.get(r)-(y.get(0)+scale*(dates.get(r).y()-first)));max=Math.max(max,residual);sum+=residual;}
    if(max>pitch*.3)continue;double score=sum/n+Math.abs(y.get(0)-first)*.2;
    if(score<bestScore){best=y;bestScore=score;}
   }
   if(best==null){best=new ArrayList<>();layout.warnings.add("Column "+(col+1)+" has insufficient consistent observed row evidence. Review Required; no rows were invented.");}
   tracks.add(best);
  }
  return new ObservedRowTracks(new ArrayList<>(layout.bounds),tracks);
 }
 int band(double x){for(int c=0;c<centers.size();c++)if(x>=bounds.get(c)&&x<bounds.get(c+1))return c;return -1;}
 int rowOf(TableParser.Token t,double pitch){int c=band(t.x());if(c<0)return -1;List<Double> y=centers.get(c);if(y.isEmpty())return -1;int r=ColumnLayout.nearest(y,t.y());return Math.abs(y.get(r)-t.y())<=pitch*.4?r:-1;}
 double center(int row,double x){int c=band(x);if(c<0)throw new IllegalArgumentException("Cell is outside observed row tracks.");return centers.get(c).isEmpty()?Double.NaN:centers.get(c).get(row);}
 JSONObject json()throws JSONException{JSONArray a=new JSONArray();for(List<Double> y:centers)a.put(new JSONArray(y));return new JSONObject().put("bounds",new JSONArray(bounds)).put("centers",a);}
 static ObservedRowTracks restore(JSONObject o)throws JSONException{List<Double>b=new ArrayList<>();JSONArray a=o.getJSONArray("bounds");for(int i=0;i<a.length();i++)b.add(a.getDouble(i));List<List<Double>>ys=new ArrayList<>();a=o.getJSONArray("centers");for(int i=0;i<a.length();i++){List<Double> y=new ArrayList<>();JSONArray q=a.getJSONArray(i);for(int j=0;j<q.length();j++)y.add(q.getDouble(j));ys.add(y);}return new ObservedRowTracks(b,ys);}
}
