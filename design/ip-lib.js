// Insight Pitch — helpers: body parsing, editor serialisation, change summaries, team lookups. Loaded as a classic <script> in <head>; top-level names are shared globals.
const ago=t=>/^\d+[hdw]$/.test(t)?t+' ago':t;
const latest=p=>p.versions[p.versions.length-1]||null;
const content=p=>latest(p)||p.draft;
const nComments=p=>p.comments.reduce((a,c)=>a+1+c.replies.length,0);
const track=on=>({trackBg:on?'#2e5e45':'#cfccc2',knobLeft:on?'19px':'3px'});
const LANG_CATALOG=[['en','English','English'],['es','Spanish','Español'],['fr','French','Français'],['ar','Arabic','العربية',1],['pt','Portuguese','Português'],['de','German','Deutsch'],['hi','Hindi','हिन्दी'],['zh','Chinese (Simplified)','简体中文'],['sw','Swahili','Kiswahili'],['ta','Tamil','தமிழ்'],['uk','Ukrainian','Українська'],['ja','Japanese','日本語'],['he','Hebrew','עברית',1],['tr','Turkish','Türkçe'],['si','Sinhala','සිංහල']];
const mkLang=(c,on)=>{const x=LANG_CATALOG.find(l=>l[0]===c);return{code:c,name:x[1],native:x[2],rtl:!!x[3],enabled:on};};
const LANGS=[mkLang('en',true),mkLang('es',true),mkLang('fr',true),mkLang('ar',true),mkLang('si',true),mkLang('pt',false)];
const hsh=t=>{let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return(h>>>0).toString(36)+t.length.toString(36);};
const TXKEY='ip-tx-cache-v1';
const loadTx=()=>{try{return JSON.parse(localStorage.getItem(TXKEY)||'{}');}catch(e){return{};}};
const VIDEO_RE=/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\/\S+/i;
const TEXTY=['p','h','quote','ul','ol'];
const bid=()=>'b'+Math.random().toString(36).slice(2,9);
const cellsOf=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
const parseBody=body=>(body||'').split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean).map(t=>{
  if(t.startsWith('## '))return{type:'h',text:t.slice(3)};
  const m=t.match(/^::(image|video|file)\s+([\s\S]*)$/);
  if(m){const f=m[2].split('|').map(x=>x.trim());
    if(m[1]==='image')return{type:'image',img:f[0],caption:f[1]||'',alt:f[2]||'',size:f[3]||''};
    if(m[1]==='video')return{type:'video',url:f[0],title:f[1]||'',dur:f[2]||''};
    return{type:'file',name:f[0],size:f[1]||''};}
  const lines=t.split('\n');
  if(lines.every(l=>/^- /.test(l)))return{type:'ul',items:lines.map(l=>l.slice(2))};
  if(lines.every(l=>/^\d+\. /.test(l)))return{type:'ol',items:lines.map(l=>l.replace(/^\d+\. /,''))};
  if(lines.every(l=>l.trim().startsWith('|')))return{type:'table',rows:lines.map(cellsOf)};
  if(lines.every(l=>l.startsWith('> ')))return{type:'quote',text:lines.map(l=>l.slice(2)).join(' ')};
  return{type:'p',text:t};});
const clean=x=>(x||'').replace(/\|/g,'/').replace(/\s*\n\s*/g,' ').trim();
const toBody=blocks=>blocks.map(b=>{switch(b.type){
  case 'h':return b.text.trim()?'## '+b.text.trim().replace(/\n+/g,' '):'';
  case 'quote':return b.text.trim()?'> '+b.text.trim().replace(/\s*\n\s*/g,' '):'';
  case 'ul':case 'ol':return b.items.map(x=>x.trim().replace(/\n+/g,' ')).filter(Boolean).map((x,i)=>(b.type==='ul'?'- ':(i+1)+'. ')+x).join('\n');
  case 'table':return b.rows.filter(r=>r.some(c=>(c||'').trim())).map(r=>'| '+r.map(clean).join(' | ')+' |').join('\n');
  case 'image':return '::image '+[b.img,b.caption,b.alt,b.size].map(clean).join(' | ');
  case 'video':return b.url.trim()?'::video '+[b.url,b.title,b.dur].map(clean).join(' | '):'';
  case 'file':return b.name?'::file '+clean(b.name)+' | '+(b.size||''):'';
  default:return(b.text||'').trim().replace(/\n\s*\n/g,'\n');}}).filter(Boolean).join('\n\n');
