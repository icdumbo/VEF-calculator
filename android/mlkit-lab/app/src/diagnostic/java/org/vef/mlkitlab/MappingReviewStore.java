package org.vef.mlkitlab;

import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.*;

/** Inspector text is durable evidence, separate from immutable OCR and rereads. */
final class MappingReviewStore {
 private final AtomicFile file;
 private JSONObject state;
 MappingReviewStore(File logs,String session,String resultFile,JSONObject report)throws Exception {
  JSONObject mapping=report.getJSONObject("mapping");
  // Exclude confirmation flags and job timestamps. Reconfirming the same
  // geometry/fields restores edits; different geometry never reuses them.
  String identity=mapping.getJSONObject("layout").toString()+"\n"+mapping.getJSONArray("choices").toString();
  byte[] digest=MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
  StringBuilder key=new StringBuilder();for(byte b:digest)key.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
  file=new AtomicFile(new File(logs,session+"-"+key+"-inspector-review.json"));
  if(file.getBaseFile().exists()||new File(file.getBaseFile().getPath()+".bak").exists()) {
   try(InputStream in=file.openRead();ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
    byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);
    state=new JSONObject(bytes.toString("UTF-8"));
   }
   if(state.getInt("schemaVersion")!=1||!identity.equals(state.getString("mappingIdentity"))||!session.equals(state.getString("session")))
    throw new IOException("Inspector review identity is incompatible; saved data retained");
   state.getJSONObject("edits");
  }else {
   state=new JSONObject().put("schemaVersion",1).put("session",session).put("mappingIdentity",identity)
    .put("sourceResultFile",resultFile).put("originalOcrRows",new JSONArray(report.getJSONArray("rows").toString()))
    .put("rereadCandidates",new JSONObject(report.optJSONObject("cellRereads")==null?"{}":report.getJSONObject("cellRereads").toString()))
    .put("valuesConfirmed",false).put("edits",new JSONObject());
  }
 }
 String value(int row,String field,String original)throws Exception {
  JSONObject edit=state.getJSONObject("edits").optJSONObject(row+":"+field);
  return edit==null?original:edit.getString("inspectorValue");
 }
 void save(int row,String field,String original,String value)throws Exception {
  JSONObject next=new JSONObject(state.toString());
  JSONObject edits=next.getJSONObject("edits");String key=row+":"+field;
  JSONObject prior=edits.optJSONObject(key);
  edits.put(key,new JSONObject().put("row",row+1).put("field",field)
   .put("originalOcrValue",prior==null?original:prior.getString("originalOcrValue"))
   .put("inspectorValue",value).put("confirmed",false).put("editedAtEpochMs",System.currentTimeMillis()));
  FileOutputStream out=null;
  try {
   out=file.startWrite();out.write(next.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();file.finishWrite(out);
   state=next;
  }catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
 }
}
