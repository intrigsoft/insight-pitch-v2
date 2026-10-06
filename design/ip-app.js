// Insight Pitch — component logic (state, methods, renderVals). the .dc.html declares `class Component extends makeIPApp(DCLogic) {}`. Loaded as a classic <script> in <head>; top-level names are shared globals.
const makeIPApp=Base=>class IPApp extends Base {
  state={screen:'login',email:'maya.chen@insight.gov',password:'insight2026',loginError:'',proposals:SEED,streams:STREAMS,
    settings:{scale:'10',scoredBy:'both',requireStream:true,showPublic:true},settingsTab:'streams',streamDraft:null,
    query:'',tab:'all',stream:null,sort:'recent',currentId:null,viewV:null,scoreEdit:null,newComment:'',replyTo:null,replyText:'',expanded:{},cSort:'relevant',cTab:'discussion',check:null,checking:false,replyCheck:null,highlight:null,revealed:{},flagMenu:null,edit:null,toast:'',menuOpen:false,
    langs:LANGS,lang:'en',langMenu:false,txCfg:{source:'en',onPublish:true,comments:true,label:true},glossary:['Insight Pitch'],glossInput:'',addLang:'',tx:loadTx(),fresh:{},reviewed:{},txBusy:0,txFailed:false,showOriginal:false,txDiscussion:false,propLang:{},cLang:{},txMenu:null,teamDlg:null,askDlg:null,crDlg:null,review:null,profileId:ME,profileTab:'proposals',profileEdit:null,followPeople:{},strengthsPublic:{priya:true,daniel:true,tomas:true,sam:true,jun:true},sel:null,link:null,slash:null,saveDlg:null,shownImgs:{},textOnly:(()=>{try{return localStorage.getItem('ip-text-only')==='1';}catch(e){return false;}})()};
  componentDidMount(){
    document.addEventListener('selectionchange',this.onSel);
    const s=this.props.startScreen;
    if(s==='list')this.setState({screen:'list'});
    if(s==='view')this.setState({screen:'view',currentId:'p1'});
    if(s==='edit')this.editProposal('p5');
    if(s==='settings')this.setState({screen:'settings'});
    if(s==='languages')this.setState({screen:'settings',settingsTab:'languages'});
    if(s==='profile')this.setState({screen:'profile',profileId:'priya'});
    if(s==='team'){this.setState({screen:'view',currentId:'p5'});this.openTeam('p5');}
    if(s==='review')this.setState({screen:'review',review:{pid:'p5',crId:'cr2',dec:{},edits:{}}});
  }
  componentDidUpdate(){this.autoTx();this.loadEd();}
  componentWillUnmount(){document.removeEventListener('selectionchange',this.onSel);}
  go(o){this.setState({menuOpen:false,langMenu:false,txMenu:null,scoreEdit:null,teamDlg:null,askDlg:null,crDlg:null,...o});window.scrollTo(0,0);}
  flash(t){this.setState({toast:t});clearTimeout(this._t);this._t=setTimeout(()=>this.setState({toast:''}),2400);}
  upd(id,fn){this.setState(s=>({proposals:s.proposals.map(p=>p.id===id?fn(p):p)}));}
  fmt(n){const sc=this.state.settings.scale;return sc==='5'?Math.max(1,Math.round(n/2)):sc==='100'?n*10:n;}
  suffix(){return '/'+this.state.settings.scale;}
  stream(id){return this.state.streams.find(x=>x.id===id);}
  login(){const{email,password}=this.state;if(!/.+@.+\..+/.test(email))return this.setState({loginError:'Enter a valid email address.'});if(!password)return this.setState({loginError:'Enter your password.'});this.go({screen:'list',loginError:''});}
  open(id){this.go({screen:'view',currentId:id,viewV:null,replyTo:null,newComment:'',cTab:'discussion',check:null,replyText:'',replyCheck:null,flagMenu:null});}
  newProposal(){this.go({screen:'edit',edit:{id:null,title:'',summary:'',body:'',key:Date.now(),scores:{},note:'',error:'',saved:null}});}
  editProposal(id){const p=this.state.proposals.find(x=>x.id===id);const src=p.draft||latest(p);this.go({screen:'edit',edit:{id,title:src.title,summary:src.summary,body:src.body,key:Date.now(),scores:{...p.scores},note:(p.draft&&p.draft.note)||'',error:'',saved:p.draft?p.draft.saved:null}});}
  setEdit(o){this.setState(s=>({edit:{...s.edit,...o}}));}
  field(k){return e=>{const val=e.target.value;this.setEdit({[k]:val,error:''});};}
  saveDraft(note){
    const e=this.flushEd();if(note!=null)e.note=note;if(!e.title.trim())return this.setEdit({error:'Add a title before saving a draft.'});
    const prevS=e.scores||{};e.scores=detectScores(e,prevS,this.state.streams);this.setEdit({scores:e.scores});
    const d={title:e.title.trim(),summary:e.summary.trim(),body:e.body,note:(e.note||'').trim(),saved:'just now'};
    if(!e.id){const id='p'+Date.now();this.setState(s=>({proposals:[{id,author:ME,scores:e.scores,ts:Date.now(),updated:'Just now',versions:[],comments:[],draft:d,following:false,team:tm(ME,[]),changeRequests:[]},...s.proposals],edit:{...s.edit,id,saved:'just now'}}));}
    else{this.upd(e.id,p=>({...p,draft:{...d,contributors:(p.draft&&p.draft.contributors)||[]},scores:e.scores,ts:Date.now(),updated:'Just now'}));this.setEdit({saved:'just now'});}
    const sk=o=>Object.keys(o).sort().join();this.flash(sk(prevS)!==sk(e.scores)?'Draft saved · streams updated':'Draft saved');
  }
  publish(){
    if(this.state.edit&&this.state.edit.cr)return this.openCrSubmit();
    const e=this.flushEd();if(e&&!e.summary.trim()&&e.title.trim()&&plainBody(e.body).trim().length>=40){this.genSummary().then(()=>this.publish());return;}e.scores=detectScores(e,e.scores||{},this.state.streams);const p=e.id&&this.state.proposals.find(x=>x.id===e.id);
    if(!e.title.trim()||!e.summary.trim()||!e.body.trim())return this.setEdit({error:'A title, summary and body are required to publish.'});
    if(parseBody(e.body).some(b=>b.type==='image'&&!b.alt.trim())){if(this._ed)this._ed.querySelectorAll('[data-type=image] [data-f=alt]').forEach(i=>{if(!i.value.trim())i.style.borderColor='#d9a9a2';});return this.setEdit({error:'Add alt text to every image before publishing.'});}
    if(parseBody(e.body).some(b=>b.type==='video'&&b.url.trim()&&!VIDEO_RE.test(b.url.trim())))return this.setEdit({error:'Video links must be from YouTube or Vimeo.'});
    if(this.state.settings.requireStream&&!Object.keys(e.scores).length)return this.setEdit({error:'This proposal couldn\u2019t be linked to a stream yet. Add more detail about what it affects, then try again.'});
    const isUpd=p&&p.versions.length>0;let note=e.note.trim();if(isUpd&&!note){const ch=changesOf(latest(p),{title:e.title.trim(),summary:e.summary.trim(),body:e.body});if(!ch.length)return this.setEdit({error:'Nothing has changed since v'+latest(p).v+'.'});note=ruleNote(ch);}
    const n=(p?p.versions.length:0)+1;const ver=v(n,'Oct 5',note||'Initial version',e.title.trim(),e.summary.trim(),e.body);ver.by=ME;ver.with=(p&&p.draft&&p.draft.contributors)||[];
    if(!p){const id='p'+Date.now();this.setState(s=>({proposals:[{id,author:ME,scores:e.scores,ts:Date.now(),updated:'Just now',versions:[ver],comments:[],draft:null,following:false,team:tm(ME,[]),changeRequests:[]},...s.proposals]}));this.go({screen:'view',currentId:id,viewV:null,edit:null});}
    else{this.upd(p.id,q=>({...q,scores:e.scores,versions:[...q.versions,ver],draft:null,ts:Date.now(),updated:'Just now'}));this.go({screen:'view',currentId:p.id,viewV:null,edit:null});}
    const tl=this.txTargets();
    if(this.state.txCfg.onPublish&&tl.length){const texts=[ver.title,ver.summary,...txTexts(ver.body)];(async()=>{for(const l of tl)await this.translate(l.code,texts);})();this.flash('Published v'+n+' · translating into '+tl.length+(tl.length===1?' language':' languages'));}
    else this.flash('Published v'+n);
  }
  updC(pid,cid,rid,fn){this.upd(pid,p=>({...p,comments:p.comments.map(c=>{if(c.id!==cid)return c;if(!rid)return fn(c);return{...c,replies:c.replies.map(r=>r.id!==rid?r:fn(r))};})}));}
  like(pid,cid,rid){this.updC(pid,cid,rid,x=>({...x,liked:!x.liked,likes:x.likes+(x.liked?-1:1)}));}
  userFlag(pid,cid,rid,reason){this.updC(pid,cid,rid,x=>({...x,userFlag:reason}));this.setState({flagMenu:null});this.flash(reason?'Flagged. A moderator will review it.':'Flag removed');}
  postComment(){const s=this.state;const t=s.newComment.trim();if(!t||s.checking)return;const p0=s.proposals.find(x=>x.id===s.currentId);
    if(s.check&&s.check.text===t)return this.commitComment(p0,t,s.check.j);
    this.setState({checking:true});clearTimeout(this._ck);this._ck=setTimeout(()=>{const j=jevFull(t,p0);if(j.flag||j.cat==='offtopic')return this.setState({checking:false,check:{text:t,j}});this.setState({checking:false});this.commitComment(p0,t,j);},700);}
  commitComment(p0,t,j){const id=nid();const kind=j.flag?null:{question:'clarification',concern:'concern',suggestion:'suggestion'}[j.cat];
    this.upd(p0.id,p=>({...p,comments:[{id,author:ME,text:t,time:'Just now',age:0,likes:0,liked:false,userFlag:null,jev:j,replies:[]},...p.comments],insights:kind?[...(p.insights||[]),{id:nid(),kind,text:t.length>110?t.slice(0,107)+'…':t,votes:0,voted:false,src:[{cid:id}]}]:(p.insights||[])}));
    this.setState({newComment:'',check:null});this.flash(j.flag?'Submitted for review. Only you can see it for now.':'Comment posted');}
  submitReply(cid){const s=this.state;const t=s.replyText.trim();if(!t)return;const f=jevFlag(t);if(f.flag&&s.replyCheck!==t)return this.setState({replyCheck:t});
    this.upd(s.currentId,p=>({...p,comments:p.comments.map(c=>c.id!==cid?c:{...c,replies:[...c.replies,{id:nid(),author:ME,text:t,time:'Just now',age:0,likes:0,liked:false,userFlag:null,jev:{flag:f.flag}}]})}));
    this.setState(x=>({replyTo:null,replyText:'',replyCheck:null,expanded:{...x.expanded,[cid]:true}}));if(f.flag)this.flash('Reply held for moderator review');}
  jump(src){const key=src.rid||src.cid;this.setState(s=>({cTab:'discussion',expanded:{...s.expanded,[src.cid]:true},highlight:key}));
    setTimeout(()=>{const el=document.getElementById('cmt-'+key);if(el)window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-120,behavior:'smooth'});},80);
    clearTimeout(this._hl);this._hl=setTimeout(()=>this.setState({highlight:null}),2600);}
  markAnswered(pid,iid,on){this.upd(pid,p=>({...p,insights:p.insights.map(i=>i.id!==iid?i:{...i,answered:on})}));this.flash(on?'Marked as answered':'Marked as unanswered');}
  vote(pid,iid){this.upd(pid,p=>({...p,insights:p.insights.map(i=>i.id!==iid?i:{...i,voted:!i.voted,votes:i.votes+(i.voted?-1:1)})}));}
  relView(rel,topic){const lv=rel>=70?3:rel>=35?2:1;const fill=lv===1?'#b07a1f':'#2e5e45';return{bars:[1,2,3].map(i=>({h:(3+i*3)+'px',bg:i<=lv?fill:'#d6d3c9'})),relLabel:(lv===3?'High relevance':lv===2?'Relevant':'Low relevance')+(topic&&lv>1?' · '+topic:''),relTitle:(lv===3?'High':lv===2?'Medium':'Low')+' relevance to the proposal'+(topic?' · mainly about '+topic:''),relShort:rel+'% relevant',relColor:lv===1?'#7a5410':'#5d665f'};}
  gov(x,pid,cid,rid){const s=this.state;const f=x.jev&&x.jev.flag;const mine=x.author===ME;const rev=!!s.revealed[x.id];const open=!f||mine||rev;
    return{isHidden:!open,isShown:open,hasFlagNote:!!f&&open,flagLabel:f||'',flagNote:f?(mine?'Pending review · only you can see this':'Flagged · '+f+' · under review'):'',bubbleBg:f&&open?'#fbf3f1':'#ecebe4',bubbleBorder:f&&open?'#ebc9c3':'transparent',
      onReveal:()=>this.setState({revealed:{...s.revealed,[x.id]:true}}),
      flagBtn:x.userFlag?'Flagged':'Flag',flagColor:x.userFlag?'#a3322a':'#5d665f',onFlag:()=>x.userFlag?this.userFlag(pid,cid,rid,null):this.setState({flagMenu:s.flagMenu===x.id?null:x.id}),
      showFlagMenu:s.flagMenu===x.id,flagReasons:REASONS.map(r=>({label:r,onClick:()=>this.userFlag(pid,cid,rid,r)})),onFlagCancel:()=>this.setState({flagMenu:null})};}
  av(a){return a===ME?{avBg:'#1f3d2e',avColor:'#f1efe6'}:{avBg:'#e2ebe4',avColor:'#234a36'};}
  splitMention(text){const m=Object.values(PEOPLE).map(p=>'@'+p.name).find(n=>text.startsWith(n));return m?{hasMention:true,mention:m,body:text.slice(m.length).trim()}:{hasMention:false,mention:'',body:text};}
  scoreItems(scores,set){
    return this.state.streams.filter(st=>st.active||scores[st.id]!=null).map(st=>{const on=scores[st.id]!=null;return{name:st.name,color:st.color,on,value:on?scores[st.id]:5,label:on?this.fmt(scores[st.id])+this.suffix():'',
      chipBg:on?'#eef3ee':'#fff',chipBorder:on?'#2e5e45':'#e0ddd4',chipWeight:on?600:400,
      onToggle:()=>{const n={...scores};if(on)delete n[st.id];else n[st.id]=5;set(n);},onInput:e=>set({...scores,[st.id]:+e.target.value})};});
  }
  sortedScores(p){return Object.entries(p.scores).map(([id,n])=>({st:this.stream(id),n})).filter(x=>x.st).sort((a,b)=>b.n-a.n);}
  // settings
  openStream(id){const st=id&&this.stream(id);this.setState({streamDraft:st?{...st,related:[...st.related],error:''}:{id:null,name:'',desc:'',color:COLORS[0],active:true,related:[],error:''}});}
  setSD(o){this.setState(s=>({streamDraft:{...s.streamDraft,...o}}));}
  saveStream(){
    const d=this.state.streamDraft;const name=d.name.trim();if(!name)return this.setSD({error:'Give the stream a name.'});
    if(this.state.streams.some(x=>x.id!==d.id&&x.name.toLowerCase()===name.toLowerCase()))return this.setSD({error:'A stream with this name already exists.'});
    const id=d.id||name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now().toString(36);
    const rec={id,name,desc:d.desc.trim(),color:d.color,active:d.active,related:d.related};
    this.setState(s=>{let list=d.id?s.streams.map(x=>x.id===id?rec:x):[...s.streams,rec];
      list=list.map(x=>{if(x.id===id)return x;const want=rec.related.includes(x.id);const has=x.related.includes(id);if(want&&!has)return{...x,related:[...x.related,id]};if(!want&&has)return{...x,related:x.related.filter(r=>r!==id)};return x;});
      return{streams:list,streamDraft:null};});
    this.flash(d.id?'Stream updated':'Stream added');
  }
  deleteStream(){const id=this.state.streamDraft.id;this.setState(s=>({streams:s.streams.filter(x=>x.id!==id).map(x=>({...x,related:x.related.filter(r=>r!==id)})),streamDraft:null}));this.flash('Stream deleted');}
  setSetting(o){this.setState(s=>({settings:{...s.settings,...o}}));}
  link(a,b){this.setState(s=>({streams:s.streams.map(x=>x.id===a&&!x.related.includes(b)?{...x,related:[...x.related,b]}:x.id===b&&!x.related.includes(a)?{...x,related:[...x.related,a]}:x)}));this.flash('Streams linked');}

  async noteText(L,cur,ch){let note=ruleNote(ch);
    try{if(window.claude&&window.claude.complete){const out=await window.claude.complete({max_tokens:200,
      system:'You write version descriptions for a public consultation platform where officials and citizens publish government proposals. A description works like a commit message: one short line, at most 12 words, past tense, sentence case, no full stop. Examples: "Added cost and funding sources", "Split construction into two phases; added access road plan", "Lowered threshold to 1 million; added redaction rules". Describe the substance of what changed, not formatting. Mention new images, tables, videos or files only when they carry content. Reply with the description only.',
      messages:[{role:'user',content:JSON.stringify({previousVersion:{title:L.title,summary:L.summary,body:L.body.slice(0,4000)},newVersion:{title:cur.title,summary:cur.summary,body:cur.body.slice(0,4000)},detectedChanges:ch.map(c=>c.label)})}]});
      const t=String(out||'').trim().split('\n')[0].replace(/^["'\u201c]+|["'\u201d.]+$/g,'').trim();if(t&&t.length<=140)note=t;}}catch(err){console.warn('description',err);}
    return note;}
  async genSummary(){const e=this.flushEd();if(!e)return;const body=plainBody(e.body);if(body.trim().length<40)return this.flash('Write a bit more of the proposal first');
    const key=e.key,sig=hsh(e.body);this.setEdit({sumBusy:true});let out=fallbackSummary(e.title,e.body);
    try{if(window.claude&&window.claude.complete){const r=await window.claude.complete({max_tokens:220,
      system:'You write the summary line for proposals on a public consultation platform where officials and citizens publish government proposals. Write one or two plain sentences, at most 40 words, that state what is proposed and the main reason or benefit. Keep key numbers exactly as written. Neutral, factual register; no hype, no "This proposal". Write in the same language as the proposal. Reply with the summary only.',
      messages:[{role:'user',content:JSON.stringify({title:e.title.trim(),body:body.slice(0,6000)})}]});
      const t=String(r||'').trim().replace(/^["\u201c]+|["\u201d]+$/g,'').trim();if(t&&t.length<=400)out=t;}}catch(err){console.warn('summary',err);}
    const ed=this.state.edit;if(!ed||ed.key!==key)return;this.setEdit({summary:out,sumAuto:true,sumFor:sig,sumBusy:false,error:''});}
  openSave(){const e=this.flushEd();if(!e)return;if(!e.title.trim())return this.setEdit({error:'Add a title before saving a draft.'});
    if(!e.summary.trim()&&plainBody(e.body).trim().length>=40&&!e.sumBusy)this.genSummary();
    const ep=e.id&&this.state.proposals.find(x=>x.id===e.id);const L=ep&&latest(ep);const cur={title:e.title.trim(),summary:e.summary.trim(),body:e.body};const ch=L?changesOf(L,cur):[];
    const sig=hsh(cur.title+'|'+cur.summary+'|'+cur.body);const keep=(e.note||'').trim()&&(e.noteAuto===false||e.noteFor===sig);
    const note=!L?((e.note||'').trim()||'Initial version'):keep?e.note:'';const busy=!!L&&!keep&&ch.length>0;
    this.setState({saveDlg:{note,busy,edited:e.noteAuto===false&&!!keep,ch,sig,isNew:!L,lv:L?L.v:0,n:(ep?ep.versions.length:0)+1}});
    if(busy)this.fillNote(L,cur,ch,sig);}
  async fillNote(L,cur,ch,sig){this.setState(x=>x.saveDlg?{saveDlg:{...x.saveDlg,busy:true}}:null);const t=await this.noteText(L,cur,ch);
    this.setState(x=>x.saveDlg&&x.saveDlg.sig===sig&&!x.saveDlg.edited?{saveDlg:{...x.saveDlg,note:t,busy:false}}:(x.saveDlg?{saveDlg:{...x.saveDlg,busy:false}}:null));}
  confirmSave(){const d=this.state.saveDlg;if(!d||d.busy)return;this.setState({saveDlg:null});this.setEdit({note:d.note.trim(),noteAuto:!d.edited,noteFor:d.sig});this.saveDraft(d.note.trim());}
  // WYSIWYG editor
  edRef=el=>{if(!el){this._ed=null;return;}if(el===this._ed)return;this._ed=el;this._edKey=null;
    el.setAttribute('contenteditable','true');el.setAttribute('role','textbox');el.setAttribute('aria-multiline','true');el.setAttribute('aria-label','Proposal body');el.setAttribute('spellcheck','true');
    el.addEventListener('focus',()=>{try{document.execCommand('defaultParagraphSeparator',false,'p');}catch(e){}});
    el.addEventListener('input',e=>this.edInput(e));el.addEventListener('keydown',e=>this.edKey(e));el.addEventListener('paste',e=>this.edPaste(e));
    el.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')&&!e.target.closest('image-slot'))e.preventDefault();});
    el.addEventListener('drop',e=>this.edDrop(e));el.addEventListener('click',e=>this.edClick(e));el.addEventListener('change',e=>this.edChange(e));
    this.loadEd();};
  loadEd(){const e=this.state.edit;if(!this._ed||!e||this._edKey===e.key)return;this._edKey=e.key;this._ed.innerHTML=bodyToHtml(e.body);this.ensureTail();}
  ensureTail(){const ed=this._ed;if(!ed)return;if(!ed.firstElementChild&&!ed.textContent.trim()){ed.innerHTML='<p><br></p>';return;}const last=ed.lastElementChild;if(!last||last.hasAttribute('data-island')||last.tagName==='TABLE')ed.insertAdjacentHTML('beforeend','<p><br></p>');}
  sync(){clearTimeout(this._syncT);this._syncT=setTimeout(()=>this.flushEd(),120);}
  flushEd(){const e=this.state.edit;if(!e||!this._ed)return e;const body=serializeEd(this._ed);if(body!==e.body)this.setState(s=>({edit:{...s.edit,body,error:''}}));return{...e,body};}
  topBlock(n){const ed=this._ed;while(n&&n.parentNode!==ed)n=n.parentNode;return n&&n.parentNode===ed?n:null;}
  curNode(){const sel=document.getSelection();if(!sel||!sel.rangeCount||!this._ed)return null;const r=sel.getRangeAt(0);if(!this._ed.contains(r.startContainer))return null;return r.startContainer.nodeType===3?r.startContainer.parentNode:r.startContainer;}
  restore(){const ed=this._ed;if(!ed)return;if(document.activeElement!==ed)ed.focus({preventScroll:true});const r=this._lastRange;if(r&&ed.contains(r.startContainer)){const s=document.getSelection();s.removeAllRanges();s.addRange(r);}}
  caretIn(el,start){if(!el)return;const r=document.createRange();r.selectNodeContents(el);r.collapse(!!start);const s=document.getSelection();s.removeAllRanges();s.addRange(r);this._lastRange=r.cloneRange();}
  blockType(n){return n.closest('h1,h2,h3')?'h':n.closest('blockquote')?'quote':n.closest('ul')?'ul':n.closest('ol')?'ol':'p';}
  exec(c,v){this.restore();document.execCommand(c,false,v);this.sync();this.onSel();}
  retag(top,tag){let el=top;if(top.nodeType===3){el=document.createElement('p');top.replaceWith(el);el.appendChild(top);}if(el.tagName===tag)return el;const n=document.createElement(tag);while(el.firstChild)n.appendChild(el.firstChild);if(!n.firstChild)n.innerHTML='<br>';el.replaceWith(n);this.caretIn(n);return n;}
  fixLists(){this._ed.querySelectorAll('p > ul, p > ol, h2 > ul, h2 > ol').forEach(l=>{const p=l.parentNode;p.after(l);if(!p.textContent.trim())p.remove();});}
  setBlock(t){this.restore();let n=this.curNode();if(!n)return;let top=this.topBlock(n);if(!top||(top.nodeType===1&&(top.hasAttribute('data-island')||top.tagName==='TABLE')))return;const cur=this.blockType(n);
    if(t==='ul'||t==='ol'){if(cur==='h'||cur==='quote')top=this.retag(top,'P');document.execCommand(t==='ul'?'insertUnorderedList':'insertOrderedList');this.fixLists();this.sync();this.onSel();return;}
    if(cur==='ul'||cur==='ol'){document.execCommand(cur==='ul'?'insertUnorderedList':'insertOrderedList');n=this.curNode();top=n&&this.topBlock(n);if(!top)return;}
    const to=cur===t?'p':t;this.retag(top,to==='h'?'H2':to==='quote'?'BLOCKQUOTE':'P');this.sync();this.onSel();}
  onSel=()=>{const ed=this._ed;if(!ed||this.state.screen!=='edit')return;const sel=document.getSelection();if(!sel||!sel.rangeCount)return;const r=sel.getRangeAt(0);const st0=this.state.sel;
    const inEd=ed.contains(r.commonAncestorContainer)&&(document.activeElement===ed);
    if(!inEd){if(st0&&st0.bub&&!this.state.link)this.setState({sel:{...st0,bub:null}});if(this.state.slash&&document.activeElement!==ed)this.setState({slash:null});return;}
    if(this.state.link)this.setState({link:null});
    this._lastRange=r.cloneRange();const n=r.startContainer.nodeType===3?r.startContainer.parentNode:r.startContainer;const top=this.topBlock(n);
    if(this._cur&&this._cur!==top&&this._cur.removeAttribute)this._cur.removeAttribute('data-cur');if(top&&top.tagName==='P'){top.setAttribute('data-cur','');this._cur=top;}
    if(this.state.slash&&top!==this._slashBlock)this.setState({slash:null});
    const a=n.closest('a');const w=ed.parentNode.getBoundingClientRect();let bub=null;
    if(!r.collapsed&&r.toString().trim()&&!n.closest('[data-island]')&&!n.closest('td,th')){const rc=r.getBoundingClientRect();bub={x:Math.round(Math.max(120,Math.min(w.width-120,rc.left+rc.width/2-w.left))),y:Math.round(rc.top-w.top),mode:'fmt'};}
    else if(a&&r.collapsed){const rc=a.getBoundingClientRect();bub={x:Math.round(Math.max(150,Math.min(w.width-150,rc.left+rc.width/2-w.left))),y:Math.round(rc.bottom-w.top),mode:'link',href:a.getAttribute('href')};}
    let b=false,i=false;try{b=document.queryCommandState('bold');i=document.queryCommandState('italic');}catch(e){}
    const st={bt:this.blockType(n),b,i,a:!!a,tbl:!!n.closest('td,th'),bub};
    if(JSON.stringify(st)!==JSON.stringify(st0))this.setState({sel:st});};
  edInput(e){const t=e.target;
    if(t!==this._ed&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA')){if(t.dataset.f==='url'){const isl=t.closest('[data-island]');const h=vHintOf(t.value);const hn=isl&&isl.querySelector('[data-f=hint]');if(hn){hn.textContent=h[0];hn.style.color=h[1];}}if(t.dataset.f==='alt'&&t.value.trim())t.style.borderColor='#e0ddd4';this.sync();return;}
    const n=this.curNode();const top=n&&this.topBlock(n);
    if(e.inputType==='insertText'&&e.data===' '&&top&&top.nodeType===1&&(top.tagName==='P'||top.tagName==='DIV'))this.mdShortcut(top);
    if(top&&top.nodeType===1&&top.tagName==='P'){const tx=top.textContent;
      if(this.state.slash){if(!tx.startsWith('/')||tx.length>24)this.setState({slash:null});else this.setState(s=>({slash:{...s.slash,q:tx.slice(1),idx:0}}));}
      else if(e.data==='/'&&tx==='/'){const w=this._ed.parentNode.getBoundingClientRect(),rc=top.getBoundingClientRect();this._slashBlock=top;this.setState({slash:{x:Math.round(rc.left-w.left),y:Math.round(rc.bottom-w.top+6),q:'',idx:0}});}}
    else if(this.state.slash)this.setState({slash:null});
    this.ensureTail();this.sync();}
  mdShortcut(top){const tx=top.textContent;const m=tx.match(/^(#{1,3}|[-*]|1\.|>)\s/);if(!m)return;let rem=m[0].length;
    const tw=document.createTreeWalker(top,NodeFilter.SHOW_TEXT);let tn;while(rem>0&&(tn=tw.nextNode())){const k=Math.min(rem,tn.data.length);tn.data=tn.data.slice(k);rem-=k;}
    if(!top.textContent)top.innerHTML='<br>';this.caretIn(top,true);const k=m[1];
    if(k[0]==='#')this.retag(top,'H2');else if(k==='>')this.retag(top,'BLOCKQUOTE');else{document.execCommand(k==='1.'?'insertOrderedList':'insertUnorderedList');this.fixLists();}}
  slashItems(){const q=((this.state.slash&&this.state.slash.q)||'').toLowerCase().trim();return SLASH.filter(x=>!q||x[1].toLowerCase().includes(q)||x[3].includes(q));}
  slashPick(k){const top=this._slashBlock;this.setState({slash:null});if(top&&this._ed.contains(top)){top.innerHTML='<br>';this._ed.focus({preventScroll:true});this.caretIn(top,true);}this.insertKind(k);}
  insertKind(k){if(TEXTY.includes(k))return this.setBlock(k);if(k==='table')return this.insertTable();this.insertIsland(k);}
  placeBlocks(nodes){const ed=this._ed;this.restore();const n=this.curNode();const top=n&&this.topBlock(n);const empty=top&&top.nodeType===1&&top.tagName==='P'&&!top.textContent.trim();
    const after=document.createElement('p');after.innerHTML='<br>';const nx=top&&!empty?top.nextElementSibling:(top?top.nextElementSibling:null);const needAfter=!(nx&&nx.tagName==='P'&&!nx.textContent.trim());
    const list=needAfter?[...nodes,after]:nodes;
    if(!top)ed.append(...list);else if(empty)top.replaceWith(...list);else top.after(...list);
    this.ensureTail();return needAfter?after:nx;}
  insertTable(){const t=document.createElement('table');t.innerHTML='<tbody><tr><th><br></th><th><br></th><th><br></th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody>';this.placeBlocks([t]);this.caretIn(t.querySelector('th'),true);this.sync();this.onSel();}
  insertIsland(k,d){if(!this._ed)return;const id=bid();const b=k==='image'?{type:'image',img:'u'+id,caption:'',alt:'',size:'',...(d||{})}:k==='video'?{type:'video',url:'',title:'',dur:''}:{type:'file',name:'',size:'',...(d||{})};
    const tmp=document.createElement('div');tmp.innerHTML=islandHtml(b);const isl=tmp.firstElementChild;const after=this.placeBlocks([isl]);
    if(k==='video')setTimeout(()=>{const i=isl.querySelector('[data-f=url]');if(i)i.focus();},30);
    else if(k==='file'&&!b.name)setTimeout(()=>{const i=isl.querySelector('input[type=file]');if(i)i.click();},30);
    else if(after){this.caretIn(after,true);}
    this.sync();}
  addFile(f){if(f.size>20*1048576)return this.flash(f.name+' is '+fmtSize(f.size)+'. The limit is 20 MB.');
    if(/^image\//.test(f.type)){const id='u'+bid();const rd=new FileReader();rd.onload=()=>{IMGSRC[id]=rd.result;this.insertIsland('image',{img:id,size:fmtSize(f.size),caption:'',alt:''});};rd.readAsDataURL(f);}
    else this.insertIsland('file',{name:f.name.replace(/\|/g,'-'),size:fmtSize(f.size)});}
  edPaste(e){const t=e.target;if(t!==this._ed&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'))return;const cd=e.clipboardData;if(!cd)return;
    const files=[...(cd.files||[])];if(files.length){e.preventDefault();files.forEach(f=>this.addFile(f));return;}
    const html=cd.getData('text/html'),text=cd.getData('text/plain');e.preventDefault();
    if(html){const tmp=document.createElement('div');tmp.innerHTML=html;tmp.querySelectorAll('script,style,meta,link,img,svg,iframe').forEach(x=>x.remove());const body=serializeEd(tmp);const bl=parseBody(body);
      if(bl.length===1&&bl[0].type==='p')document.execCommand('insertHTML',false,inlHtml(bl[0].text));else document.execCommand('insertHTML',false,bodyToHtml(body,true));}
    else if(/\n\s*\n/.test(text))document.execCommand('insertHTML',false,text.split(/\n\s*\n/).map(p=>'<p>'+esc(p.trim()).replace(/\n/g,' ')+'</p>').join(''));
    else document.execCommand('insertText',false,text.replace(/\n/g,' '));
    this.fixLists();this.ensureTail();this.sync();}
  edDrop(e){if(e.target.closest('image-slot')||e.target.closest('[data-island]'))return;const fs=e.dataTransfer&&[...e.dataTransfer.files];if(!fs||!fs.length)return;e.preventDefault();
    const r=document.caretRangeFromPoint?document.caretRangeFromPoint(e.clientX,e.clientY):null;if(r&&this._ed.contains(r.startContainer)){this._lastRange=r;}fs.forEach(f=>this.addFile(f));}
  edClick(e){const b=e.target.closest('[data-act]');if(!b||!this._ed.contains(b))return;e.preventDefault();const isl=b.closest('[data-island]');const act=b.dataset.act;
    if(act==='remove')isl.remove();if(act==='up'&&isl.previousElementSibling)isl.previousElementSibling.before(isl);if(act==='down'&&isl.nextElementSibling)isl.nextElementSibling.after(isl);
    this.ensureTail();this.sync();}
  edChange(e){const t=e.target;if(t.dataset.f!=='file')return;const f=t.files&&t.files[0];if(!f)return;const isl=t.closest('[data-island]');
    if(f.size>20*1048576){const er=isl.querySelector('[data-f=ferr]');if(er){er.textContent=f.name+' is '+fmtSize(f.size)+'. The limit is 20 MB.';er.style.color='#a3322a';}return;}
    const tmp=document.createElement('div');tmp.innerHTML=islandHtml({type:'file',name:f.name.replace(/\|/g,'-'),size:fmtSize(f.size)});isl.replaceWith(tmp.firstElementChild);this.sync();}
  edKey(e){if(e.target!==this._ed)return;const sl=this.state.slash;
    if(sl){const items=this.slashItems();
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=items.length;if(n)this.setState({slash:{...sl,idx:(sl.idx+(e.key==='ArrowDown'?1:n-1))%n}});return;}
      if((e.key==='Enter'||e.key==='Tab')&&items.length){e.preventDefault();this.slashPick(items[Math.min(sl.idx,items.length-1)][0]);return;}
      if(e.key==='Escape'){e.preventDefault();this.setState({slash:null});return;}}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();this.openLink();return;}
    if(e.key==='Tab'){const n=this.curNode();const cell=n&&n.closest('td,th');if(cell){e.preventDefault();const cells=[...cell.closest('table').querySelectorAll('th,td')];const j=cells.indexOf(cell)+(e.shiftKey?-1:1);if(j>=0&&j<cells.length)this.caretIn(cells[j]);else if(!e.shiftKey){this.tableOp('row');const tr=cell.parentNode.nextElementSibling;if(tr)this.caretIn(tr.firstElementChild,true);}}}}
  tableOp(op){this.restore();const n=this.curNode();const cell=n&&n.closest('td,th');if(!cell)return;const tr=cell.parentNode,table=cell.closest('table');const ci=[...tr.children].indexOf(cell);const rows=[...table.querySelectorAll('tr')];
    if(op==='row'){const nr=document.createElement('tr');[...tr.children].forEach(()=>{const td=document.createElement('td');td.innerHTML='<br>';nr.append(td);});tr.after(nr);this.caretIn(nr.children[ci],true);}
    if(op==='col'){rows.forEach((r,ri)=>{const c=document.createElement(ri===0?'th':'td');c.innerHTML='<br>';const ref=r.children[ci];if(ref)ref.after(c);else r.append(c);});this.caretIn(tr.children[ci+1],true);}
    if(op==='delrow'){if(rows.indexOf(tr)===0||rows.length<=2)return this.flash('A table needs a header row and at least one row');const nx=tr.nextElementSibling||tr.previousElementSibling;tr.remove();this.caretIn(nx.children[Math.min(ci,nx.children.length-1)]);}
    if(op==='delcol'){if(tr.children.length<=1)return;rows.forEach(r=>{if(r.children[ci])r.children[ci].remove();});this.caretIn(rows[0].children[Math.max(0,ci-1)]);}
    if(op==='deltable'){const nx=table.nextElementSibling;table.remove();this.ensureTail();if(nx)this.caretIn(nx,true);}
    this.sync();this.onSel();}
  openLink(){this.restore();const sel=document.getSelection();if(!sel.rangeCount)return;let r=sel.getRangeAt(0);const n=this.curNode();if(!n)return;const a=n.closest('a');
    if(a&&r.collapsed){r=document.createRange();r.selectNodeContents(a);sel.removeAllRanges();sel.addRange(r);}
    else if(r.collapsed||!r.toString().trim())return this.flash('Select the text you want to link');
    this._linkRange=r.cloneRange();const rc=(a||r).getBoundingClientRect();const w=this._ed.parentNode.getBoundingClientRect();
    this.setState({link:{x:Math.round(Math.max(180,Math.min(w.width-180,rc.left+rc.width/2-w.left))),y:Math.round(rc.bottom-w.top),url:a?a.getAttribute('href'):'',hadLink:!!a}});
    setTimeout(()=>{const i=document.getElementById('ip-link-input');if(i){i.focus();i.select();}},30);}
  applyLink(remove){const L=this.state.link;this.setState({link:null});this._lastRange=this._linkRange;this.restore();let url=((L&&L.url)||'').trim();
    if(remove||!url)document.execCommand('unlink');else{if(!/^(https?:|mailto:)/i.test(url))url='https://'+url;document.execCommand('createLink',false,url);}
    const s=document.getSelection();if(s.rangeCount)s.collapseToEnd();this.sync();this.onSel();}
  unlinkHere(){const n=this.curNode();const a=n&&n.closest('a');if(!a)return;const r=document.createRange();r.selectNodeContents(a);const s=document.getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('unlink');s.collapseToEnd();this.sync();this.onSel();}
  viewBlocks(p,shown,T){const s=this.state;
    return parseBody(shown.body).map(b=>{const t=b.type;const o={isH:t==='h',isP:t==='p',isQuote:t==='quote',isList:t==='ul'||t==='ol',isTable:t==='table',isImage:t==='image',isVideo:t==='video',isFile:t==='file'};
      if(o.isH)o.text=T(b.text);
      if(o.isP||o.isQuote)o.segs=segs(T(b.text));
      if(o.isList)o.items=b.items.map((x,j)=>({marker:t==='ol'?(j+1)+'.':'•',segs:segs(T(x))}));
      if(o.isTable){const nc=Math.max(...b.rows.map(r=>r.length));const num=ci=>b.rows.length>1&&b.rows.slice(1).every(r=>/^[\d.,%\s–-]/.test(r[ci]||''));const al=[...Array(nc)].map((_,ci)=>ci&&num(ci)?'end':'start');
        Object.assign(o,{cols:nc>1?'minmax(180px,2fr) repeat('+(nc-1)+',minmax(110px,1fr))':'minmax(180px,1fr)',minW:(180+(nc-1)*110)+'px',
          cells:b.rows.flatMap((row,ri)=>[...Array(nc)].map((_,ci)=>({text:T(row[ci]||''),align:al[ci],bg:ri===0?'#f8f7f2':'#fff',fs:ri===0?'11.5px':'14.5px',fw:ri===0?600:(ci===0?500:400),tt:ri===0?'uppercase':'none',ls:ri===0?'0.07em':'normal',color:ri===0?'#5d665f':'#18201b',bt:ri?'1px solid #ecebe4':'none'})))});}
      if(o.isImage){const show=!s.textOnly||!!s.shownImgs[b.img];Object.assign(o,{slotId:'img-'+b.img,src:IMGSRC[b.img]||'',caption:T(b.caption),alt:T(b.alt)||'Image',placeholder:b.caption||'Image',showImg:show,hideImg:!show,hasCaption:!!b.caption,showLabel:'Show'+(b.size?' · '+b.size:''),onShow:()=>this.setState(x=>({shownImgs:{...x.shownImgs,[b.img]:true}}))});}
      if(o.isVideo)Object.assign(o,{title:T(b.title)||b.url,url:b.url,meta:['Video',b.dur,hostOf(b.url)].filter(Boolean).join(' · ')});
      if(o.isFile){const first=p.versions.find(x=>(x.body||'').includes('::file '+b.name+' '));Object.assign(o,{name:b.name,...fileBadge(b.name),meta:[b.size,first?'added in v'+first.v:'in draft'].filter(Boolean).join(' · '),onOpen:()=>this.flash('Downloading '+b.name)});}
      return o;});}
  verChanges(p,x){const i=p.versions.indexOf(x);return i>0?changesOf(p.versions[i-1],x):[];}

  // translation
  k(lang,t){return lang+'|'+hsh(t);}
  langOf(code){return this.state.langs.find(x=>x.code===code);}
  txTargets(){const s=this.state;return s.langs.filter(l=>l.enabled&&l.code!==s.txCfg.source);}
  shownOf(p){const s=this.state;const L=latest(p);return s.viewV!=null?p.versions.find(x=>x.v===s.viewV):(L||p.draft);}
  commentTexts(p){return[...p.comments.flatMap(c=>[c.text,...c.replies.map(r=>r.text)]),...(p.insights||[]).map(i=>i.text)];}
  viewLang(p){const s=this.state;const l=p&&s.propLang[p.id];return l&&(l===s.txCfg.source||this.txTargets().some(x=>x.code===l))?l:s.lang;}
  textOf(p,id){for(const c of p.comments){if(c.id===id)return c.text;const r=c.replies.find(x=>x.id===id);if(r)return r.text;}return null;}
  neededTx(){const s=this.state;const src=s.txCfg.source;const out={};const add=(l,arr)=>{if(l===src||!this.langOf(l))return;(out[l]=out[l]||[]).push(...arr);};
    if(s.screen==='list')add(s.lang,s.proposals.filter(p=>p.versions.length||isMem(p)).flatMap(p=>{const c=content(p);return[c.title,c.summary];}));
    if(s.screen==='view'){const p=s.proposals.find(x=>x.id===s.currentId);if(p){const vl=this.viewLang(p);const sh=this.shownOf(p);
      if(!s.showOriginal)add(vl,[sh.title,sh.summary,...txTexts(sh.body)]);
      if(s.txCfg.comments&&s.txDiscussion)add(vl,this.commentTexts(p));
      Object.entries(s.cLang).forEach(([id,l])=>{const t=this.textOf(p,id);if(t)add(l,[t]);});}}
    return out;}
  autoTx(){if(this.state.txFailed)return;Object.entries(this.neededTx()).forEach(([l,t])=>this.translate(l,t));}
  cTx(x,p,vt){const s=this.state;const src=s.txCfg.source;const cl=s.cLang[x.id];const eff=cl||(vt.dOn?this.viewLang(p):src);const L=this.langOf(eff);
    const t=eff!==src&&L?s.tx[this.k(eff,x.text)]:null;const busy=eff!==src&&!!L&&!t&&!s.txFailed;const open=s.txMenu==='c:'+x.id;
    return{text:t||x.text,isTx:!cl&&vt.dOn&&s.txCfg.label&&!!t&&t!==x.text,cDir:t&&L.rtl?'rtl':'ltr',canTx:s.txCfg.comments&&this.txTargets().length>0,
      txBtn:eff===src||!L?'Translate':busy?'Translating…':L.native,txColor:eff!==src?'#2e5e45':'#5d665f',txMenuOpen:open,onTxMenu:()=>this.setState({txMenu:open?null:'c:'+x.id}),
      txOpts:[this.langOf(src),...this.txTargets()].map(l=>({label:l.code===src?'Original ('+l.native+')':l.native,on:l.code===eff,bg:l.code===eff?'#eef3ee':'transparent',weight:l.code===eff?600:400,onClick:()=>this.setState(z=>({cLang:{...z.cLang,[x.id]:l.code},txMenu:null,txFailed:false}))}))};}
  async translate(lang,texts){
    const s=this.state;this._pending=this._pending||new Set();
    const need=[...new Set(texts.filter(t=>t&&t.trim()))].filter(t=>{const key=this.k(lang,t);return!s.tx[key]&&!this._pending.has(key);});
    if(!need.length)return;
    need.forEach(t=>this._pending.add(this.k(lang,t)));
    const L=this.langOf(lang),S=this.langOf(s.txCfg.source);
    this.setState(x=>({txBusy:x.txBusy+1}));
    try{
      if(!window.claude||!window.claude.complete)throw new Error('Translation service unavailable');
      const out=await window.claude.complete({max_tokens:6000,
        system:'You translate content for a public consultation platform where citizens and officials discuss government proposals. Translate each string in the JSON array from '+S.name+' into '+L.name+' ('+L.native+'). Use a clear, neutral register suited to public administration. Keep all numbers, percentages, amounts, dates and units exactly as written. Never translate these terms: '+s.glossary.join(', ')+'. Keep @mentions of people unchanged. Some strings contain inline formatting: keep **bold**, *italic* and [link text](url) markers in place, translate the visible text and never change URLs. If a string is already in '+L.name+', return it unchanged. Reply with only a JSON array of translated strings, same length and order, no commentary.',
        messages:[{role:'user',content:JSON.stringify(need)}]});
      const arr=JSON.parse(out.slice(out.indexOf('['),out.lastIndexOf(']')+1));
      if(!Array.isArray(arr)||arr.length!==need.length)throw new Error('Unexpected response');
      const add={},fr={};need.forEach((t,i)=>{const key=this.k(lang,t);add[key]=String(arr[i]);fr[key]=true;});
      this.setState(x=>{const tx={...x.tx,...add};try{localStorage.setItem(TXKEY,JSON.stringify(tx));}catch(e){}return{tx,fresh:{...x.fresh,...fr}};});
    }catch(e){console.warn('translate',e);this.setState({txFailed:true});this.flash('Translation failed. Try again.');}
    finally{need.forEach(t=>this._pending.delete(this.k(lang,t)));this.setState(x=>({txBusy:x.txBusy-1}));}
  }
  setLang(code){this.setState({lang:code,langMenu:false,showOriginal:false,txFailed:false});}
  setTxCfg(o){this.setState(s=>({txCfg:{...s.txCfg,...o}}));}
  toggleLang(code){const s=this.state;const l=this.langOf(code);const on=!l.enabled;
    this.setState(x=>({langs:x.langs.map(y=>y.code===code?{...y,enabled:on}:y),lang:!on&&x.lang===code?x.txCfg.source:x.lang}));
    this.flash(on?l.native+' enabled. Proposals are translated the first time someone reads them.':l.native+' turned off');}
  addLanguage(){const c=this.state.addLang;if(!c)return;const l=mkLang(c,true);this.setState(x=>({langs:[...x.langs,l],addLang:''}));this.flash(l.native+' added');}
  removeLang(code){const l=this.langOf(code);this.setState(x=>({langs:x.langs.filter(y=>y.code!==code),lang:x.lang===code?x.txCfg.source:x.lang}));this.flash(l.native+' removed');}
  addGloss(){const t=this.state.glossInput.trim();if(!t)return;this.setState(x=>({glossary:x.glossary.some(g=>g.toLowerCase()===t.toLowerCase())?x.glossary:[...x.glossary,t],glossInput:''}));}
  clearCache(){try{localStorage.removeItem(TXKEY);}catch(e){}this.setState({tx:{},fresh:{},reviewed:{},txFailed:false});this.flash('Translation cache cleared');}
  markReviewed(keys){this.setState(x=>{const r={...x.reviewed};keys.forEach(k=>{r[k]='Maya Chen';});return{reviewed:r};});this.flash('Translation marked as reviewed');}
  rowTx(c){const s=this.state;const L=this.langOf(s.lang);const on=s.lang!==s.txCfg.source&&!!L;const g=t=>(on&&t&&s.tx[this.k(s.lang,t)])||t;const has=on&&!!s.tx[this.k(s.lang,c.title)];return{title:g(c.title),summary:g(c.summary),dir:has&&L.rtl?'rtl':'ltr',showTxLabel:has&&s.txCfg.label};}
  viewTx(p,shown){
    const s=this.state;const lang=this.viewLang(p);const src=s.txCfg.source,popen=s.txMenu==='p:'+p.id;const L=this.langOf(lang),S=this.langOf(s.txCfg.source);const on=lang!==s.txCfg.source&&!!L;
    const keys=[shown.title,shown.summary,...txTexts(shown.body)].filter(Boolean).map(t=>this.k(lang,t));
    const total=keys.length,done=keys.filter(k=>s.tx[k]).length,ready=on&&done===total;
    const useTx=on&&!s.showOriginal;
    const T=t=>useTx&&t?(s.tx[this.k(lang,t)]||t):t;
    const dOn=on&&s.txCfg.comments&&s.txDiscussion;
    const D=t=>dOn&&t?(s.tx[this.k(lang,t)]||t):t;
    const Dl=t=>{if(!dOn||!s.txCfg.label)return false;const x=s.tx[this.k(lang,t)];return!!x&&x!==t;};
    const dBusy=dOn&&!s.txFailed&&this.commentTexts(p).some(t=>t&&!s.tx[this.k(lang,t)]);
    const fresh=keys.filter(k=>s.fresh[k]).length,rev=keys.filter(k=>s.reviewed[k]).length,allRev=rev===total;
    let head='',sub='';
    if(on){
      if(s.showOriginal){head='Showing the original in '+S.native;sub='Switch back any time. Readers who choose '+L.native+' see the translation by default.';}
      else if(s.txFailed&&!ready){head='Translation into '+L.native+' didn’t finish';sub='Showing the original for now.';}
      else if(!ready){head='Translating into '+L.native+'…';sub=done?done+' of '+total+' sections already in the cache.':'Usually takes a few seconds. The result is cached for everyone who reads this in '+L.native+'.';}
      else{head='Translated from '+S.native+' to '+L.native+' by AI';sub=fresh===0?'Loaded from the translation cache.':fresh===total?'Translated just now and cached for the next reader.':(total-fresh)+' sections from the cache, '+fresh+' changed '+(fresh===1?'section':'sections')+' translated just now.';
        if(rev&&!allRev)sub+=' '+(total-rev)+' not reviewed yet.';}
    }
    const canToggle=ready||s.showOriginal,canReview=ready&&!s.showOriginal&&!allRev,failed=s.txFailed&&!ready;
    return{T,D,Dl,dOn,banner:{isTx:on,
      pCanTx:this.txTargets().length>0,pTxLabel:on?L.native:'Translate',pTxBg:on?'#eef3ee':'#fff',pTxBorder:on?'#2e5e45':'#e0ddd4',pTxOpen:popen,onPTxMenu:()=>this.setState({txMenu:popen?null:'p:'+p.id}),
      pTxOpts:[S,...this.txTargets()].map(l=>({native:l.code===src?'Original':l.native,sub:l.code===src?l.native:l.name,on:l.code===lang,bg:l.code===lang?'#eef3ee':'transparent',weight:l.code===lang?600:500,onClick:()=>this.setState(z=>({propLang:{...z.propLang,[p.id]:l.code},txMenu:null,showOriginal:false,txFailed:false}))})),txHead:head,txSub:sub,dir:useTx&&ready&&L.rtl?'rtl':'ltr',
      txShowChip:ready&&!s.showOriginal,txChip:allRev?'Reviewed':rev?rev+' of '+total+' reviewed':'Machine translation',txChipBg:allRev?'#e2ebe4':'#f6ecd6',txChipFg:allRev?'#234a36':'#7a5410',
      txHasActions:canToggle||canReview||failed,txCanToggle:canToggle,txToggleLabel:s.showOriginal?'Show '+L.native+' translation':'Show original ('+S.native+')',onTxToggle:()=>this.setState({showOriginal:!s.showOriginal}),
      txCanReview:canReview,onTxReview:()=>this.markReviewed(keys),txFailed:failed,bodyOpacity:on&&!ready&&!s.showOriginal&&!s.txFailed?0.5:1,
      canTxDiscussion:on&&s.txCfg.comments&&p.comments.length>0,txDLabel:dOn?(dBusy?'Translating discussion…':'Show original comments'):'Translate discussion',
      dDir:dOn&&L.rtl?'rtl':'ltr',txDBg:dOn?'#eef3ee':'#fff',txDBorder:dOn?'#2e5e45':'#e0ddd4',onTxDiscussion:()=>this.setState({txDiscussion:!s.txDiscussion,txFailed:false})}};
  }
  langSettings(){const s=this.state;const c=s.txCfg;const cnt=code=>Object.keys(s.tx).filter(k=>k.startsWith(code+'|')).length;
    const en=s.langs.filter(l=>l.enabled);const total=Object.keys(s.tx).length;const withCache=s.langs.filter(l=>cnt(l.code)>0).length;
    return{langSummary:s.langs.length+' languages · '+en.length+' enabled',
      addLang:s.addLang,onAddLangPick:e=>this.setState({addLang:e.target.value}),onAddLang:()=>this.addLanguage(),addBtnBg:s.addLang?'#2e5e45':'#9fb5a7',
      addLangOpts:LANG_CATALOG.filter(x=>!s.langs.some(l=>l.code===x[0])).map(x=>({code:x[0],label:x[2]+' · '+x[1]})),
      langRows:s.langs.map(l=>{const src=l.code===c.source;const n=cnt(l.code);return{native:l.native,name:l.name+' · '+l.code.toUpperCase(),isSource:src,notSource:!src,dirLabel:l.rtl?'Right to left':'Left to right',cached:src?'—':n+(n===1?' section':' sections'),opacity:l.enabled?1:0.5,statusLabel:l.enabled?'Enabled':'Off',...track(l.enabled),onToggle:()=>this.toggleLang(l.code),onRemove:()=>this.removeLang(l.code)};}),
      sourceLang:c.source,onSource:e=>{const v2=e.target.value;this.setState(x=>({txCfg:{...x.txCfg,source:v2},lang:v2}));},sourceOpts:en.map(l=>({code:l.code,label:l.native+' · '+l.name})),
      langToggles:[['onPublish','Translate new versions on publish','Each enabled language is translated as soon as a version goes live, so readers don’t wait.'],['comments','Translate the discussion','Readers can translate comments, replies and insights into their language.'],['label','Label machine translations','Mark proposals and comments that were translated by AI.']].map(([k,t,d])=>({title:t,desc:d,...track(c[k]),onToggle:()=>this.setTxCfg({[k]:!c[k]})})),
      glossary:s.glossary.map(t=>({term:t,onRemove:()=>this.setState(x=>({glossary:x.glossary.filter(g=>g!==t)}))})),glossInput:s.glossInput,onGlossInput:e=>this.setState({glossInput:e.target.value}),onGlossKey:e=>{if(e.key==='Enter'){e.preventDefault();this.addGloss();}},
      cacheLine:total?total+' sections cached across '+withCache+(withCache===1?' language.':' languages.'):'The cache is empty.',onClearCache:()=>this.clearCache()};}

  openProfile(id){this.go({screen:'profile',profileId:id,profileTab:'proposals',profileEdit:null});}
  rowOf(p){const s=this.state;const c=content(p);const L=latest(p);const ss=this.sortedScores(p);const tq=teamOf(p);const nT=tq.members.length-1;const myLead=tq.lead===ME;return{...this.rowTx(c),hasTeam:nT>0,teamMore:'and '+nT+(nT===1?' other':' others'),authorName:PEOPLE[tq.lead].name,initials:PEOPLE[tq.lead].initials,updated:'Updated '+p.updated.toLowerCase(),versionLabel:L?'v'+L.v:'Not published',commentCount:nComments(p),
    scores:ss.map(x=>({name:x.st.name,color:x.st.color,label:this.fmt(x.n),showNum:s.settings.showPublic})),isDraft:!L,hasPending:!!(L&&p.draft&&myLead),hasBadge:!L||!!(p.draft&&myLead),onOpen:()=>this.open(p.id),onAuthor:e=>{e.stopPropagation();this.openProfile(tq.lead);}};}
  pOf(id){return this.state.proposals.find(x=>x.id===id);}
  updTeam(pid,fn){this.upd(pid,p=>({...p,team:fn(teamOf(p))}));}
  strengthIn(uid,sid){const x=sid&&this.strengthsOf(uid).find(y=>y.st.id===sid);return x?x.n:0;}
  teamCard(p){const t=teamOf(p);const L=latest(p);const lead=t.lead===ME;const mem=t.members.some(m=>m.id===ME);const n=t.members.length;
    const members=[...t.members].sort((a,b)=>(b.id===t.lead)-(a.id===t.lead)).map(m=>{const u=PEOPLE[m.id];const isL=m.id===t.lead;const st=m.focus&&this.stream(m.focus);const parts=[];if(st)parts.push(st.name);else if(!isL)parts.push('Contributor');if(u.role==='Official')parts.push('Official');if(m.id===t.founder)parts.push('Started this proposal');
      return{...this.av(m.id),initials:u.initials,name:u.name+(m.id===ME?' (you)':''),sub:parts.join(' · ')||'Lead',isLead:isL,onClick:()=>this.openProfile(m.id)};});
    const off=mem&&t.offer&&t.offer.to===ME?t.offer:null;const inv=!mem?t.invites.find(i=>i.user===ME):null;const myReq=t.requests.find(r=>r.user===ME);
    let join={};
    if(!mem&&L&&!inv){if(myReq)join={hasPendingReq:true,pendingLine:'Request sent '+(myReq.time==='Just now'?'just now':ago(myReq.time))+(myReq.stream?' · '+(this.stream(myReq.stream)||{}).name:'')};
      else{const dcl=t.declined[ME];const info=t.blocked.includes(ME)||t.joinMode==='closed'?fnm(t.lead)+' isn’t taking join requests for this proposal.':t.cap&&n>=t.cap?'The team is full.':dcl!=null&&dcl<30?'Your last request was declined. You can ask again in '+(30-dcl)+' days.':t.joinMode==='roles'&&!t.openRoles.length?'No open roles right now.':'';
        join=info?{hasJoinInfo:true,joinInfo:info}:{showAsk:true};}}
    const crs=mem?(p.changeRequests||[]).filter(c=>c.status!=='withdrawn').sort((a,b)=>(b.status==='open')-(a.status==='open')):[];
    const items=crs.map(c=>{const st=CR_ST[c.status];let conf=0;if(c.status==='open'&&lead)conf=this.crChunks({p,cr:c,baseV:p.versions.find(x=>x.v===c.base)}).hunks.filter(h=>h.kind==='conflict').length;
      return{...this.av(c.author),initials:PEOPLE[c.author].initials,note:c.note,meta:(c.author===ME?'You':fnm(c.author))+' · based on v'+c.base+' · '+(c.time==='Just now'?'just now':ago(c.time)),status:c.status==='open'&&lead?'Needs review':st.label,stBg:st.bg,stFg:st.fg,hasConflict:conf>0,conflictLabel:conf+(conf===1?' conflict':' conflicts'),onOpen:()=>this.openReview(p.id,c.id)};});
    const nOpen=crs.filter(c=>c.status==='open').length;
    return{countLabel:n===1?'Team of one':n+' members',members,
      hasOffer:!!off,offerFrom:off?PEOPLE[t.lead].name:'',hasOfferNote:!!(off&&off.note),offerNote:off?off.note:'',offerHint:off?'As lead you publish new versions and manage the team. '+fnm(t.lead)+' stays on as a contributor.':'',onAcceptOffer:()=>this.acceptOffer(p.id),onDeclineOffer:()=>this.declineOffer(p.id),
      hasInvite:!!inv,inviteFrom:inv?PEOPLE[inv.from].name:'',inviteFor:inv&&inv.stream?' for '+(this.stream(inv.stream)||{}).name:'',hasInviteNote:!!(inv&&inv.note),inviteNote:inv?inv.note:'',onAcceptInvite:()=>this.acceptInvite(p.id),onDeclineInvite:()=>this.declineInvite(p.id),
      hasOpenRoles:t.openRoles.length>0,openRoles:t.openRoles.map(r=>{const st=this.stream(r.stream)||{};return{name:st.name,color:st.color,note:r.note};}),
      isLead:lead,onManage:()=>this.openTeam(p.id),hasReqBadge:lead&&t.requests.length>0,reqBadge:t.requests.length,
      isContrib:mem&&!lead,onLeave:()=>this.leaveTeam(p.id),
      showAsk:false,hasPendingReq:false,hasJoinInfo:false,...join,onAsk:()=>this.openAsk(p.id),onWithdrawReq:()=>this.withdrawReq(p.id),
      hasCrs:items.length>0,crs:items,crCount:nOpen?nOpen+' open':''};}
  openTeam(pid){this.setState({teamDlg:{pid,confirm:null,inv:{user:'',stream:'',note:''},role:{stream:'',note:''},error:'',roleError:''},menuOpen:false});}
  setTD(o){this.setState(s=>({teamDlg:s.teamDlg?{...s.teamDlg,...o}:null}));}
  approveReq(pid,rid){const t=teamOf(this.pOf(pid));const r=t.requests.find(x=>x.id===rid);if(!r)return;if(t.cap&&t.members.length>=t.cap)return this.flash('The team is full. Raise the size limit to add '+fnm(r.user)+'.');
    const fill=!!r.stream&&t.openRoles.some(o=>o.stream===r.stream);
    this.updTeam(pid,x=>{const i=r.stream?x.openRoles.findIndex(o=>o.stream===r.stream):-1;return{...x,requests:x.requests.filter(y=>y.id!==rid),members:[...x.members,{id:r.user,focus:r.stream||null,since:'Oct 5'}],openRoles:x.openRoles.filter((_,j)=>j!==i)};});
    this.flash(fnm(r.user)+' joined the team'+(fill?' · '+this.stream(r.stream).name+' role filled':''));}
  declineReq(pid,rid){const r=teamOf(this.pOf(pid)).requests.find(x=>x.id===rid);if(!r)return;this.updTeam(pid,x=>({...x,requests:x.requests.filter(y=>y.id!==rid),declined:{...x.declined,[r.user]:0}}));this.flash('Declined. '+fnm(r.user)+' can ask again in 30 days.');}
  blockReq(pid,rid){const r=teamOf(this.pOf(pid)).requests.find(x=>x.id===rid);if(!r)return;this.updTeam(pid,x=>({...x,requests:x.requests.filter(y=>y.id!==rid),blocked:[...x.blocked,r.user]}));this.flash(fnm(r.user)+' can no longer ask to join this proposal');}
  unblock(pid,uid){this.updTeam(pid,x=>({...x,blocked:x.blocked.filter(b=>b!==uid)}));this.flash(fnm(uid)+' unblocked');}
  sendInvite(pid,user,stream,note){const t=teamOf(this.pOf(pid));if(!user)return this.setTD({error:'Choose who to invite.'});
    if(t.requests.some(r=>r.user===user))return this.setTD({error:fnm(user)+' has already asked to join. Approve the request instead.'});
    if(t.cap&&t.members.length+t.invites.length>=t.cap)return this.setTD({error:'Inviting '+fnm(user)+' would take the team over its size limit.'});
    this.updTeam(pid,x=>({...x,invites:[...x.invites,{id:nid(),user,stream:stream||null,note:(note||'').trim(),time:'Just now',from:ME}]}));this.setTD({inv:{user:'',stream:'',note:''},error:''});this.flash('Invite sent to '+PEOPLE[user].name);}
  withdrawInvite(pid,iid){this.updTeam(pid,x=>({...x,invites:x.invites.filter(i=>i.id!==iid)}));this.flash('Invite withdrawn');}
  addRole(pid){const d=this.state.teamDlg;if(!d.role.stream)return this.setTD({roleError:'Pick the stream this role covers.'});this.updTeam(pid,x=>({...x,openRoles:[...x.openRoles,{id:nid(),stream:d.role.stream,note:d.role.note.trim()}]}));this.setTD({role:{stream:'',note:''},roleError:''});this.flash('Open role added');}
  removeRole(pid,rid){this.updTeam(pid,x=>({...x,openRoles:x.openRoles.filter(o=>o.id!==rid)}));}
  offerLead(pid,uid){this.updTeam(pid,x=>({...x,offer:{to:uid,note:'',time:'Just now'}}));this.setTD({confirm:null});this.flash('Lead role offered to '+fnm(uid)+'. They need to accept.');}
  withdrawOffer(pid){this.updTeam(pid,x=>({...x,offer:null}));this.flash('Offer withdrawn');}
  removeMember(pid,uid){this.updTeam(pid,x=>({...x,members:x.members.filter(m=>m.id!==uid),offer:x.offer&&x.offer.to===uid?null:x.offer}));this.flash(fnm(uid)+' removed from the team');}
  acceptOffer(pid){const old=teamOf(this.pOf(pid)).lead;this.updTeam(pid,x=>({...x,lead:ME,offer:null}));this.flash('You’re now the lead. '+fnm(old)+' stays on as a contributor.');}
  declineOffer(pid){const t=teamOf(this.pOf(pid));this.updTeam(pid,x=>({...x,offer:null}));this.flash(fnm(t.lead)+' stays the lead');}
  acceptInvite(pid){const inv=teamOf(this.pOf(pid)).invites.find(i=>i.user===ME);if(!inv)return;this.updTeam(pid,x=>{const i=inv.stream?x.openRoles.findIndex(o=>o.stream===inv.stream):-1;return{...x,invites:x.invites.filter(y=>y.id!==inv.id),members:[...x.members,{id:ME,focus:inv.stream||null,since:'Oct 5'}],openRoles:x.openRoles.filter((_,j)=>j!==i)};});this.flash('You joined the team. You can now suggest changes.');}
  declineInvite(pid){this.updTeam(pid,x=>({...x,invites:x.invites.filter(i=>i.user!==ME)}));this.flash('Invite declined');}
  leaveTeam(pid){this.updTeam(pid,x=>({...x,members:x.members.filter(m=>m.id!==ME)}));this.flash('You left the team');}
  myPending(){return this.state.proposals.reduce((a,q)=>a+teamOf(q).requests.filter(r=>r.user===ME).length,0);}
  openAsk(pid){const t=teamOf(this.pOf(pid));this.setState({askDlg:{pid,stream:t.joinMode==='roles'&&t.openRoles[0]?t.openRoles[0].stream:'',note:'',error:''}});}
  setAJ(o){this.setState(s=>({askDlg:s.askDlg?{...s.askDlg,...o}:null}));}
  sendAsk(){const d=this.state.askDlg;const p=this.pOf(d.pid);const t=teamOf(p);const n=d.note.trim();
    if(t.joinMode==='roles'&&!d.stream)return this.setAJ({error:'Pick the role you’d like to take on.'});
    if(n.length<20)return this.setAJ({error:'Say a little more about what you’d bring.'});
    if(n.length>280)return this.setAJ({error:'Keep it under 280 characters.'});
    if(this.myPending()>=5)return this.setAJ({error:'You already have 5 pending requests. Wait for a reply or withdraw one first.'});
    this.updTeam(p.id,x=>({...x,requests:[...x.requests,{id:nid(),user:ME,stream:d.stream||null,note:n,time:'Just now'}]}));this.setState({askDlg:null});this.flash('Request sent to '+fnm(t.lead));}
  withdrawReq(pid){this.updTeam(pid,x=>({...x,requests:x.requests.filter(r=>r.user!==ME)}));this.flash('Request withdrawn');}
  askVals(){const d=this.state.askDlg;if(!d)return{isOpen:false};const p=this.pOf(d.pid);const t=teamOf(p);const lf=fnm(t.lead);const sfx=this.suffix();
    const opt=(key,name,color,note,n)=>{const on=d.stream===key;return{name,color,note,hasStrength:n>0,strength:'Your strength '+this.fmt(n)+sfx,border:on?'#2e5e45':'#e0ddd4',bg:on?'#f3f7f3':'#fff',ring:on?'#2e5e45':'#b9b6ac',dot:on?'#2e5e45':'transparent',onClick:()=>this.setAJ({stream:key,error:''})};};
    const roles=t.openRoles.map(r=>{const st=this.stream(r.stream)||{};return opt(r.stream,st.name,st.color,r.note,this.strengthIn(ME,r.stream));});
    if(t.joinMode==='open')roles.push(opt('','General contributor','#9a9f98','Help wherever the proposal needs it',0));
    const n=d.note.length;
    return{isOpen:true,title:content(p).title,intro:lf+' reviews each request. If you’re added, you can suggest changes, and '+lf+' decides what goes into the next version.',roles,hasRoles:roles.length>0,
      note:d.note,onNote:e=>this.setAJ({note:e.target.value,error:''}),count:n+'/280',countColor:n>280?'#a3322a':'#6b736d',error:d.error,hasError:!!d.error,
      footnote:'You have '+this.myPending()+' of 5 pending requests. If '+lf+' declines, you can ask again after 30 days.',
      sendBg:d.note.trim().length>=20?'#2e5e45':'#9fb5a7',onSend:()=>this.sendAsk(),onCancel:()=>this.setState({askDlg:null})};}
  teamDrawerVals(){const s=this.state;const d=s.teamDlg;if(!d)return{isOpen:false};const p=this.pOf(d.pid);if(!p)return{isOpen:false};const t=teamOf(p);const L=latest(p);const sfx=this.suffix();
    const taken=id=>t.members.some(m=>m.id===id)||t.invites.some(i=>i.user===id)||t.requests.some(r=>r.user===id)||t.blocked.includes(id);
    const sName=id=>{const st=id&&this.stream(id);return st?st.name:'';};
    const reqs=t.requests.map(r=>{const u=PEOPLE[r.user];const rs=ROLE_STYLE[u.role]||ROLE_STYLE.Citizen;const st=r.stream&&this.stream(r.stream);const n=st?this.strengthIn(r.user,r.stream):0;
      return{...this.av(r.user),name:u.name,initials:u.initials,role:u.role,roleBg:rs.bg,roleFg:rs.fg,time:'Asked '+(r.time==='Just now'?'just now':ago(r.time)),hasStream:!!st,streamName:st?st.name:'',streamColor:st?st.color:'',strengthLine:st?(n?st.name+' strength '+this.fmt(n)+sfx:'No '+st.name+' activity yet'):'',note:r.note,
        onProfile:()=>this.openProfile(r.user),onApprove:()=>this.approveReq(p.id,r.id),onDecline:()=>this.declineReq(p.id,r.id),onBlock:()=>this.blockReq(p.id,r.id)};});
    const members=[...t.members].sort((a,b)=>(b.id===t.lead)-(a.id===t.lead)).map((m,i)=>{const u=PEOPLE[m.id];const isL=m.id===t.lead;const off=!!(t.offer&&t.offer.to===m.id);const conf=d.confirm===m.id;const parts=[isL?'Lead':'Contributor'];if(m.focus)parts.push(sName(m.focus));if(m.id===t.founder)parts.push('Started this proposal');else if(m.since)parts.push('Joined '+m.since);
      return{...this.av(m.id),initials:u.initials,name:u.name+(m.id===ME?' (you)':''),sub:parts.join(' · '),sep:i?'#efede6':'transparent',isLeadRow:isL,canManage:!isL&&!off&&!conf,isOffered:off,confirming:conf,
        confirmText:'Offer the lead role to '+fnm(m.id)+'? '+fnm(m.id)+' has to accept. Until then you stay the lead, and afterwards you stay on the team as a contributor.',
        onMakeLead:()=>this.setTD({confirm:m.id}),onConfirm:()=>this.offerLead(p.id,m.id),onCancelConfirm:()=>this.setTD({confirm:null}),onWithdrawOffer:()=>this.withdrawOffer(p.id),onRemove:()=>this.removeMember(p.id,m.id)};});
    const active=s.streams.filter(x=>x.active);
    const suggest=[];t.openRoles.forEach(r=>{const st=this.stream(r.stream);if(!st)return;Object.keys(PEOPLE).filter(id=>!taken(id)).map(id=>({id,n:this.strengthIn(id,r.stream)})).filter(x=>x.n>=4).sort((a,b)=>b.n-a.n).slice(0,2).forEach(x=>{if(suggest.some(y=>y.id===x.id))return;suggest.push({id:x.id,...this.av(x.id),initials:PEOPLE[x.id].initials,name:PEOPLE[x.id].name,line:st.name+' strength '+this.fmt(x.n)+sfx,onInvite:()=>this.sendInvite(p.id,x.id,r.stream,'')});});});
    const modes=[['open','Open','Anyone can ask to join and say what they’d bring.'],['roles','Only for open roles','People can only ask for one of the roles you’ve listed.'],['closed','Closed','No one can ask. You can still invite people.']];
    return{isOpen:true,title:content(p).title,onClose:()=>this.setState({teamDlg:null}),isDraft:!L,
      reqs,reqCount:t.requests.length?t.requests.length+' pending':'',noReqs:!t.requests.length&&!!L,
      members,memberCount:t.members.length+(t.cap?' of '+t.cap:''),
      people:Object.keys(PEOPLE).filter(id=>!taken(id)).map(id=>({id,label:PEOPLE[id].name+' · '+PEOPLE[id].role})),
      invUser:d.inv.user,invStream:d.inv.stream,invNote:d.inv.note,streamOpts:active.map(x=>({id:x.id,label:x.name})),
      onInvUser:e=>{const v2=e.target.value;this.setState(z=>({teamDlg:{...z.teamDlg,inv:{...z.teamDlg.inv,user:v2},error:''}}));},
      onInvStream:e=>{const v2=e.target.value;this.setState(z=>({teamDlg:{...z.teamDlg,inv:{...z.teamDlg.inv,stream:v2}}}));},
      onInvNote:e=>{const v2=e.target.value;this.setState(z=>({teamDlg:{...z.teamDlg,inv:{...z.teamDlg.inv,note:v2}}}));},
      error:d.error,hasError:!!d.error,sendBg:d.inv.user?'#2e5e45':'#9fb5a7',onSendInvite:()=>this.sendInvite(p.id,d.inv.user,d.inv.stream,d.inv.note),
      hasSuggest:suggest.length>0,suggest,
      hasInvites:t.invites.length>0,invites:t.invites.map(i=>({name:PEOPLE[i.user].name,meta:[sName(i.stream),'sent '+(i.time==='Just now'?'just now':ago(i.time))].filter(Boolean).join(' · '),onWithdraw:()=>this.withdrawInvite(p.id,i.id)})),
      roles:t.openRoles.map(o=>{const st=this.stream(o.stream)||{};return{name:st.name,color:st.color,note:o.note||'No description',onRemove:()=>this.removeRole(p.id,o.id)};}),
      roleStream:d.role.stream,roleNote:d.role.note,roleOpts:active.filter(x=>!t.openRoles.some(o=>o.stream===x.id)).map(x=>({id:x.id,label:x.name})),
      onRoleStream:e=>{const v2=e.target.value;this.setState(z=>({teamDlg:{...z.teamDlg,role:{...z.teamDlg.role,stream:v2},roleError:''}}));},
      onRoleNote:e=>{const v2=e.target.value;this.setState(z=>({teamDlg:{...z.teamDlg,role:{...z.teamDlg.role,note:v2}}}));},
      onAddRole:()=>this.addRole(p.id),roleError:d.roleError,hasRoleError:!!d.roleError,
      modes:modes.map(([k,title,desc])=>{const on=t.joinMode===k;return{title,desc,border:on?'#2e5e45':'#e0ddd4',bg:on?'#f3f7f3':'#fff',ring:on?'#2e5e45':'#b9b6ac',dot:on?'#2e5e45':'transparent',onClick:()=>this.updTeam(p.id,x=>({...x,joinMode:k}))};}),
      cap:t.cap?String(t.cap):'',capOpts:['','3','5','8','12'].map(c=>({value:c,label:c?c+' people':'No limit'})),onCap:e=>{const v2=e.target.value;this.updTeam(p.id,x=>({...x,cap:v2?+v2:null}));},
      hasBlocked:t.blocked.length>0,blocked:t.blocked.map(id=>({name:PEOPLE[id].name,onUnblock:()=>this.unblock(p.id,id)}))};}
  suggestChanges(pid,crId){const p=this.pOf(pid);const L=latest(p);if(!L)return;const cr=crId&&(p.changeRequests||[]).find(x=>x.id===crId);const src=cr||L;
    this.go({screen:'edit',edit:{id:pid,cr:{base:cr?cr.base:L.v,id:cr?cr.id:null},title:src.title,summary:src.summary,body:src.body,key:Date.now(),scores:{...p.scores},note:cr?cr.note:'',error:'',saved:null}});}
  openCrSubmit(){const e=this.flushEd();if(!e)return;const p=this.pOf(e.id);const base=p.versions.find(x=>x.v===e.cr.base);const cur={title:e.title.trim(),summary:e.summary.trim(),body:e.body};
    if(!cur.title)return this.setEdit({error:'Add a title before submitting.'});
    const ch=changesOf(base,cur);if(!ch.length)return this.setEdit({error:'You haven’t changed anything since v'+base.v+' yet.'});
    const sig=hsh(cur.title+'|'+cur.summary+'|'+cur.body);const pre=(e.note||'').trim();
    this.setState({crDlg:{note:pre,busy:!pre,edited:!!pre,ch,sig,cur,pid:p.id,crId:e.cr.id,base:e.cr.base}});
    if(!pre)this.noteText(base,cur,ch).then(t=>this.setState(x=>x.crDlg&&x.crDlg.sig===sig&&!x.crDlg.edited?{crDlg:{...x.crDlg,note:t,busy:false}}:(x.crDlg?{crDlg:{...x.crDlg,busy:false}}:null)));}
  confirmCr(){const d=this.state.crDlg;if(!d||d.busy)return;const note=d.note.trim()||ruleNote(d.ch);const p=this.pOf(d.pid);const lead=teamOf(p).lead;
    const rec={id:d.crId||('cr'+Date.now()),author:ME,base:d.base,...d.cur,note,time:'Just now',status:'open'};
    this.upd(p.id,q=>({...q,changeRequests:d.crId?q.changeRequests.map(x=>x.id===d.crId?rec:x):[rec,...(q.changeRequests||[])]}));
    this.setState({crDlg:null,edit:null});this.open(p.id);this.flash(lead===ME?'Change request added':'Change request sent to '+fnm(lead));}
  crDlgVals(){const d=this.state.crDlg;if(!d)return{isOpen:false};const lf=fnm(teamOf(this.pOf(d.pid)).lead);
    return{isOpen:true,kicker:'Change request · based on v'+d.base,changesLabel:'Changes since v'+d.base,changes:d.ch.map((c,i)=>({label:c.label,bt:i?'1px solid #ecebe4':'none'})),busy:d.busy,ready:!d.busy,note:d.note,
      onNote:e=>{const v2=e.target.value;this.setState(x=>({crDlg:{...x.crDlg,note:v2,edited:true}}));},
      hint:lf+' sees each change separately and decides which ones go into the next version.',submitBg:d.busy?'#9fb5a7':'#2e5e45',onSubmit:()=>this.confirmCr(),onCancel:()=>this.setState({crDlg:null})};}
  openReview(pid,id){this.go({screen:'review',review:{pid,crId:id,dec:{},edits:{}}});}
  crCtx(){const r=this.state.review;if(!r)return null;const p=this.pOf(r.pid);const cr=p&&(p.changeRequests||[]).find(x=>x.id===r.crId);if(!cr)return null;return{p,cr,baseV:p.versions.find(x=>x.v===cr.base)};}
  crChunks({p,cr,baseV}){const B=docB(baseV||{});const T=docB(cr);const O=cr.status==='open'?docB(p.draft||latest(p)):B;const chunks=merge3(B,O,T);let i=0;chunks.forEach(ch=>{if(ch.kind==='theirs'||ch.kind==='conflict')ch.idx=i++;});return{chunks,hunks:chunks.filter(ch=>ch.idx!=null)};}
  setRV(o){this.setState(s=>({review:{...s.review,...o}}));}
  decide(idx,val){this.setState(s=>{const cur=s.review.dec[idx];return{review:{...s.review,dec:{...s.review.dec,[idx]:cur===val&&val!=='edit'?undefined:val}}};});}
  applyCR(){const c=this.crCtx();if(!c)return;const{p,cr}=c;const r=this.state.review;const{chunks,hunks}=this.crChunks(c);
    if(hunks.some(h=>!r.dec[h.idx]))return this.flash('Decide on every change first');
    const out=[];let acc=0;
    chunks.forEach(ch=>{const d=r.dec[ch.idx];
      if(ch.kind==='theirs'){if(d==='accept'){out.push(...ch.theirs);acc++;}else out.push(...ch.ours);}
      else if(ch.kind==='conflict'){if(d==='theirs'){out.push(...ch.theirs);acc++;}else if(d==='edit'){const tx=r.edits[ch.idx]||'';const mm=(ch.base[0]||ch.ours[0]||'').match(/^@@(title|summary) /);out.push(...(mm?[mm[0]+tx.replace(/\s*\n\s*/g,' ').trim()]:splitB(tx)));acc++;}else out.push(...ch.ours);}
      else out.push(...ch.ours);});
    const doc=fromB(out,p.draft||latest(p));
    this.upd(p.id,q=>({...q,draft:acc?{...(q.draft||{note:''}),title:doc.title,summary:doc.summary,body:doc.body,saved:'just now',contributors:[...new Set([...((q.draft&&q.draft.contributors)||[]),cr.author])]}:q.draft,
      changeRequests:q.changeRequests.map(x=>x.id===cr.id?{...x,status:acc?'merged':'closed',result:acc+' of '+hunks.length}:x),ts:Date.now(),updated:'Just now'}));
    this.open(p.id);this.flash(acc?'Merged '+acc+(acc===1?' change':' changes')+' into your draft. Publish when you’re ready.':'Closed. Nothing was merged.');}
  setCrStatus(st,msg){const c=this.crCtx();if(!c)return;this.upd(c.p.id,q=>({...q,changeRequests:q.changeRequests.map(x=>x.id===c.cr.id?{...x,status:st}:x)}));this.open(c.p.id);this.flash(msg);}
  reviewVals(){const s=this.state;const c=this.crCtx();if(!c)return{noChanges:true,noChangesText:'This change request no longer exists.',onBack:()=>this.go({screen:'list'}),chunks:[]};
    const{p,cr}=c;const t=teamOf(p);const r=s.review;const open=cr.status==='open';const lead=t.lead===ME;const canDecide=open&&lead;const L=latest(p);
    const au=PEOPLE[cr.author];const af=fnm(cr.author);const lf=fnm(t.lead);const mineAuthor=cr.author===ME;
    const{chunks,hunks}=this.crChunks(c);const hasDraft=!!p.draft;
    const youL=lead?(hasDraft?'Your draft':'v'+L.v+' (latest)'):lf+'’s draft',themL=mineAuthor?'Your version':af+'’s version';
    let sec='';const out=[];let ctx=null;
    const secOf=arr=>arr.forEach(x=>{if(x.startsWith('## '))sec=x.slice(3);});
    chunks.forEach(ch=>{
      if(ch.idx==null){ch.ours.filter(x=>!x.startsWith('@@')).forEach(x=>{const d=dispB(x);if(!ctx){ctx={isContext:true,isHunk:false,isConflict:false,blocks:[]};out.push(ctx);}ctx.blocks.push({isH:!!d.isH,isText:!d.isH,text:d.text});});secOf(ch.base.length?ch.base:ch.ours);return;}
      ctx=null;const dec=r.dec[ch.idx];const section=sec;const meta=[...ch.base,...ch.theirs].some(x=>x.startsWith('@@'));secOf(ch.base);
      if(ch.kind==='theirs'){const acc=dec==='accept',rej=dec==='reject';
        out.push({isContext:false,isHunk:true,isConflict:false,label:hunkLabel(ch.base,ch.theirs),section,hasSection:!!section&&!meta,rows:hunkRows(ch.base,ch.theirs),canDecide,
          border:acc?'#2e5e45':'#e4e2da',shadow:acc?'0 0 0 1px #2e5e45':'none',rowsOpacity:rej?0.45:1,
          acLabel:acc?'Accepted':'Accept',acBg:acc?'#2e5e45':'#fff',acColor:acc?'#fff':'#18201b',acBorder:acc?'#2e5e45':'#d9d6cc',
          rjLabel:rej?'Rejected':'Reject',rjBg:rej?'#fbf3f1':'#fff',rjColor:rej?'#a3322a':'#18201b',rjBorder:rej?'#d9a9a2':'#d9d6cc',
          onAccept:()=>this.decide(ch.idx,'accept'),onReject:()=>this.decide(ch.idx,'reject')});
      }else{const bt=ch.base.map(x=>dispB(x).text).join('\n\n');
        const side=(arr,key,label)=>{const on=dec===key;const tx=arr.map(x=>dispB(x).text).join('\n\n');return{label,segs:segsOf(wdiff(bt,tx)),canPick:canDecide,border:on?'#2e5e45':'#e4e2da',bg:on?'#f3f7f3':'#fff',ring:on?'#2e5e45':'#b9b6ac',dot:on?'#2e5e45':'transparent',cursor:canDecide?'pointer':'default',onPick:()=>{if(canDecide)this.decide(ch.idx,key);}};};
        const editing=dec==='edit';const strip=arr=>arr.map(x=>x.replace(/^@@(title|summary) /,'')).join('\n\n');
        out.push({isContext:false,isHunk:false,isConflict:true,label:hunkLabel(ch.base,ch.theirs),section,hasSection:!!section&&!meta,canDecide,
          border:dec?'#2e5e45':'#e6d3a8',explain:(lead?'You':lf)+' and '+(mineAuthor?'you':af)+' both edited this since v'+cr.base+'. Highlights show what each version changed. '+(canDecide?'Pick one to keep, or write a combined version.':lf+' picks which one to keep.'),
          options:[side(ch.ours,'mine',youL),side(ch.theirs,'theirs',themL)],
          isEditing:editing,editLabel:editing?'Editing a combined version':'Write a combined version instead',editText:r.edits[ch.idx]!=null?r.edits[ch.idx]:strip(ch.theirs),
          onEdit:()=>{if(r.edits[ch.idx]==null)this.setRV({edits:{...r.edits,[ch.idx]:strip(ch.theirs)}});this.decide(ch.idx,'edit');},
          onEditText:e=>{const v2=e.target.value;this.setState(z=>({review:{...z.review,edits:{...z.review.edits,[ch.idx]:v2}}}));},
          baseLabel:'v'+cr.base,baseText:bt||'Nothing here yet'});}
    });
    const nH=hunks.length,nC=hunks.filter(h=>h.kind==='conflict').length,decided=hunks.filter(h=>r.dec[h.idx]).length;
    const acc=hunks.filter(h=>['accept','theirs','edit'].includes(r.dec[h.idx])).length,rej=hunks.filter(h=>['reject','mine'].includes(r.dec[h.idx])).length;
    const ready=decided===nH;const st=CR_ST[cr.status];const ch1=n=>n+(n===1?' change':' changes');
    const intro=open?(lead?(hasDraft?'Compared with your draft, saved '+p.draft.saved+'. ':'Compared with v'+L.v+', the latest version. ')+ch1(nH)+' from '+(mineAuthor?'you':af)+'. '+(nC?nC+(nC===1?' overlaps':' overlap')+' with edits made since v'+cr.base+', so pick which version to keep. The rest merge cleanly.':'None overlap with edits made since v'+cr.base+', so each one merges cleanly.')
      :(mineAuthor?'You suggested '+ch1(nH)+'. '+lf+' accepts or rejects each one.':af+' suggested '+ch1(nH)+'. '+lf+' reviews them.')):af+'’s changes against v'+cr.base+'.';
    let stateLine='';if(!open)stateLine=cr.status==='merged'?'Merged into '+(lead?'your':lf+'’s')+' draft'+(cr.result?' · '+cr.result+' changes accepted':''):cr.status==='returned'?'Sent back to '+(mineAuthor?'you':af)+' to update':cr.status==='closed'?'Closed without merging':'Withdrawn';else if(!lead&&!mineAuthor)stateLine='Waiting for '+lf+'’s review';
    return{onBack:()=>this.open(p.id),proposalTitle:content(p).title,onProposal:()=>this.open(p.id),note:cr.note,initials:au.initials,...this.av(cr.author),authorName:au.name,onAuthor:()=>this.openProfile(cr.author),
      metaLine:'Based on v'+cr.base+' · '+(cr.time==='Just now'?'just now':ago(cr.time)),status:canDecide?'Needs your review':st.label,stBg:st.bg,stFg:st.fg,intro,chunks:out,
      noChanges:!nH,noChangesText:open?'Everything in this request is already in '+(lead?'your draft':lf+'’s draft')+'.':'No changes.',
      asideKicker:canDecide?'Your review':'Status',isLeadOpen:canDecide,isAuthorOpen:open&&!lead&&mineAuthor,isAuthorReturned:cr.status==='returned'&&mineAuthor,hasStateLine:!!stateLine,stateLine,
      progress:decided+' of '+nH+' decided',breakdown:[acc+' accepted',rej+' kept as is'].join(' · '),pct:nH?Math.round(decided/nH*100)+'%':'100%',
      applyLabel:nH?'Merge into draft':'Close request',applyBg:ready?'#2e5e45':'#9fb5a7',onApply:()=>this.applyCR(),
      canAcceptAll:canDecide&&hunks.some(h=>h.kind==='theirs'&&!r.dec[h.idx]),onAcceptAll:()=>{const dec={...r.dec};hunks.forEach(h=>{if(h.kind==='theirs'&&!dec[h.idx])dec[h.idx]='accept';});this.setRV({dec});},
      applyHint:'Accepted changes go into your draft. Nothing is published until you publish a new version.',
      sendBackLabel:'Send back to '+af,onSendBack:()=>this.setCrStatus('returned','Sent back to '+af),onCloseCr:()=>this.setCrStatus('closed','Change request closed'),
      waitLine:lf+' hasn’t reviewed this yet.',onWithdraw:()=>this.setCrStatus('withdrawn','Change request withdrawn'),onUpdate:()=>this.suggestChanges(p.id,cr.id),
      howText:'Changes are compared paragraph by paragraph with v'+cr.base+', the version '+(mineAuthor?'you':af)+' started from. Paragraphs only one person edited merge cleanly. Paragraphs both people edited are shown side by side.'};}
  editProfile(){const u=PEOPLE[ME];this.setState({profileEdit:{name:u.name,title:u.title,org:u.org,location:u.location,bio:u.bio,langs:[...u.langs],error:''}});}
  setPE(o){this.setState(s=>({profileEdit:{...s.profileEdit,...o}}));}
  saveProfile(){const d=this.state.profileEdit;const name=d.name.trim();if(!name)return this.setPE({error:'Add your name.'});if(d.bio.length>280)return this.setPE({error:'Keep your bio under 280 characters.'});if(!d.langs.length)return this.setPE({error:'Pick at least one language.'});
    const ini=name.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
    Object.assign(PEOPLE[ME],{name,initials:ini,title:d.title.trim(),org:d.org.trim(),location:d.location.trim(),bio:d.bio.trim(),langs:d.langs});
    this.setState({profileEdit:null});this.flash('Profile updated');}
  profileVals(){
    const s=this.state;const id=s.profileId||ME;const u=PEOPLE[id];const me=id===ME;const first=u.name.split(' ')[0];
    const props=s.proposals.filter(p=>p.author===id&&(me||p.versions.length)).sort((a,b)=>b.ts-a.ts);
    const items=[];s.proposals.filter(p=>p.versions.length).forEach(p=>p.comments.forEach(c=>{if(c.author===id)items.push({p,c,x:c});c.replies.forEach(r=>{if(r.author===id)items.push({p,c,r,x:r});});}));
    items.sort((a,b)=>a.x.age-b.x.age);
    const inv=new Set([...props.filter(p=>p.versions.length),...items.map(i=>i.p)]);const cnt={};inv.forEach(p=>Object.keys(p.scores).forEach(k=>{cnt[k]=(cnt[k]||0)+1;}));
    const tab=s.profileTab==='comments'?'comments':'proposals';
    const rs=ROLE_STYLE[u.role]||ROLE_STYLE.Citizen;const fol=!!s.followPeople[id];
    const langName=c=>{const x=LANG_CATALOG.find(l=>l[0]===c);return x?x[2]:c;};
    const work=[u.title,u.org].filter(Boolean).join(', ');
    return{name:u.name,initials:u.initials,...(me?{avBg:'#1f3d2e',avColor:'#f1efe6'}:{avBg:'#e2ebe4',avColor:'#234a36'}),role:u.role,roleBg:rs.bg,roleFg:rs.fg,isMe:me,notMe:!me,
      headline:[work,u.location].filter(Boolean).join(' · '),
      onEdit:()=>this.editProfile(),followLabel:fol?'Following ✓':'Follow',followBg:fol?'#fff':'#2e5e45',followColor:fol?'#2e5e45':'#fff',followBorder:'#2e5e45',
      onFollow:()=>{this.setState(x=>({followPeople:{...x.followPeople,[id]:!fol}}));this.flash(fol?'Unfollowed '+u.name:'You’ll be notified when '+first+' publishes');},
      tabs:[['proposals','Proposals',props.length],['comments','Comments',items.length]].map(([k,label,n])=>({label,count:n,color:tab===k?'#18201b':'#8a918b',line:tab===k?'#2e5e45':'transparent',onClick:()=>this.setState({profileTab:k})})),
      isPropsTab:tab==='proposals',isCommentsTab:tab==='comments',
      rows:props.map(p=>this.rowOf(p)),hasProps:props.length>0,noProps:!props.length,noPropsText:me?'You haven’t written a proposal yet.':first+' hasn’t published a proposal yet.',
      comments:items.map(({p,c,r,x})=>{const flag=x.jev&&x.jev.flag;const hidden=!!flag&&!me;return{proposal:this.rowTx(content(p)).title,context:r?(c.author===id?'In their thread on':'Replied to '+PEOPLE[c.author].name.split(' ')[0]+' on'):'Commented on',
        text:r?this.splitMention(x.text).body:x.text,isShown:!hidden,isHidden:hidden,time:ago(x.time),hasLikes:x.likes>0,likesLabel:x.likes+(x.likes===1?' like':' likes'),hasNote:!!flag&&me,note:'Pending review',
        onOpen:()=>{this.open(p.id);setTimeout(()=>this.jump(r?{cid:c.id,rid:r.id}:{cid:c.id}),60);}};}),
      hasComments:items.length>0,noComments:!items.length,noCommentsText:me?'You haven’t commented on a proposal yet.':first+' hasn’t commented yet.',
      bio:u.bio,hasBio:!!u.bio,noBioMe:!u.bio&&me,
      details:[['Organisation',u.org],['Location',u.location],['Member since',u.joined],['Reads in',u.langs.map(langName).join(', ')]].filter(d=>d[1]).map(([k,v2])=>({k,v:v2})),
      firstPron:me?'you':first,...this.strengthVals(id,me,first,Object.keys(cnt).length>0),
      streams:Object.entries(cnt).map(([k,n])=>({st:this.stream(k),n})).filter(x=>x.st).sort((a,b)=>b.n-a.n).map(x=>({name:x.st.name,color:x.st.color,count:x.n,onClick:()=>this.go({screen:'list',tab:'all',stream:x.st.id})}))};
  }
  strengthsOf(id){
    const raw={},np={},nc={};const add=(k,v2,o)=>{raw[k]=(raw[k]||0)+v2;o[k]=(o[k]||0)+1;};
    this.state.proposals.filter(p=>p.versions.length).forEach(p=>{const sc=Object.entries(p.scores);
      if(p.author===id)sc.forEach(([k,n])=>add(k,n,np));
      const mine=[];p.comments.forEach(c=>{if(c.author===id)mine.push(c);c.replies.forEach(r=>{if(r.author===id)mine.push(r);});});
      mine.filter(x=>!(x.jev&&x.jev.flag)).forEach(x=>{const rel=(x.jev&&x.jev.rel!=null?x.jev.rel:jevFull(x.text,p).rel)/100;sc.forEach(([k,n])=>add(k,n/10*rel*3*(1+Math.min(x.likes,10)*0.1),nc));});});
    return Object.keys(raw).map(k=>({st:this.stream(k),raw:raw[k],np:np[k]||0,nc:nc[k]||0})).filter(x=>x.st&&x.raw>=1)
      .map(x=>({...x,n:Math.max(1,Math.round(10*(1-Math.exp(-x.raw/8))))})).sort((a,b)=>b.n-a.n||b.raw-a.raw).slice(0,5);}
  strengthVals(id,me,first,hasStreams){
    const s=this.state;const pub=!!s.strengthsPublic[id];const list=this.strengthsOf(id);const sfx=this.suffix();
    const pl=(n,w)=>n+' '+w+(n===1?'':'s');
    return{showStrengths:me||(pub&&list.length>0),showActive:!me&&!(pub&&list.length>0)&&hasStreams,hasStrengths:list.length>0,noStrengths:!list.length,
      strengthCaption:'Calculated from '+(me?'your':'their')+' proposals’ stream scores and how relevant '+(me?'your':'their')+' comments are',
      strengths:list.map(x=>({name:x.st.name,color:x.st.color,pct:(x.n*10)+'%',value:this.fmt(x.n),suffix:sfx,evidence:[x.np?pl(x.np,'proposal'):'',x.nc?pl(x.nc,'comment'):''].filter(Boolean).join(' · ')})),
      ...track(pub),visLine:pub?'Visible to everyone on your profile':'Only you can see your strengths',visBg:pub?'#eef3ee':'#f5f4ef',visFg:pub?'#234a36':'#5d665f',
      onToggleStrengths:()=>{this.setState(x=>({strengthsPublic:{...x.strengthsPublic,[id]:!pub}}));this.flash(pub?'Strengths are now private':'Strengths are now public');}};}
  peVals(){const d=this.state.profileEdit;if(!d)return{isOpen:false};const f=k=>e=>this.setPE({[k]:e.target.value,error:''});const n=d.bio.length;
    return{isOpen:true,name:d.name,title:d.title,org:d.org,location:d.location,bio:d.bio,count:n+'/280',countColor:n>280?'#a3322a':'#6b736d',role:PEOPLE[ME].role,error:d.error,hasError:!!d.error,
      onName:f('name'),onTitle:f('title'),onOrg:f('org'),onLocation:f('location'),onBio:f('bio'),
      langs:this.state.langs.filter(l=>l.enabled).map(l=>{const on=d.langs.includes(l.code);return{label:l.native,bg:on?'#eef3ee':'#fff',border:on?'#2e5e45':'#e0ddd4',weight:on?600:400,onClick:()=>this.setPE({langs:on?d.langs.filter(c=>c!==l.code):[...d.langs,l.code],error:''})};}),
      onSave:()=>this.saveProfile(),onCancel:()=>this.setState({profileEdit:null})};}

  renderVals(){
    const s=this.state;const compact=this.props.listDensity==='compact';const sfx=this.suffix();
    const activeStreams=s.streams.filter(x=>x.active);
    const visible=s.proposals.filter(p=>p.versions.length||isMem(p));
    const published=s.proposals.filter(p=>p.versions.length);
    const tabDefs=[['all','All proposals',visible],['mine','My proposals',s.proposals.filter(p=>isMem(p))],['drafts','Drafts',s.proposals.filter(p=>teamOf(p).lead===ME&&p.draft)],['following','Following',visible.filter(p=>p.following)]];
    const cur=tabDefs.find(t=>t[0]===s.tab)||tabDefs[0];
    const q=s.query.trim().toLowerCase();
    let rows=cur[2].filter(p=>{const c=content(p);const hay=[c.title,c.summary,PEOPLE[p.author].name,...Object.keys(p.scores).map(id=>(this.stream(id)||{}).name||'')].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!s.stream||p.scores[s.stream]!=null);});
    const maxS=p=>Math.max(0,...Object.values(p.scores));
    rows=[...rows].sort((a,b)=>s.sort==='discussed'?nComments(b)-nComments(a):s.sort==='score'?(s.stream?(b.scores[s.stream]||0)-(a.scores[s.stream]||0):maxS(b)-maxS(a)):b.ts-a.ts);
    const curStream=s.stream&&this.stream(s.stream);
    const out={
      isLogin:s.screen==='login',isApp:s.screen!=='login',isList:s.screen==='list',isView:s.screen==='view',isEdit:s.screen==='edit',isSettings:s.screen==='settings',isProfile:s.screen==='profile',meName:PEOPLE[ME].name,meInitials:PEOPLE[ME].initials,goProfile:()=>this.openProfile(ME),
      email:s.email,password:s.password,loginError:s.loginError,hasLoginError:!!s.loginError,
      onEmail:e=>this.setState({email:e.target.value,loginError:''}),onPassword:e=>this.setState({password:e.target.value,loginError:''}),
      onLogin:()=>this.login(),onLoginKey:e=>{if(e.key==='Enter')this.login();},
      onLogout:()=>this.go({screen:'login'}),toggleMenu:()=>this.setState({menuOpen:!s.menuOpen,langMenu:false}),menuOpen:s.menuOpen,
      goList:()=>this.go({screen:'list'}),goMine:()=>this.go({screen:'list',tab:'mine',stream:null}),goSettings:()=>this.go({screen:'settings'}),onNew:()=>this.newProposal(),
      gearBg:s.screen==='settings'?'#fff':'transparent',
      query:s.query,onQuery:e=>this.setState({query:e.target.value,screen:'list'}),
      sort:s.sort,onSort:e=>this.setState({sort:e.target.value}),showSummary:!compact,
      scoreSortLabel:curStream?'Highest '+curStream.name+' score':'Highest score',
      tabs:tabDefs.map(([id,label,list])=>({label,count:list.length,bg:s.tab===id?'#fff':'transparent',border:s.tab===id?'#e0ddd4':'transparent',weight:s.tab===id?600:400,onClick:()=>this.setState({tab:id})})),
      streamFilters:activeStreams.map(st=>({name:st.name,color:st.color,count:visible.filter(p=>p.scores[st.id]!=null).length,bg:s.stream===st.id?'#e2ebe4':'transparent',weight:s.stream===st.id?600:400,onClick:()=>this.setState({stream:s.stream===st.id?null:st.id})})),
      listTitle:curStream?curStream.name:cur[1],
      listSubtitle:rows.length+(rows.length===1?' proposal':' proposals')+(curStream?' in '+cur[1].toLowerCase():'')+(q?' matching “'+s.query.trim()+'”':''),
      hasRows:rows.length>0,noRows:rows.length===0,clearFilters:()=>this.setState({query:'',stream:null,tab:'all'}),
      rows:rows.map(p=>this.rowOf(p)),
      cSort:s.cSort,onCSort:e=>this.setState({cSort:e.target.value}),newComment:s.newComment,onNewComment:e=>this.setState({newComment:e.target.value,check:null}),onPostComment:()=>this.postComment(),postBg:s.newComment.trim()?'#2e5e45':'#9fb5a7',
      toast:s.toast,hasToast:!!s.toast,
      langCode:s.lang.toUpperCase(),langMenu:s.langMenu,toggleLangMenu:()=>this.setState({langMenu:!s.langMenu,menuOpen:false}),langBtnBg:s.lang!==s.txCfg.source?'#fff':'transparent',txBusyShown:s.txBusy>0,
      langItems:s.langs.filter(l=>l.enabled).map(l=>({native:l.native,sub:l.code===s.txCfg.source?l.name+' · original':l.name,on:l.code===s.lang,bg:l.code===s.lang?'#eef3ee':'transparent',weight:l.code===s.lang?600:500,onClick:()=>this.setLang(l.code)})),
      goLangSettings:()=>this.go({screen:'settings',settingsTab:'languages'}),onTxRetry:()=>this.setState({txFailed:false}),
      onSaveDraft:()=>this.openSave(),onPublish:()=>this.publish(),
      onTitle:this.field('title'),onSummary:this.field('summary'),onBody:this.field('body'),onNote:ev=>{const v2=ev.target.value;this.setEdit({note:v2,noteAuto:false,error:''});},
      v:{},ed:{},sd:{isOpen:false},pr:s.screen==='profile'?this.profileVals():{},pe:this.peVals()
    };
    const p=s.proposals.find(x=>x.id===s.currentId);
    if(s.screen==='view'&&p){
      const L=latest(p);const shown=s.viewV!=null?p.versions.find(x=>x.v===s.viewV):(L||p.draft);const tmm=teamOf(p);const mine=tmm.lead===ME;const contrib=!mine&&tmm.members.some(m=>m.id===ME);
      const vt=this.viewTx(p,shown);const T=vt.T;
      const blocks=this.viewBlocks(p,shown,T);const hasImages=blocks.some(b=>b.isImage);
      const ss=this.sortedScores(p);const unscored=activeStreams.filter(st=>p.scores[st.id]==null).map(st=>st.name);
      const who=s.settings.scoredBy;const adjusting=!!s.scoreEdit;
      out.v={
        title:T(shown.title),summary:T(shown.summary),blocks,hasImages,toBg:s.textOnly?'#eef3ee':'#fff',toBorder:s.textOnly?'#2e5e45':'#e0ddd4',
        onTextOnly:()=>{const on=!s.textOnly;try{localStorage.setItem('ip-text-only',on?'1':'0');}catch(e){}this.setState({textOnly:on,shownImgs:{}});this.flash(on?'Images hidden. Tap one to load it.':'Images shown');},...vt.banner,authorName:PEOPLE[tmm.lead].name,onAuthor:()=>this.openProfile(tmm.lead),initials:PEOPLE[tmm.lead].initials,
        metaLine:L?('Published v'+L.v+' · '+L.date+(p.versions.length>1?' · first published '+p.versions[0].date:'')):'Draft · saved '+p.draft.saved,
        isOld:s.viewV!=null&&L&&s.viewV!==L.v,shownLabel:shown.v?'v'+shown.v:'',shownDate:shown.date,shownNote:shown.note,latestLabel:L?'v'+L.v:'',onLatest:()=>this.setState({viewV:null}),
        isDraftOnly:!L,isPublished:!!L,canComment:!!L,isMine:mine,notMine:!mine&&!contrib,isContrib:contrib,canSuggest:contrib&&!!L,suggestHint:L?fnm(tmm.lead)+' reviews your changes before anything is published.':'You can suggest changes once v1 is published.',onSuggest:()=>this.suggestChanges(p.id),tm:this.teamCard(p),
        scoreCaption:'Detected automatically from the proposal',
        scoreRows:ss.map(x=>({name:x.st.name,color:x.st.color,pct:(x.n*10)+'%',value:this.fmt(x.n),suffix:sfx})),
        hasUnscored:unscored.length>0&&!adjusting,unscored:unscored.join(', '),
        canAdjust:who!=='author'&&!adjusting,isAdjusting:adjusting,notAdjusting:!adjusting,
        onAdjust:()=>this.setState({scoreEdit:{...p.scores}}),onCancelAdjust:()=>this.setState({scoreEdit:null}),
        onSaveAdjust:()=>{const n=s.scoreEdit;this.upd(p.id,x=>({...x,scores:n}));this.setState({scoreEdit:null});this.flash('Scores updated');},
        adjustItems:adjusting?this.scoreItems(s.scoreEdit,n=>this.setState({scoreEdit:n})):[],
        statusLine:L?(p.versions.length+(p.versions.length===1?' version':' versions')+' · last published '+L.date):'Not published yet',
        editLabel:p.draft?'Continue draft':(L?'Edit as new version':'Edit draft'),onEdit:()=>this.editProposal(p.id),
        followLabel:p.following?'Following ✓':'Follow proposal',onFollow:()=>{this.upd(p.id,x=>({...x,following:!x.following}));this.flash(p.following?'Unfollowed':'You’ll be notified about new versions');},
        hasPendingMine:!!(mine&&p.draft&&L),draftSaved:p.draft?p.draft.saved:'',noVersions:!L,
        versions:[...p.versions].reverse().map(x=>{const active=shown===x;const ch=this.verChanges(p,x);return{label:'v'+x.v,date:x.date+' · '+verBy(x,p),note:x.note,changes:ch,hasChanges:ch.length>0,isLatest:x===L,bg:active?'#eef3ee':'transparent',dot:active?'#2e5e45':'#c9cec7',onClick:()=>this.setState({viewV:x===L?null:x.v})};}),
        commentCount:nComments(p),
        ...(()=>{
          const all=p.comments.map(c=>c.jev&&c.jev.cat?c:{...c,jev:{...jevFull(c.text,p),flag:c.jev&&c.jev.flag}});
          const hid=c=>c.jev.flag&&c.author!==ME?1:0;
          const cmp={relevant:(a,b)=>hid(a)-hid(b)||b.jev.rel-a.jev.rel||b.likes-a.likes,newest:(a,b)=>a.age-b.age,oldest:(a,b)=>b.age-a.age,liked:(a,b)=>b.likes-a.likes||a.age-b.age,replies:(a,b)=>b.replies.length-a.replies.length||a.age-b.age}[s.cSort];
          const list=[...all].sort(cmp);
          const ins=L?(p.insights||[]):[];const insTab=s.cTab==='insights'&&ins.length>0;
          const GROUPS=[['concern','Concerns','#b07a1f'],['suggestion','Suggestions','#2f7680'],['clarification','Clarifications','#3b6a8f']];
          const t=s.newComment.trim();const ck=s.check&&s.check.text===t?s.check.j:null;
          const rt=s.replyText.trim();const rFlag=s.replyCheck&&s.replyCheck===rt?jevFlag(rt).flag:null;
          const tab=on=>({c:on?'#18201b':'#8a918b',l:on?'#2e5e45':'transparent'});
          return{
            isDiscussionTab:!insTab,isInsightsTab:insTab,showSort:!insTab&&all.length>1,hasInsights:ins.length>0,insightCount:ins.length,
            tabDColor:tab(!insTab).c,tabDLine:ins.length?tab(!insTab).l:'transparent',tabIColor:tab(insTab).c,tabILine:tab(insTab).l,
            onTabDiscussion:()=>this.setState({cTab:'discussion'}),onTabInsights:()=>this.setState({cTab:'insights'}),
            insightGroups:GROUPS.map(([k,label,dot])=>{const items=ins.filter(i=>i.kind===k).sort((a,b)=>(a.answered?1:0)-(b.answered?1:0)||b.votes-a.votes);const nA=items.filter(i=>i.answered).length;return{label,dot,n:items.length,count:items.length+(nA?' · '+nA+' answered':''),items:items.map((i,ix)=>({text:vt.D(i.text),votes:i.votes,answered:!!i.answered,textColor:i.answered?'#5d665f':'#18201b',canMark:mine&&k==='clarification',markLabel:i.answered?'Mark unanswered':'Mark answered',markBg:i.answered?'#fff':'#2e5e45',markColor:i.answered?'#5d665f':'#fff',markBorder:i.answered?'#e0ddd4':'#2e5e45',onMark:()=>this.markAnswered(p.id,i.id,!i.answered),sep:ix?'#efede6':'transparent',voteBg:i.voted?'#e2ebe4':'#fff',voteBorder:i.voted?'#2e5e45':'#e0ddd4',voteColor:i.voted?'#2e5e45':'#18201b',onVote:()=>this.vote(p.id,i.id),
              sources:i.src.map((sr,si)=>{const c=p.comments.find(x=>x.id===sr.cid);const r=sr.rid&&c?c.replies.find(x=>x.id===sr.rid):null;const au=r||c;return{label:(au?PEOPLE[au.author].name.split(' ')[0]:'')+(si<i.src.length-1?',':''),onJump:()=>this.jump(sr)};})}))};}).filter(g=>g.n>0),
            hasCheck:!!ck,checkColor:ck&&ck.flag?'#a3322a':'#7a5410',
            checkText:ck?(ck.flag?'Possible '+ck.flag.toLowerCase()+'. Edit it, or post it for moderator review.':'This looks unrelated to the proposal. Edit it, or post anyway.'):'',
            composerBorder:ck?(ck.flag?'#d9a9a2':'#e6d3a8'):'#e0ddd4',
            postLabel:s.checking?'Checking…':ck?(ck.flag?'Post for review':'Post anyway'):'Post comment',postBg:t&&!s.checking?'#2e5e45':'#9fb5a7',
            comments:list.map(c=>{const many=c.replies.length>2&&!s.expanded[c.id];const shownR=many?c.replies.slice(-1):c.replies;const hidden=c.replies.length-shownR.length;const g=this.gov(c,p.id,c.id);const open=s.replyTo===c.id;
          return{...this.av(c.author),...g,...this.relView(c.jev.rel,c.jev.topic),id:c.id,bubbleBg:s.highlight===c.id?'#f6ecd6':g.bubbleBg,initials:PEOPLE[c.author].initials,authorName:PEOPLE[c.author].name,onAuthor:()=>this.openProfile(c.author),...this.cTx(c,p,vt),time:c.time,likes:c.likes,hasLikes:c.likes>0,likeColor:c.liked?'#2e5e45':'#5d665f',
            onLike:()=>this.like(p.id,c.id),onReply:()=>this.setState({replyTo:c.id,replyText:'',replyCheck:null}),
            collapsed:hidden>0,replyCountLabel:hidden+' earlier '+(hidden===1?'reply':'replies'),onExpand:()=>this.setState({expanded:{...s.expanded,[c.id]:true}}),
            shownReplies:shownR.map(r=>{const rg=this.gov(r,p.id,c.id,r.id);return{...this.av(r.author),...rg,...(q=>({...q,...this.splitMention(q.text)}))(this.cTx(r,p,vt)),id:r.id,bubbleBg:s.highlight===r.id?'#f6ecd6':rg.bubbleBg,initials:PEOPLE[r.author].initials,authorName:PEOPLE[r.author].name,onAuthor:()=>this.openProfile(r.author),time:r.time,likes:r.likes,hasLikes:r.likes>0,likeColor:r.liked?'#2e5e45':'#5d665f',
              onLike:()=>this.like(p.id,c.id,r.id),onReply:()=>this.setState({replyTo:c.id,replyCheck:null,replyText:r.author===ME?'':'@'+PEOPLE[r.author].name+' '})};}),
            showReplyBox:open,replyText:s.replyText,onReplyChange:e=>this.setState({replyText:e.target.value,replyCheck:null}),
            replyFlagged:open&&!!rFlag,replyFlagLine:rFlag?'Possible '+rFlag.toLowerCase()+'. Send again to post it for moderator review.':'',replyBorder:open&&rFlag?'#d9a9a2':'#e0ddd4',replyBtn:open&&rFlag?'Post for review':'Reply',
            onReplyKey:e=>{if(e.key==='Enter'){e.preventDefault();this.submitReply(c.id);}if(e.key==='Escape')this.setState({replyTo:null});},
            onReplySubmit:()=>this.submitReply(c.id),onReplyCancel:()=>this.setState({replyTo:null,replyText:'',replyCheck:null})};})};
        })()
      };
    }
    if(s.screen==='edit'&&s.edit){
      const e=s.edit;const ep=e.id&&s.proposals.find(x=>x.id===e.id);const L=ep&&latest(ep);const n=(ep?ep.versions.length:0)+1;const authorScores=s.settings.scoredBy!=='reviewers';
      out.ed={title:e.title,summary:e.summary,body:e.body,note:e.note,error:e.error,hasError:!!e.error,
        scoreItems:this.scoreItems(e.scores,sc=>this.setEdit({scores:sc,error:''})),authorScores,
        scoreHint:authorScores?(s.settings.scoredBy==='both'?'Pick the streams this affects and suggest a score. Reviewers confirm after publishing.':'Pick the streams this affects and score the impact on each.'):'Pick the streams this affects. Reviewers assign scores after publishing.',
        heading:!ep?'New proposal':(L?'Editing v'+n+' draft':'Editing draft'),
        backLabel:ep?'Back to proposal':'Cancel',
        statusText:!ep?'New · not saved yet':(L?'Published v'+L.v+(ep.draft?' · draft of v'+n+' in progress':''):'Draft · not published'),
        savedLine:e.saved?'Draft saved '+e.saved:'',
        publishLabel:L?'Publish v'+n:'Publish',
        noteLabel:L?'What changed in v'+n+'?':'Version note (optional)',notePlaceholder:L?'e.g. Added cost estimate':'Initial version',
        publishHint:L?'Required. v1–v'+L.v+' stay readable in version history.':'Publishing creates v1 and opens comments.',
        hasTxHint:s.txCfg.onPublish&&this.txTargets().length>0,txHint:'Translated into '+this.txTargets().map(l=>l.native).join(', ')+' when you publish. Unchanged sections reuse earlier translations.',
        hasHistory:!!L,history:L?[...ep.versions].reverse().map(x=>({label:'v'+x.v,date:x.date+' · '+verBy(x,ep),note:x.note})):[],
        };
      const ch=L?changesOf(L,{title:e.title.trim(),summary:e.summary.trim(),body:e.body}):[];
      const rows=Object.entries(e.scores||{}).map(([id,k])=>({st:this.stream(id),k})).filter(x=>x.st).sort((a,b)=>b.k-a.k);const sfx2=this.suffix();
      const hasBody=plainBody(e.body).trim().length>=40;const sumEmpty=!e.summary.trim();const stale=!!e.sumAuto&&!sumEmpty&&e.sumFor!==hsh(e.body);
      Object.assign(out.ed,{onSummary:ev=>{const v2=ev.target.value;this.setEdit({summary:v2,sumAuto:false,error:''});},sumPh:'One or two sentences that sum up the ask',
        sumBusy:!!e.sumBusy,sumIdle:!e.sumBusy,sumOpacity:e.sumBusy?0.45:1,sumCanGen:hasBody,
        sumBtn:sumEmpty?'Generate from proposal':stale?'Update summary':e.sumAuto?'Regenerate':'Generate from proposal',
        sumNote:sumEmpty?(hasBody?'Leave it empty and one is written for you when you save.':'Write the proposal first, then generate a summary from it.'):stale?'The proposal has changed since this summary was written.':e.sumAuto?'Written automatically from the proposal. Edit it if you like.':'Written by you. Generate one from the proposal to replace it.',
        sumNoteColor:stale?'#7a5410':'#6b736d',onGenSummary:()=>this.genSummary()});
      const meName=PEOPLE[ME].name;const dn=(e.note||'').trim();
      Object.assign(out.ed,{draftLabel:'Draft',draftMeta:(e.saved?'Saved '+e.saved:'Not saved yet')+' · '+meName,draftNote:dn||(e.saved?'No description':'Saved drafts appear here with a description of what changed'),draftNoteColor:dn?'#4f5751':'#8a918b',
        hasScores:rows.length>0,noScores:!rows.length,scoreRows:rows.map(x=>({name:x.st.name,color:x.st.color,pct:(x.k*10)+'%',value:this.fmt(x.k),suffix:sfx2})),
        scoreHint:s.settings.scoredBy==='author'?'Updated from your proposal each time you save.':'Updated from your proposal each time you save. Reviewers can adjust scores after publishing.'});
      out.ed.notCr=!e.cr;if(e.cr&&ep){const lf=fnm(teamOf(ep).lead);Object.assign(out.ed,{heading:'Suggesting changes to v'+e.cr.base,backLabel:'Back to proposal',statusText:'Change request based on v'+e.cr.base+'. '+lf+' reviews each change before it goes into a new version.',publishLabel:'Submit for review',savedLine:'',hasTxHint:false,draftLabel:'Your changes',draftMeta:'Not submitted · '+meName,draftNote:'Sent to '+lf+' as a change request',draftNoteColor:'#4f5751'});}
      const S=s.sel||{};const on=x=>x?'#e2ebe4':'transparent';const dk=x=>x?'rgba(255,255,255,0.16)':'transparent';const md=fn=>ev=>{ev.preventDefault();fn();};
      out.ed.tb={bt:S.bt==='h'||S.bt==='quote'?S.bt:'p',onBlock:ev=>this.setBlock(ev.target.value),bBg:on(S.b),iBg:on(S.i),aBg:on(S.a),ulBg:on(S.bt==='ul'),olBg:on(S.bt==='ol'),
        onB:md(()=>this.exec('bold')),onI:md(()=>this.exec('italic')),onLink:md(()=>this.openLink()),onUl:md(()=>this.setBlock('ul')),onOl:md(()=>this.setBlock('ol')),onH:md(()=>this.setBlock('h')),onQ:md(()=>this.setBlock('quote')),
        onImage:md(()=>this.insertKind('image')),onTable:md(()=>this.insertKind('table')),onVideo:md(()=>this.insertKind('video')),onFile:md(()=>this.insertKind('file')),
        inTable:!!S.tbl,notTable:!S.tbl,onRow:md(()=>this.tableOp('row')),onCol:md(()=>this.tableOp('col')),onDelRow:md(()=>this.tableOp('delrow')),onDelCol:md(()=>this.tableOp('delcol')),onDelTable:md(()=>this.tableOp('deltable'))};
      out.ed.bb={b:dk(S.b),i:dk(S.i),a:dk(S.a),h:dk(S.bt==='h'),q:dk(S.bt==='quote')};
      const B=S.bub;out.ed.bubFmt=!!(B&&B.mode==='fmt'&&!s.link&&!s.slash);out.ed.bubLink=!!(B&&B.mode==='link'&&!s.link&&!s.slash);out.ed.bub=B?{x:B.x+'px',y:B.y+'px',href:B.href||''}:{};
      out.ed.onEditLink=md(()=>this.openLink());out.ed.onUnlink=md(()=>this.unlinkHere());
      out.ed.hasLinkEd=!!s.link;out.ed.lk=s.link?{x:s.link.x+'px',y:s.link.y+'px',url:s.link.url,canRemove:s.link.hadLink,onUrl:ev=>{const u=ev.target.value;this.setState(x=>({link:{...x.link,url:u}}));},
        onKey:ev=>{if(ev.key==='Enter'){ev.preventDefault();this.applyLink();}if(ev.key==='Escape'){ev.preventDefault();this.setState({link:null});this._lastRange=this._linkRange;this.restore();}},onApply:md(()=>this.applyLink()),onRemove:md(()=>this.applyLink(true))}:{};
      out.ed.hasSlash=!!s.slash;if(s.slash){const its=this.slashItems();const ix=Math.min(s.slash.idx,its.length-1);out.ed.sl={x:s.slash.x+'px',y:s.slash.y+'px',none:!its.length,
        items:its.map((x,i)=>({label:x[1],desc:x[2],isGlyph:!!x[4],glyph:x[4]||'',gFont:x[5]==='Newsreader'?"'Newsreader',serif":"'Geist',sans-serif",gSize:x[5]==='Newsreader'?'22px':'14px',isTable:x[0]==='table',isImage:x[0]==='image',isVideo:x[0]==='video',isFile:x[0]==='file',bg:i===ix?'#eef3ee':'transparent',onPick:md(()=>this.slashPick(x[0])),onHover:()=>{if(this.state.slash&&this.state.slash.idx!==i)this.setState(z=>({slash:{...z.slash,idx:i}}));}}))};}else out.ed.sl={};
    }
    out.isReview=s.screen==='review';out.rv=out.isReview?this.reviewVals():{chunks:[]};out.tmd=this.teamDrawerVals();out.aj=this.askVals();out.cd=this.crDlgVals();
    out.edRef=this.edRef;
    const dl=s.saveDlg;out.sv=dl?{isOpen:true,kicker:dl.isNew?'Not published yet':'Draft of v'+dl.n,changesLabel:dl.isNew?'Changes':'Changes since v'+dl.lv,
      changes:dl.ch.map((c,i)=>({label:c.label,bt:i?'1px solid #ecebe4':'none'})),hasChanges:dl.ch.length>0,noChanges:!dl.ch.length,noChangesText:dl.isNew?'This is the first version of the proposal.':'Nothing has changed since v'+dl.lv+'.',
      busy:dl.busy,ready:!dl.busy,note:dl.note,onNote:ev=>{const v2=ev.target.value;this.setState(x=>({saveDlg:{...x.saveDlg,note:v2,edited:true}}));},
      canRegen:!dl.isNew&&!dl.busy&&dl.ch.length>0,onRegen:()=>{const e2=this.state.edit;const ep2=e2.id&&s.proposals.find(x=>x.id===e2.id);const L2=ep2&&latest(ep2);if(!L2)return;this.setState(x=>({saveDlg:{...x.saveDlg,edited:false}}));this.fillNote(L2,{title:e2.title.trim(),summary:e2.summary.trim(),body:e2.body},dl.ch,dl.sig);},
      hint:dl.isNew?'Shown in version history once you publish.':dl.busy?'':dl.edited?'You can change this again before publishing.':'Written automatically from your changes. Edit it if you like.',
      saveBg:dl.busy?'#9fb5a7':'#2e5e45',onSave:()=>this.confirmSave(),onCancel:()=>this.setState({saveDlg:null})}:{isOpen:false};
    out.onCancelEdit=()=>{const e=s.edit;if(e&&e.id)this.open(e.id);else this.go({screen:'list'});};
    if(s.screen==='settings'){
      const countIn=id=>s.proposals.filter(p=>p.scores[id]!=null).length;
      out.settingsTabs=[['streams','Streams'],['scoring','Scoring'],['overlaps','Overlaps'],['languages','Languages']].map(([id,label])=>({label,border:s.settingsTab===id?'#2e5e45':'transparent',weight:s.settingsTab===id?600:400,color:s.settingsTab===id?'#18201b':'#5d665f',onClick:()=>this.setState({settingsTab:id})}));
      out.isStreamsTab=s.settingsTab==='streams';out.isScoringTab=s.settingsTab==='scoring';out.isOverlapTab=s.settingsTab==='overlaps';out.isLangTab=s.settingsTab==='languages';
      out.settingsIntro=out.isLangTab?'Choose the languages readers can switch to. Proposals and comments are translated by AI the first time someone reads them, then cached and reused.':'Streams are the public policy areas proposals are organised and scored against. A proposal can belong to several streams, and streams can be marked as overlapping.';
      Object.assign(out,this.langSettings());
      out.streamsSummary=s.streams.length+' streams · '+activeStreams.length+' active';
      out.onAddStream=()=>this.openStream(null);
      out.streamRows=s.streams.map(st=>{const rel=st.related.map(id=>this.stream(id)).filter(Boolean);const c=countIn(st.id);return{name:st.name,desc:st.desc,color:st.color,count:c,related:rel.map(r=>({name:r.name,color:r.color})),noRelated:rel.length===0,opacity:st.active?1:0.5,activeLabel:st.active?'Active':'Inactive',...track(st.active),
        onToggle:()=>{this.setState(x=>({streams:x.streams.map(y=>y.id===st.id?{...y,active:!y.active}:y)}));this.flash(st.name+(st.active?' deactivated':' activated'));},onEdit:()=>this.openStream(st.id)};});
      const sc=s.settings;
      out.scaleOpts=[['5','1 – 5'],['10','0 – 10'],['100','0 – 100']].map(([k,l])=>({label:l,bg:sc.scale===k?'#fff':'transparent',shadow:sc.scale===k?'0 1px 2px rgba(0,0,0,0.12)':'none',weight:sc.scale===k?600:400,onClick:()=>this.setSetting({scale:k})}));
      out.whoOpts=[['author','Author','Authors score their own proposal against each stream.'],['reviewers','Reviewers','Admins and assigned reviewers set all scores.'],['both','Author, then reviewers','Authors suggest scores; reviewers confirm or adjust them.']].map(([k,t,d])=>({title:t,desc:d,border:sc.scoredBy===k?'#2e5e45':'#e0ddd4',bg:sc.scoredBy===k?'#f3f7f3':'#fff',ring:sc.scoredBy===k?'#2e5e45':'#b9b6ac',dot:sc.scoredBy===k?'#2e5e45':'transparent',onClick:()=>this.setSetting({scoredBy:k})}));
      out.scoringToggles=[['requireStream','Require at least one stream to publish','Proposals without a stream can still be saved as drafts.'],['showPublic','Show scores on the public listing','When off, the listing shows stream names only. Scores stay visible on each proposal.']].map(([k,t,d])=>({title:t,desc:d,...track(sc[k]),onToggle:()=>this.setSetting({[k]:!sc[k]})}));
      const both=(a,b)=>published.filter(p=>p.scores[a]!=null&&p.scores[b]!=null).length;
      let mx=1;activeStreams.forEach(a=>activeStreams.forEach(b=>{if(a.id!==b.id)mx=Math.max(mx,both(a.id,b.id));}));
      out.matrixCols=activeStreams.map(st=>({name:st.name,color:st.color}));
      out.matrixRows=activeStreams.map(a=>({name:a.name,color:a.color,cells:activeStreams.map(b=>{if(a.id===b.id)return{label:both(a.id,a.id),bg:'#f3f2ec',color:'#5d665f',shadow:'none',weight:500};const c=both(a.id,b.id);const al=c?0.12+0.7*c/mx:0;const rel=a.related.includes(b.id);return{label:c||'',bg:c?'rgba(46,94,69,'+al.toFixed(2)+')':'#fbfaf7',color:al>0.5?'#fff':'#18201b',shadow:rel?'inset 0 0 0 2px #18201b':'none',weight:600};})}));
      const sug=[];activeStreams.forEach((a,i)=>activeStreams.slice(i+1).forEach(b=>{const c=both(a.id,b.id);if(c>=2&&!a.related.includes(b.id))sug.push({a:a.name,b:b.name,c,countLabel:c+' shared proposals',onMark:()=>this.link(a.id,b.id)});}));
      out.suggestions=sug.sort((x,y)=>y.c-x.c);out.noSuggestions=sug.length===0;
    }
    const d=s.streamDraft;
    if(d){const c=d.id?s.proposals.filter(p=>p.scores[d.id]!=null).length:0;
      out.sd={isOpen:true,title:d.id?'Edit stream':'New stream',name:d.name,desc:d.desc,error:d.error,hasError:!!d.error,...track(d.active),
        onName:e=>this.setSD({name:e.target.value,error:''}),onDesc:e=>this.setSD({desc:e.target.value}),onToggleActive:()=>this.setSD({active:!d.active}),
        colors:COLORS.map(hex=>({hex,ring:d.color===hex?'0 0 0 2px #fff, 0 0 0 4px '+hex:'none',onClick:()=>this.setSD({color:hex})})),
        others:s.streams.filter(x=>x.id!==d.id).map(x=>{const on=d.related.includes(x.id);return{name:x.name,color:x.color,bg:on?'#eef3ee':'#fff',border:on?'#2e5e45':'#e0ddd4',weight:on?600:400,onClick:()=>this.setSD({related:on?d.related.filter(r=>r!==x.id):[...d.related,x.id]})};}),
        canDelete:!!d.id&&c===0,inUse:c>0,inUseLabel:'Used by '+c+(c===1?' proposal':' proposals')+'. Deactivate instead of deleting.',
        onDelete:()=>this.deleteStream(),onSave:()=>this.saveStream(),onCancel:()=>this.setState({streamDraft:null})};}
    return out;
  }
};
