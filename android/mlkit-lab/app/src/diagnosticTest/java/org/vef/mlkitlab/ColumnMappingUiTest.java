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
}
