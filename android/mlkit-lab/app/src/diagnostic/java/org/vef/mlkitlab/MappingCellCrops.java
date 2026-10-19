package org.vef.mlkitlab;
/** Scoped only to the mapping worker; legacy rereads have no overrides. */
public final class MappingCellCrops {
 private static final ThreadLocal<int[][][]> CROPS=new ThreadLocal<>();
 private static final ThreadLocal<double[][][]> CLIPS=new ThreadLocal<>();
 private static final ThreadLocal<double[]> ACTIVE=new ThreadLocal<>();
 public static void set(int[][][] crops){CROPS.set(crops);}
 public static void set(MappingRows mapped){CROPS.set(mapped.crops);CLIPS.set(mapped.clips);}
 public static double[] active(){return ACTIVE.get();}
 public static boolean contains(double[] clip,double x,double y){double u=x-clip[5]*(y-clip[6]),v=y-clip[4]*x;return u>=clip[0]&&u<=clip[1]&&v>=clip[2]&&v<=clip[3];}
 public static void clear(){CROPS.remove();CLIPS.remove();ACTIVE.remove();}
 public static int[] get(int row,int col){int[][][] crops=CROPS.get();if(crops==null)return null;double[][][] clips=CLIPS.get();if(clips!=null)ACTIVE.set(clips[row][col]);return crops[row][col].clone();}
 private MappingCellCrops(){}
}
