package org.vef.mlkitlab;

import android.graphics.*;
import android.widget.*;
import com.google.android.gms.tasks.*;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

/** Reuses the existing worker, recognizer, bitmap and persistent diagnostic directory. */
public final class CellReread {
    public static void run(Bitmap original,TextRecognizer recognizer,TableParser.Result parsed,
                           RunJournal journal,JSONObject report,File logs,String runId)throws Exception {
        JSONObject rereads=CellRetryPolicy.run(parsed,original.getWidth(),original.getHeight(),(box,variant,timeout)-> {
            Bitmap crop=Bitmap.createBitmap(original,box[0],box[1],box[2]-box[0],box[3]-box[1]);
            // createBitmap may return its input. Never recycle the original document.
            Bitmap masked=MappingImage.mask(crop,box);
            if(masked!=crop&&crop!=original)crop.recycle();
            crop=masked;
            Bitmap input=crop;
            if(variant==1) {
                input=Bitmap.createBitmap(crop.getWidth()*2,crop.getHeight()*2,Bitmap.Config.ARGB_8888);
                Paint paint=new Paint(Paint.FILTER_BITMAP_FLAG);
                float c=1.12f,offset=128*(1-c);
                paint.setColorFilter(new ColorMatrixColorFilter(new ColorMatrix(new float[]{c,0,0,0,offset,0,c,0,0,offset,0,0,c,0,offset,0,0,0,1,0})));
                new Canvas(input).drawBitmap(crop,null,new Rect(0,0,input.getWidth(),input.getHeight()),paint);
                if(crop!=original)crop.recycle();
            }
            final Bitmap taskBitmap=input;
            Task<Text> task;
            try { task=recognizer.process(InputImage.fromBitmap(input,0)); }
            catch(Exception e){if(input!=original)input.recycle();throw e;}
            // Native ML Kit tasks cannot be cancelled. Keep image alive until task completion.
            task.addOnCompleteListener(Runnable::run,done->{if(taskBitmap!=original&&!taskBitmap.isRecycled())taskBitmap.recycle();});
            Text text=Tasks.await(task,timeout,TimeUnit.MILLISECONDS);
            JSONArray fragments=new JSONArray();
            for(Text.TextBlock block:text.getTextBlocks())for(Text.Line line:block.getLines())for(Text.Element element:line.getElements()) {
                JSONObject token=new JSONObject().put("text",element.getText()).put("confidence",element.getConfidence());
                Rect rect=element.getBoundingBox();
                if(rect!=null)token.put("cropPixels",new JSONArray(new int[]{rect.left,rect.top,rect.right,rect.bottom}));
                fragments.put(token);
            }
            return new JSONObject().put("rawText",text.getText()).put("fragments",fragments);
        },new CellRetryPolicy.Control(){
            public long now(){return System.nanoTime()/1000000;}
            public long elapsed(){return journal.elapsed();}
            public boolean running(){return journal.running()&&!Thread.currentThread().isInterrupted();}
            public void persist(JSONObject state)throws Exception {
                File file=new File(logs,runId+"-cell-rereads.json");
                File temporary=new File(logs,runId+"-cell-rereads.json.tmp");
                try(FileOutputStream out=new FileOutputStream(temporary)) {out.write(state.toString(2).getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
                java.nio.file.Files.move(temporary.toPath(),file.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                journal.event("CELL_REREAD",state.toString());
            }
        });
        report.put("cellRereads",rereads).put("cellOcrCalls",rereads.getInt("cellOcrCalls"))
              .put("totalOcrCalls",rereads.getInt("totalOcrCalls"));
    }
    public static void display(LinearLayout container,JSONObject report,int row,String column) {
        JSONObject state=report.optJSONObject("cellRereads");if(state==null)return;
        JSONArray cells=state.optJSONArray("cells");if(cells==null)return;
        for(int i=0;i<cells.length();i++) {
            JSONObject cell=cells.optJSONObject(i);
            if(cell==null||cell.optInt("row")!=row+1||!column.equals(cell.optString("column")))continue;
            StringBuilder message=new StringBuilder("Local cell reread — Review Required\nInitial OCR: ").append(cell.optString("initialValue"));
            JSONArray attempts=cell.optJSONArray("attempts");
            if(attempts!=null)for(int j=0;j<attempts.length();j++) {
                JSONObject a=attempts.optJSONObject(j);JSONObject result=a.optJSONObject("result");
                message.append('\n').append(a.optString("variant")).append(": ").append(result==null?a.optString("status"):result.optString("rawText"))
                    .append(" (").append(a.optLong("elapsedMs")).append(" ms)");
            }
            if(cell.has("skipReason"))message.append('\n').append(cell.optString("skipReason"));
            message.append("\nCompare with the original image and edit manually. No candidate is automatically confirmed.");
            TextView label=new TextView(container.getContext());label.setText(message);label.setTextSize(15);label.setBackgroundColor(0xffffedb0);container.addView(label);
        }
    }
    private CellReread(){}
}
