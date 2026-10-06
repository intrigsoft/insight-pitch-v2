// Insight Pitch — three-way paragraph merge and word diff for change requests. Loaded as a classic <script> in <head>; top-level names are shared globals.
const splitB=b=>(b||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
const docB=d=>['@@title '+(d.title||''),'@@summary '+(d.summary||''),...splitB(d.body)];
const fromB=(arr,fb)=>{const t=arr.find(x=>x.startsWith('@@title '));const sm=arr.find(x=>x.startsWith('@@summary '));return{title:t?t.slice(8):fb.title,summary:sm?sm.slice(10):fb.summary,body:arr.filter(x=>!x.startsWith('@@')).join('\n\n')};};
const lcsTable=(a,b)=>{const n=a.length,m=b.length;const dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);return dp;};
const lcsMap=(a,b)=>{const dp=lcsTable(a,b);const map=new Array(a.length).fill(-1);let i=0,j=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){map[i]=j;i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}return map;};
const merge3=(B,O,T)=>{const mo=lcsMap(B,O),mt=lcsMap(B,T);const out=[];let bi=0,oi=0,ti=0;const eq=(x,y)=>x.length===y.length&&x.every((v2,i)=>v2===y[i]);
  for(let i=0;i<=B.length;i++){const end=i===B.length;if(!end&&!(mo[i]>=0&&mt[i]>=0))continue;const oj=end?O.length:mo[i],tj=end?T.length:mt[i];const b=B.slice(bi,i),o=O.slice(oi,oj),t=T.slice(ti,tj);
    if(b.length||o.length||t.length){const kind=eq(o,b)&&eq(t,b)?'same':eq(o,b)?'theirs':(eq(t,b)||eq(o,t))?'ours':'conflict';out.push({kind,base:b,ours:o,theirs:t});}
    if(!end)out.push({kind:'same',base:[B[i]],ours:[O[oj]],theirs:[T[tj]]});bi=i+1;oi=oj+1;ti=tj+1;}
  return out;};
const wdiff=(a,b)=>{const A=a.split(/(\s+)/).filter(x=>x!==''),Bw=b.split(/(\s+)/).filter(x=>x!=='');if(A.length*Bw.length>60000)return[{t:a,k:'del'},{t:'\n'+b,k:'add'}];const dp=lcsTable(A,Bw);const out=[];const push=(t,k)=>{const l=out[out.length-1];if(l&&l.k===k)l.t+=t;else out.push({t,k});};let i=0,j=0;
  while(i<A.length&&j<Bw.length){if(A[i]===Bw[j]){push(A[i],'same');i++;j++;}else if(dp[i+1][j]>=dp[i][j+1]){push(A[i],'del');i++;}else{push(Bw[j],'add');j++;}}while(i<A.length)push(A[i++],'del');while(j<Bw.length)push(Bw[j++],'add');return out;};
const SEG={same:{bg:'transparent',color:'inherit',deco:'none'},del:{bg:'#f6dcd7',color:'#7a2f28',deco:'line-through'},add:{bg:'#d5e6da',color:'#173a28',deco:'none'}};
const segsOf=parts=>parts.map(x=>({text:x.t,...SEG[x.k]}));
const simW=(a,b)=>{const w=s=>new Set(s.toLowerCase().split(/\W+/).filter(Boolean));const A=w(a),Bs=w(b);let c=0;A.forEach(x=>{if(Bs.has(x))c++;});return c/Math.max(1,A.size,Bs.size);};
const plainMd=t=>(t||'').replace(/\*\*|\*/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
const dispB=raw=>{if(raw.startsWith('@@title '))return{meta:'Title',text:raw.slice(8)};if(raw.startsWith('@@summary '))return{meta:'Summary',text:raw.slice(10)};const b=parseBody(raw)[0]||{type:'p',text:raw};
  if(b.type==='h')return{isH:true,text:b.text};if(b.type==='ul'||b.type==='ol')return{text:b.items.map((x,i)=>(b.type==='ul'?'• ':(i+1)+'. ')+plainMd(x)).join('\n')};if(b.type==='table')return{text:b.rows.map(r=>r.join('  ·  ')).join('\n')};
  if(b.type==='image')return{text:'Image: '+(b.caption||b.alt)};if(b.type==='video')return{text:'Video: '+(b.title||b.url)};if(b.type==='file')return{text:'Attachment: '+b.name};return{text:plainMd(b.text)};};
const hunkLabel=(b,t)=>{const m=[...b,...t].find(x=>x.startsWith('@@'));if(m)return m.startsWith('@@title')?'Title':'Summary';const pl=n=>n===1?'paragraph':n+' paragraphs';if(!b.length)return t.some(x=>x.startsWith('## '))?'New section':'Added '+pl(t.length);if(!t.length)return 'Removed '+pl(b.length);return t.length>b.length?'Edited and added text':'Edited '+pl(b.length);};
const hunkRows=(b,t)=>{const rows=[];let j=0;const row=(x,k)=>{const d=dispB(x);const add=k==='add';return{marker:add?'+':'−',markColor:add?'#2e5e45':'#a3322a',bg:add?'#f1f6f2':'#fbf3f1',isH:!!d.isH,isText:!d.isH,hasLabel:!!d.meta,label:d.meta||'',text:d.text,segs:[{text:d.text,bg:'transparent',color:add?'#173a28':'#7a2f28',deco:'none'}]};};
  b.forEach(x=>{const dx=dispB(x);let k=-1;if(!dx.isH)for(let q=j;q<t.length;q++){const dq=dispB(t[q]);if(!dq.isH&&(dq.meta||'')===(dx.meta||'')&&simW(dx.text,dq.text)>=0.4){k=q;break;}}
    if(k<0){rows.push(row(x,'del'));return;}for(;j<k;j++)rows.push(row(t[j],'add'));const dq=dispB(t[k]);
    rows.push({marker:'±',markColor:'#6b736d',bg:'transparent',isH:false,isText:true,hasLabel:!!dx.meta,label:dx.meta||'',text:dq.text,segs:segsOf(wdiff(dx.text,dq.text))});j=k+1;});
  for(;j<t.length;j++)rows.push(row(t[j],'add'));return rows;};
