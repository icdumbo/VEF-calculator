package org.vef.mlkitlab;
import android.content.Intent;
import android.view.*;
import android.widget.*;
/** Adds one entry point without replacing the installed launcher activity. */
public final class MappingEntry {
 public static void install(MainActivity activity){
  ViewGroup root=activity.findViewById(android.R.id.content);
  if(root.getChildCount()!=1||!(root.getChildAt(0) instanceof ScrollView))throw new IllegalStateException("Diagnostic root layout changed.");
  ScrollView scroll=(ScrollView)root.getChildAt(0);LinearLayout content=(LinearLayout)scroll.getChildAt(0);
  Button button=new Button(activity);button.setText("Column Mapping — adjust and assign columns");
  button.setOnClickListener(v->{if(activity.diagnosticIsBusy()){Toast.makeText(activity,"Finish or cancel the current diagnostic first.",Toast.LENGTH_SHORT).show();return;}activity.startActivity(new Intent(activity,MappingActivity.class));});
  content.addView(button,2);
 }
 private MappingEntry(){}
}
