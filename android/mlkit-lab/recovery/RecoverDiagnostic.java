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
  static void phase(MethodNode method, AbstractInsnNode before, String name) {
    InsnList code=new InsnList();code.add(new LdcInsnNode(name));
    code.add(new MethodInsnNode(Opcodes.INVOKESTATIC,"org/vef/mlkitlab/ParserRuntime","phase","(Ljava/lang/String;)V",false));
    method.instructions.insertBefore(before,code);
  }
  static void instrumentParser(MethodNode method) {
    String runtime="org/vef/mlkitlab/ParserRuntime";
    if(method.name.equals("textGroups")) {
      method.instructions.insert(new MethodInsnNode(Opcodes.INVOKESTATIC,runtime,"beginGroups","()V",false));
      int bounds=0,regex=0;
      for(AbstractInsnNode n:method.instructions.toArray()) {
        if(n instanceof MethodInsnNode){MethodInsnNode call=(MethodInsnNode)n;
          if(call.owner.equals("org/vef/mlkitlab/TableParser")&&call.name.equals("bounds")){call.owner=runtime;call.name="cachedBounds";bounds++;}
          if(call.owner.equals("java/lang/String")&&call.name.equals("matches")){call.setOpcode(Opcodes.INVOKESTATIC);call.owner=runtime;call.name="hasLetters";call.desc="(Ljava/lang/String;Ljava/lang/String;)Z";regex++;}
        }
        if(n.getOpcode()==Opcodes.ARETURN) method.instructions.insertBefore(n,new MethodInsnNode(Opcodes.INVOKESTATIC,runtime,"endGroups","()V",false));
      }
      if(bounds!=2||regex!=2)throw new IllegalStateException("Grouping body changed unexpectedly");
    }
    if(method.name.equals("parse")) {
      int headers=0,groups=0,validation=0;
      for(AbstractInsnNode n:method.instructions.toArray()) {
        if(n instanceof MethodInsnNode) {MethodInsnNode call=(MethodInsnNode)n;
          if(call.name.equals("headerCandidates")) {phase(method,n,"HEADER_CANDIDATES");
            InsnList after=new InsnList();after.add(new LdcInsnNode("HEADER_SELECTION_AND_GEOMETRY"));after.add(new MethodInsnNode(Opcodes.INVOKESTATIC,runtime,"phase","(Ljava/lang/String;)V",false));method.instructions.insert(n,after);headers++;}
          if(call.name.equals("textGroups")) {phase(method,n,"TEXT_FRAGMENT_GROUPING");
            InsnList after=new InsnList();after.add(new LdcInsnNode("CELL_ASSOCIATION"));after.add(new MethodInsnNode(Opcodes.INVOKESTATIC,runtime,"phase","(Ljava/lang/String;)V",false));method.instructions.insert(n,after);groups++;}
        }
        if(n instanceof TypeInsnNode&&n.getOpcode()==Opcodes.NEW&&((TypeInsnNode)n).desc.equals("java/util/StringJoiner")){phase(method,n,"CELL_VALUE_ASSEMBLY_AND_INTERNAL_VALIDATION");validation++;}
      }
      if(headers!=1||groups!=1||validation!=1)throw new IllegalStateException("Parser phase anchors changed unexpectedly");
    }
  }
  public static void main(String[] args)throws Exception{
    boolean headerFix=args.length==3&&args[2].equals("--fix-headers");
    boolean parserFix=args.length==3&&(args[2].equals("--fix-parser")||headerFix);
    boolean fix=args.length==3&&(args[2].equals("--fix-initialization")||parserFix);
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
          if(parserFix) {
            if(c.name.equals(SERVICE)&&m.name.equals("process")) {
              int calls=0;
              for(AbstractInsnNode n:m.instructions.toArray())if(n instanceof MethodInsnNode){
                MethodInsnNode call=(MethodInsnNode)n;
                if(call.owner.equals("org/vef/mlkitlab/TableParser")&&call.name.equals("parse")){
                  InsnList journal=new InsnList();journal.add(new VarInsnNode(Opcodes.ALOAD,0));
                  journal.add(new FieldInsnNode(Opcodes.GETFIELD,SERVICE,"journal","Lorg/vef/mlkitlab/RunJournal;"));
                  m.instructions.insertBefore(call,journal);
                  call.owner="org/vef/mlkitlab/ParserRuntime";
                  call.desc="(Ljava/util/List;Ljava/util/List;Lorg/vef/mlkitlab/RunJournal;)Lorg/vef/mlkitlab/TableParser$Result;";calls++;
                }
              }
              if(calls!=1)throw new IllegalStateException("Expected one service parser call");
            }
            if(c.name.equals("org/vef/mlkitlab/TableParser")) {
              instrumentParser(m);
              if(headerFix&&m.name.equals("parse")) {
                int rewritten=0;
                for(AbstractInsnNode n:m.instructions)if(n instanceof MethodInsnNode){MethodInsnNode call=(MethodInsnNode)n;
                  if(call.owner.equals(c.name)&&call.name.equals("headerCandidates")){call.owner="org/vef/mlkitlab/HeaderRuntime";rewritten++;}
                }
                if(rewritten!=1)throw new IllegalStateException("Expected one header discovery call");
                for(AbstractInsnNode n:m.instructions.toArray())if(n.getOpcode()==Opcodes.ARETURN){
                  InsnList mark=new InsnList();mark.add(new InsnNode(Opcodes.DUP));mark.add(new MethodInsnNode(Opcodes.INVOKESTATIC,"org/vef/mlkitlab/HeaderRuntime","annotate","(Lorg/vef/mlkitlab/TableParser$Result;)V",false));m.instructions.insertBefore(n,mark);
                }
              }
            }
            before.put(m.name+m.desc,instructions(m));
          }
          methods++;
        }
        if(parserFix&&c.name.equals("org/vef/mlkitlab/TableParser")) {
          MethodNode bounds=null;for(MethodNode m:c.methods)if(m.name.equals("bounds"))bounds=m;
          if(bounds==null)throw new IllegalStateException("Missing original bounds");
          MethodNode copy=new MethodNode(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,"diagnosticBounds",bounds.desc,null,null);
          bounds.accept(copy);copy.name="diagnosticBounds";copy.access=Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC;
          c.methods.add(copy);before.put(copy.name+copy.desc,instructions(copy));
        }
        if(headerFix&&c.name.equals("org/vef/mlkitlab/TableParser")) {
          for(String name:Arrays.asList("headerCandidates","dateColumn")) {
            MethodNode source=null;for(MethodNode m:c.methods)if(m.name.equals(name))source=m;
            if(source==null)throw new IllegalStateException("Missing original "+name);
            MethodNode copy=new MethodNode(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,"diagnostic"+Character.toUpperCase(name.charAt(0))+name.substring(1),source.desc,null,null);
            source.accept(copy);copy.name="diagnostic"+Character.toUpperCase(name.charAt(0))+name.substring(1);copy.access=Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC;
            c.methods.add(copy);before.put(copy.name+copy.desc,instructions(copy));
          }
          MethodNode head=new MethodNode(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,"diagnosticHead","(ILjava/util/List;)Ljava/lang/Object;",null,null);
          head.instructions.add(new TypeInsnNode(Opcodes.NEW,"org/vef/mlkitlab/TableParser$Head"));head.instructions.add(new InsnNode(Opcodes.DUP));head.instructions.add(new VarInsnNode(Opcodes.ILOAD,0));head.instructions.add(new VarInsnNode(Opcodes.ALOAD,1));head.instructions.add(new MethodInsnNode(Opcodes.INVOKESPECIAL,"org/vef/mlkitlab/TableParser$Head","<init>","(ILjava/util/List;)V",false));head.instructions.add(new InsnNode(Opcodes.ARETURN));
          c.methods.add(head);before.put(head.name+head.desc,instructions(head));
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
