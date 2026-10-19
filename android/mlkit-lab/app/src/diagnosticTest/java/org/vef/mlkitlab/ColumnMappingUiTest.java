package org.vef.mlkitlab;

import android.app.Activity;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import java.lang.reflect.*;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 35}, application = android.app.Application.class)
public class ColumnMappingUiTest {
    private ColumnLayout nineColumns() {
        List<TableParser.Token> tokens = new ArrayList<>();
        int id = 0;
        for (int c = 0; c < 9; c++) {
            tokens.add(new TableParser.Token("Header " + c, 20+c*150,30,110+c*150,45,.99f,id++));
            for (int r = 0; r < 20; r++) {
                String text = c == 2 ? String.format(Locale.ROOT,"%02d/01/2026",r+1) : "Sample " + c;
                tokens.add(new TableParser.Token(text,20+c*150,100+r*30,110+c*150,112+r*30,.99f,id++));
            }
        }
        ColumnLayout layout = ColumnLayout.detect(tokens,1400,1100);
        assertEquals(9, layout.columns());
        return layout;
    }
    private void measure(View view, int width) {
        shadowOf(Looper.getMainLooper()).idle();
        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        view.layout(0,0,width,view.getMeasuredHeight());
        shadowOf(Looper.getMainLooper()).idle();
    }
    private List<Spinner> selectors(View view) {
        List<Spinner> out = new ArrayList<>();
        if (view instanceof Spinner) out.add((Spinner)view);
        else if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++)
            out.addAll(selectors(((ViewGroup)view).getChildAt(i)));
        return out;
    }
    @Test public void actualStepTwoShowsNineLabelledSelectorsIncludingFirstAndLast() throws Exception {
        try (var controller = Robolectric.buildActivity(MappingActivity.class).setup()) {
            MappingActivity activity = controller.get();
            Field field = MappingActivity.class.getDeclaredField("layout"); field.setAccessible(true);
            field.set(activity,nineColumns());
            Method step = MappingActivity.class.getDeclaredMethod("showMapping"); step.setAccessible(true); step.invoke(activity);
            View content = activity.findViewById(android.R.id.content);
            for (int width : new int[]{320, 720, 1100}) {
                measure(content,width);
                List<Spinner> all = selectors(content);
                assertEquals(9,all.size());
                Set<Integer> ids = new HashSet<>();
                for (int c=0;c<9;c++) {
                    Spinner selector = all.get(c);
                    assertEquals("column-selector-"+c,selector.getTag());
                    assertEquals("Map Column "+(c+1)+" to field",selector.getContentDescription());
                    assertEquals(View.VISIBLE,selector.getVisibility());
                    assertTrue(selector.isEnabled());
                    assertTrue(selector.isShown());
                    assertTrue(selector.getMeasuredWidth()>100);
                    assertTrue(selector.getMeasuredHeight()>=selector.getMinimumHeight());
                    assertTrue(ids.add(selector.getId()));
                    assertEquals("Select field",selector.getSelectedItem());
                }
            }
        }
    }
    @Test public void eachSelectorChangesOnlyItsOwnPhysicalColumnIncludingIgnore() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        int[] choices = new int[9]; Arrays.fill(choices,-2);
        int[] changes = {0};
        ColumnMappingForm form = new ColumnMappingForm(activity,nineColumns(),choices,()->changes[0]++);
        activity.setContentView(form); measure(form,400);
        List<Spinner> all = selectors(form);
        int[] expected = choices.clone();
        for (int c=0;c<9;c++) {
            all.get(c).setSelection(1); measure(form,400);
            expected[c] = -1;
            assertArrayEquals(expected,choices);
            assertEquals("Ignore",all.get(c).getSelectedItem());
        }
        assertEquals(9,changes[0]);
        int[] target = {-1,0,1,2,3,4,-1,-1,-1};
        for (int c=0;c<9;c++) all.get(c).setSelection(target[c]+2);
        measure(form,400);
        assertArrayEquals(target,choices);
        ColumnLayout.validateMapping(choices,9);
        all.get(8).setSelection(2); measure(form,400);
        assertEquals(0,choices[8]); assertEquals(0,choices[1]);
        try { ColumnLayout.validateMapping(choices,9); fail("Duplicate must fail"); }
        catch (IllegalArgumentException expectedFailure) { }
    }
    @Test public void restoredChoicesAreVisibleWithoutRewritingSavedMapping() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        int[] choices = {-1,0,1,2,3,4,-1,-1,-1};
        int[] expected = choices.clone(); int[] changes = {0};
        ColumnMappingForm form = new ColumnMappingForm(activity,nineColumns(),choices,()->changes[0]++);
        activity.setContentView(form); measure(form,400);
        List<Spinner> all = selectors(form);
        for (int c=0;c<9;c++) assertEquals(expected[c]+2,all.get(c).getSelectedItemPosition());
        assertArrayEquals(expected,choices); assertEquals(0,changes[0]);
    }

    @Test public void firstAndLastSelectorsOpenDialogsAndIgnoreOnlyTheirOwnColumn() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            Activity activity = controller.get();
            int[] choices = new int[9]; Arrays.fill(choices,-2);
            ColumnMappingForm form = new ColumnMappingForm(activity,nineColumns(),choices,()->{});
            ScrollView scroll = new ScrollView(activity); scroll.addView(form);
            activity.setContentView(scroll); measure(form,400);
            List<Spinner> all = selectors(form);
            for (int column : new int[]{0,8}) {
                assertTrue(all.get(column).performClick());
                shadowOf(Looper.getMainLooper()).idle();
                android.app.AlertDialog dialog = org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog();
                assertNotNull(dialog); assertTrue(dialog.isShowing());
                ListView list = dialog.getListView();
                assertEquals("Ignore",list.getAdapter().getItem(1));
                list.performItemClick(list.getAdapter().getView(1,null,list),1,list.getAdapter().getItemId(1));
                measure(form,400);
                assertEquals(-1,choices[column]);
                for (int c=1;c<8;c++) assertEquals(-2,choices[c]);
                assertFalse(dialog.isShowing());
            }
        }
    }

    private void field(Object target,String name,Object value)throws Exception {
        Field f=MappingActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(target,value);
    }
    private Object field(Object target,String name)throws Exception {
        Field f=MappingActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(target);
    }
    private String visibleText(View v) {
        StringBuilder s=new StringBuilder();if(v instanceof TextView)s.append(((TextView)v).getText()).append(' ');
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)s.append(visibleText(((ViewGroup)v).getChildAt(i)));
        return s.toString();
    }
    private List<EditText> edits(View v){
        List<EditText> out=new ArrayList<>();if(v instanceof EditText)out.add((EditText)v);
        else if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)out.addAll(edits(((ViewGroup)v).getChildAt(i)));
        return out;
    }
    private void await(java.util.function.BooleanSupplier condition)throws Exception {
        long end=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        do {shadowOf(Looper.getMainLooper()).idle();if(condition.getAsBoolean())return;Thread.sleep(10);}while(System.nanoTime()<end);
        fail("Asynchronous mapping step did not finish");
    }
    private String readUtf8(java.nio.file.Path p)throws java.io.IOException {return new String(java.nio.file.Files.readAllBytes(p),java.nio.charset.StandardCharsets.UTF_8);}
    private org.json.JSONObject realReport()throws Exception {
        String path=System.getenv("MLKIT_HEADERFIX_RESULT");assertNotNull("Private device fixture required",path);
        return new org.json.JSONObject(readUtf8(java.nio.file.Paths.get(path)));
    }
    @Test public void rawOcrWithoutLayoutUsesSeparateDetectionWithoutChangingRaw()throws Exception {
        org.json.JSONObject raw=realReport();raw.remove("layout");String before=raw.toString();
        try {raw.getJSONObject("layout");fail("Old loader must reproduce the missing-layout failure");}
        catch(org.json.JSONException expected) { }
        ColumnLayout layout=ColumnLayout.detect(ColumnLayout.tokens(raw.getJSONArray("tokensInOrientedOcrPixels")),raw.getInt("ocrWidth"),raw.getInt("ocrHeight"));
        org.json.JSONObject geometry=layout.json();org.json.JSONObject result=new org.json.JSONObject().put("mapping",new org.json.JSONObject().put("layout",geometry));
        ColumnLayout restored=MappingActivity.savedDetectedLayout(raw,result,new org.json.JSONObject().put("layout",geometry));
        assertEquals(layout.bounds,restored.bounds);assertEquals(20,restored.rows.size());assertEquals(9,restored.columns());assertEquals(before,raw.toString());
    }
    @Test public void confirmNineColumnsWithFourIgnoredOpensOneHundredReviewValues()throws Exception { completedMapping(false); }
    @Test public void completedMappingResumesWithoutDetectionFileAndPreservesInvalidValue()throws Exception { completedMapping(true); }
    private void completedMapping(boolean missingDetection)throws Exception {
        var controller=Robolectric.buildActivity(MappingActivity.class).setup();MappingActivity activity=controller.get();
        org.json.JSONObject raw=realReport();raw.remove("layout");String session="map-test-confirm";
        ColumnLayout detected=ColumnLayout.detect(ColumnLayout.tokens(raw.getJSONArray("tokensInOrientedOcrPixels")),raw.getInt("ocrWidth"),raw.getInt("ocrHeight"));
        int[] choices={-1,0,1,2,3,4,-1,-1,-1};assertEquals(9,detected.columns());
        java.io.File logs=new java.io.File(activity.getFilesDir(),"diagnostics"),cache=new java.io.File(activity.getFilesDir(),"mapping-cache");logs.mkdirs();cache.mkdirs();
        String rawName=session+"-mapping-raw.json",detectName=session+"-mapping-detect.json",resultName=session+"-completed-mapping-result.json";
        MappingOcrService.save(new java.io.File(logs,rawName),raw);
        java.io.File detectionFile=new java.io.File(logs,detectName);
        if(!missingDetection)MappingOcrService.save(detectionFile,new org.json.JSONObject(raw.toString()).put("layout",detected.json()));
        android.graphics.Bitmap photo=android.graphics.Bitmap.createBitmap(16,16,android.graphics.Bitmap.Config.ARGB_8888);
        try(var out=new java.io.FileOutputStream(new java.io.File(cache,session+".input"))){photo.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}photo.recycle();
        field(activity,"session",session);field(activity,"detectFile",detectName);field(activity,"layout",detected);field(activity,"detected",detected);field(activity,"choices",choices);
        Method show=MappingActivity.class.getDeclaredMethod("showMapping");show.setAccessible(true);show.invoke(activity);
        Method confirm=MappingActivity.class.getDeclaredMethod("confirm");confirm.setAccessible(true);confirm.invoke(activity);
        java.io.File selectionFile=new java.io.File(cache,session+"-selection.json");await(selectionFile::exists);
        final android.content.Intent[] started={null};await(()->{started[0]=shadowOf(activity.getApplication()).getNextStartedService();return started[0]!=null;});
        assertEquals("apply",started[0].getAction());assertEquals(session,started[0].getStringExtra("session"));
        org.json.JSONObject selection=MappingOcrService.read(selectionFile);for(int i=0;i<9;i++)assertEquals(choices[i],selection.getJSONArray("choices").getInt(i));
        assertTrue(selection.getBoolean("confirmedByInspector"));assertFalse(selection.getBoolean("valuesConfirmed"));
        MappingRows mapped=new MappingRows(detected,choices);
        assertEquals(100,mapped.result.associatedCells);assertEquals("6362.5776",mapped.result.cells[2][3]);assertEquals("invalid",mapped.result.status[2][3]);
        org.json.JSONObject result=mapped.report().put("session",session).put("rawOcrFile",rawName).put("mapping",selection).put("usedActiveMs",100).put("cellOcrCalls",0);
        MappingOcrService.save(new java.io.File(logs,resultName),result);
        String rawBefore=readUtf8(new java.io.File(logs,rawName).toPath()),selectionBefore=readUtf8(selectionFile.toPath());
        android.os.Bundle response=new android.os.Bundle();response.putString("session",session);response.putString("resultFile",resultName);
        ((android.os.ResultReceiver)started[0].getParcelableExtra("receiver")).send(2,response);
        View root=activity.findViewById(android.R.id.content);await(()->visibleText(root).contains("Step 3"));
        assertFalse((Boolean)field(activity,"busy"));List<EditText> values=edits(root);assertEquals(100,values.size());
        for(int r=0;r<20;r++)for(int c=0;c<5;c++)assertEquals(mapped.result.cells[r][c],values.get(r*5+c).getText().toString());
        assertTrue(visibleText(root).contains("Review Required"));assertFalse(visibleText(root).contains("Cannot load saved results"));
        assertEquals(rawBefore,readUtf8(new java.io.File(logs,rawName).toPath()));assertEquals(selectionBefore,readUtf8(selectionFile.toPath()));
        controller.pause().stop().destroy();
        try(var resumed=Robolectric.buildActivity(MappingActivity.class).setup()) {
            View resumedRoot=resumed.get().findViewById(android.R.id.content);await(()->visibleText(resumedRoot).contains("Step 3"));
            assertEquals(100,edits(resumedRoot).size());assertEquals("6362.5776",edits(resumedRoot).get(13).getText().toString());
            assertTrue(visibleText(resumedRoot).contains("Review Required"));
        }
    }
}
