export function registerScheduleReader(read:()=>{teachers:string[];groups:string[];lessons:unknown[]}){
 type Tool={name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown};
 const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
 if(!context?.registerTool)return ()=>{};
 const lifecycle=new AbortController();
 try{void Promise.resolve(context.registerTool({name:'read_extracted_timetable',description:'Read teachers, groups and extracted lessons from PDFs already uploaded in this page. Does not upload files, change the selection or export Excel.',inputSchema:{type:'object',properties:{teacher:{type:'string'}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected an object.');
  const obj=input as Record<string,unknown>;
  if(Object.keys(obj).some(k=>k!=='teacher')||(obj.teacher!==undefined&&typeof obj.teacher!=='string'))throw Error('teacher must be a string.');
  const state=read();if(obj.teacher!==undefined&&!state.teachers.includes(obj.teacher as string))throw Error('Teacher is not present in the uploaded files.');
  return obj.teacher?{teacher:obj.teacher,lessons:state.lessons.filter(l=>(l as {teacher:string}).teacher===obj.teacher)}:{teachers:state.teachers,groups:state.groups};
 }},{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser capability. */}
 return ()=>lifecycle.abort();
}
