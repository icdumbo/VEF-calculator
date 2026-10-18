import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Recovery of our own diagnostic APK; no decompiler output is executed. */
public final class RecoverDiagnostic {
  static final String SERVICE = "org/vef/mlkitlab/OcrDiagnosticService";
  static final String MLKIT = "com/google/mlkit/common/MlKit";
  static final String IMAGE = "com/google/mlkit/vision/common/InputImage";
  static String signature(AbstractInsnNode n) {
    if(n instanceof MethodInsnNode){MethodInsnNode m=(MethodInsnNode)n;return n.getOpcode()+":"+m.owner+":"+m.name+":"+m.desc;}
    if(n instanceof FieldInsnNode){FieldInsnNode f=(FieldInsnNode)n;return n.getOpcode()+":"+f.owner+":"+f.name+":"+f.desc;}
    if(n instanceof VarInsnNode)return n.getOpcode()+":"+((VarInsnNode)n).var;
    if(n instanceof LdcInsnNode)return n.getOpcode()+":"+((LdcInsnNode)n).cst;
    if(n instanceof IntInsnNode)return n.getOpcode()+":"+((IntInsnNode)n).operand;
    if(n instanceof TypeInsnNode)return n.getOpcode()+":"+((TypeInsnNode)n).desc;
    return ""+n.getOpcode();
  }
  static List<String> instructions(MethodNode m){List<String> r=new ArrayList<>();for(AbstractInsnNode n:m.instructions)if(n.getOpcode()>=0)r.add(signature(n));return r;}
  static AbstractInsnNode previous(AbstractInsnNode n){do{n=n.getPrevious();}while(n!=null&&n.getOpcode()<0);return n;}
  public static void main(String[] args)throws Exception{
    boolean fix=args.length==3&&args[2].equals("--fix-initialization");
    int patched=0,classes=0,methods=0;
    try(ZipFile z=new ZipFile(args[0]);ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(Path.of(args[1])))){
      for(ZipEntry e:Collections.list(z.entries())){
        if(!e.getName().endsWith(".class"))continue;
        byte[] original=z.getInputStream(e).readAllBytes();
        ClassNode c=new ClassNode();new ClassReader(original).accept(c,ClassReader.SKIP_FRAMES);
        Map<String,List<String>> before=new LinkedHashMap<>();
        for(MethodNode m:c.methods){
          // dex2jar may mark JDK interface invocations incorrectly. This changes
          // JVM metadata only, not the Android instruction stream or dispatch.
          for(AbstractInsnNode n:m.instructions)if(n instanceof MethodInsnNode){MethodInsnNode call=(MethodInsnNode)n;try{call.itf=Class.forName(call.owner.replace('/','.')).isInterface();}catch(ClassNotFoundException ignored){}}
          before.put(m.name+m.desc,instructions(m));
          if(fix&&c.name.equals(SERVICE)&&m.name.equals("process")){
            MethodInsnNode init=null,image=null;
            for(AbstractInsnNode n:m.instructions)if(n instanceof MethodInsnNode){MethodInsnNode call=(MethodInsnNode)n;if(call.owner.equals(MLKIT)&&call.name.equals("initialize"))init=call;if(call.owner.equals(IMAGE)&&call.name.equals("fromBitmap"))image=call;}
            if(init==null||image==null)throw new IllegalStateException("Expected exact initialization and InputImage call");
            AbstractInsnNode context=previous(init),self=previous(context);
            if(!(context instanceof MethodInsnNode)||!((MethodInsnNode)context).name.equals("getApplicationContext")||!(self instanceof VarInsnNode)||self.getOpcode()!=Opcodes.ALOAD||((VarInsnNode)self).var!=0)throw new IllegalStateException("Unexpected initialization sequence");
            List<String> expected=new ArrayList<>(before.get(m.name+m.desc));
            int at=expected.indexOf(signature(image)),old=expected.indexOf(signature(init));
            if(old<at)throw new IllegalStateException("Source is already fixed");
            List<String> moved=new ArrayList<>(expected.subList(old-2,old+1));expected.subList(old-2,old+1).clear();expected.addAll(at,moved);
            m.instructions.remove(self);m.instructions.remove(context);m.instructions.remove(init);
            InsnList bootstrap=new InsnList();bootstrap.add(self);bootstrap.add(context);bootstrap.add(init);m.instructions.insertBefore(image,bootstrap);
            if(!expected.equals(instructions(m)))throw new IllegalStateException("Unexpected instruction changes");
            before.put(m.name+m.desc,expected);patched++;
          }
          methods++;
        }
        c.version=Math.max(c.version,Opcodes.V1_8);
        ClassWriter w=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS){@Override protected String getCommonSuperClass(String a,String b){try{return super.getCommonSuperClass(a,b);}catch(Throwable ignored){return "java/lang/Object";}}};
        c.accept(w);byte[] bytes=w.toByteArray();ClassNode verified=new ClassNode();new ClassReader(bytes).accept(verified,ClassReader.SKIP_FRAMES);
        for(MethodNode m:verified.methods)if(!before.get(m.name+m.desc).equals(instructions(m)))throw new IllegalStateException("Recovery altered "+c.name+"."+m.name);
        ZipEntry target=new ZipEntry(e.getName());target.setTime(0);out.putNextEntry(target);out.write(bytes);out.closeEntry();classes++;
      }
    }
    if(fix&&patched!=1)throw new IllegalStateException("Expected one patched method, got "+patched);
    System.out.println("Verified "+classes+" recovered classes, "+methods+" methods; initialization sequences moved="+patched);
  }
}