const newBlock=t=>{const id=bid();return t==='table'?{id,type:t,rows:[['',''],['','']]}:t==='image'?{id,type:t,img:'u'+id,caption:'',alt:'',size:''}:t==='video'?{id,type:t,url:'',title:'',dur:''}:t==='file'?{id,type:t,name:'',size:''}:t==='ul'||t==='ol'?{id,type:t,items:['']}:{id,type:t,text:''};};
const toEdBlocks=body=>{const b=parseBody(body).map(x=>({...x,id:bid()}));return b.length?b:[newBlock('p')];};
const txTexts=body=>parseBody(body).flatMap(b=>b.type==='ul'||b.type==='ol'?b.items:b.type==='table'?b.rows.flat():b.type==='image'?[b.caption,b.alt]:b.type==='video'?[b.title]:b.type==='file'?[]:[b.text]).filter(x=>x&&x.trim());
const segs=t=>{const out=[];const re=/\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;let i=0,m;while((m=re.exec(t))){if(m.index>i)out.push({text:t.slice(i,m.index)});if(m[1])out.push({text:m[1],b:1});else if(m[2])out.push({text:m[2],i:1});else out.push({text:m[3],href:m[4]});i=re.lastIndex;}if(i<t.length)out.push({text:t.slice(i)});
  return out.map(s=>({text:s.text,isLink:!!s.href,isText:!s.href,href:s.href||'',fw:s.b?600:'inherit',fs:s.i?'italic':'inherit'}));};
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return'';}};
const fmtSize=n=>n<1048576?Math.max(1,Math.round(n/1024))+' KB':(n/1048576).toFixed(1)+' MB';
const fileBadge=name=>{const ext=((name||'').split('.').pop()||'').toUpperCase().slice(0,4);const c=/PDF/.test(ext)?['#f3e3df','#a3322a']:/XLS|CSV|ODS/.test(ext)?['#e2ebe4','#234a36']:/DOC|ODT/.test(ext)?['#e4ecf3','#2c5272']:['#ecebe4','#3a423c'];return{ext,badgeBg:c[0],badgeFg:c[1]};};
const sig=b=>b.type==='image'?b.img:b.type==='file'?b.name:b.url;
const diffBodies=(a,b)=>{const A=parseBody(a),B=parseBody(b);const out=[];
  [['image','Image','images'],['video','Video','videos'],['file','Attachment','attachments']].forEach(([t,one,many])=>{const ka=A.filter(x=>x.type===t).map(sig),kb=B.filter(x=>x.type===t).map(sig);const ad=kb.filter(k=>!ka.includes(k)).length,rm=ka.filter(k=>!kb.includes(k)).length;
    if(ad)out.push({label:(ad>1?ad+' '+many:one)+' added'});if(rm)out.push({label:(rm>1?rm+' '+many:one)+' removed'});});
  const ta=A.filter(x=>x.type==='table').map(x=>JSON.stringify(x.rows)),tb=B.filter(x=>x.type==='table').map(x=>JSON.stringify(x.rows));
  if(tb.length>ta.length)out.push({label:'Table added'});if(ta.length>tb.length)out.push({label:'Table removed'});if(tb.slice(0,ta.length).some((x,i)=>x!==ta[i]))out.push({label:'Table changed'});
  B.filter(x=>x.type==='h'&&!A.some(y=>y.type==='h'&&y.text===x.text)).forEach(x=>out.push({label:'New section: '+x.text}));
  const txt=x=>['p','ul','ol','quote'].includes(x.type);const at=A.filter(txt).map(x=>JSON.stringify([x.type,x.text,x.items])),bt=B.filter(txt).map(x=>JSON.stringify([x.type,x.text,x.items]));const ch=bt.filter(x=>!at.includes(x)).length;
  if(ch)out.push({label:'Text edited in '+ch+(ch===1?' place':' places')});return out;};
