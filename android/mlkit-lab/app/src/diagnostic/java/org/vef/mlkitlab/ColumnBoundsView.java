package org.vef.mlkitlab;
import android.content.Context;
import android.graphics.*;
import android.view.*;
/** Touch editor in original oriented coordinates. Split/merge never edits OCR text. */
public final class ColumnBoundsView extends View {
 public interface Listener{void selected(int column);void changed();}
 private ColumnLayout layout;private Bitmap photo;private final Paint paint=new Paint(3);private Listener listener;private int separator=-1,selected;private boolean editable=true;
 public ColumnBoundsView(Context context){super(context);setContentDescription("Photograph with adjustable column separators");setMinimumHeight(240);}
 public void set(ColumnLayout l,Bitmap p,boolean edit,Listener listener){layout=l;photo=p;editable=edit;this.listener=listener;selected=Math.min(selected,l.columns()-1);requestLayout();invalidate();}
 public int selected(){return selected;}
 @Override protected void onMeasure(int w,int h){int width=MeasureSpec.getSize(w);int height=layout==null?260:Math.max(240,(int)(width*(double)layout.height/layout.width));setMeasuredDimension(width,height);}
 private float px(double x){return (float)(x/layout.width*getWidth());}private float py(double y){return (float)(y/layout.height*getHeight());}
 @Override protected void onDraw(Canvas c){super.onDraw(c);if(layout==null)return;if(photo!=null&&!photo.isRecycled())c.drawBitmap(photo,null,new Rect(0,0,getWidth(),getHeight()),paint);else c.drawColor(Color.LTGRAY);
  double y1=Math.max(0,layout.rows.get(0)-layout.pitch),y2=Math.min(layout.height,layout.rows.get(layout.rows.size()-1)+layout.pitch*1.5);
  for(int i=0;i<layout.bounds.size();i++){double x=layout.bounds.get(i);paint.setColor(i==separator?Color.RED:Color.rgb(0,90,210));paint.setStrokeWidth(3*getResources().getDisplayMetrics().density);c.drawLine(px(layout.sourceX(x,y1)),py(y1),px(layout.sourceX(x,y2)),py(y2),paint);c.drawCircle(px(layout.sourceX(x,(y1+y2)/2)),py((y1+y2)/2),7*getResources().getDisplayMetrics().density,paint);}
  paint.setTextSize(14*getResources().getDisplayMetrics().scaledDensity);paint.setColor(Color.BLUE);for(int i=0;i<layout.columns();i++)c.drawText(Integer.toString(i+1),px((layout.bounds.get(i)+layout.bounds.get(i+1))/2),py(y1)-3,paint);
 }
 @Override public boolean onTouchEvent(MotionEvent e){if(layout==null)return false;double y=e.getY()/getHeight()*layout.height,x=layout.projectX(e.getX()/getWidth()*layout.width,y);
  if(e.getAction()==MotionEvent.ACTION_DOWN){separator=-1;double distance=28*getResources().getDisplayMetrics().density/getWidth()*layout.width;if(editable)for(int i=0;i<layout.bounds.size();i++){double d=Math.abs(x-layout.bounds.get(i));if(d<distance){separator=i;distance=d;}}for(int i=0;i<layout.columns();i++)if(x>=layout.bounds.get(i)&&x<=layout.bounds.get(i+1)){selected=i;if(listener!=null)listener.selected(i);break;}if(separator>=0)getParent().requestDisallowInterceptTouchEvent(true);invalidate();return true;}
  if(e.getAction()==MotionEvent.ACTION_MOVE&&separator>=0){double low=separator==0?0:layout.bounds.get(separator-1)+3,high=separator==layout.bounds.size()-1?layout.width:layout.bounds.get(separator+1)-3;layout.move(separator,Math.max(low,Math.min(high,x)));invalidate();return true;}
  if(e.getAction()==MotionEvent.ACTION_UP||e.getAction()==MotionEvent.ACTION_CANCEL){boolean changed=separator>=0;separator=-1;getParent().requestDisallowInterceptTouchEvent(false);if(changed&&listener!=null)listener.changed();performClick();invalidate();return true;}return true;
 }
 @Override public boolean performClick(){super.performClick();return true;}
}
