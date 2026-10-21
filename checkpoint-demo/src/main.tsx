import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assign, label, makeTracking, publicHistory, seed, statuses, transition, validateParcel, visibleParcels } from './domain';
import type { DemoState, Parcel, Status, User } from './domain';
import './style.css';

const KEY = 'ptl-checkpoint-ui-v2';
const INITIAL_PASSWORD = 'DemoOnly10!';
const date = (at: string) => new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(at));
function load(): DemoState {
  try { const value = JSON.parse(localStorage.getItem(KEY) || 'null'); if (value?.users?.length && Array.isArray(value.parcels)) return value; } catch {}
  return seed();
}
function App() {
  const [data, setData] = useState<DemoState>(load);
  const [userId, setUserId] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [route, setRoute] = useState(location.hash.slice(1) || '/login');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const user = data.users.find(u => u.id === userId && u.active);
  useEffect(() => {
    const handler = () => { setRoute(location.hash.slice(1) || '/login'); setSelected(null); setNotice(''); setQuery(''); setFilter(''); };
    const resetShortcut = (event: KeyboardEvent) => { if (event.altKey && event.shiftKey && event.code === 'KeyR') { event.preventDefault(); setConfirmReset(true); } };
    window.addEventListener('hashchange', handler); window.addEventListener('keydown', resetShortcut);
    return () => { window.removeEventListener('hashchange', handler); window.removeEventListener('keydown', resetShortcut); };
  }, []);
  const go = (path: string) => { if (route === path) { setSelected(null); setNotice(''); } location.hash = path; };
  const save = (next: DemoState) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); setData(next); return true; }
    catch { setNotice('Unable to save changes. Free some browser storage or choose a smaller image and try again.'); return false; }
  };
  function login(username: string, password: string) {
    const account = data.users.find(u => u.username === username.trim().toLowerCase() && u.active);
    if (!account || password !== (passwords[account.id] ?? INITIAL_PASSWORD)) return 'Sign in failed. Check your username and password.';
    setUserId(account.id); go(account.role === 'ADMIN' ? '/admin' : account.role === 'RIDER' ? '/rider' : '/seller'); return '';
  }
  const logout = () => { setUserId(null); setSelected(null); go('/login'); };
  function reset() { if (!save(seed())) return; setUserId(null); setPasswords({}); setSelected(null); setConfirmReset(false); go('/login'); setNotice('Initial data restored.'); }
  const allowed = route === '/track' || route === '/login' || route === '/signup' || (user && (route === '/account' || user.role === 'ADMIN' && ['/admin','/users'].includes(route) || user.role === 'SELLER' && ['/seller','/new'].includes(route) || user.role === 'RIDER' && route === '/rider'));
  const current = user ? visibleParcels(data, user).find(p => p.id === selected) : undefined;
  function run(action: () => DemoState, message: string) { try { if (save(action())) setNotice(message); } catch (e) { setNotice((e as Error).message); } }
  const nav = user?.role === 'ADMIN' ? [['/admin','Dashboard & assignments'],['/users','User management']] : user?.role === 'RIDER' ? [['/rider','Assigned parcels']] : user ? [['/seller','My parcels'],['/new','Register parcel']] : [['/login','Sign in'],['/signup','Create account']];
  return <>
    <a className="skip" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>Skip to content</a>
    <div className="shell"><aside>
      <div className="wordmark">ParcelTrack<span>Lite</span></div><p className="brand-note">RapidExpress</p>
      <nav aria-label="Main navigation">{nav.map(([path,text]) => <a key={path} href={'#'+path} aria-current={route===path?'page':undefined}>{text}</a>)}<a href="#/track" aria-current={route==='/track'?'page':undefined}>Track a parcel</a>{user && <a href="#/account" aria-current={route==='/account'?'page':undefined}>My account</a>}</nav>
      <div className="identity">{user && <><strong>{user.name}</strong><span>{label(user.role)}</span><button className="secondary on-navy" onClick={logout}>Sign out</button></>}</div>
    </aside><main id="main" tabIndex={-1}>
      <div className="topline"><span>Parcel management</span><span>{new Intl.DateTimeFormat('en-MY',{dateStyle:'long',timeZone:'Asia/Kuala_Lumpur'}).format(new Date())}</span></div>
      {notice && <div role="status" className="notice">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}>Dismiss</button></div>}
      {!allowed ? <section className="surface"><h1>{user?'You do not have access to this page':'Sign in to continue'}</h1><p>{user?'Return to your workspace to manage your parcels.':'Sign in to view your parcels and delivery updates.'}</p><button onClick={()=>go(user?.role==='ADMIN'?'/admin':user?.role==='RIDER'?'/rider':user?'/seller':'/login')}>Return to my page</button></section> : <>
        {route==='/login' && <Login onLogin={login}/>}
        {route==='/signup' && <Signup onSave={(account,password)=>{
          if(data.users.some(x=>x.username===account.username)) return 'This username is already used.';
          if(!save({...data,users:[...data.users,account]})) return 'Could not create your account. Try again.';
          setPasswords(previous=>({...previous,[account.id]:password}));go('/login');setNotice('Account created. Sign in to continue.');return '';
        }}/>}
        {user && route==='/account' && <Account user={user} onChangePassword={(current,next)=>{
          if(current!==(passwords[user.id]??INITIAL_PASSWORD))return 'Current password is incorrect.';
          setPasswords(previous=>({...previous,[user.id]:next}));setNotice('Password updated.');return '';
        }}/>}
        {user?.role==='ADMIN' && route==='/users' && <Users data={data} save={save} notify={setNotice} setPassword={(id,password)=>setPasswords(previous=>({...previous,[id]:password}))}/>}
        {user?.role==='SELLER' && route==='/new' && <NewParcel onCreated={(input)=>{
          let token=makeTracking();while(data.parcels.some(p=>p.tracking===token))token=makeTracking();
          const parcel:Parcel={id:crypto.randomUUID(),tracking:token,sellerId:user.id,riderId:null,...input,status:'REGISTERED',history:[{status:'REGISTERED',at:new Date().toISOString(),actor:user.name}]};
          if(save({...data,parcels:[parcel,...data.parcels]})){go('/seller');setNotice('Parcel registered. Tracking number: '+token);}
        }}/>}
        {user && ['/seller','/admin','/rider'].includes(route) && <>
          <header className="page-heading"><div><h1>{user.role==='ADMIN'?'Delivery operations':user.role==='RIDER'?'Assigned parcels':'My parcels'}</h1><p>{user.role==='ADMIN'?'Assign unfinished parcels and review the current workload.':user.role==='RIDER'?'Open a parcel to start delivery or record its outcome.':'Register parcels and follow their delivery progress.'}</p></div>{user.role==='SELLER' && <button onClick={()=>go('/new')}>Register parcel</button>}</header>
          {user.role==='ADMIN' && <div className="counts" aria-label="Parcel counts by status">{statuses.map(s=><button key={s} className={filter===s?'count active':'count'} onClick={()=>setFilter(filter===s?'':s)}><strong>{data.parcels.filter(p=>p.status===s).length}</strong><span>{label(s)}</span></button>)}</div>}
          <section className="surface"><div className="toolbar"><label className="search">Search parcels<input aria-label="Search parcels" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tracking number or recipient"/></label><label>Status<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All statuses</option>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label></div>
            <div className="parcel-list"><div className="list-head"><span>Parcel / recipient</span><span>Status</span><span>Rider</span><span>Details</span></div>{visibleParcels(data,user).filter(p=>(!filter||p.status===filter)&&(!query||[p.tracking,p.recipient].some(value=>value.toLowerCase().includes(query.toLowerCase())))).map(p=><div className="parcel-row" key={p.id}><div><strong className="tracking">{p.tracking}</strong><span>{p.recipient} <small>{p.weight.toFixed(3)} kg</small></span></div><span><span className={'status '+p.status.toLowerCase()}>{label(p.status)}</span></span><span>{data.users.find(account=>account.id===p.riderId)?.name || 'Not assigned'}</span><button className="secondary" onClick={()=>{setSelected(p.id);setNotice('');}}>Open parcel</button></div>)}
              {visibleParcels(data,user).filter(p=>(!filter||p.status===filter)&&(!query||[p.tracking,p.recipient].some(value=>value.toLowerCase().includes(query.toLowerCase())))).length===0 && <div className="empty"><h2>No parcels found</h2><p>Try a different search or status filter.{user.role==='SELLER'?' You can also register a new parcel.':''}</p></div>}
            </div>
          </section>
          {current && <ParcelDetail key={current.id} parcel={current} user={user} users={data.users} close={()=>setSelected(null)} onAssign={id=>run(()=>assign(data,user,current.id,id),'Rider assignment saved.')} onTransition={(status,proof)=>run(()=>transition(data,user,current.id,status,proof),'Delivery status updated.')}/>}
        </>}
        {route==='/track' && <Tracking parcels={data.parcels}/>}
      </>}
    </main></div>
    {confirmReset && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="reset-title" className="modal" onKeyDown={e=>{if(e.key==='Escape')setConfirmReset(false);if(e.key==='Tab'){e.preventDefault();const buttons=e.currentTarget.querySelectorAll('button');const idx=Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement);buttons[(idx+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}}}><h2 id="reset-title">Restore initial data?</h2><p>This removes records created in this browser and signs you out.</p><div className="actions"><button autoFocus className="secondary" onClick={()=>setConfirmReset(false)}>Cancel</button><button onClick={reset}>Restore data</button></div></section></div>}
  </>;
}
function Login({onLogin}:{onLogin:(username:string,password:string)=>string}) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
  return <div className="login-layout"><div className="intro"><h1>Manage your parcels</h1><p>Register parcels, coordinate deliveries and keep track of every update.</p></div><section className="surface auth"><h2>Sign in</h2><p>Enter your account details to continue.</p><form onSubmit={e=>{e.preventDefault();const message=onLogin(username,password);setError(message);if(message)setPassword('');}}><label>Username<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="error">{error}</p>}<button>Sign in</button></form><a href="#/signup">Create a Seller account</a><a href="#/track">Track a parcel without signing in</a></section></div>;
}
function Signup({onSave}:{onSave:(user:User,password:string)=>string}) {
  const [error,setError]=useState('');
  return <section className="surface form-page"><h1>Create a Seller account</h1><p>Register to send parcels and follow their delivery progress.</p><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const password=String(data.get('password'));const name=String(data.get('name')).trim();if(!name){setError('Enter your display name.');return;}if(password.length<10){setError('Use at least 10 characters.');return;}setError(onSave({id:crypto.randomUUID(),name,username:String(data.get('username')).trim().toLowerCase(),role:'SELLER',active:true},password));}}><label>Display name<input name="name" required maxLength={100}/></label><label>Username<input name="username" required pattern="[a-zA-Z0-9._-]{3,40}" title="3 to 40 letters, digits, dots, underscores or hyphens"/></label><label>Password<input type="password" name="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label><p className="hint">Use at least 10 characters.</p>{error&&<p role="alert" className="error">{error}</p>}<div className="actions"><button>Create account</button><a href="#/login">Back to sign in</a></div></form></section>;
}
function Account({user,onChangePassword}:{user:User;onChangePassword:(current:string,next:string)=>string}) {
  const [error,setError]=useState('');
  return <section className="surface form-page"><h1>My account</h1><p>{user.name} / {label(user.role)}</p><h2>Change password</h2><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const current=String(data.get('current')),next=String(data.get('next'));if(next.length<10||next===current){setError('Use a different password of at least 10 characters.');return;}const message=onChangePassword(current,next);setError(message);if(!message)e.currentTarget.reset();}}><label>Current password<input type="password" name="current" required autoComplete="current-password"/></label><label>New password<input type="password" name="next" required minLength={10} maxLength={128} autoComplete="new-password"/></label>{error&&<p role="alert" className="error">{error}</p>}<button>Update password</button></form></section>;
}
function Users({data,save,notify,setPassword}:{data:DemoState;save:(data:DemoState)=>boolean;notify:(message:string)=>void;setPassword:(id:string,password:string)=>void}) {
  const [error,setError]=useState('');
  return <><header className="page-heading"><div><h1>User management</h1><p>Create Rider accounts and manage their access.</p></div></header><section className="surface"><h2>Rider directory</h2>{data.users.filter(u=>u.role==='RIDER').map(u=><div className="user-row" key={u.id}><div><strong>{u.name}</strong><span>{u.username}</span></div><span>{u.active?'Active':'Inactive'}</span><button className="secondary" onClick={()=>{if(save({...data,users:data.users.map(x=>x.id===u.id?{...x,active:!x.active}:x)}))notify('Rider '+(u.active?'disabled.':'enabled.'));}}>{u.active?'Disable Rider':'Enable Rider'}</button></div>)}</section><section className="surface form-page"><h2>Create a Rider</h2><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget),username=String(form.get('username')).trim().toLowerCase(),name=String(form.get('name')).trim();if(!name){setError('Enter a display name.');return;}if(data.users.some(u=>u.username===username)){setError('This username is already used.');return;}const id=crypto.randomUUID();if(save({...data,users:[...data.users,{id,username,name,role:'RIDER',active:true}]})){setPassword(id,String(form.get('password')));e.currentTarget.reset();setError('');notify('Rider account created.');}}}><label>Display name<input name="name" required maxLength={100}/></label><label>Username<input name="username" required pattern="[a-zA-Z0-9._-]{3,40}"/></label><label>Initial password<input type="password" name="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label>{error&&<p role="alert" className="error">{error}</p>}<button>Create Rider</button></form></section></>;
}
function NewParcel({onCreated}:{onCreated:(parcel:{recipient:string;phone:string;address:string;weight:number})=>void}) {
  const [errors,setErrors]=useState<Record<string,string>>({});
  return <section className="surface form-page"><h1>Register a parcel</h1><p>Enter the recipient’s delivery details and parcel weight.</p><form noValidate onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const input={recipient:String(data.get('recipient')),phone:String(data.get('phone')),address:String(data.get('address')),weight:String(data.get('weight'))};const issues=validateParcel(input);setErrors(issues);if(!Object.keys(issues).length)onCreated({...input,recipient:input.recipient.trim(),address:input.address.trim(),weight:Number(input.weight)});}}>{[['recipient','Recipient name','text'],['phone','Phone number','tel'],['address','Delivery address','textarea'],['weight','Weight (kg)','number']].map(([name,title,type])=><label key={name}>{title}{type==='textarea'?<textarea name={name} rows={3} aria-invalid={!!errors[name]} aria-describedby={errors[name]?name+'-error':undefined}/>:<input name={name} type={type} step={name==='weight'?'0.001':undefined} min={name==='weight'?'0.001':undefined} max={name==='weight'?'100':undefined} aria-invalid={!!errors[name]} aria-describedby={errors[name]?name+'-error':undefined}/ >}{errors[name]&&<span id={name+'-error'} className="error" role="alert">{errors[name]}</span>}</label>)}<div className="actions"><button>Register parcel</button><a href="#/seller">Cancel</a></div></form></section>;
}
function ParcelDetail({parcel,user,users,close,onAssign,onTransition}:{parcel:Parcel;user:User;users:User[];close:()=>void;onAssign:(id:string)=>void;onTransition:(status:Status,proof?:string)=>void}) {
  const [rider,setRider]=useState(parcel.riderId||users.find(u=>u.role==='RIDER'&&u.active)?.id||''),[outcome,setOutcome]=useState<Status>('DELIVERED'),[proof,setProof]=useState<string>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function choose(file?:File) {
    setProof(undefined);setError('');if(!file)return;
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024){setError('Choose one JPG or PNG up to 5 MiB.');return;}
    setLoading(true);
    try{const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>20_000_000)throw new Error('Use an image of at most 20 megapixels.');const reader=new FileReader();reader.onload=()=>{setProof(reader.result as string);setLoading(false);};reader.onerror=()=>{setError('Could not read this image.');setLoading(false);};reader.readAsDataURL(file);}
    catch{setError('Could not read this image. Choose a readable JPG or PNG up to 20 megapixels.');setLoading(false);}
  }
  return <section className="surface detail" aria-label="Parcel details"><div className="detail-head"><div><h2>Parcel details</h2><p className="tracking">{parcel.tracking}</p></div><button className="secondary" onClick={close}>Close details</button></div><div className="detail-grid"><div><h3>Recipient</h3><p>{parcel.recipient}<br/>{parcel.phone}<br/>{parcel.address}</p><h3>Weight</h3><p>{parcel.weight.toFixed(3)} kg</p>
    {user.role==='ADMIN'&&!['DELIVERED','FAILED'].includes(parcel.status)&&<form onSubmit={e=>{e.preventDefault();onAssign(rider);}}><label>Assign to active Rider<select value={rider} onChange={e=>setRider(e.target.value)}>{users.filter(u=>u.role==='RIDER'&&u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><button disabled={!rider}>Save assignment</button></form>}
    {user.role==='RIDER'&&parcel.status==='ASSIGNED'&&<button onClick={()=>onTransition('OUT_FOR_DELIVERY')}>Start delivery</button>}
    {user.role==='RIDER'&&parcel.status==='OUT_FOR_DELIVERY'&&<form onSubmit={e=>{e.preventDefault();if(!proof){setError('Choose one JPG or PNG proof photo.');return;}onTransition(outcome,proof);}}><label>Delivery outcome<select value={outcome} onChange={e=>setOutcome(e.target.value as Status)}><option value="DELIVERED">Delivered</option><option value="FAILED">Failed</option></select></label><label>Proof photo<input type="file" accept="image/jpeg,image/png" onChange={e=>choose(e.target.files?.[0])}/></label><p className="hint">One JPG or PNG, up to 5 MiB and 20 megapixels.</p>{loading&&<p role="status">Reading image...</p>}{error&&<p role="alert" className="error">{error}</p>}{proof&&<img className="proof" src={proof} alt="Selected delivery proof"/>}<button disabled={loading}>Save delivery outcome</button></form>}
    {parcel.proof&&<><h3>Proof photo</h3><img className="proof" src={parcel.proof} alt="Delivery proof"/></>}
    </div><div><h3>Status history</h3><ol className="timeline">{parcel.history.map((history,i)=><li key={i}><strong>{label(history.status)}</strong><span>{date(history.at)} MYT</span>{user.role==='ADMIN'&&<small>{history.actor}</small>}</li>)}</ol><a href="#/track">Track this parcel</a></div></div></section>;
}
function Tracking({parcels}:{parcels:Parcel[]}) {
  const [token,setToken]=useState(''),[result,setResult]=useState<ReturnType<typeof publicHistory>|null>(null),[message,setMessage]=useState('');
  return <div className="tracking-page"><header><h1>Track a parcel</h1><p>Enter your tracking number to see the latest delivery updates.</p></header><section className="surface"><form onSubmit={e=>{e.preventDefault();setResult(null);const normalized=token.trim().toUpperCase();if(!/^PTL-[A-F0-9]{32}$/.test(normalized)){setMessage('Enter PTL- followed by 32 letters A-F or digits 0-9.');return;}const parcel=parcels.find(p=>p.tracking===normalized);if(!parcel){setMessage('No parcel found for this tracking number.');return;}setMessage('');setResult(publicHistory(parcel));}}><label>Tracking number<input className="tracking" value={token} onChange={e=>setToken(e.target.value)} placeholder="Enter your tracking number" autoComplete="off"/></label><button>Track parcel</button></form>{message&&<p role="alert" className="error">{message}</p>}{result&&<div className="public-result"><h2>Delivery timeline</h2><ol className="timeline">{result.map((history,i)=><li key={i}><strong>{label(history.status)}</strong><span>{date(history.at)} MYT</span></li>)}</ol></div>}</section></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