const esc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const IMGSRC={};
const inlHtml=t=>segs(t||'').map(x=>x.isLink?'<a href="'+esc(x.href)+'">'+esc(x.text)+'</a>':x.fw===600?'<strong>'+esc(x.text)+'</strong>':x.fs==='italic'?'<em>'+esc(x.text)+'</em>':esc(x.text)).join('');
const vHintOf=u=>{u=(u||'').trim();if(!u)return['YouTube and Vimeo only. Readers see a link card, and nothing loads until they press play.','#6b736d'];return VIDEO_RE.test(u)?['Linked from '+hostOf(u)+'. The video stays on '+hostOf(u)+' and isn\u2019t uploaded here.','#6b736d']:['Only YouTube and Vimeo links are supported.','#a3322a'];};
const CTL='<div data-ctl="1" style="position:absolute;top:-14px;right:10px;z-index:3;display:flex;gap:1px;padding:2px;background:#fff;border:1px solid #e4e2da;border-radius:999px;box-shadow:0 2px 8px rgba(24,32,27,0.08)">'+[['up','Move up','M12 19V5M6 11l6-6 6 6'],['down','Move down','M12 5v14M6 13l6 6 6-6'],['remove','Remove','M6 6l12 12M18 6 6 18']].map(([a,t,d])=>'<button type="button" data-act="'+a+'" title="'+t+'" style="width:26px;height:26px;border:none;background:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:'+(a==='remove'?'#a3322a':'#4f5751')+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"></path></svg></button>').join('')+'</div>';
const ISL='position:relative;margin:10px 0 22px;font-family:Geist,\'Noto Sans Sinhala\',sans-serif;font-size:14px;line-height:1.45;color:#18201b;font-style:normal;font-weight:400;letter-spacing:normal;text-transform:none';
const INP='width:100%;box-sizing:border-box;height:38px;padding:0 12px;border:1px solid #e0ddd4;border-radius:9px;background:#fff;outline:none;font-family:inherit;font-size:14px;color:#18201b';
const islandHtml=b=>{
  if(b.type==='image'){const src=IMGSRC[b.img];return '<figure data-island="image" data-type="image" data-img="'+esc(b.img)+'" data-size="'+esc(b.size)+'" contenteditable="false" style="'+ISL+';display:flex;flex-direction:column;gap:8px">'+CTL+'<div style="width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#f3f2ec"><image-slot id="img-'+esc(b.img)+'" shape="rect" placeholder="Drop an image, or click to browse"'+(src?' src="'+src+'"':'')+'></image-slot></div><input data-f="caption" value="'+esc(b.caption)+'" placeholder="Caption (optional)" style="'+INP+'"><input data-f="alt" value="'+esc(b.alt)+'" placeholder="Alt text: describe what the image shows" style="'+INP+'"><span style="font-size:12px;color:#6b736d;text-wrap:pretty">Alt text is required. It\u2019s read by screen readers, translated, and shown when readers hide images. Text inside the image isn\u2019t translated.</span></figure>';}
  if(b.type==='video'){const h=vHintOf(b.url);return '<div data-island="video" data-type="video" data-dur="'+esc(b.dur)+'" contenteditable="false" style="'+ISL+';display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid #e0ddd4;border-radius:12px;background:#fff">'+CTL+'<div style="display:flex;align-items:center;gap:10px"><span style="width:34px;height:34px;border-radius:50%;background:#1f3d2e;color:#fff;display:flex;align-items:center;justify-content:center;flex:none"><svg width="12" height="12" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"></path></svg></span><input data-f="url" value="'+esc(b.url)+'" placeholder="Paste a YouTube or Vimeo link" style="'+INP+';flex:1;min-width:0"></div><div style="padding-left:44px;display:flex;flex-direction:column;gap:8px"><input data-f="title" value="'+esc(b.title)+'" placeholder="Title readers will see" style="'+INP+'"><span data-f="hint" style="font-size:12.5px;color:'+h[1]+';text-wrap:pretty">'+esc(h[0])+'</span></div></div>';}
  if(b.name){const fb=fileBadge(b.name);return '<div data-island="file" data-type="file" data-name="'+esc(b.name)+'" data-size="'+esc(b.size)+'" contenteditable="false" style="'+ISL+';display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid #e0ddd4;border-radius:12px;background:#fff">'+CTL+'<span style="width:38px;height:44px;border-radius:6px;background:'+fb.badgeBg+';color:'+fb.badgeFg+';font-size:10px;font-weight:700;letter-spacing:0.04em;display:flex;align-items:flex-end;justify-content:center;padding-bottom:7px;box-sizing:border-box;flex:none">'+esc(fb.ext)+'</span><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-weight:600;font-size:14.5px;overflow-wrap:anywhere">'+esc(b.name)+'</span><span style="font-size:13px;color:#5d665f">'+esc(b.size)+'</span></span></div>';}
  return '<div data-island="file" data-type="file" data-name="" data-size="" contenteditable="false" style="'+ISL+'">'+CTL+'<label style="display:flex;align-items:center;gap:12px;padding:16px;border:1px dashed #cfccc2;border-radius:12px;background:#fbfaf6;cursor:pointer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e5e45" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17a1.7 1.7 0 0 1-2.4-2.4L15 7"></path></svg><span style="flex:1;display:flex;flex-direction:column"><span style="font-weight:600;color:#2e5e45">Choose a file</span><span data-f="ferr" style="font-size:12.5px;color:#6b736d">PDF, spreadsheet or document \u00b7 up to 20 MB</span></span><input type="file" data-f="file" accept=".pdf,.xlsx,.xls,.csv,.ods,.docx,.doc,.odt,.pptx" style="display:none"></label></div>';};
const bodyToHtml=(body,frag)=>{const bl=parseBody(body);let h=bl.map(b=>{switch(b.type){
  case 'h':return '<h2>'+esc(b.text)+'</h2>';
  case 'quote':return '<blockquote>'+(inlHtml(b.text)||'<br>')+'</blockquote>';
  case 'ul':case 'ol':return '<'+b.type+'>'+b.items.map(x=>'<li>'+(inlHtml(x)||'<br>')+'</li>').join('')+'</'+b.type+'>';
  case 'table':return '<table><tbody>'+b.rows.map((r,ri)=>'<tr>'+r.map(c=>ri?'<td>'+(esc(c)||'<br>')+'</td>':'<th>'+(esc(c)||'<br>')+'</th>').join('')+'</tr>').join('')+'</tbody></table>';
  case 'image':case 'video':case 'file':return frag?'':islandHtml(b);
  default:return '<p>'+(inlHtml(b.text)||'<br>')+'</p>';}}).join('');
  if(frag)return h;const last=bl[bl.length-1];if(!last||!TEXTY.includes(last.type))h+='<p><br></p>';return h;};
const isBold=n=>{const fw=n.style&&n.style.fontWeight;if(fw==='normal'||fw==='400')return false;return n.tagName==='B'||n.tagName==='STRONG'||/^(bold|[6-9]00)$/.test(fw||'');};
const isItal=n=>n.tagName==='I'||n.tagName==='EM'||(n.style&&n.style.fontStyle==='italic');
const inlMd=node=>{let s='';node.childNodes.forEach(n=>{if(n.nodeType===3){s+=n.data;return;}if(n.nodeType!==1)return;if(n.tagName==='BR'){s+=' ';return;}if(/^(UL|OL|TABLE|SCRIPT|STYLE)$/.test(n.tagName))return;
  const inner=inlMd(n);if(!inner.trim()){s+=inner;return;}const lead=inner.match(/^\s*/)[0],trail=inner.match(/\s*$/)[0];let core=inner.trim();const href=n.tagName==='A'&&n.getAttribute('href');
  if(href&&!/^javascript:/i.test(href))core='['+core.replace(/[\[\]]/g,'')+']('+href.replace(/[()\s]/g,c=>encodeURIComponent(c))+')';
  else{if(isBold(n))core='**'+core.replace(/\*\*/g,'')+'**';if(isItal(n))core='*'+core+'*';}
  s+=lead+core+trail;});return s.replace(/\u00a0/g,' ');};
const BLOCK_RE=/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|FIGURE|SECTION|ARTICLE|MAIN|HEADER|FOOTER|BODY|PRE)$/;
const fval=(n,f)=>{const x=n.querySelector('[data-f="'+f+'"]');return x?x.value:'';};
const walkEd=(root,out)=>{let buf='';const flush=()=>{if(buf.trim())out.push({type:'p',text:buf.trim()});buf='';};
  root.childNodes.forEach(n=>{
    if(n.nodeType===3){buf+=n.data.replace(/\u00a0/g,' ');return;}if(n.nodeType!==1)return;const t=n.tagName,ty=n.dataset&&n.dataset.type;
    if(!ty&&!BLOCK_RE.test(t)){if(t==='BR'){flush();return;}buf+=inlMd({childNodes:[n]});return;}
    flush();
    if(ty==='image')out.push({type:'image',img:n.dataset.img,caption:fval(n,'caption'),alt:fval(n,'alt'),size:n.dataset.size||''});
    else if(ty==='video')out.push({type:'video',url:fval(n,'url'),title:fval(n,'title'),dur:n.dataset.dur||''});
    else if(ty==='file')out.push({type:'file',name:n.dataset.name||'',size:n.dataset.size||''});
    else if(/^H[1-6]$/.test(t)){const x=n.textContent.replace(/\u00a0/g,' ').trim();if(x)out.push({type:'h',text:x});}
    else if(t==='UL'||t==='OL')out.push({type:t==='UL'?'ul':'ol',items:[...n.querySelectorAll('li')].map(li=>inlMd(li).trim())});
    else if(t==='BLOCKQUOTE')out.push({type:'quote',text:inlMd(n).trim()});
    else if(t==='TABLE'){const rows=[...n.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>c.textContent.replace(/\u00a0/g,' ').trim()));if(rows.length)out.push({type:'table',rows});}
    else if([...n.children].some(c=>BLOCK_RE.test(c.tagName)||(c.dataset&&c.dataset.type)))walkEd(n,out);
    else out.push({type:'p',text:inlMd(n).trim()});});
  flush();return out;};
