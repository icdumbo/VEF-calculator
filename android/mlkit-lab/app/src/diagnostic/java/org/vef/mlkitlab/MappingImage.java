package org.vef.mlkitlab;
import android.graphics.*;
import androidx.exifinterface.media.ExifInterface;
import java.io.*;
/** The same oriented pixel space is used for detection, overlay and cell rereads. */
public final class MappingImage {
 public static Bitmap decode(File file,int longest)throws IOException {
  BitmapFactory.Options b=new BitmapFactory.Options();b.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.getPath(),b);
  if(b.outWidth<=0||b.outHeight<=0)throw new IOException("Photograph cannot be decoded.");
  int sample=1;while((long)(b.outWidth/sample)*(b.outHeight/sample)>16000000||Math.max(b.outWidth/sample,b.outHeight/sample)>longest)sample*=2;
  b.inJustDecodeBounds=false;b.inSampleSize=sample;b.inPreferredConfig=Bitmap.Config.ARGB_8888;Bitmap original=BitmapFactory.decodeFile(file.getPath(),b);if(original==null)throw new IOException("Photograph decoding failed.");
  int o=new ExifInterface(file).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);Matrix m=new Matrix();
  switch(o){case 2:m.setScale(-1,1);break;case 3:m.setRotate(180);break;case 4:m.setScale(1,-1);break;case 5:m.setRotate(90);m.postScale(-1,1);break;case 6:m.setRotate(90);break;case 7:m.setRotate(-90);m.postScale(-1,1);break;case 8:m.setRotate(-90);break;default:break;}
  if(m.isIdentity())return original;Bitmap oriented=Bitmap.createBitmap(original,0,0,original.getWidth(),original.getHeight(),m,true);if(oriented!=original)original.recycle();return oriented;
 }
 public static Bitmap mask(Bitmap crop,int[] box){double[] clip=MappingCellCrops.active();if(clip==null)return crop;Bitmap out=crop.copy(Bitmap.Config.ARGB_8888,true);int[] pixels=new int[out.getWidth()*out.getHeight()];out.getPixels(pixels,0,out.getWidth(),0,0,out.getWidth(),out.getHeight());for(int y=0;y<out.getHeight();y++)for(int x=0;x<out.getWidth();x++){double sx=x+box[0]+.5,sy=y+box[1]+.5;if(!MappingCellCrops.contains(clip,sx,sy))pixels[y*out.getWidth()+x]=0xffffffff;}out.setPixels(pixels,0,out.getWidth(),0,0,out.getWidth(),out.getHeight());return out;}
 private MappingImage(){}
}
