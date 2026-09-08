'use client';
import {useEffect,useMemo,useState,useRef} from 'react';
import {Upload,CalendarDays,Download,FileText,X,ArrowRight,Check,LoaderCircle} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Checkbox} from '@/components/ui/checkbox';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {readPdf,deduplicate,conflicts,DAYS} from '@/lib/schedule.mjs';
import {exportSchedule} from '@/lib/export.mjs';
import {registerScheduleReader} from '@/lib/webmcp';

type Lesson={id:string;sourceId?:string;teacher:string;group:string;subgroup:string;subject:string;week:string;day:number;slot:number;time:string;room:string;source:string;page:number;bbox:number[]};
type Source={id:string;name:string;lessons:Lesson[];warnings:string[];groups:string[];error?:string;url:string};
const WEEK:Record<string,string>={odd:'Нечётная',even:'Чётная',both:'Обе недели'};
function Choice({value,onChange,items,label}:{value:string;onChange:(v:string)=>void;items:{value:string;label:string}[];label:string}){return <Select value={value} onValueChange={v=>onChange(String(v))} items={items}><SelectTrigger className="choice" aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select>}
export default function Home(){
 const [sources,setSources]=useState<Source[]>([]),[teacher,setTeacher]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [start,setStart]=useState('2026-09-01'),[firstWeek,setFirstWeek]=useState('odd'),[timeMode,setTimeMode]=useState('template'),[aliases,setAliases]=useState<Record<string,string>>({}),[excluded,setExcluded]=useState<string[]>([]),[reviewed,setReviewed]=useState(false),[expected,setExpected]=useState('');
 const uploadRef=useRef<HTMLInputElement>(null),running=useRef(false);
 const all=useMemo(()=>deduplicate(sources.flatMap(s=>s.lessons)) as Lesson[],[sources]);
 const teachers=useMemo(()=>[...new Set(all.map(l=>l.teacher))].sort((a,b)=>a.localeCompare(b,'ru')),[all]);
 const found=all.filter(l=>l.teacher===teacher),selected=found.filter(l=>!excluded.includes(l.id));
 const collisions=conflicts(selected),groups=[...new Set(sources.flatMap(s=>s.groups))];
 const missing=expected.split(/[,;\s]+/).map(s=>s.trim().replace(/K/g,'К')).filter(Boolean).filter(s=>!groups.includes(s));
 const warnings=sources.flatMap(s=>s.warnings),bad=sources.some(s=>s.error);
 const subjects=[...new Set(found.map(l=>l.subject))];
 const toolState=useRef({teachers,groups,lessons:all});
 useEffect(()=>{toolState.current={teachers,groups,lessons:all}});
 useEffect(()=>registerScheduleReader(()=>toolState.current),[]);
 function invalidate(){setReviewed(false);setSuccess('')}
 async function upload(files:File[]){
  if(running.current)return;running.current=true;setError('');invalidate();
  try{for(const file of files){
   if(!file.name.toLowerCase().endsWith('.pdf')){setError('Поддерживаются PDF-файлы.');continue}
   if(file.size>20*1024*1024){setError('Один PDF должен быть не больше 20 МБ.');continue}
   const id=crypto.randomUUID(),url=URL.createObjectURL(file);setBusy(file.name);
   try{const result=await readPdf(await file.arrayBuffer(),file.name,setBusy);setSources(prev=>[...prev,{...result,lessons:result.lessons.map((l:Lesson)=>({...l,id:`${id}:${l.id}`,sourceId:id})),id,name:file.name,url}]);}
   catch(e){setSources(prev=>[...prev,{id,name:file.name,url,lessons:[],groups:[],warnings:[],error:e instanceof Error?e.message:'Не удалось прочитать файл.'}])}
  }}finally{running.current=false;setBusy('');if(uploadRef.current)uploadRef.current.value=''}
 }
 function remove(s:Source){URL.revokeObjectURL(s.url);setSources(prev=>prev.filter(x=>x.id!==s.id));invalidate()}
 async function download(){
  setError('');setSuccess('');setBusy('Собираю Excel');
  try{const response=await fetch('/template.xlsx');if(!response.ok)throw Error('Не удалось загрузить шаблон Excel. Попробуй снова.');
   const out=exportSchedule(await response.arrayBuffer(),selected,{start,firstWeek,timeMode,aliases});
   const url=URL.createObjectURL(new Blob([new Uint8Array(out)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`Расписание — ${teacher}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setSuccess('Excel готов. Проверь загрузки браузера.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось собрать Excel.')}finally{setBusy('')}
 }
 return <main className="workspace"><header><span className="brand"><CalendarDays size={24}/> Личное расписание</span><span className="badge">Тестовая версия</span></header>
 <div className="intro"><div><h1>Все твои пары.<br/>В одном Excel.</h1><p>Загрузи общие расписания и выбери преподавателя.</p></div><div className="template-note"><FileText size={25}/><div><strong>Твой исходный шаблон</strong><span>3 листа · прежнее оформление · без новых колонок</span></div></div></div>
 <div className="layout"><div><section className="panel"><h2><span className="step">01</span> Расписания групп</h2><label className={'drop '+(busy?'disabled':'')} ><Upload size={28}/><strong>Выбрать PDF-файлы</strong><span>Можно выбрать несколько PDF. До 20 МБ на файл.</span><input ref={uploadRef} type="file" accept=".pdf,application/pdf" multiple disabled={!!busy} onChange={e=>void upload(Array.from(e.target.files||[]))}/></label>
 <p className="muted">Поддерживается таблица как в образце: группы по колонкам, пять дней и пять пар. Сканированные PDF пока не поддерживаются.</p>
 {sources.map(s=><div className="file-row" key={s.id}><FileText size={20}/><div><strong>{s.name}</strong><span>{s.error||`Группы: ${s.groups.join(', ')}`}</span></div><button className="icon-button" disabled={!!busy} onClick={()=>remove(s)} aria-label={`Убрать ${s.name}`}><X size={18}/></button></div>)}
 {busy&&<output className="status"><LoaderCircle className="spin" size={18}/>{busy}</output>}
 </section><section className="panel"><h2><span className="step">02</span> Преподаватель и период</h2><div className="field"><span>Преподаватель</span><Choice value={teacher} onChange={v=>{setTeacher(v);setExcluded([]);invalidate()}} label="Выбрать преподавателя" items={teachers.map(t=>({value:t,label:t}))}/></div>
 {!teachers.length&&<p className="muted">Список появится после загрузки PDF.</p>}
 <div className="fields"><label className="field"><span>Начало занятий</span><input type="date" value={start} onChange={e=>{setStart(e.target.value);invalidate()}}/></label><div className="field"><span>Первая неделя</span><Choice value={firstWeek} onChange={v=>{setFirstWeek(v);invalidate()}} label="Первая неделя" items={[{value:'odd',label:'Нечётная'},{value:'even',label:'Чётная'}]}/></div></div>
 <div className="field"><span>Время пар в Excel</span><Choice value={timeMode} onChange={v=>{setTimeMode(v);invalidate()}} label="Время пар" items={[{value:'template',label:'Как в твоём Excel'},{value:'pdf',label:'Из загруженных PDF'}]}/></div>
 <p className="muted">В исходных образцах время звонков различается. По умолчанию сохраняем время из Excel. Выгрузка охватывает три недели, начиная с выбранной даты.</p>
 <label className="field extra"><span>Группы из нагрузки <small>необязательно</small></span><input value={expected} placeholder="Например: 251, 251К, 371" onChange={e=>{setExpected(e.target.value);invalidate()}}/></label>
 {missing.length>0&&<p className="warning">Не хватает расписаний групп: {missing.join(', ')}. Добавь файлы или исправь список.</p>}
 </section></div>
 <aside><section className="panel guide"><h2>Как разделяются недели</h2><div className="week-cell"><div><span>Сверху</span><strong>Нечётная</strong></div><div><span>Снизу</span><strong>Чётная</strong></div></div><p>Разделение определяется по линии внутри ячейки, даже если половины разной высоты.</p><p>Общая ячейка без разделения — обе недели. Подгруппы учитываются отдельно.</p><div className="privacy"><Check size={18}/><span>PDF обрабатываются в твоём браузере.</span></div></section><p className="side-note">Результат строится только по загруженным файлам. Занятия отсутствующих групп не восстанавливаются.</p></aside></div>
 {teacher&&<section className="panel result"><div className="section-title"><h2><span className="step">03</span> Проверка занятий</h2><span className="muted">{teacher} · {selected.length} записей</span></div>
 {bad&&<p className="warning">Есть файл, который не удалось прочитать. Удали его или загрузи подходящий PDF — выгрузка пока недоступна.</p>}
 {warnings.length>0&&<details className="warning"><summary>Есть неразобранные фрагменты: {warnings.length}. Выгрузка остановлена.</summary>{warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
 {collisions.length>0&&<div className="warning"><strong>Есть пересечения. Сверь с PDF и исключи лишние записи.</strong>{collisions.map((c:{week:string;day:number;slot:number;lessons:Lesson[]},i:number)=><p key={i}>{WEEK[c.week]}, {DAYS[c.day]}, пара {c.slot}: {c.lessons.map((l:Lesson)=>l.group+(l.subgroup?'/'+l.subgroup:'')).join(', ')}</p>)}</div>}
 <Tabs defaultValue="odd"><TabsList className="week-tabs"><TabsTrigger value="odd">Нечётная неделя</TabsTrigger><TabsTrigger value="even">Чётная неделя</TabsTrigger></TabsList>{['odd','even'].map(w=><TabsContent value={w} key={w}><Table className="lesson-table"><TableHeader><TableRow><TableHead>В Excel</TableHead><TableHead>День / пара</TableHead><TableHead>Группа</TableHead><TableHead>Предмет</TableHead><TableHead>Источник</TableHead></TableRow></TableHeader><TableBody>{found.filter(l=>l.week===w||l.week==='both').sort((a,b)=>a.day-b.day||a.slot-b.slot).map(l=><TableRow key={l.id} className={excluded.includes(l.id)?'excluded':''}><TableCell><Checkbox aria-label={`Включить ${l.group}, ${DAYS[l.day]}, пара ${l.slot}`} checked={!excluded.includes(l.id)} onCheckedChange={v=>{setExcluded(prev=>v?prev.filter(id=>id!==l.id):[...prev,l.id]);invalidate()}}/></TableCell><TableCell><strong>{DAYS[l.day]}</strong><span>{l.slot} пара · {l.time}</span></TableCell><TableCell>{l.group}{l.subgroup?'/'+l.subgroup:''}</TableCell><TableCell><strong>{aliases[l.subject]||l.subject}</strong><span>{l.room?`Каб. ${l.room}`:''}{l.week==='both'?' · Обе недели':''}</span></TableCell><TableCell><a href={`${sources.find(s=>s.id===l.sourceId)?.url}#page=${l.page}`} target="_blank" rel="noreferrer">PDF, стр. {l.page} <ArrowRight size={14}/></a></TableCell></TableRow>)}</TableBody></Table></TabsContent>)}</Tabs>
 {!found.length&&<p>В загруженных файлах нет занятий выбранного преподавателя.</p>}
 {subjects.length>0&&<details className="rename"><summary>Названия предметов в Excel</summary><p className="muted">Можно сократить названия или использовать свои. Например, указать «Видеоконтент» для соответствующего предмета. Смысл названий программа не меняет автоматически.</p>{subjects.map(s=><label className="alias-row" key={s}><span>{s}</span><input aria-label={`Название в Excel: ${s}`} value={aliases[s]??s} onChange={e=>{setAliases(prev=>({...prev,[s]:e.target.value}));invalidate()}}/></label>)}</details>}
 <div className="export-bar"><label className="confirm" htmlFor="reviewed"><Checkbox id="reviewed" checked={reviewed} onCheckedChange={v=>setReviewed(!!v)}/><span>Проверил занятия, недели и полноту загруженных файлов</span></label><button className="primary" onClick={()=>void download()} disabled={!reviewed||!!busy||!selected.length||!!collisions.length||bad||!!warnings.length||!!missing.length||!start}><Download size={19}/> Скачать Excel</button></div>
 <p className="muted">В файле останутся только три листа твоего шаблона. Кабинеты и ссылки на источники в Excel не добавляются.</p>
 </section>}
 {error&&<p className="warning" role="alert">{error}</p>}{success&&<output className="success">{success}</output>}
 <footer>Личное расписание · MVP</footer></main>
}