const serializeEd=root=>toBody(walkEd(root,[]));
const SLASH=[['p','Text','Plain paragraph','paragraph text','Aa','Geist'],['h','Heading','Section heading','heading title h2 section','H','Geist'],['ul','Bulleted list','Simple list','bullet list unordered','\u2022','Geist'],['ol','Numbered list','Ordered steps','numbered list ordered','1.','Geist'],['quote','Quote','Quoted text','quote blockquote','\u201c','Newsreader'],['table','Table','Rows and columns','table grid'],['image','Image','Upload or drop a picture','image photo picture'],['video','Video','YouTube or Vimeo link','video youtube vimeo'],['file','File','PDF, spreadsheet or document','file attachment pdf document']];
const KW={health:['hospital','clinic','health','patient','doctor','nurse','medical','maternity','telemedicine'],finance:['cost','budget','fund','million','loan','tax','procurement','spending','contract','lease','saving'],law:['court','legal','law ','justice','lawyer','legislation','redaction','dispute'],it:['digital','online','data','register','software','telemedicine','video','internet','kiosk','searchable'],tourism:['visitor','tourism','heritage','trail','tourist'],transport:['road','bus','route','transit','transport','travel','parking','shuttle'],env:['air quality','electric','emission','climate','waste','energy','environment','diesel'],edu:['school','student','education','teacher','training'],agri:['farm','produce','agricultur','crop']};
const detectScores=(e,prev,streams)=>{const t=(' '+[e.title,e.summary,e.body].join(' ')+' ').toLowerCase();const out={};
  streams.filter(st=>st.active).forEach(st=>{const kws=KW[st.id]||st.name.toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3);let hits=0;kws.forEach(k=>{hits+=t.split(k).length-1;});
    if(hits>=2)out[st.id]=prev&&prev[st.id]!=null?prev[st.id]:Math.min(9,Math.max(3,Math.round(2+hits*0.8)));});
  return out;};
