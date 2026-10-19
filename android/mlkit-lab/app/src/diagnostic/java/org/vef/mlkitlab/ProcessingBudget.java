package org.vef.mlkitlab;
import java.util.function.LongSupplier;
/** Carries machine time between isolated jobs. Human mapping time is not charged. */
public final class ProcessingBudget {
 public static LongSupplier clock(LongSupplier monotonic,long consumed){
  if(consumed<0||consumed>15000)throw new IllegalArgumentException("Invalid processing budget.");
  return new LongSupplier(){boolean first=true;public long getAsLong(){long now=monotonic.getAsLong();if(first){first=false;return now-consumed;}return now;}};
 }
 private ProcessingBudget(){}
}
