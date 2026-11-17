import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, Bookmark, Compass, Eye, EyeOff, Heart, LoaderCircle, LockKeyhole, Map as MapIcon, MapPin, Menu, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { useGetAdminStatus, getGetAdminStatusQueryKey } from '@workspace/api-client-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { PlaceRecord } from '@/types/database';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type Place = PlaceRecord;
type AuthShape = { user?: { id: string; email?: string } | null; loading?: boolean; isLoading?: boolean };
const auth = () => useAuth() as AuthShape;

function Shell({ children }: { children: ReactNode }) {
  const path = useLocation().pathname;
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: '/', label: 'Discover', icon: Compass },
    { href: '/explore', label: 'Explore map', icon: MapIcon },
    { href: '/saved', label: 'Saved', icon: Bookmark },
  ];
  return <div className="paper-grain min-h-[100dvh] pb-16 md:pb-0">
    <header className="relative z-20 border-b border-border/80 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 md:px-10">
        <Link to="/" className="group flex items-center gap-3 text-foreground no-underline" data-testid="link-home">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"><Compass size={21} strokeWidth={1.7}/></span>
          <span className="leading-none"><span className="block font-editorial text-xl font-semibold tracking-[-.04em]">HIDDEN GEMS</span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.25em] text-muted-foreground">Kenya, a little closer</span></span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {links.map(({href,label,icon:Icon}) => <Link key={href} to={href} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${path===href?'bg-secondary text-primary':'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`} data-testid={`link-${label.toLowerCase().replaceAll(' ','-')}`}><Icon size={16}/>{label}</Link>)}
          <Link to="/create" className="ml-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline transition-transform hover:-translate-y-0.5" data-testid="link-share-a-place">Share a place <span className="ml-1">+</span></Link>
          <Link to="/profile" aria-label="Your profile" className={`ml-2 grid h-10 w-10 place-items-center rounded-full border border-border text-primary hover:bg-secondary ${path==='/profile'?'bg-secondary':''}`} data-testid="link-profile"><UserRound size={18}/></Link>
        </nav>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-border md:hidden" onClick={()=>setMenuOpen(!menuOpen)} aria-label={menuOpen?'Close navigation':'Open navigation'} data-testid="button-mobile-menu">{menuOpen?<X size={19}/>:<Menu size={19}/>}</button>
      </div>
      {menuOpen&&<nav className="absolute left-0 right-0 top-full border-b border-border bg-background p-4 shadow-lg md:hidden">{links.map(({href,label,icon:Icon})=><Link key={href} to={href} onClick={()=>setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-foreground no-underline hover:bg-secondary"><Icon size={17}/>{label}</Link>)}<Link to="/create" onClick={()=>setMenuOpen(false)} className="mt-2 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground no-underline">Share a place</Link><Link to="/profile" onClick={()=>setMenuOpen(false)} className="mt-1 block rounded-xl px-3 py-3 text-sm text-foreground no-underline hover:bg-secondary">Your profile</Link></nav>}
    </header>
    <main>{children}</main>
    <footer className="border-t border-border/80 px-5 py-8 md:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><Compass size={15} className="text-primary"/><span className="font-semibold tracking-wide text-foreground">HIDDEN GEMS</span><span>· For the places worth finding.</span></div>
        <div className="flex gap-5"><Link to="/sign-in" className="hover:text-primary">Sign in</Link><Link to="/create" className="hover:text-primary">Share a place</Link><Link to="/admin" className="hover:text-primary">Admin</Link></div>
      </div>
    </footer>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur md:hidden">
      {[links[0],links[1],{href:'/create',label:'Create',icon:Sparkles},links[2],{href:'/profile',label:'Profile',icon:UserRound}].map(({href,label,icon:Icon})=><Link key={href} to={href} className={`flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium no-underline ${path===href?'text-primary':'text-muted-foreground'}`}><Icon size={18}/>{label}</Link>)}
    </nav>
  </div>;
}

function PlaceCard({place}: {place: Place}) {
  const category = place.categories?.name || 'A place to discover';
  const pricing = place.price_min == null ? 'Details on arrival' : `${place.currency_code || 'KES'} ${place.price_min.toLocaleString()}${place.price_max && place.price_max !== place.price_min ? ` – ${place.price_max.toLocaleString()}` : ''}`;
  return <Link to={`/places/${place.id}`} className="group block overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground no-underline transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`card-place-${place.id}`}>
    <div className="relative aspect-[1.42/1] overflow-hidden bg-[#d8dfd0]">
      {place.cover_photo_path?.startsWith('http') ? <img src={place.cover_photo_path} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"/> : <div className="h-full w-full overflow-hidden bg-[#dfe4d8]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_32%,rgba(227,191,120,.82)_0,rgba(227,191,120,.82)_12%,transparent_12.5%)]"/>
        <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full"><path d="M0 225 Q120 165 236 213 T470 187 T700 190 V380 H0Z" fill="#9ba991"/><path d="M0 255 Q130 200 260 246 T500 219 T700 236 V380 H0Z" fill="#6c806e"/><path d="M0 285 Q165 235 315 278 T700 253 V380 H0Z" fill="#3d614f"/><path d="M50 225 Q160 200 235 213M265 244 Q380 214 475 188M100 284 Q210 260 310 278" fill="none" stroke="#f3e8ce" strokeOpacity=".5" strokeWidth="2"/></svg>
        <div className="absolute bottom-4 left-4 rounded-full border border-white/50 bg-background/70 px-3 py-1 text-[9px] font-semibold uppercase tracking-[.2em] text-primary">Field notes</div>
      </div>}
      <div className="absolute right-4 top-4"><Badge className="border-0 bg-background/85 text-primary backdrop-blur">{category}</Badge></div>
      <span className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-background/90 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground"><ArrowUpRightIcon/></span>
    </div>
    <div className="p-5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[.15em] text-muted-foreground"><MapPin size={13}/>{place.country_code || 'Kenya'}</div>
      <h3 className="font-editorial text-[23px] leading-tight tracking-[-.025em]">{place.title}</h3>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{place.description || 'A lesser-known spot, shared by someone who knows it well.'}</p>
      <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4 text-xs text-muted-foreground">
        <span>{pricing}</span><span className="flex items-center gap-1"><Heart size={13}/>{place.like_count ?? 0}</span>
      </div>
    </div>
  </Link>;
}
function ArrowUpRightIcon(){return <ArrowRight size={17} className="-rotate-45"/>}

function Discover() {
  const [places,setPlaces]=useState<Place[]>([]);
  const [categories,setCategories]=useState<{id:string;name:string}[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [term,setTerm]=useState('');
  const [selected,setSelected]=useState('All places');
  async function loadPlaces() {
    setLoading(true); setError('');
    try {
      const [{data,error:placeError},{data:categoryRows,error:categoryError}]=await Promise.all([
        supabase.from('places').select('*').eq('status','approved').order('title',{ascending:true}),
        supabase.from('categories').select('id,name').order('name',{ascending:true}),
      ]);
      if(placeError) throw placeError;
      if(categoryError) throw categoryError;
      const categoryMap=new globalThis.Map<string,string>((categoryRows||[]).map((c:{id:string;name:string})=>[c.id,c.name]));
      setCategories((categoryRows||[]) as {id:string;name:string}[]);
      setPlaces(((data||[]) as Place[]).map(p=>({...p,categories:p.category_id?{name:categoryMap.get(p.category_id)||'A place to discover'}:null})));
    } catch(e) { setError(e instanceof Error?e.message:'We couldn’t reach the places right now.'); }
    finally {setLoading(false);}
  }
  useEffect(()=>{void loadPlaces();},[]);
  const filtered=useMemo(()=>places.filter(p=>(selected==='All places'||p.categories?.name===selected)&&`${p.title} ${p.description||''} ${p.country_code||''}`.toLowerCase().includes(term.toLowerCase())),[places,selected,term]);
  return <div>
    <section className="mx-auto max-w-[1440px] px-5 pb-14 pt-12 md:px-10 md:pb-20 md:pt-20">
      <div className="grid items-center gap-8 lg:grid-cols-[1.08fr_.92fr]">
        <div className="rise-in">
          <div className="mb-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.22em] text-primary"><span className="h-px w-9 bg-accent-foreground/60"/>Kenya, beyond the usual</div>
          <h1 className="max-w-[730px] font-editorial text-[clamp(3.4rem,8vw,7.1rem)] leading-[.94] tracking-[-.065em] text-primary">Find your<br/><em className="font-medium text-[#84927c]">own way</em> there.</h1>
          <p className="mt-7 max-w-[470px] text-base leading-7 text-muted-foreground md:text-lg">Small places. Local stories. The turnoff you’d have missed. Discover Kenya through the people who call it home.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4"><a href="#discover-places" className="inline-flex items-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground no-underline transition-transform hover:-translate-y-0.5">Explore the collection <ArrowDown size={16}/></a><span className="text-xs text-muted-foreground">Shared by travelers, held to a higher standard.</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-[590px] lg:ml-auto">
          <div className="relative aspect-[1.07/0.9] overflow-hidden rounded-[46%_46%_42%_42%/48%_48%_38%_38%] bg-[#dfe5d9]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_71%_31%,#e9c982_0, #e9c982_12%,transparent_12.5%)]"/>
            <svg viewBox="0 0 700 570" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path d="M0 293 103 217l88 54 97-122 107 130 72-67 128 88 105-68v338H0z" fill="#adb9a6"/>
              <path d="m0 373 125-73 112 68 103-97 105 86 115-61 140 77v197H0z" fill="#758d77"/>
              <path d="M0 432q142-81 271-4t270-23q93-45 159 16v149H0z" fill="#496e59"/>
              <path d="M0 483q150-60 289-2t240-29q104-45 171 12v104H0z" fill="#294c3c"/>
              <path d="M90 430q45-49 93-7 40 35 80-2M375 382q37-37 79-4t86-12M184 503q55-41 110-6t107-2" fill="none" stroke="#e8e5d3" strokeOpacity=".56" strokeWidth="2"/>
              <path d="M350 171c-42 59-54 114-36 168 17 51 59 72 70 117 7 29-2 58-26 85" fill="none" stroke="#ebd6a9" strokeWidth="6" strokeDasharray="2 12" strokeLinecap="round" opacity=".9"/>
              <g fill="#254b3b"><path d="M501 349l20-81 20 81zm-12 0h64v7h-64zM540 369l16-64 17 64zm-9 0h51v6h-51zM108 374l18-73 18 73zm-10 0h56v6H98z"/></g>
            </svg>
            <div className="absolute left-[13%] top-[20%] -rotate-6 rounded-[2px] bg-background px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-primary shadow-sm">Take the slower road</div>
            <div className="absolute bottom-[15%] right-[8%] rotate-3 rounded-full border border-white/60 bg-background/75 px-4 py-2 text-xs font-medium text-primary backdrop-blur">Somewhere you haven’t been</div>
          </div>
          <div className="absolute -bottom-3 left-0 hidden -rotate-6 border border-border bg-background px-4 py-3 text-[10px] uppercase tracking-[.19em] text-muted-foreground shadow-md sm:block">Field guide no. 01 — Kenya</div>
          <span className="absolute -right-1 top-5 grid h-14 w-14 place-items-center rounded-full bg-accent text-primary"><Sparkles size={20}/></span>
        </div>
      </div>
    </section>
    <section id="discover-places" className="bg-[#e9e8de] px-5 py-14 md:px-10 md:py-20">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">The community’s field notes</div><h2 className="mt-3 font-editorial text-4xl tracking-[-.045em] text-primary md:text-5xl">Worth the detour.</h2><p className="mt-3 max-w-lg text-sm text-muted-foreground">Every spot here has been shared by a traveler. Start with what calls you.</p></div>
          <label className="relative block w-full lg:max-w-[330px]"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search places or stories" className="h-12 rounded-full border-border bg-background pl-11" aria-label="Search places" data-testid="input-search-places"/></label>
        </div>
        <div className="mb-9 flex gap-2 overflow-x-auto pb-2">
          {['All places',...categories.map(c=>c.name)].map(label=><button key={label} onClick={()=>setSelected(label)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${selected===label?'border-primary bg-primary text-primary-foreground':'border-border bg-background/60 text-muted-foreground hover:border-primary/50 hover:text-primary'}`} data-testid={`filter-${label.toLowerCase().replaceAll(' ','-')}`}>{label}</button>)}
        </div>
        {loading?<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map(i=><div key={i} className="overflow-hidden rounded-2xl border border-border/70 bg-background"><div className="aspect-[1.42/1] animate-pulse bg-muted"/><div className="space-y-3 p-5"><div className="h-3 w-24 animate-pulse rounded bg-muted"/><div className="h-6 w-3/4 animate-pulse rounded bg-muted"/><div className="h-4 w-full animate-pulse rounded bg-muted"/></div></div>)}</div>
        :error?<div className="rounded-2xl border border-destructive/30 bg-background p-8 text-center"><p className="font-editorial text-2xl">This trail’s temporarily quiet.</p><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button onClick={()=>void loadPlaces()} className="mt-5 rounded-full" data-testid="button-retry-places">Try again</Button></div>
        :filtered.length===0?<div className="rounded-[26px] border border-dashed border-[#aab5a3] bg-background/55 px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary"><Compass size={22}/></span><h3 className="mt-5 font-editorial text-2xl text-primary">{places.length===0?'The map is still unfolding.':'No places found.'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{places.length===0?'No approved places have been shared yet. Be the first to bring a hidden corner into view.':'Try another search or category. There may be another road worth taking.'}</p><Link to="/create" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold text-primary-foreground no-underline" data-testid="link-empty-share">Share a place <ArrowRight size={15}/></Link></div>
        :<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(p=><PlaceCard key={p.id} place={p}/>)}</div>}
      </div>
    </section>
    <section className="mx-auto grid max-w-[1440px] gap-8 px-5 py-14 md:grid-cols-[1fr_auto] md:items-center md:px-10 md:py-20">
      <div><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">A note from the road</div><p className="mt-4 max-w-3xl font-editorial text-3xl leading-snug tracking-[-.03em] md:text-4xl">“The best places aren’t always hidden. Sometimes, they’re simply waiting for someone to tell you where to look.”</p></div>
      <Link to="/create" className="inline-flex items-center gap-3 self-end rounded-full border border-primary px-5 py-3 text-sm font-semibold text-primary no-underline transition-colors hover:bg-primary hover:text-primary-foreground">Leave a field note <ArrowRight size={16}/></Link>
    </section>
  </div>;
}

function AuthWall({title='A little closer to home',copy='Sign in to keep your own collection and share the places that matter to you.'}:{title?:string;copy?:string}) {
  return <div className="mx-auto max-w-[760px] px-5 py-16 md:py-24"><div className="rounded-[28px] border border-border bg-card px-7 py-12 text-center md:px-16"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary text-primary"><LockKeyhole size={23}/></span><div className="mt-6 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Your personal trail</div><h1 className="mt-3 font-editorial text-4xl tracking-[-.04em] text-primary">{title}</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">{copy}</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/sign-in" className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground no-underline">Sign in</Link><Link to="/sign-up" className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-primary no-underline hover:bg-secondary">Create an account</Link></div></div></div>;
}
function Protected({children,title,copy}:{children:ReactNode;title?:string;copy?:string}) {
  const {user,loading,isLoading}=auth(); if(loading||isLoading) return <LoadingPanel label="Checking your account"/>; return user?<>{children}</>:<AuthWall title={title} copy={copy}/>;
}
function LoadingPanel({label='Loading'}:{label?:string}){return <div className="mx-auto flex min-h-[55vh] max-w-5xl flex-col items-center justify-center px-5 text-center"><span className="h-10 w-10 animate-pulse rounded-full bg-secondary"/><p className="mt-5 text-sm text-muted-foreground">{label}…</p></div>}

function Explore() {
  const [term,setTerm]=useState('');
  return <div className="mx-auto max-w-[1440px] px-5 py-12 md:px-10 md:py-20"><div className="grid gap-10 lg:grid-cols-[.86fr_1.14fr] lg:items-center">
    <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.2em] text-primary"><MapPin size={14}/>A map with room to grow</div><h1 className="mt-5 font-editorial text-5xl leading-[1.02] tracking-[-.055em] text-primary md:text-7xl">See where<br/>the stories lead.</h1><p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">The map will fill in as community places with verified coordinates come into view. No pins guessed, no roads invented.</p>
      <label className="relative mt-8 block max-w-md"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search a place or county" className="h-12 rounded-full bg-card pl-11" data-testid="input-map-search"/></label>
      <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#91a589]"/>No map locations loaded yet</div>
    </div>
    <div className="relative min-h-[390px] overflow-hidden rounded-[30px] border border-border bg-[#e9e8de] md:min-h-[550px]">
      <div className="absolute inset-0 opacity-35" style={{backgroundImage:'linear-gradient(28deg,transparent 49.6%,#aab5a3 49.8%,#aab5a3 50.1%,transparent 50.3%),linear-gradient(110deg,transparent 49.6%,#aab5a3 49.8%,#aab5a3 50.1%,transparent 50.3%)',backgroundSize:'110px 110px'}}/>
      <div className="absolute inset-4 rounded-[23px] border border-dashed border-[#b3bdad] md:inset-7"/>
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"><span className="grid h-16 w-16 place-items-center rounded-full border border-[#bdc8b8] bg-background/80 text-primary"><MapIcon size={26} strokeWidth={1.5}/></span><p className="mt-6 font-editorial text-2xl text-primary">The map is waiting for its first coordinates.</p><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Approved places will appear here when location data is available.</p></div>
      <span className="absolute left-8 top-8 text-[9px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Kenya · field view</span><span className="absolute bottom-8 right-8 text-[9px] uppercase tracking-[.18em] text-muted-foreground">No map tiles loaded</span>
    </div>
  </div></div>;
}

function CreatePlace() {
 const [title,setTitle]=useState(''); const [story,setStory]=useState('');
 return <Protected title="Your discoveries start here" copy="Sign in to prepare a place submission. Your field note will be part of a thoughtful review before it appears publicly."><div className="mx-auto max-w-[950px] px-5 py-12 md:px-10 md:py-20"><Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground no-underline hover:text-primary"><ArrowLeft size={15}/>Back to discovery</Link><div className="mt-8 grid gap-10 md:grid-cols-[.85fr_1.15fr]"><div><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">Share something special</div><h1 className="mt-4 font-editorial text-5xl leading-tight tracking-[-.05em] text-primary">Know a place<br/>we should know?</h1><p className="mt-5 text-sm leading-7 text-muted-foreground">The quiet beach. The roadside kitchen. The trail you almost didn’t take. Tell us why it stayed with you.</p><div className="mt-8 border-l-2 border-accent pl-4 text-sm leading-6 text-muted-foreground">Every submission is reviewed before it joins the collection. Good stories start with local knowledge.</div></div>
    <form onSubmit={e=>e.preventDefault()} className="rounded-3xl border border-border bg-card p-6 md:p-8"><label className="mb-2 block text-sm font-medium">Place name</label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="What do people call it?" className="h-12 bg-background" data-testid="input-place-name"/><label className="mb-2 mt-6 block text-sm font-medium">Your story</label><Textarea value={story} onChange={e=>setStory(e.target.value)} placeholder="What makes this place worth finding?" className="min-h-36 resize-y bg-background" data-testid="input-place-story"/><div className="mt-6 rounded-xl bg-secondary/70 p-4 text-xs leading-5 text-muted-foreground">Location, category and photos are not connected yet. Your draft stays on this screen; submissions are not sent or saved in this foundation.</div><Button type="button" disabled className="mt-6 w-full rounded-full" data-testid="button-submit-place">Submission opens soon</Button><p className="mt-3 text-center text-[11px] text-muted-foreground">Nothing is published without review.</p></form>
  </div></div></Protected>;
}

function Saved() {
 const {user}=auth();
 return <Protected title="Keep the places you love" copy="Sign in to build a personal shortlist of the places you want to find."><div className="mx-auto max-w-[1000px] px-5 py-16 md:px-10 md:py-24"><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">Your collection</div><h1 className="mt-3 font-editorial text-5xl tracking-[-.05em] text-primary">Saved for later.</h1><div className="mt-10 rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center"><Bookmark size={27} className="mx-auto text-primary"/><h2 className="mt-5 font-editorial text-2xl">Your collection is empty.</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Places you save will gather here, ready for the next time you’re nearby.</p><Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground no-underline">Find a place <ArrowRight size={15}/></Link></div><span className="sr-only">{user?.id}</span></div></Protected>;
}

function Profile() {
 const {user,loading,isLoading}=auth();
 const [profile,setProfile]=useState<{username:string|null;display_name:string|null;bio:string|null;avatar_path:string|null}|null>(null);
 const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 useEffect(()=>{if(user){void supabase.from('profiles').select('username,display_name,bio,avatar_path').eq('id',user.id).maybeSingle().then(({data}:{data:{username:string|null;display_name:string|null;bio:string|null;avatar_path:string|null}|null})=>setProfile(data||{username:null,display_name:null,bio:null,avatar_path:null}));}},[user?.id]);
 if(loading||isLoading)return <LoadingPanel label="Finding your profile"/>;
 if(!user)return <AuthWall title="Your own little field guide" copy="Sign in to see your profile, tell your story and keep your favorite places close." />;
 async function saveProfile(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!profile||!user)return;setBusy(true);setError('');const {error:saveError}=await supabase.from('profiles').update({display_name:profile.display_name,bio:profile.bio}).eq('id',user.id);if(saveError)setError(saveError.message);else setError('Profile saved.');setBusy(false);}
 return <div className="mx-auto max-w-[800px] px-5 py-12 md:px-10 md:py-20"><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">Your account</div><h1 className="mt-3 font-editorial text-5xl tracking-[-.05em] text-primary">Your field notes.</h1><div className="mt-9 rounded-3xl border border-border bg-card p-6 md:p-9"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-xl font-editorial text-primary">{(profile?.display_name||profile?.username||user.email||'T')[0].toUpperCase()}</div><div><h2 className="font-editorial text-2xl">{profile?.display_name||profile?.username||'Traveler'}</h2><p className="mt-1 text-sm text-muted-foreground">@{profile?.username||'username-not-set'}</p></div></div>
  <form onSubmit={saveProfile} className="mt-8 space-y-5"><div><label className="mb-2 block text-sm font-medium">Display name</label><Input value={profile?.display_name||''} onChange={e=>setProfile(p=>({...p,username:p?.username||null,bio:p?.bio||null,avatar_path:p?.avatar_path||null,display_name:e.target.value}))} className="bg-background" data-testid="input-display-name"/></div><div><label className="mb-2 block text-sm font-medium">A little about you</label><Textarea value={profile?.bio||''} onChange={e=>setProfile(p=>({...p,username:p?.username||null,bio:e.target.value,avatar_path:p?.avatar_path||null,display_name:p?.display_name||null}))} className="bg-background" data-testid="input-profile-bio"/></div>{error&&<p role="status" className="text-sm text-muted-foreground">{error}</p>}<Button type="submit" disabled={busy||!profile} className="rounded-full" data-testid="button-save-profile">{busy?'Saving…':'Save profile'}</Button></form><p className="mt-6 text-xs text-muted-foreground">Signed in as {user.email||'your account'}</p>
 <div className="mt-5 border-t border-border pt-5"><button type="button" onClick={()=>void supabase.auth.signOut()} className="text-sm font-medium text-muted-foreground hover:text-primary" data-testid="button-sign-out">Sign out</button></div></div></div>;
}

function PlaceDetail({params}:{params:{placeId:string}}) {
 const [place,setPlace]=useState<Place|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let live=true;void (async()=>{setLoading(true);const {data,error:err}=await supabase.from('places').select('*').eq('id',params.placeId).eq('status','approved').maybeSingle();if(!live)return;if(err)setError(err.message);else setPlace(data as Place|null);setLoading(false);})();return()=>{live=false};},[params.placeId]);
 if(loading)return <LoadingPanel label="Finding this place"/>;if(error)return <div className="mx-auto max-w-3xl px-5 py-20 text-center"><p className="font-editorial text-3xl">This page didn’t open.</p><p className="mt-3 text-sm text-muted-foreground">{error}</p><Link to="/" className="mt-6 inline-block text-sm text-primary">Return to discovery</Link></div>;
 if(!place)return <div className="mx-auto max-w-3xl px-5 py-20 text-center"><Compass size={28} className="mx-auto text-primary"/><h1 className="mt-5 font-editorial text-3xl">This place isn’t on the map.</h1><p className="mt-2 text-sm text-muted-foreground">It may be unpublished or the link may have changed.</p><Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary no-underline"><ArrowLeft size={15}/>Back to discovery</Link></div>;
 return <article className="mx-auto max-w-[1000px] px-5 py-10 md:px-10 md:py-16"><Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground no-underline"><ArrowLeft size={15}/>All places</Link><div className="mt-8 overflow-hidden rounded-[28px] bg-secondary">{place.cover_photo_path?.startsWith('http')?<img src={place.cover_photo_path} alt="" className="max-h-[500px] w-full object-cover"/>:<div className="grid min-h-[260px] place-items-center bg-[#dfe4d8] md:min-h-[430px]"><Compass size={52} strokeWidth={1} className="text-primary/50"/></div>}</div><div className="mx-auto max-w-[740px] py-9"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-primary"><MapPin size={14}/>{place.country_code||'Kenya'}</div><h1 className="mt-3 font-editorial text-5xl tracking-[-.055em] text-primary md:text-7xl">{place.title}</h1><p className="mt-7 whitespace-pre-line text-base leading-8 text-muted-foreground">{place.description||'A place shared by the community.'}</p><div className="mt-9 flex flex-wrap gap-3">{place.avg_rating!=null&&<Badge variant="secondary">Rating {place.avg_rating.toFixed(1)} · {place.rating_count??0} visits</Badge>}<Badge variant="secondary">{place.like_count??0} appreciations</Badge>{place.price_min!=null&&<Badge variant="secondary">{place.currency_code||'KES'} {place.price_min.toLocaleString()}{place.price_max&&place.price_max!==place.price_min?` – ${place.price_max.toLocaleString()}`:''}</Badge>}</div><p className="mt-8 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">Shared by a member of the HIDDEN GEMS community. Please check local guidance before you travel.</p></div></article>;
}

function Admin() {
 const {user,loading,isLoading}=auth();
 const status=useGetAdminStatus({query:{enabled:!!user,queryKey:getGetAdminStatusQueryKey(),retry:false}});
 if(loading||isLoading)return <LoadingPanel label="Checking your account"/>;if(!user)return <AuthWall title="A quiet corner for the team" copy="The admin workspace is only available to signed-in team members."/>;if(status.isLoading)return <LoadingPanel label="Checking admin access"/>;
 if(status.isError)return <div className="mx-auto max-w-3xl px-5 py-20 text-center"><ShieldCheck size={28} className="mx-auto text-primary"/><h1 className="mt-5 font-editorial text-3xl">We couldn’t confirm access.</h1><p className="mt-2 text-sm text-muted-foreground">Try again once your connection is steady.</p><Button onClick={()=>void status.refetch()} className="mt-6 rounded-full" data-testid="button-retry-admin">Try again</Button></div>;
 if(!status.data?.isAdmin)return <div className="mx-auto max-w-3xl px-5 py-20 text-center"><ShieldCheck size={28} className="mx-auto text-primary"/><h1 className="mt-5 font-editorial text-3xl">This path is for the team.</h1><p className="mt-2 text-sm text-muted-foreground">Your account doesn’t have admin access.</p><Link to="/" className="mt-6 inline-block text-sm font-semibold text-primary">Back to discovery</Link></div>;
 return <div className="mx-auto max-w-5xl px-5 py-16 md:px-10 md:py-24"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.2em] text-primary"><ShieldCheck size={15}/>Verified admin</div><h1 className="mt-4 font-editorial text-5xl tracking-[-.05em] text-primary">Review desk.</h1><p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Your admin status is confirmed by the server. Place review tools will appear here when the moderation API is available.</p><div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No moderation actions are connected in this foundation.</div></div>;
}

function SignIn() {return <AuthScreen mode="sign-in"/>}
function SignUp() {return <AuthScreen mode="sign-up"/>}
function ForgotPassword() {return <AuthScreen mode="forgot-password"/>}
function AuthScreen({mode}:{mode:'sign-in'|'sign-up'|'forgot-password'}) {
 const navigate=useNavigate();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const [showPassword,setShowPassword]=useState(false);
 const title=mode==='sign-in'?'Good to have you back.':mode==='sign-up'?'Start your own field guide.':'A link for the way back.';
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{if(mode==='sign-in'){const {data,error:authError}=await supabase.auth.signInWithPassword({email,password});if(authError)throw authError;const {data:profile,error:profileError}=await supabase.from('profiles').select('username').eq('id',data.user.id).maybeSingle();if(profileError)throw profileError;navigate(profile?.username?'/':'/setup-username');}else if(mode==='sign-up'){const {data,error:authError}=await supabase.auth.signUp({email,password,options:{data:{display_name:name}}});if(authError)throw authError;if(data.session)navigate('/setup-username');else setMessage('Check your email to confirm your account, then sign in to choose your username.');}else{const {error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/reset-password`});if(resetError)throw resetError;setMessage('If an account exists for that email, a reset link is on its way.');}}catch(err){setError(err instanceof Error?err.message:'We couldn’t complete that request. Please try again.');}finally{setBusy(false);}}
 return <div className="mx-auto grid min-h-[75vh] max-w-[1200px] items-center gap-12 px-5 py-12 md:grid-cols-2 md:px-10 md:py-20"><div><span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><Compass size={23}/></span><p className="mt-8 text-[11px] font-semibold uppercase tracking-[.2em] text-primary">HIDDEN GEMS · KENYA</p><h1 className="mt-4 max-w-xl font-editorial text-5xl leading-[1.06] tracking-[-.05em] text-primary md:text-6xl">{title}</h1><p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{mode==='forgot-password'?'We’ll send a sign-in reset link to the email on your account.':mode==='sign-up'?'Find the small places. Save the stories. Share the detours worth taking.':'Pick up where you left off, and keep the places you love close.'}</p></div><form onSubmit={submit} className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-9"><h2 className="font-editorial text-2xl text-primary">{mode==='sign-in'?'Sign in':mode==='sign-up'?'Create your account':'Reset your password'}</h2><p className="mt-2 text-sm text-muted-foreground">{mode==='forgot-password'?'Enter your email and we’ll send a reset link.':'Your next good discovery is just around the corner.'}</p>{mode==='sign-up'&&<div className="mt-7"><label className="mb-2 block text-sm font-medium">Display name</label><Input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name" className="h-12 bg-background" data-testid="input-auth-name"/></div>}<div className="mt-7"><label className="mb-2 block text-sm font-medium">Email</label><Input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="h-12 bg-background" placeholder="you@example.com" data-testid="input-auth-email"/></div>{mode!=='forgot-password'&&<div className="mt-5"><label className="mb-2 block text-sm font-medium">Password</label><div className="relative"><Input required minLength={6} type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='sign-in'?'current-password':'new-password'} className="h-12 bg-background pr-12" data-testid="input-auth-password"/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" data-testid="button-toggle-password">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>}{mode==='sign-in'&&<div className="mt-3 text-right"><Link to="/forgot-password" className="text-xs font-medium text-primary no-underline hover:underline">Forgot password?</Link></div>}{error&&<p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}{message&&<p role="status" className="mt-4 rounded-lg bg-secondary p-3 text-sm text-primary">{message}</p>}<Button type="submit" disabled={busy} className="mt-7 h-12 w-full rounded-full" data-testid="button-auth-submit">{busy?<><LoaderCircle size={16} className="mr-2 animate-spin"/>Working…</>:mode==='sign-in'?'Sign in':mode==='sign-up'?'Create account':'Send reset link'}</Button><p className="mt-6 text-center text-sm text-muted-foreground">{mode==='sign-in'?<>New to HIDDEN GEMS? <Link to="/sign-up" className="font-semibold text-primary no-underline">Create an account</Link></>:mode==='sign-up'?<>Already a member? <Link to="/sign-in" className="font-semibold text-primary no-underline">Sign in</Link></>:<>Remembered your password? <Link to="/sign-in" className="font-semibold text-primary no-underline">Sign in</Link></>}</p></form></div>;
}

function ResetPassword() {
 const navigate=useNavigate();const {user,loading}=auth();const [password,setPassword]=useState('');const [confirmation,setConfirmation]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 if(loading)return <LoadingPanel label="Checking your reset link"/>;
 if(!user)return <div className="mx-auto max-w-xl px-5 py-16 md:py-24"><div className="rounded-3xl border border-border bg-card p-8"><h1 className="font-editorial text-3xl text-primary">Your reset link is not active.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Request a new link and open it from the same browser to continue.</p><Link to="/forgot-password" className="mt-5 inline-flex text-sm font-semibold text-primary">Request another link</Link></div></div>;
 async function submit(e:FormEvent){e.preventDefault();setError('');setMessage('');if(password.length<8){setError('Use at least 8 characters for your new password.');return;}if(password!==confirmation){setError('The passwords do not match.');return;}setBusy(true);try{const {error:resetError}=await supabase.auth.updateUser({password});if(resetError)throw resetError;setMessage('Your password has been updated.');setTimeout(()=>navigate('/'),900);}catch(err){setError(err instanceof Error?err.message:'We could not update your password. Request a new reset link and try again.');}finally{setBusy(false);}}
 return <div className="mx-auto max-w-xl px-5 py-16 md:py-24"><form onSubmit={submit} className="rounded-3xl border border-border bg-card p-7 md:p-10"><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">Account security</div><h1 className="mt-4 font-editorial text-4xl tracking-[-.04em] text-primary">Choose a new password.</h1><label className="mb-2 mt-7 block text-sm font-medium">New password</label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password" className="h-12 bg-background" data-testid="input-new-password"/><label className="mb-2 mt-5 block text-sm font-medium">Confirm password</label><Input type="password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} minLength={8} required autoComplete="new-password" className="h-12 bg-background" data-testid="input-confirm-password"/>{error&&<p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}{message&&<p role="status" className="mt-4 rounded-lg bg-secondary p-3 text-sm text-primary">{message}</p>}<Button type="submit" disabled={busy} className="mt-6 h-12 w-full rounded-full" data-testid="button-update-password">{busy?'Updating…':'Update password'}</Button></form></div>;
}

function SetupUsername() {
 const {user,loading,isLoading}=auth(); const [username,setUsername]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 if(loading||isLoading)return <LoadingPanel label="Preparing your account"/>;if(!user)return <AuthWall title="One last step" copy="Sign in to choose the name friends will see beside your discoveries." />;
 const navigate=useNavigate();
 async function save(e:FormEvent){e.preventDefault();if(!user)return;setBusy(true);setMessage('');const clean=username.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(clean)){setMessage('Use 3–24 letters, numbers or underscores.');setBusy(false);return;}const {error}=await supabase.from('profiles').update({username:clean}).eq('id',user.id);if(error)setMessage(error.message);else{setMessage('Username saved.');navigate('/');}setBusy(false);}
 return <div className="mx-auto max-w-xl px-5 py-16 md:py-24"><div className="rounded-3xl border border-border bg-card p-7 md:p-10"><div className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">Make it yours</div><h1 className="mt-4 font-editorial text-4xl tracking-[-.04em] text-primary">Choose your trail name.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">A simple username makes your shared places easier to find.</p><form onSubmit={save} className="mt-7"><label className="mb-2 block text-sm font-medium">Username</label><div className="flex items-center rounded-xl border border-input bg-background pl-4"><span className="text-sm text-muted-foreground">@</span><Input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} required className="border-0 bg-transparent focus-visible:ring-0" placeholder="yourname" data-testid="input-username"/></div>{message&&<p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}<Button disabled={busy} className="mt-5 rounded-full" data-testid="button-save-username">{busy?'Saving…':'Save username'}</Button></form></div></div>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}){const location=useLocation();return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>}
function PlaceDetailRoute(){const params=useParams<{placeId:string}>();return <PlaceDetail params={{placeId:params.placeId||''}}/>}
function Router(){return <RoutedErrorBoundary><Shell><Routes>
  <Route path="/" element={<Discover/>}/><Route path="/explore" element={<Explore/>}/><Route path="/create" element={<CreatePlace/>}/><Route path="/saved" element={<Saved/>}/><Route path="/profile" element={<Profile/>}/>
  <Route path="/places/:placeId" element={<PlaceDetailRoute/>}/><Route path="/admin" element={<Admin/>}/><Route path="/sign-in" element={<SignIn/>}/><Route path="/sign-up" element={<SignUp/>}/><Route path="/forgot-password" element={<ForgotPassword/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/setup-username" element={<SetupUsername/>}/><Route path="*" element={<NotFound/>}/>
</Routes></Shell></RoutedErrorBoundary>}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></BrowserRouter><Toaster/></TooltipProvider></QueryClientProvider>}
export default App;