const listJoin=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
const ruleNote=ch=>{const add=[],rem=[],sec=[],other=[];let text=false;const art=w=>/^\d/.test(w)?w:(/^[aeiou]/.test(w)?'an ':'a ')+w;
  ch.forEach(c=>{const l=c.label;if(/ added$/.test(l))add.push(art(l.replace(/ added$/,'').toLowerCase()));else if(/ removed$/.test(l))rem.push(art(l.replace(/ removed$/,'').toLowerCase()));else if(l.startsWith('New section: '))sec.push(l.slice(13).toLowerCase());else if(l==='Table changed')other.push('updated a table');else if(l==='Title changed')other.push('reworded the title');else if(l==='Summary changed')other.push('rewrote the summary');else if(l.startsWith('Text edited'))text=true;});
  const parts=[];if(sec.length)parts.push('added '+(sec.length===1?'a section on ':'sections on ')+listJoin(sec));if(add.length)parts.push((sec.length?'':'added ')+listJoin(add));if(rem.length)parts.push('removed '+listJoin(rem));parts.push(...other);if(!parts.length&&text)parts.push('edited the text');
  const r=parts.join('; ');return r.charAt(0).toUpperCase()+r.slice(1);};
const plainBody=body=>txTexts(body).map(t=>t.replace(/\*\*|\*/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')).join('\n');
const fallbackSummary=(title,body)=>{const p=parseBody(body).find(b=>b.type==='p'&&b.text.trim());const t=p?p.text.replace(/\*\*|\*/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1'):title;const ss=(t.match(/[^.!?]+[.!?]+/g)||[t]).slice(0,2).join(' ').trim();return ss.length>240?ss.slice(0,237).trim()+'…':ss;};
const changesOf=(a,b)=>[...(a.title!==b.title?[{label:'Title changed'}]:[]),...(a.summary!==b.summary?[{label:'Summary changed'}]:[]),...diffBodies(a.body,b.body)];
const teamOf=p=>p.team||tm(p.author,[]);
const isMem=p=>teamOf(p).members.some(m=>m.id===ME);
const fnm=id=>PEOPLE[id].name.split(' ')[0];
const verBy=(x,p)=>PEOPLE[x.by||p.author].name+(x.with&&x.with.length?' with '+listJoin(x.with.map(fnm)):'');
const CR_ST={open:{label:'Open',bg:'#e4ecf3',fg:'#2c5272'},merged:{label:'Merged',bg:'#e2ebe4',fg:'#234a36'},returned:{label:'Sent back',bg:'#f6ecd6',fg:'#7a5410'},closed:{label:'Closed',bg:'#ecebe4',fg:'#3a423c'},withdrawn:{label:'Withdrawn',bg:'#ecebe4',fg:'#3a423c'}};
