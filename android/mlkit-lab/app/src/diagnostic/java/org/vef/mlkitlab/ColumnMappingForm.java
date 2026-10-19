package org.vef.mlkitlab;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.widget.*;

/** Each physical column owns its label, selector and samples in one visible card. */
public final class ColumnMappingForm extends LinearLayout {
    private static final String[] OPTIONS = {"Select field", "Ignore", "Port / Terminal",
            "B/L Date", "Cargo", "Ship's Figures", "B/L Figures"};

    public ColumnMappingForm(Context context, ColumnLayout layout, int[] choices, Runnable changed) {
        super(context);
        if (choices.length != layout.columns()) throw new IllegalArgumentException("Column count mismatch.");
        setOrientation(VERTICAL);
        setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        for (int column = 0; column < layout.columns(); column++) {
            final int physicalColumn = column;
            LinearLayout card = new LinearLayout(context);
            card.setOrientation(VERTICAL);
            card.setPadding(dp(12), dp(12), dp(12), dp(12));
            GradientDrawable border = new GradientDrawable();
            border.setColor(Color.WHITE);
            border.setStroke(dp(1), Color.GRAY);
            border.setCornerRadius(dp(8));
            card.setBackground(border);
            LayoutParams cardParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
            cardParams.bottomMargin = dp(16);
            addView(card, cardParams);
            String name = "Column " + (column + 1);
            String header = layout.header(column);
            label(card, name + " · " + (header.isEmpty() ? "No readable header" : header), 18);
            TextView selectorLabel = label(card, "Map " + name + " to field", 16);
            Spinner selector = new Spinner(context, Spinner.MODE_DIALOG);
            selector.setId(View.generateViewId());
            selector.setTag("column-selector-" + column);
            selectorLabel.setLabelFor(selector.getId());
            selector.setContentDescription("Map " + name + " to field");
            selector.setPrompt("Map " + name + " · " + (header.isEmpty() ? "No readable header" : header));
            selector.setMinimumHeight(dp(56));
            ArrayAdapter<String> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, OPTIONS);
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            selector.setAdapter(adapter);
            selector.setSelection(choices[column] + 2);
            card.addView(selector, new LayoutParams(LayoutParams.MATCH_PARENT, dp(56)));
            TextView selection = label(card, "", 15);
            Runnable describe = () -> selection.setText(name + " selection: " + OPTIONS[choices[physicalColumn] + 2]);
            describe.run();
            selector.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                public void onNothingSelected(AdapterView<?> parent) { }
                public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                    if (position < 0 || position >= OPTIONS.length) return;
                    boolean different = choices[physicalColumn] != position - 2;
                    choices[physicalColumn] = position - 2;
                    describe.run();
                    if (different) changed.run();
                }
            });
            label(card, "Sample values from " + name + ":\n" + String.join("\n", layout.samples(column)), 15);
        }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView label(LinearLayout parent, String value, int size) {
        TextView label = new TextView(getContext());
        label.setText(value);
        label.setTextColor(Color.BLACK);
        label.setTextSize(size);
        label.setPadding(0, dp(4), 0, dp(6));
        parent.addView(label, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        return label;
    }
}
