package org.vef.mlkitlab;
import java.util.*;
import java.text.Normalizer;
import org.json.*;

/** Applies a confirmed physical mapping; values remain unconfirmed and digits untouched. */
public final class MappingRows {
 public final TableParser.Result result=new TableParser.Result();
 public final int[][][] crops;
 public final double[][][] clips;
 public final JSONArray ambiguous=new JSONArray();
 public MappingRows(ColumnLayout layout,int[] choices)throws JSONException {
  ColumnLayout.validateMapping(choices,layout.columns());
  TableParser.Result r=result;r.rowCount=layout.rows.size();r.observedRows=layout.observedRows;r.pitch=layout.pitch;r.slope=layout.slope;r.warnings.addAll(layout.warnings);
  crops=new int[r.rowCount][5][4];clips=new double[r.rowCount][5][7];
  for(int row=0;row<r.rowCount;row++)for(int col=0;col<layout.columns();col++) {
   int field=choices[col];if(field<0)continue;
   double rowSlope=layout.tracks==null?layout.slope:0;
   double rowCenter=layout.tracks==null?layout.rows.get(row):layout.tracks.center(row,(layout.bounds.get(col)+layout.bounds.get(col+1))/2);
   if(!Double.isFinite(rowCenter)){r.status[row][field]="missing";r.reasons[row][field]="INSUFFICIENT_OBSERVED_ROW_EVIDENCE_REVIEW_REQUIRED";continue;}
            double half=layout.pitch*(layout.tracks==null?.44:.4);
            double u1=layout.bounds.get(col),u2=layout.bounds.get(col+1),v1=rowCenter-half,v2=rowCenter+half;
   clips[row][field]=new double[]{u1,u2,v1,v2,rowSlope,layout.drift,layout.referenceY};
   double minX=layout.width,minY=layout.height,maxX=0,maxY=0;
   for(double u:new double[]{u1,u2})for(double v:new double[]{v1,v2}){double x=(u+layout.drift*(v-layout.referenceY))/(1-layout.drift*rowSlope),y=v+rowSlope*x;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
   crops[row][field]=new int[]{Math.max(0,(int)Math.floor(minX)),Math.max(0,(int)Math.floor(minY)),Math.min(layout.width,(int)Math.ceil(maxX)),Math.min(layout.height,(int)Math.ceil(maxY))};
   List<TableParser.Token> parts=layout.cell(row,col);boolean crossing=false,low=false;StringJoiner text=new StringJoiner(" ");
   for(TableParser.Token t:layout.words){if(layout.rowOf(t)!=row)continue;double l=layout.projectX(t.left,t.y()),rr=layout.projectX(t.right,t.y());if(rr>layout.bounds.get(col)&&l<layout.bounds.get(col+1)&&(l<layout.bounds.get(col)-1||rr>layout.bounds.get(col+1)+1)){crossing=true;ambiguous.put(new JSONObject().put("row",row+1).put("physicalColumn",col).put("token",token(t)).put("reason","TOKEN_CROSSES_CONFIRMED_COLUMN_LIMIT"));}}
   if(crossing){r.status[row][field]="invalid";r.reasons[row][field]="COLUMN_LIMIT_INTERSECTS_OCR_ELEMENT_REVIEW_REQUIRED";r.invalidCells++;continue;}
   for(TableParser.Token t:parts){text.add(t.text);r.evidence[row][field].add(t);low|=!Float.isFinite(t.confidence)||t.confidence<.8f;}
   String value=Normalizer.normalize(text.toString(),Normalizer.Form.NFC).trim().replaceAll("\\s+"," ");if(field==0||field==2)value=value.toUpperCase(Locale.ROOT);r.cells[row][field]=value;
   if(value.isEmpty()){r.status[row][field]="missing";r.reasons[row][field]="NO_OBSERVED_TEXT_REVIEW_REQUIRED";continue;}
   r.associatedCells++;
   if(!CellRetryPolicy.valid(field,value)){r.status[row][field]="invalid";r.reasons[row][field]=field==1?"INVALID_DATE":"INVALID_QUANTITY_NO_AUTOMATIC_REPAIR";r.invalidCells++;}
   else if(field==1&&ObservedDates.requiresReview(value)){r.status[row][field]="review_required";r.reasons[row][field]="AMBIGUOUS_DATE_REVIEW_REQUIRED";r.reviewCells++;}
            else if(low){r.status[row][field]="review_required";r.reasons[row][field]="LOW_OR_UNKNOWN_OCR_CONFIDENCE_REVIEW_REQUIRED";r.reviewCells++;}
   else {r.status[row][field]="candidate";r.reasons[row][field]="INSPECTOR_MAPPED_COLUMN_VALUE_UNCONFIRMED";r.coherentCells++;}
  }
  r.diagnostic=r.rowCount+" observed rows; "+r.associatedCells+" associated cells; "+r.invalidCells+" invalid; all values remain unconfirmed.";
 }
 public JSONObject report()throws JSONException {
  JSONArray rows=new JSONArray();TableParser.Result r=result;
  for(int row=0;row<r.rowCount;row++){JSONObject cells=new JSONObject();for(int col=0;col<5;col++){JSONArray evidence=new JSONArray();for(TableParser.Token t:r.evidence[row][col])evidence.put(token(t));cells.put(ColumnLayout.FIELDS[col],new JSONObject().put("value",r.cells[row][col]).put("status",r.status[row][col]).put("reason",r.reasons[row][col]).put("originalFragments",evidence).put("originalCellCrop",new JSONArray(crops[row][col])).put("automaticApproval",false));}rows.put(new JSONObject().put("row",row+1).put("cells",cells));}
  return new JSONObject().put("rows",rows).put("associatedCells",r.associatedCells).put("coherentCandidates",r.coherentCells).put("uncertainCandidates",r.reviewCells).put("invalidCandidates",r.invalidCells).put("ambiguousElements",ambiguous).put("warnings",new JSONArray(r.warnings)).put("diagnostic",r.diagnostic).put("automaticApproval",false);
 }
 public static JSONObject token(TableParser.Token t)throws JSONException {return new JSONObject().put("id",t.id).put("text",t.text).put("left",t.left).put("top",t.top).put("right",t.right).put("bottom",t.bottom).put("confidence",Float.isFinite(t.confidence)?t.confidence:JSONObject.NULL);}

}
