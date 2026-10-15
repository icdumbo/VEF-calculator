package org.vef.mlkitlab;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.*;
import androidx.exifinterface.media.ExifInterface;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.*;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int PICK=10,CAMERA=11,EXPORT=12;
    private static final java.util.concurrent.atomic.AtomicBoolean ENGINE_BUSY=new java.util.concurrent.atomic.AtomicBoolean(false);
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private Uri selected,capture;
    private Button run,cancel,gallery,camera,export;
    private TextView status,metrics;
    private ImageView photo;
    private LinearLayout rows;
    private TableParser.Result result;
    private final EditText[][] reference=new EditText[20][5];
    private final CheckBox[] confirmed=new CheckBox[20];
    private List<TableParser.Token> rawWords=new ArrayList<>();
    private volatile long generation=0;
    private volatile boolean inFlight=false,dead=false;
    private long started;
    private double decodeMs,ocrMs,parseMs;
    private int imageWidth,imageHeight,sourceWidth,sourceHeight;
    private Bitmap preview;
    private Runnable watchdog;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(20,20,20,20);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(content);setContentView(scroll);
        // Keep controls clear of system bars on Android 15/16 edge-to-edge windows.
        content.setOnApplyWindowInsetsListener((v,i)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets b=i.getInsets(WindowInsets.Type.systemBars());v.setPadding(20+b.left,20+b.top,20+b.right,20+b.bottom);}else v.setPadding(20+i.getSystemWindowInsetLeft(),20+i.getSystemWindowInsetTop(),20+i.getSystemWindowInsetRight(),20+i.getSystemWindowInsetBottom());return i;});
        TextView title=new TextView(this);title.setText("VEF ML Kit Lab 0.1 · local OCR test");title.setTextSize(22);content.addView(title);
        TextView note=new TextView(this);note.setText("No VEF calculation. No server. Compare every cell with the photo. Recognition accuracy has not been validated on your phone.");content.addView(note);
        LinearLayout buttons=new LinearLayout(this);content.addView(buttons);
        camera=button(buttons,"Camera",v->camera());gallery=button(buttons,"Gallery",v->gallery());
        run=button(content,"Run local OCR",v->start());cancel=button(content,"Cancel",v->cancel());cancel.setEnabled(false);
        status=new TextView(this);status.setText("Select a full VEF photo with readable headers and all 20 rows.");content.addView(status);
        photo=new ImageView(this);photo.setAdjustViewBounds(true);photo.setScaleType(ImageView.ScaleType.FIT_CENTER);content.addView(photo,new LinearLayout.LayoutParams(-1,700));
        button(content,"Open original photo",v->{if(selected!=null)try{startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(selected,"image/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));}catch(Exception e){message("No image viewer available.");}});
        metrics=new TextView(this);content.addView(metrics);
        export=button(content,"Export local test report (JSON)",v->export());export.setEnabled(false);
        rows=new LinearLayout(this);rows.setOrientation(LinearLayout.VERTICAL);content.addView(rows);
        if(state!=null){String s=state.getString("selected"),c=state.getString("capture");if(s!=null)selected=Uri.parse(s);if(c!=null)capture=Uri.parse(c);status.setText("Session restored. Rerun OCR; unsaved review edits are not retained.");}
    }
    private Button button(LinearLayout parent,String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setOnClickListener(action);parent.addView(b);return b;}
    private void message(String s){status.setText(s);}
    private void busy(boolean value){inFlight=value;run.setEnabled(!value);gallery.setEnabled(!value);camera.setEnabled(!value);cancel.setEnabled(value);export.setEnabled(!value&&result!=null);}
    private void gallery(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK);}
    private void camera(){
        try{File dir=new File(getCacheDir(),"captures");if(!dir.exists()&&!dir.mkdirs())throw new IOException("Cannot create capture directory");
            capture=FileProvider.getUriForFile(this,"org.vef.mlkitlab.files",File.createTempFile("photo-",".jpg",dir));
            Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,capture).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.setClipData(ClipData.newRawUri("capture",capture));startActivityForResult(i,CAMERA);
        }catch(Exception e){message("Camera unavailable: "+e.getMessage());}
    }
    private void select(Uri uri){selected=uri;generation++;result=null;rawWords.clear();rows.removeAllViews();metrics.setText("");export.setEnabled(false);photo.setImageDrawable(null);if(preview!=null){preview.recycle();preview=null;}message("Photo selected. Press Run local OCR. The original remains available for comparison.");}
    @Override protected void onActivityResult(int request,int code,Intent data){super.onActivityResult(request,code,data);if(code!=RESULT_OK)return;
        if(request==PICK&&data!=null&&data.getData()!=null){Uri uri=data.getData();try{getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}select(uri);}
        if(request==CAMERA&&capture!=null)select(capture);
        if(request==EXPORT&&data!=null&&data.getData()!=null){try{String json=report().toString(2);Uri destination=data.getData();executor.execute(()->{try(OutputStream stream=getContentResolver().openOutputStream(destination)){if(stream==null)throw new IOException("No output stream");stream.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));main.post(()->{if(!dead)message("Report saved locally. No photo or report uploaded.");});}catch(Exception e){main.post(()->{if(!dead)message("Export failed: "+e.getMessage());});}});}catch(Exception e){message("Report failed: "+e.getMessage());}}
    }
    private Bitmap decode(Uri uri)throws Exception{
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
        try(InputStream s=getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(s,null,bounds);}
        if(bounds.outWidth<=0||bounds.outHeight<=0)throw new IOException("Unsupported image");
        sourceWidth=bounds.outWidth;sourceHeight=bounds.outHeight;
        BitmapFactory.Options options=new BitmapFactory.Options();
        // Bound decoded memory; preserve at least ~4k on the long side for normal large photos.
        options.inSampleSize=1;
        while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>8192||(long)(bounds.outWidth/options.inSampleSize)*(bounds.outHeight/options.inSampleSize)>16000000L)options.inSampleSize*=2;
        options.inPreferredConfig=Bitmap.Config.ARGB_8888;
        Bitmap bitmap;try(InputStream s=getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(s,null,options);}
        if(bitmap==null)throw new IOException("Cannot decode photo");
        int orientation=1;try(InputStream s=getContentResolver().openInputStream(uri)){orientation=new ExifInterface(s).getAttributeInt(ExifInterface.TAG_ORIENTATION,1);}
        Matrix matrix=new Matrix();switch(orientation){case 2:matrix.setScale(-1,1);break;case 3:matrix.setRotate(180);break;case 4:matrix.setScale(1,-1);break;case 5:matrix.setRotate(90);matrix.postScale(-1,1);break;case 6:matrix.setRotate(90);break;case 7:matrix.setRotate(270);matrix.postScale(-1,1);break;case 8:matrix.setRotate(270);break;}
        if(!matrix.isIdentity()){Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);if(rotated!=bitmap)bitmap.recycle();bitmap=rotated;}
        return bitmap;
    }
    private static TableParser.Token token(String text,Rect box,float confidence){return new TableParser.Token(text,box.left,box.top,box.right,box.bottom,confidence);}
    private void start(){
        if(selected==null){message("Choose a photo first.");return;}if(inFlight)return;
        if(!ENGINE_BUSY.compareAndSet(false,true)){message("The previous activity's native OCR call is still finishing. Retry after it releases resources.");return;}
        busy(true);result=null;rows.removeAllViews();metrics.setText("");started=SystemClock.elapsedRealtime();final long id=++generation;final Uri uri=selected;
        Arrays.fill(confirmed,null);for(EditText[] row:reference)Arrays.fill(row,null);
        message("Decoding photo locally…");
        watchdog=()->{if(id==generation&&inFlight){generation++;cancel.setEnabled(false);message("90 second timeout. Result discarded. Waiting for the native OCR call to finish before another run; you can close the app.");}};main.postDelayed(watchdog,90000);
        executor.execute(()->{
            Bitmap bitmap=null;TextRecognizer recognizer=null;
            try{
                long t=SystemClock.elapsedRealtime();bitmap=decode(uri);decodeMs=SystemClock.elapsedRealtime()-t;
                if(id!=generation)throw new CancellationException();
                imageWidth=bitmap.getWidth();imageHeight=bitmap.getHeight();
                main.post(()->{if(!dead&&id==generation)message("Recognizing text locally · one ML Kit call · elapsed time measured, no simulated percentage");});
                recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);t=SystemClock.elapsedRealtime();
                Text text=com.google.android.gms.tasks.Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap,0)));
                ocrMs=SystemClock.elapsedRealtime()-t;
                if(id!=generation)throw new CancellationException();
                List<TableParser.Token> words=new ArrayList<>(),lines=new ArrayList<>();
                for(Text.TextBlock block:text.getTextBlocks())for(Text.Line line:block.getLines()){
                    if(line.getBoundingBox()!=null)lines.add(token(line.getText(),line.getBoundingBox(),line.getConfidence()));
                    for(Text.Element e:line.getElements())if(e.getBoundingBox()!=null)words.add(token(e.getText(),e.getBoundingBox(),e.getConfidence()));
                }
                t=SystemClock.elapsedRealtime();TableParser.Result parsed=TableParser.parse(words,lines);parseMs=SystemClock.elapsedRealtime()-t;
                Bitmap small=Bitmap.createScaledBitmap(bitmap,Math.max(1,bitmap.getWidth()*Math.min(1200,bitmap.getWidth())/bitmap.getWidth()),Math.max(1,bitmap.getHeight()*Math.min(1200,bitmap.getWidth())/bitmap.getWidth()),true);
                if(small==bitmap)bitmap=null;
                main.post(()->{if(dead||id!=generation){small.recycle();return;}if(preview!=null)preview.recycle();preview=small;photo.setImageBitmap(preview);result=parsed;rawWords=words;render();message(parsed.diagnostic);});
            }catch(Exception|OutOfMemoryError e){String error=e instanceof CancellationException?"Run cancelled; late results discarded.":"OCR failed: "+e.getClass().getSimpleName()+" "+e.getMessage();main.post(()->{if(!dead)message(error);});}
            finally{try{if(recognizer!=null)recognizer.close();}finally{if(bitmap!=null)bitmap.recycle();ENGINE_BUSY.set(false);main.post(()->{main.removeCallbacks(watchdog);if(!dead){busy(false);if(result!=null)updateMetrics();}});}}
        });
    }
    private void cancel(){if(!inFlight)return;generation++;cancel.setEnabled(false);message("Cancelled. Late results will be discarded; waiting for the current native operation to release resources.");}
    private void render(){
        rows.removeAllViews();
        TextView instructions=new TextView(this);instructions.setText("Frozen OCR reading is shown above each editable inspector value. Correct the values from the original, then confirm each row. A blank OCR reading always counts as blank. Only confirmed rows are scored; edits never change the OCR baseline.");rows.addView(instructions);
        HorizontalScrollView horizontal=new HorizontalScrollView(this);TableLayout table=new TableLayout(this);horizontal.addView(table);rows.addView(horizontal);
        TableRow header=new TableRow(this);TextView number=new TextView(this);number.setText("Row");header.addView(number);for(String label:TableParser.LABELS){TextView name=new TextView(this);name.setText(label);name.setTextSize(18);header.addView(name,new TableRow.LayoutParams(dp(240),-2));}TextView review=new TextView(this);review.setText("Inspector confirmation");header.addView(review);table.addView(header);
        for(int r=0;r<20;r++){
            final int row=r;TableRow visualRow=new TableRow(this);visualRow.setPadding(0,12,0,12);TextView heading=new TextView(this);heading.setText(String.valueOf(r+1));heading.setTextSize(20);visualRow.addView(heading);
            for(int c=0;c<5;c++){
                LinearLayout cell=new LinearLayout(this);cell.setOrientation(LinearLayout.VERTICAL);cell.setPadding(8,0,8,0);visualRow.addView(cell,new TableRow.LayoutParams(dp(240),-2));
                TextView prediction=new TextView(this);String p=result.cells[r][c];prediction.setText("OCR: "+(p.isEmpty()?"[blank — review required]":p+" [unconfirmed]"));prediction.setBackgroundColor(0xffffedb0);cell.addView(prediction);
                EditText value=new EditText(this);value.setSingleLine(true);value.setText(p);value.setHint("Inspector reference");value.setContentDescription("Row "+(r+1)+" "+TableParser.LABELS[c]+" inspector reference");cell.addView(value);reference[r][c]=value;
                value.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int count,int after){}public void onTextChanged(CharSequence s,int st,int before,int count){if(confirmed[row]!=null)confirmed[row].setChecked(false);updateMetrics();}public void afterTextChanged(android.text.Editable e){}});
            }
            CheckBox check=new CheckBox(this);check.setText("I checked all five reference cells against the original");confirmed[r]=check;visualRow.addView(check,new TableRow.LayoutParams(dp(240),-2));check.setOnCheckedChangeListener((b,v)->updateMetrics());table.addView(visualRow);
        }
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private boolean[] confirmations(){boolean[] c=new boolean[20];for(int r=0;r<20;r++)c[r]=confirmed[r]!=null&&confirmed[r].isChecked();return c;}
    private String[][] references(){String[][] ref=new String[20][5];for(int r=0;r<20;r++)for(int c=0;c<5;c++)ref[r][c]=reference[r][c]==null?"":reference[r][c].getText().toString();return ref;}
    private void updateMetrics(){if(result==null)return;int[] n=TableParser.score(result.cells,references(),confirmations());metrics.setText(String.format(Locale.ROOT,"Decode %.0f ms · ML Kit %.0f ms (1 call) · table %.0f ms\nSource %d×%d · OCR %d×%d\nCorrect %d · wrong %d · blank %d · unreviewed %d / 100\nExact text comparison after trimming outer spaces; no accuracy claim before inspector confirmation.",decodeMs,ocrMs,parseMs,sourceWidth,sourceHeight,imageWidth,imageHeight,n[0],n[1],n[2],n[3]));}
    private JSONObject report()throws Exception{
        if(result==null)throw new IOException("No completed run");JSONObject report=new JSONObject();report.put("prototype","VEF ML Kit Lab 0.1");report.put("package","org.vef.mlkitlab");report.put("mlkit","com.google.mlkit:text-recognition:16.0.1 bundled Latin");report.put("diagnostic",result.diagnostic);
        report.put("device",Build.MANUFACTURER+" "+Build.MODEL).put("androidSdk",Build.VERSION.SDK_INT).put("exportedAtUtc",java.time.Instant.now().toString());
        report.put("decodeMs",decodeMs).put("ocrMs",ocrMs).put("parseMs",parseMs).put("ocrCalls",1).put("sourceWidth",sourceWidth).put("sourceHeight",sourceHeight).put("ocrWidth",imageWidth).put("ocrHeight",imageHeight);
        int[] n=TableParser.score(result.cells,references(),confirmations());report.put("correct",n[0]).put("wrong",n[1]).put("blank",n[2]).put("unreviewed",n[3]).put("totalCells",100).put("fullyReviewed",n[3]==0).put("scoring","Exact trimmed text, confirmed rows only; empty OCR is blank even when reference is empty");
        JSONArray data=new JSONArray();String[][] refs=references();boolean[] checks=confirmations();
        for(int r=0;r<20;r++){JSONObject row=new JSONObject();row.put("row",r+1).put("confirmedByInspector",checks[r]);JSONObject ocr=new JSONObject(),ref=new JSONObject();for(int c=0;c<5;c++){ocr.put(TableParser.LABELS[c],result.cells[r][c]);ref.put(TableParser.LABELS[c],refs[r][c]);}row.put("ocr",ocr).put("reference",ref);data.put(row);}report.put("rows",data);
        JSONArray tokens=new JSONArray();for(TableParser.Token t:rawWords)tokens.put(new JSONObject().put("text",t.text).put("left",t.left).put("top",t.top).put("right",t.right).put("bottom",t.bottom).put("confidence",Float.isFinite(t.confidence)?t.confidence:JSONObject.NULL));report.put("tokensInOrientedOcrPixels",tokens);return report;
    }
    private void export(){if(result==null)return;startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"vef-mlkit-lab-results.json"),EXPORT);}
    @Override protected void onSaveInstanceState(Bundle b){super.onSaveInstanceState(b);if(selected!=null)b.putString("selected",selected.toString());if(capture!=null)b.putString("capture",capture.toString());}
    @Override protected void onDestroy(){dead=true;generation++;if(watchdog!=null)main.removeCallbacks(watchdog);executor.shutdown();super.onDestroy();}
}
