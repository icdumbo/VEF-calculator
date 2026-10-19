package org.vef.mlkitlab;

import java.text.Normalizer;
import java.util.*;
import org.json.*;

/** Physical columns first, inspector-confirmed semantics second. No header dictionary. */
public final class ColumnLayout {
 public static final String[] FIELDS={"Port / Terminal","B/L Date","Cargo","Ship's Figures","B/L Figures"};
 public final int width,height,observedRows;
 public final double slope,drift,referenceY,pitch;
 public final List<Double> rows=new ArrayList<>(),bounds=new ArrayList<>();
 public final List<TableParser.Token> words;
 public final List<String> warnings=new ArrayList<>();
 public ColumnLayout(List<TableParser.Token> tokens,int w,int h,List<Double> y,List<Double> b,double s,double d,double p,int observed){
  width=w;height=h;words=new ArrayList<>(tokens);rows.addAll(y);bounds.addAll(b);slope=s;drift=d;pitch=p;observedRows=observed;referenceY=rows.isEmpty()?0:rows.get(0);
 }
 public static List<TableParser.Token> tokens(JSONArray array)throws JSONException {
  List<TableParser.Token> out=new ArrayList<>();
  for(int i=0;i<array.length();i++){JSONObject t=array.getJSONObject(i);out.add(new TableParser.Token(t.getString("text"),(float)t.getDouble("left"),(float)t.getDouble("top"),(float)t.getDouble("right"),(float)t.getDouble("bottom"),t.isNull("confidence")?Float.NaN:(float)t.getDouble("confidence"),t.optInt("id",i)));}return out;
 }
 static double median(List<Double> values){if(values.isEmpty())return 0;List<Double> a=new ArrayList<>(values);Collections.sort(a);int n=a.size();return n%2==1?a.get(n/2):(a.get(n/2-1)+a.get(n/2))/2;}
 static int nearest(List<Double> rows,double y){int best=-1;double distance=Double.POSITIVE_INFINITY;for(int i=0;i<rows.size();i++){double d=Math.abs(rows.get(i)-y);if(d<distance){distance=d;best=i;}}return best;}
 public static ColumnLayout detect(List<TableParser.Token> words,int width,int height) {
  List<TableParser.Token> dates=new ArrayList<>();for(Object t:TableParser.diagnosticDateColumn(words))dates.add((TableParser.Token)t);
  dates.sort(Comparator.comparingDouble(TableParser.Token::y));
  if(dates.size()<2)throw new IllegalArgumentException("Not enough observed row anchors. No rows were invented.");
  List<Double> gap=new ArrayList<>(),heights=new ArrayList<>();for(int i=1;i<dates.size();i++){double d=dates.get(i).y()-dates.get(i-1).y();if(d>0)gap.add(d);}double pitch=median(gap);if(pitch<2)throw new IllegalArgumentException("Row spacing is uncertain.");
  double anchorX=dates.get(0).x();List<Double> rawRows=new ArrayList<>();for(TableParser.Token t:dates)rawRows.add((double)t.y());
  double bestSlope=0,bestScore=Double.POSITIVE_INFINITY;
  for(int step=-100;step<=100;step++){
   double slope=step*.002,score=0;int used=0;
   for(TableParser.Token t:words){if(t.y()<rawRows.get(0)-pitch||t.y()>rawRows.get(rawRows.size()-1)+pitch)continue;double y=t.y()-slope*(t.x()-anchorX);int row=nearest(rawRows,y);double delta=Math.abs(y-rawRows.get(row));score+=Math.min(delta,pitch*.4);used++;}
   if(used>0){score/=used;score+=Math.abs(slope)*.01;if(score<bestScore){bestScore=score;bestSlope=slope;}}
  }
  List<Double> rows=new ArrayList<>();for(TableParser.Token t:dates){double y=t.y()-bestSlope*t.x();if(rows.isEmpty()||y-rows.get(rows.size()-1)>pitch*.45)rows.add(y);}
  Collections.sort(rows);int observed=rows.size();if(rows.size()>20)rows=new ArrayList<>(rows.subList(0,20));
  double meanY=0,meanX=0;for(TableParser.Token t:dates){meanY+=t.y();meanX+=t.x();}meanY/=dates.size();meanX/=dates.size();double numerator=0,denominator=0;for(TableParser.Token t:dates){numerator+=(t.y()-meanY)*(t.x()-meanX);denominator+=(t.y()-meanY)*(t.y()-meanY);}double drift=denominator>0?numerator/denominator:0;if(Math.abs(drift)>.25)drift=0;
  ColumnLayout layout=new ColumnLayout(words,width,height,rows,new ArrayList<>(),bestSlope,drift,pitch,observed);
  BitSet[] support=new BitSet[width];for(int x=0;x<width;x++)support[x]=new BitSet();double min=width,max=0;
  for(TableParser.Token t:words){int row=layout.rowOf(t);if(row<0)continue;heights.add((double)t.height());double l=layout.projectX(t.left,t.y()),r=layout.projectX(t.right,t.y());if(!Double.isFinite(l+r))continue;min=Math.min(min,l);max=Math.max(max,r);for(int x=Math.max(0,(int)Math.floor(l));x<Math.min(width,(int)Math.ceil(r));x++)support[x].set(row);}
  if(max<=min)throw new IllegalArgumentException("No usable table text found.");
  layout.bounds.add(Math.max(0,min-6));int threshold=Math.min(3,rows.size());double minGap=Math.max(5,median(heights)*.45);int start=-1;
  for(int x=Math.max(0,(int)min);x<Math.min(width,(int)max);x++){
   if(support[x].cardinality()<threshold){if(start<0)start=x;}else if(start>=0){if(x-start>=minGap&&start>min+minGap&&x<max-minGap)layout.bounds.add((start+x)/2.0);start=-1;}
  }
  layout.bounds.add(Math.min(width,max+6));
  if(layout.columns()>24){layout.warnings.add("Many tentative columns detected. Merge false splits before mapping.");}
  if(observed>20)layout.warnings.add("More than 20 observed voyages; only the first 20 are available in this lab.");
  return layout;
 }
 public int columns(){return bounds.size()-1;}
 public double projectX(double x,double y){return x-drift*(y-referenceY);}
 public double sourceX(double x,double y){return x+drift*(y-referenceY);}
 public int rowOf(TableParser.Token t){if(rows.isEmpty())return -1;double y=t.y()-slope*t.x();int i=nearest(rows,y);return Math.abs(rows.get(i)-y)<=pitch*.43?i:-1;}
 public int columnOf(TableParser.Token t){double x=projectX(t.x(),t.y());for(int c=0;c<columns();c++)if(x>=bounds.get(c)&&x<bounds.get(c+1))return c;return -1;}
 public boolean crosses(TableParser.Token t,int col){double left=projectX(t.left,t.y()),right=projectX(t.right,t.y());return left<bounds.get(col)-1||right>bounds.get(col+1)+1;}
 public void move(int index,double x){if(!Double.isFinite(x)||index<0||index>=bounds.size())throw new IllegalArgumentException("Invalid separator.");double low=index==0?0:bounds.get(index-1)+3,high=index==bounds.size()-1?width:bounds.get(index+1)-3;if(x<low||x>high)throw new IllegalArgumentException("Separators must stay ordered and at least 3 pixels apart.");bounds.set(index,x);}
 public void split(int col){if(col<0||col>=columns()||bounds.get(col+1)-bounds.get(col)<6)throw new IllegalArgumentException("Column is too narrow to split.");bounds.add(col+1,(bounds.get(col)+bounds.get(col+1))/2);}
 public void merge(int col){if(col<0||col>=columns()-1)throw new IllegalArgumentException("Select a column with a neighbour to its right.");bounds.remove(col+1);}
 public String header(int col){List<TableParser.Token> h=new ArrayList<>();double first=rows.get(0);for(TableParser.Token t:words){double y=t.y()-slope*t.x();if(y<first-pitch*.5&&y>first-pitch*4&&columnOf(t)==col)h.add(t);}h.sort(Comparator.comparingDouble((TableParser.Token t)->t.y()).thenComparingDouble(t->t.x()));StringJoiner joined=new StringJoiner(" ");for(TableParser.Token t:h)joined.add(t.text);return joined.toString();}
 public List<String> samples(int col){List<String> samples=new ArrayList<>();for(int row=0;row<rows.size()&&samples.size()<4;row++){List<TableParser.Token> parts=cell(row,col);if(parts.isEmpty())continue;StringJoiner j=new StringJoiner(" ");for(TableParser.Token t:parts)j.add(t.text);samples.add(j.toString());}return samples;}
 public List<TableParser.Token> cell(int row,int col){List<TableParser.Token> parts=new ArrayList<>();for(TableParser.Token t:words)if(rowOf(t)==row&&columnOf(t)==col)parts.add(t);parts.sort(Comparator.comparingDouble(t->t.left));return parts;}
 public static void validateMapping(int[] choices,int columns){if(choices.length!=columns)throw new IllegalArgumentException("Column count changed. Map the edited columns again.");boolean[] seen=new boolean[5];for(int n:choices){if(n==-1)continue;if(n<0||n>=5)throw new IllegalArgumentException("Select a field or Ignore for every column.");if(seen[n])throw new IllegalArgumentException("Duplicate mapping: "+FIELDS[n]);seen[n]=true;}for(int c=0;c<5;c++)if(!seen[c])throw new IllegalArgumentException("Required field not mapped: "+FIELDS[c]);}
 public JSONObject json()throws JSONException{return new JSONObject().put("width",width).put("height",height).put("slope",slope).put("drift",drift).put("pitch",pitch).put("observedRows",observedRows).put("rows",new JSONArray(rows)).put("bounds",new JSONArray(bounds)).put("warnings",new JSONArray(warnings));}
 public static ColumnLayout restore(JSONObject json,List<TableParser.Token> words)throws JSONException {List<Double> rows=new ArrayList<>(),bounds=new ArrayList<>();for(Object n:array(json.getJSONArray("rows")))rows.add(((Number)n).doubleValue());for(Object n:array(json.getJSONArray("bounds")))bounds.add(((Number)n).doubleValue());ColumnLayout out=new ColumnLayout(words,json.getInt("width"),json.getInt("height"),rows,bounds,json.getDouble("slope"),json.getDouble("drift"),json.getDouble("pitch"),json.getInt("observedRows"));for(int i=0;i<bounds.size();i++)out.move(i,bounds.get(i));JSONArray warnings=json.optJSONArray("warnings");if(warnings!=null)for(int i=0;i<warnings.length();i++)out.warnings.add(warnings.getString(i));return out;}
 static List<Object> array(JSONArray a)throws JSONException {List<Object> out=new ArrayList<>();for(int i=0;i<a.length();i++)out.add(a.get(i));return out;}
 public String signature(){try{StringBuilder b=new StringBuilder().append(columns()).append('|');double left=bounds.get(0),span=bounds.get(bounds.size()-1)-left;for(int c=0;c<columns();c++){b.append(Math.round((bounds.get(c+1)-bounds.get(c))/span*20)).append(':');String s=Normalizer.normalize(header(c),Normalizer.Form.NFC).toUpperCase(Locale.ROOT).replaceAll("\\s+"," ");b.append(s).append('|');}byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(b.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte v:hash)out.append(String.format(Locale.ROOT,"%02x",v&255));return out.toString();}catch(Exception e){throw new IllegalStateException(e);}}
 public JSONObject profile(ColumnLayout detected,int[] choices)throws JSONException {validateMapping(choices,columns());double left=detected.bounds.get(0),span=detected.bounds.get(detected.bounds.size()-1)-left;JSONArray normalized=new JSONArray();for(double b:bounds)normalized.put((b-left)/span);return new JSONObject().put("signature",detected.signature()).put("normalizedBounds",normalized).put("choices",new JSONArray(choices));}
 public int[] applyProfile(JSONObject p)throws JSONException {if(!signature().equals(p.getString("signature")))throw new IllegalArgumentException("Saved layout is incompatible. Confirm a new mapping.");JSONArray b=p.getJSONArray("normalizedBounds"),a=p.getJSONArray("choices");double left=bounds.get(0),span=bounds.get(bounds.size()-1)-left;List<Double> restored=new ArrayList<>();for(int i=0;i<b.length();i++){double x=left+b.getDouble(i)*span;if(x<0||x>width||!Double.isFinite(x)||(i>0&&x-restored.get(i-1)<3))throw new IllegalArgumentException("Saved limits do not fit this photograph.");restored.add(x);}int[] choices=new int[a.length()];for(int i=0;i<a.length();i++)choices[i]=a.getInt(i);validateMapping(choices,restored.size()-1);bounds.clear();bounds.addAll(restored);return choices;}
}
