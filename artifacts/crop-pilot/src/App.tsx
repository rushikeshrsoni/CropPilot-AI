import { useEffect, useMemo, useState, type FormEvent, type HTMLAttributes, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, Bug, Check,
  CheckCircle2, ChevronRight, CircleHelp, CloudSun, Droplets, FileClock, Flower2,
  Globe2, HeartHandshake, Home, ImagePlus, Leaf, LoaderCircle, LogOut, Menu, MessageCircle,
  MessageSquareText, Plus, Save, Search, Send, ShieldCheck, Sprout, Tractor, Trash2,
  TriangleAlert, Upload, Wheat, X,
} from 'lucide-react';
import {
  getGetAdviceQueryKey, getGetCurrentUserQueryKey, getGetDashboardQueryKey,
  getGetDiagnosisQueryKey, getGetFarmQueryKey, getHealthCheckQueryKey,
  getListAdviceQueryKey, getListChatMessagesQueryKey, getListChatSessionsQueryKey,
  getListDiagnosesQueryKey, getListFarmsQueryKey, getListHistoryQueryKey,
  useCreateAdvice, useCreateChatSession, useCreateDiagnosis, useCreateFarm,
  useDeleteFarm, useGetAdvice, useGetCurrentUser, useGetDashboard, useGetDiagnosis,
  useGetFarm, useHealthCheck, useListAdvice, useListChatMessages, useListChatSessions,
  useListDiagnoses, useListFarms, useListHistory, useLogin, useLogout, useRegister,
  useSendChatMessage, useUpdateFarm, useUpdateProfile,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } },
});

const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = `${button} bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md`;
const quietButton = `${button} border border-border bg-card text-foreground hover:bg-secondary`;
const inputClass = 'w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground/70';
const labelClass = 'mb-1.5 block text-sm font-semibold text-foreground';

function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`flex items-center gap-2.5 ${light ? 'text-sidebar-foreground' : 'text-foreground'}`} data-testid="link-brand">
    <span className="grid size-10 place-items-center rounded-2xl bg-accent text-primary"><Sprout size={23} strokeWidth={2.2} /></span>
    <span className="font-display text-[22px] font-semibold tracking-tight">CropPilot<span className="text-primary">.</span></span>
  </Link>;
}

function ButtonLink({ href, children, variant = 'primary', testId }: { href: string; children: ReactNode; variant?: 'primary' | 'quiet'; testId: string }) {
  return <Link href={href} className={variant === 'primary' ? primaryButton : quietButton} data-testid={testId}>{children}</Link>;
}

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>{eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[.19em] text-primary/75">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[40px]" data-testid="text-page-title">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
    </div>{action}
  </div>;
}

function Surface({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={`rounded-2xl border border-card-border bg-card shadow-sm ${className}`} {...props}>{children}</section>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} aria-label="Loading" />;
}

function LoadingPanel({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" data-testid="status-loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={`h-[72px] w-full ${i === 0 ? 'h-24' : ''}`} />)}</div>;
}

function ErrorPanel({ onRetry, message = 'We could not load this just now.' }: { onRetry?: () => void; message?: string }) {
  return <Surface className="flex flex-col items-center px-6 py-12 text-center" data-testid="status-error">
    <span className="mb-4 grid size-12 place-items-center rounded-full bg-red-50 text-destructive"><TriangleAlert size={21} /></span>
    <h3 className="font-display text-xl font-semibold">A small pause in the field</h3>
    <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message} Check your connection and try again.</p>
    {onRetry && <button onClick={onRetry} className={`${quietButton} mt-5`} data-testid="button-retry">Try again</button>}
  </Surface>;
}

function EmptyState({ icon: Icon = Sprout, title, copy, action }: { icon?: typeof Sprout; title: string; copy: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center" data-testid="status-empty">
    <span className="mb-4 grid size-14 place-items-center rounded-full bg-accent/70 text-primary"><Icon size={25} /></span>
    <h3 className="font-display text-xl font-semibold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>{action && <div className="mt-5">{action}</div>}
  </div>;
}

const nav = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/farms', label: 'My farms', icon: Tractor },
  { href: '/diagnose', label: 'Crop check', icon: Bug },
  { href: '/advice', label: 'Field advice', icon: BookOpen },
  { href: '/chat', label: 'Ask CropPilot', icon: MessageCircle },
  { href: '/history', label: 'History', icon: FileClock },
];

function AppFrame({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const logout = useLogout();
  const qc = useQueryClient();
  const initials = user?.fullName?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F';
  const currentLabel = nav.find((item) => location.startsWith(item.href))?.label ?? 'Your field desk';
  const doLogout = () => logout.mutate(undefined, { onSuccess: () => { qc.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); setLocation('/login'); } });
  return <div className="min-h-[100dvh] bg-background">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
      <Brand light />
      <div className="mb-4 mt-10 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-sidebar-foreground/45">Your field desk</div>
      <nav className="space-y-1.5">{nav.map(({ href, label, icon: Icon }) => {
        const active = location === href || (href !== '/dashboard' && location.startsWith(`${href}/`));
        return <Link key={href} href={href} data-testid={`nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition ${active ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}>
          <Icon size={18} strokeWidth={active ? 2.2 : 1.8} /><span className="flex-1">{label}</span>{active && <span className="size-1.5 rounded-full bg-sidebar-primary" />}
        </Link>;
      })}</nav>
      <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-4">
        <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary"><HeartHandshake size={19} /></div>
        <p className="text-sm font-semibold">A steadier season starts here.</p><p className="mt-1 text-xs leading-5 text-sidebar-foreground/60">Your notes, questions and next steps, all in one place.</p>
        <Link href="/profile" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sidebar-primary" data-testid="link-profile-sidebar">Your profile <ArrowRight size={13} /></Link>
      </div>
    </aside>
    <div className="lg:pl-[252px]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur-md sm:px-8">
        <button onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-xl border border-border lg:hidden" aria-label="Open navigation" data-testid="button-open-menu"><Menu size={19} /></button>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><span className="font-medium text-foreground">{currentLabel}</span><ChevronRight size={14} /><span>Field desk</span></div>
        <div className="flex items-center gap-3">
          <Link href="/profile" className="hidden text-right sm:block" data-testid="link-profile-header"><span className="block text-sm font-semibold">{user?.fullName || 'Farmer'}</span><span className="block text-xs text-muted-foreground">{user?.regionState || 'Your farm, your pace'}</span></Link>
          <Link href="/profile" className="grid size-10 place-items-center rounded-full bg-accent font-semibold text-primary" aria-label="Open profile" data-testid="avatar-profile">{initials}</Link>
          <button onClick={doLogout} disabled={logout.isPending} title="Sign out" className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid="button-logout">{logout.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <LogOut size={17} />}</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-10"><div className="animate-[enter_.5s_ease-out_both]">{children}</div></main>
    </div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-foreground/35 lg:hidden" onClick={() => setMobileOpen(false)}>
      <div className="flex h-full w-[min(86vw,320px)] flex-col bg-sidebar p-5 text-sidebar-foreground shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><Brand light /><button onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-sidebar-accent" aria-label="Close navigation" data-testid="button-close-menu"><X size={18} /></button></div>
        <nav className="mt-9 space-y-2">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${location === href ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'}`} data-testid={`mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} />{label}</Link>)}</nav>
        <Link href="/profile" onClick={() => setMobileOpen(false)} className="mt-auto rounded-xl bg-sidebar-accent px-4 py-3 text-sm" data-testid="link-mobile-profile">Profile & language settings</Link>
      </div>
    </div>}
  </div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, refetch } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const [, setLocation] = useLocation();
  useEffect(() => { if (!isLoading && (isError || !data)) setLocation('/login'); }, [data, isError, isLoading, setLocation]);
  if (isLoading) return <div className="min-h-[100dvh] bg-background p-5 sm:p-10"><div className="mx-auto max-w-5xl"><Skeleton className="mb-9 h-12 w-52" /><Skeleton className="h-48 w-full" /><button onClick={() => refetch()} className="sr-only">Retry</button></div></div>;
  if (!data) return null;
  return <AppFrame>{children}</AppFrame>;
}

function HomePage() {
  const { data: status, isLoading: checking } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  return <div className="grain min-h-[100dvh] overflow-hidden bg-background">
    <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <Brand /><nav className="flex items-center gap-3"><Link href="/login" className="hidden px-3 py-2 text-sm font-semibold text-foreground sm:block" data-testid="link-login">Sign in</Link><ButtonLink href="/register" testId="link-get-started">Get started <ArrowRight size={16} /></ButtonLink></nav>
    </header>
    <main>
      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-8 sm:px-8 sm:pb-24 lg:grid-cols-[1.02fr_.98fr] lg:gap-5 lg:pt-12">
        <div className="relative z-10 max-w-[650px] animate-[enter_.6s_ease-out_both]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/85 px-3.5 py-2 text-xs font-semibold text-primary shadow-sm"><span className="size-2 rounded-full bg-primary" /> Practical guidance, rooted in your field</div>
          <h1 className="font-display text-[48px] font-medium leading-[1.02] tracking-[-.045em] sm:text-[70px] lg:text-[78px]">Good farming<br /><span className="text-primary">grows with</span><br /><em className="font-medium">good advice.</em></h1>
          <p className="mt-6 max-w-[490px] text-base leading-7 text-muted-foreground sm:text-lg">CropPilot turns what you see in the field and what you know about your farm into clear next steps — in English or Hindi.</p>
          <div className="mt-8 flex flex-wrap gap-3"><ButtonLink href="/register" testId="link-create-account">Start with your farm <ArrowRight size={16} /></ButtonLink><ButtonLink href="/login" variant="quiet" testId="link-existing-account">I have an account</ButtonLink></div>
          <div className="mt-8 flex items-center gap-3 text-xs text-muted-foreground"><ShieldCheck size={16} className="text-primary" />Built to support your judgement, not replace it.</div>
        </div>
        <div className="relative mx-auto w-full max-w-[620px] animate-[enter_.75s_.1s_ease-out_both]">
          <div className="absolute -right-12 -top-9 size-48 rounded-full bg-accent/50 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[#d9dfcf] bg-[#e7eadc] p-4 shadow-[0_30px_80px_rgba(42,65,42,.16)] sm:p-6">
            <div className="relative min-h-[355px] overflow-hidden rounded-[1.5rem] bg-[#718a62]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_76%_18%,rgba(242,217,147,.9),transparent_24%),linear-gradient(162deg,#97ae84_0%,#66815f_46%,#304f3f_100%)]" />
              <div className="absolute left-[-10%] top-[18%] h-[80%] w-[125%] rotate-[-14deg] rounded-[45%] border-t border-white/20 bg-[#779161]/65" />
              <div className="absolute left-[-12%] top-[36%] h-[80%] w-[130%] rotate-[-14deg] rounded-[48%] border-t border-white/20 bg-[#536f4e]/80" />
              <div className="absolute left-[-10%] top-[55%] h-[75%] w-[132%] rotate-[-14deg] rounded-[48%] border-t border-white/20 bg-[#355642]/90" />
              <div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'repeating-linear-gradient(171deg, transparent 0 29px, rgba(232,230,189,.4) 30px 32px, transparent 33px 57px)' }} />
              <div className="absolute left-[12%] top-[29%] flex rotate-[-7deg] items-center gap-2 rounded-full border border-white/35 bg-white/85 px-3 py-2 text-xs font-semibold text-[#315541] shadow-lg backdrop-blur"><span className="grid size-6 place-items-center rounded-full bg-[#dce7ce]"><Leaf size={14} /></span>Crop health looks steady</div>
              <div className="absolute bottom-[12%] right-[8%] rounded-2xl border border-white/50 bg-[#f8f6ed]/95 p-4 shadow-xl backdrop-blur-sm">
                <div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#e5ebda] text-primary"><CloudSun size={19} /></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today’s field note</p><p className="mt-1 max-w-[190px] text-sm font-semibold text-foreground">A little rain is coming. Hold irrigation for now.</p></div></div>
              </div>
              <div className="absolute bottom-5 left-5 rounded-xl bg-[#203e31]/65 px-3 py-2 text-[10px] uppercase tracking-[.18em] text-white/80 backdrop-blur">Your field · Your season</div>
            </div>
            <div className="flex items-center justify-between px-2 pb-1 pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" /> {checking ? 'Checking CropPilot services' : status?.status === 'ok' ? 'Field desk is ready' : 'Your field desk, when you need it'}</span><span>EN · हिंदी</span></div>
          </div>
          <div className="absolute -bottom-8 -left-4 hidden rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-lg sm:flex sm:items-center sm:gap-3"><span className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><MessageCircle size={17} /></span><span className="text-xs"><strong className="block text-foreground">A trusted voice, close at hand</strong><span className="text-muted-foreground">Clear advice for real farm days</span></span></div>
        </div>
      </section>
      <section className="border-y border-border bg-[#e9eadf] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[.75fr_1.25fr] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-primary">A good place to begin</p><h2 className="mt-3 max-w-sm font-display text-4xl leading-tight">Your field has a story. Let’s read it together.</h2></div><p className="max-w-xl text-sm leading-7 text-muted-foreground md:justify-self-end md:text-base">Keep farm details close, make sense of crop symptoms, and plan the next move with advice shaped around your soil, season and goals.</p></div>
        <div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-3">
          {[{ n: '01', icon: Tractor, title: 'Know your farm', text: 'Save your crops, soil and irrigation once. Get guidance that starts with your conditions.' }, { n: '02', icon: Bug, title: 'Notice something?', text: 'Describe a symptom or add a field photo. Get a calm, practical first assessment.' }, { n: '03', icon: BookOpen, title: 'Choose your next step', text: 'Plan for your season, your budget and the way you want to grow.' }].map(({ n, icon: Icon, title, text }) => <article key={n} className="rounded-2xl border border-[#d8d9cd] bg-background/75 p-6 transition-transform duration-200 hover:-translate-y-1"><div className="flex items-center justify-between"><span className="font-display text-3xl text-primary/30">{n}</span><Icon size={21} className="text-primary" /></div><h3 className="mt-7 font-display text-2xl">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}
        </div>
      </section>
      <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 sm:py-20 md:flex-row md:items-center">
        <div><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-primary">Made for the way you speak</p><h2 className="font-display text-4xl sm:text-5xl">English today.<br /><span className="text-primary">हिंदी whenever you need.</span></h2><p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">Choose your language and CropPilot will keep your plans, conversations and farm notes in step.</p></div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm"><span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><Globe2 size={22} /></span><span className="pr-3 text-sm"><strong className="block">Your language, your choice</strong><span className="text-muted-foreground">Set it any time in your profile</span></span></div>
      </section>
      <footer className="border-t border-border bg-[#263f32] px-5 py-9 text-white sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 sm:flex-row sm:items-center"><Brand light /><p className="max-w-xl text-xs leading-5 text-white/65">CropPilot offers helpful guidance, but field conditions vary. For severe or fast-spreading crop issues, contact a local agricultural expert.</p></div></footer>
    </main>
  </div>;
}

const loginSchema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });
function AuthShell({ children, caption }: { children: ReactNode; caption: string }) {
  return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]">
    <aside className="relative hidden overflow-hidden bg-[#263f32] p-10 text-[#f1f0e4] lg:flex lg:flex-col lg:justify-between">
      <Brand light /><div className="relative z-10 max-w-lg"><p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-[#e4c987]">Your fields, understood</p><h1 className="font-display text-6xl leading-[1.04]">A steady hand<br />for every season.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/70">{caption}</p></div>
      <div className="absolute -bottom-20 -right-28 size-[430px] rounded-full border border-white/10" /><div className="absolute -bottom-12 -right-20 size-[330px] rounded-full border border-white/10" /><div className="absolute bottom-7 left-10 text-xs text-white/45">A thoughtful companion for Indian growers.</div>
    </aside>
    <div className="flex min-h-[100dvh] flex-col p-5 sm:p-9"><div className="flex items-center justify-between lg:justify-end"><div className="lg:hidden"><Brand /></div><Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-home"><ArrowLeft size={15} />Home</Link></div><div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">{children}</div><p className="text-center text-xs text-muted-foreground">Your information stays connected to your account.</p></div>
  </div>;
}

function LoginPage() {
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const login = useLogin(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const submit = form.handleSubmit((values) => login.mutate({ data: values }, { onSuccess: (user) => { qc.setQueryData(getGetCurrentUserQueryKey(), user); setLocation('/dashboard'); } }));
  return <AuthShell caption="Field notes, crop guidance and conversations you can return to — in English or Hindi.">
    <p className="mb-2 text-xs font-bold uppercase tracking-[.19em] text-primary">Welcome back</p><h2 className="font-display text-4xl">Come on in.</h2><p className="mt-2 text-sm text-muted-foreground">Sign in to pick up where your fields left off.</p>
    <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
      <div><label className={labelClass} htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" className={inputClass} {...form.register('email')} data-testid="input-email" />{form.formState.errors.email && <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.email.message}</p>}</div>
      <div><label className={labelClass} htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" className={inputClass} {...form.register('password')} data-testid="input-password" />{form.formState.errors.password && <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.password.message}</p>}</div>
      {login.isError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" data-testid="status-login-error">We could not sign you in. Check your details and try again.</p>}
      <button className={`${primaryButton} w-full py-3`} disabled={login.isPending} data-testid="button-login">{login.isPending ? <><LoaderCircle className="animate-spin" size={17} />Signing in…</> : <>Sign in <ArrowRight size={16} /></>}</button>
    </form><p className="mt-7 text-center text-sm text-muted-foreground">New to CropPilot? <Link className="font-semibold text-primary hover:underline" href="/register" data-testid="link-register">Create an account</Link></p>
  </AuthShell>;
}

const registerSchema = z.object({ fullName: z.string().min(2, 'Use at least 2 characters'), email: z.string().email('Enter a valid email address'), phone: z.string().optional(), password: z.string().min(10, 'Use at least 10 characters'), preferredLanguage: z.enum(['en', 'hi']), regionState: z.string().optional() });
function RegisterPage() {
  const form = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema), defaultValues: { fullName: '', email: '', phone: '', password: '', preferredLanguage: 'en', regionState: '' } });
  const register = useRegister(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const submit = form.handleSubmit(({ phone, regionState, ...values }) => register.mutate({ data: { ...values, phone: phone || null, regionState: regionState || null } }, { onSuccess: (user) => { qc.setQueryData(getGetCurrentUserQueryKey(), user); setLocation('/dashboard'); } }));
  return <AuthShell caption="Start with what you grow. CropPilot learns your farm context and helps you make the next decision with confidence.">
    <p className="mb-2 text-xs font-bold uppercase tracking-[.19em] text-primary">A better field notebook</p><h2 className="font-display text-4xl">Let’s get started.</h2><p className="mt-2 text-sm text-muted-foreground">A few details to make CropPilot yours.</p>
    <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
      <div><label className={labelClass} htmlFor="reg-name">Your name</label><input id="reg-name" className={inputClass} autoComplete="name" {...form.register('fullName')} data-testid="input-full-name" />{form.formState.errors.fullName && <p className="mt-1 text-xs text-destructive">{form.formState.errors.fullName.message}</p>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass} htmlFor="reg-email">Email address</label><input id="reg-email" className={inputClass} type="email" autoComplete="email" {...form.register('email')} data-testid="input-register-email" /></div><div><label className={labelClass} htmlFor="reg-phone">Phone <span className="font-normal text-muted-foreground">optional</span></label><input id="reg-phone" className={inputClass} type="tel" autoComplete="tel" {...form.register('phone')} data-testid="input-phone" /></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass} htmlFor="reg-state">State <span className="font-normal text-muted-foreground">optional</span></label><input id="reg-state" className={inputClass} placeholder="e.g. Maharashtra" {...form.register('regionState')} data-testid="input-region-state" /></div><div><label className={labelClass} htmlFor="reg-language">Preferred language</label><select id="reg-language" className={inputClass} {...form.register('preferredLanguage')} data-testid="select-language"><option value="en">English</option><option value="hi">हिंदी</option></select></div></div>
      <div><label className={labelClass} htmlFor="reg-password">Create a password</label><input id="reg-password" type="password" autoComplete="new-password" className={inputClass} {...form.register('password')} data-testid="input-register-password" /><p className="mt-1 text-xs text-muted-foreground">At least 10 characters.</p></div>
      {Object.values(form.formState.errors).length > 0 && <p role="alert" className="text-xs text-destructive">Please review the highlighted details.</p>}
      {register.isError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" data-testid="status-register-error">We could not create your account. Please review your details and try again.</p>}
      <button className={`${primaryButton} w-full py-3`} disabled={register.isPending} data-testid="button-register">{register.isPending ? <><LoaderCircle className="animate-spin" size={17} />Setting up your field desk…</> : <>Create your account <ArrowRight size={16} /></>}</button>
    </form><p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link className="font-semibold text-primary hover:underline" href="/login" data-testid="link-login-from-register">Sign in</Link></p>
  </AuthShell>;
}

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  if (isLoading) return <><Skeleton className="mb-8 h-28 w-full" /><LoadingPanel rows={4} /></>;
  if (isError || !data) return <><PageTitle title="Your field desk" subtitle="Your farms, notes and next steps." /><ErrorPanel onRetry={() => refetch()} /></>;
  const stats = [
    { label: 'Farms', value: data.farmCount, icon: Tractor, tone: 'bg-[#e4eddd] text-[#345f42]', href: '/farms' },
    { label: 'Crop checks', value: data.diagnosisCount, icon: Bug, tone: 'bg-[#f1e8d9] text-[#8d6430]', href: '/history?kind=diagnosis' },
    { label: 'Field plans', value: data.adviceCount, icon: BookOpen, tone: 'bg-[#e1eceb] text-[#356766]', href: '/history?kind=advice' },
    { label: 'Conversations', value: data.chatCount, icon: MessageCircle, tone: 'bg-[#eee4df] text-[#8a5b47]', href: '/chat' },
  ];
  return <>
    <div className="mb-8 overflow-hidden rounded-[1.8rem] bg-[#2e503d] p-6 text-[#f5f2e7] sm:p-9">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[#dcc991]">Your field desk</p><h1 className="font-display text-3xl sm:text-4xl" data-testid="text-dashboard-title">Every good season begins with a note.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Keep your farm close, ask what’s on your mind, and take the next step when you’re ready.</p></div><div className="flex flex-wrap gap-2"><ButtonLink href="/diagnose" testId="link-start-diagnosis"><Bug size={16} />Check a crop</ButtonLink><ButtonLink href="/advice" variant="quiet" testId="link-start-advice"><BookOpen size={16} />Plan my season</ButtonLink></div></div>
    </div>
    <div className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(({ label, value, icon: Icon, tone, href }) => <Link key={label} href={href} className="rounded-2xl border border-card-border bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5 sm:p-5" data-testid={`stat-${label.toLowerCase().replace(' ', '-')}`}><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon size={19} /></span><ArrowDownRight size={16} className="text-muted-foreground/60" /></div><p className="mt-5 font-display text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></Link>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.12fr_.88fr]">
      <Surface className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">A little history</p><h2 className="mt-1 font-display text-2xl">Recent activity</h2></div><Link href="/history" className="inline-flex items-center gap-1 text-xs font-semibold text-primary" data-testid="link-all-history">All history <ArrowRight size={14} /></Link></div>
        {!data.recentActivity.length ? <EmptyState icon={Activity} title="Your field notes start here" copy="Crop checks, season plans and conversations will gather here as you use CropPilot." action={<ButtonLink href="/diagnose" testId="link-first-check">Make a crop check</ButtonLink>} /> :
          <div className="divide-y divide-border/70">{data.recentActivity.slice(0, 5).map((item) => <Link href={item.path} key={`${item.kind}-${item.id}`} className="flex gap-3 py-4 first:pt-0 last:pb-0" data-testid={`activity-${item.id}`}><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent/60 text-primary">{item.kind === 'diagnosis' ? <Bug size={17} /> : item.kind === 'advice' ? <BookOpen size={17} /> : <MessageCircle size={17} />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.title}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">{item.summary}</span></span><time className="shrink-0 pt-1 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</time></Link>)}</div>}
      </Surface>
      <div className="space-y-4">
        <Surface className="p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e5eddd] text-primary"><Leaf size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-primary">Your latest crop check</p><h2 className="font-display text-xl">A closer look</h2></div></div>
          {data.latestDiagnosis ? <Link href={`/diagnose/${data.latestDiagnosis.id}`} className="block rounded-xl bg-muted/70 p-4 hover:bg-muted" data-testid="latest-diagnosis"><p className="text-sm font-semibold">{data.latestDiagnosis.result.diseaseName}</p><p className="mt-1 text-xs text-muted-foreground">{data.latestDiagnosis.cropName} · {data.latestDiagnosis.result.confidenceScore}% match</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">See recommendations <ArrowRight size={13} /></span></Link> : <p className="text-sm leading-6 text-muted-foreground">When something in your crop looks different, start a check and keep the findings close.</p>}
          <Link href="/diagnose" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary" data-testid="link-new-diagnosis"><Plus size={15} />Start a crop check</Link>
        </Surface>
        <Surface className="p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f1e8d9] text-[#8d6430]"><Wheat size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#8d6430]">Your latest field plan</p><h2 className="font-display text-xl">A plan for what’s next</h2></div></div>
          {data.latestAdvice ? <Link href={`/advice/${data.latestAdvice.id}`} className="block rounded-xl bg-muted/70 p-4 hover:bg-muted" data-testid="latest-advice"><p className="text-sm font-semibold">{data.latestAdvice.farmName || 'Your farm'} · {data.latestAdvice.season}</p><p className="mt-1 text-xs text-muted-foreground">Created {formatDistanceToNow(new Date(data.latestAdvice.createdAt), { addSuffix: true })}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Open field plan <ArrowRight size={13} /></span></Link> : <p className="text-sm leading-6 text-muted-foreground">Set a goal for the season and get a thoughtful plan grounded in your farm.</p>}
          <Link href="/advice" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary" data-testid="link-new-advice"><Plus size={15} />Build a field plan</Link>
        </Surface>
      </div>
    </div>
  </>;
}

const farmSchema = z.object({
  name: z.string().min(1, 'Give this farm a name').max(120),
  state: z.string().optional(), district: z.string().optional(), soilType: z.string().optional(),
  soilPh: z.string().optional(), organicMatter: z.string().optional(), irrigationMethod: z.string().optional(),
  farmSizeAcres: z.string().optional(), primaryCrops: z.string().optional(), notes: z.string().optional(),
});
type FarmValues = z.infer<typeof farmSchema>;
function FarmForm({ initial, onSubmit, pending, submitError, editing = false }: { initial?: FarmValues; onSubmit: (values: FarmValues) => void; pending: boolean; submitError: boolean; editing?: boolean }) {
  const form = useForm<FarmValues>({ resolver: zodResolver(farmSchema), defaultValues: initial || { name: '', state: '', district: '', soilType: '', soilPh: '', organicMatter: '', irrigationMethod: '', farmSizeAcres: '', primaryCrops: '', notes: '' } });
  useEffect(() => { if (initial) form.reset(initial); }, [initial, form]);
  return <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
    <Surface className="p-5 sm:p-7"><div className="mb-5"><h2 className="font-display text-2xl">Farm details</h2><p className="mt-1 text-sm text-muted-foreground">A little context helps make every recommendation more useful.</p></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={labelClass} htmlFor="farm-name">Farm name</label><input id="farm-name" className={inputClass} placeholder="e.g. North Field" {...form.register('name')} data-testid="input-farm-name" />{form.formState.errors.name && <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
        <div><label className={labelClass} htmlFor="farm-state">State</label><input id="farm-state" className={inputClass} placeholder="e.g. Maharashtra" {...form.register('state')} data-testid="input-farm-state" /></div>
        <div><label className={labelClass} htmlFor="farm-district">District</label><input id="farm-district" className={inputClass} placeholder="Your district" {...form.register('district')} data-testid="input-farm-district" /></div>
        <div><label className={labelClass} htmlFor="farm-size">Farm size (acres)</label><input id="farm-size" className={inputClass} type="number" min="0" step="0.1" placeholder="e.g. 3.5" {...form.register('farmSizeAcres')} data-testid="input-farm-size" /></div>
        <div><label className={labelClass} htmlFor="farm-crops">Main crops</label><input id="farm-crops" className={inputClass} placeholder="Wheat, cotton, soybean…" {...form.register('primaryCrops')} data-testid="input-farm-crops" /><p className="mt-1 text-xs text-muted-foreground">Separate crops with commas.</p></div>
        <div><label className={labelClass} htmlFor="farm-soil">Soil type</label><select id="farm-soil" className={inputClass} {...form.register('soilType')} data-testid="select-soil-type"><option value="">Choose if known</option><option>Black cotton soil</option><option>Alluvial</option><option>Red soil</option><option>Laterite</option><option>Sandy</option><option>Clay</option><option>Loamy</option><option>Other</option></select></div>
        <div><label className={labelClass} htmlFor="farm-ph">Soil pH <span className="font-normal text-muted-foreground">optional</span></label><input id="farm-ph" className={inputClass} type="number" min="0" max="14" step="0.1" placeholder="e.g. 6.8" {...form.register('soilPh')} data-testid="input-soil-ph" /></div>
        <div><label className={labelClass} htmlFor="farm-organic">Organic matter</label><input id="farm-organic" className={inputClass} placeholder="e.g. Medium, 1.2%" {...form.register('organicMatter')} data-testid="input-organic-matter" /></div>
        <div className="sm:col-span-2"><label className={labelClass} htmlFor="farm-irrigation">Irrigation method</label><select id="farm-irrigation" className={inputClass} {...form.register('irrigationMethod')} data-testid="select-irrigation"><option value="">Choose if known</option><option>Rain-fed</option><option>Drip</option><option>Sprinkler</option><option>Canal</option><option>Well / borewell</option><option>Flood irrigation</option><option>Other</option></select></div>
        <div className="sm:col-span-2"><label className={labelClass} htmlFor="farm-notes">Notes about this farm</label><textarea id="farm-notes" rows={4} className={inputClass} placeholder="Anything you’d like CropPilot to keep in mind…" {...form.register('notes')} data-testid="textarea-farm-notes" /></div>
      </div>
    </Surface>
    {submitError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" role="alert" data-testid="status-farm-error">We couldn’t save this farm. Please try again.</p>}
    <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row"><ButtonLink href="/farms" variant="quiet" testId="link-cancel-farm">Cancel</ButtonLink><button className={primaryButton} disabled={pending} data-testid="button-save-farm">{pending ? <><LoaderCircle size={16} className="animate-spin" />Saving…</> : <><Save size={16} />{editing ? 'Save farm changes' : 'Save farm'}</>}</button></div>
  </form>;
}
function farmPayload(values: FarmValues) {
  return {
    name: values.name.trim(), state: values.state || null, district: values.district || null,
    soilType: values.soilType || null, soilPh: values.soilPh ? Number(values.soilPh) : null,
    organicMatter: values.organicMatter || null, irrigationMethod: values.irrigationMethod || null,
    farmSizeAcres: values.farmSizeAcres ? Number(values.farmSizeAcres) : null,
    primaryCrops: (values.primaryCrops || '').split(',').map((crop) => crop.trim()).filter(Boolean),
    notes: values.notes || null,
  };
}
function NewFarmPage() {
  const create = useCreateFarm(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  return <><PageTitle eyebrow="Farm notebook" title="Add a farm" subtitle="Start with the details you know. You can always add more later." />
    <FarmForm onSubmit={(values) => create.mutate({ data: farmPayload(values) }, { onSuccess: (farm) => { qc.invalidateQueries({ queryKey: getListFarmsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setLocation(`/farms/${farm.id}/edit`); } })} pending={create.isPending} submitError={create.isError} />
  </>;
}
function EditFarmPage() {
  const params = useParams<{ id: string }>(); const id = params.id || '';
  const { data: farm, isLoading, isError, refetch } = useGetFarm(id, { query: { queryKey: getGetFarmQueryKey(id), enabled: !!id } });
  const update = useUpdateFarm(); const remove = useDeleteFarm(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const initial = useMemo(() => farm ? { name: farm.name, state: farm.state || '', district: farm.district || '', soilType: farm.soilType || '', soilPh: farm.soilPh?.toString() || '', organicMatter: farm.organicMatter || '', irrigationMethod: farm.irrigationMethod || '', farmSizeAcres: farm.farmSizeAcres?.toString() || '', primaryCrops: farm.primaryCrops.join(', '), notes: farm.notes || '' } : undefined, [farm]);
  if (isLoading) return <LoadingPanel />;
  if (isError || !farm) return <><PageTitle title="Farm details" /><ErrorPanel onRetry={() => refetch()} message="This farm may have been removed, or the details are unavailable." /></>;
  const doDelete = () => { if (window.confirm(`Delete ${farm.name}? This cannot be undone.`)) remove.mutate({ id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFarmsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setLocation('/farms'); } }); };
  return <><PageTitle eyebrow="Farm notebook" title="Edit your farm" subtitle={`${farm.district || 'Location not set'}${farm.state ? `, ${farm.state}` : ''}`} action={<button onClick={doDelete} disabled={remove.isPending} className={`${quietButton} text-destructive`} data-testid="button-delete-farm"><Trash2 size={16} />{remove.isPending ? 'Removing…' : 'Delete farm'}</button>} />
    {remove.isError && <p className="mb-4 text-sm text-destructive" role="alert">This farm couldn’t be deleted. Try again.</p>}
    <FarmForm editing initial={initial} onSubmit={(values) => update.mutate({ id, data: farmPayload(values) }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetFarmQueryKey(id) }); qc.invalidateQueries({ queryKey: getListFarmsQueryKey() }); setLocation('/farms'); } })} pending={update.isPending} submitError={update.isError} />
  </>;
}
function FarmsPage() {
  const { data: farms, isLoading, isError, refetch } = useListFarms({ query: { queryKey: getListFarmsQueryKey() } });
  return <><PageTitle eyebrow="Farm notebook" title="Your farms" subtitle="The more CropPilot knows about your fields, the more grounded its guidance can be." action={<ButtonLink href="/farms/new" testId="link-add-farm"><Plus size={16} />Add a farm</ButtonLink>} />
    {isLoading ? <LoadingPanel rows={4} /> : isError ? <ErrorPanel onRetry={() => refetch()} /> : !farms?.length ? <EmptyState icon={Tractor} title="Every field has a beginning" copy="Add a farm to save your location, soil and crops. Your field advice will start from here." action={<ButtonLink href="/farms/new" testId="link-create-first-farm"><Plus size={16} />Add your first farm</ButtonLink>} /> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{farms.map((farm, index) => <Surface key={farm.id} className="group overflow-hidden transition-transform duration-200 hover:-translate-y-1" data-testid={`card-farm-${farm.id}`}>
        <div className={`h-2 ${index % 3 === 0 ? 'bg-[#738b62]' : index % 3 === 1 ? 'bg-[#b4915a]' : 'bg-[#668888]'}`} />
        <div className="p-5"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl bg-accent/70 text-primary"><Wheat size={21} /></span><Link href={`/farms/${farm.id}/edit`} className="rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-muted" data-testid={`link-edit-farm-${farm.id}`}>Edit details <ArrowRight size={14} className="ml-1 inline" /></Link></div>
          <h2 className="mt-5 font-display text-2xl font-semibold" data-testid={`text-farm-name-${farm.id}`}>{farm.name}</h2><p className="mt-1 text-sm text-muted-foreground">{[farm.district, farm.state].filter(Boolean).join(', ') || 'Location not added yet'}</p>
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs"><div className="text-muted-foreground">Farm size <strong className="mt-1 block text-sm font-semibold text-foreground">{farm.farmSizeAcres ? `${farm.farmSizeAcres} acres` : 'Not set'}</strong></div><div className="text-muted-foreground">Soil <strong className="mt-1 block text-sm font-semibold text-foreground">{farm.soilType || 'Not set'}</strong></div></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{farm.primaryCrops.length ? farm.primaryCrops.map((crop) => <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground" key={crop}>{crop}</span>) : <span className="text-xs text-muted-foreground">No crops added</span>}</div>
        </div>
      </Surface>)}</div>}
  </>;
}

const diagnosisSchema = z.object({ cropName: z.string().min(1, 'Which crop should we look at?'), farmId: z.string().optional(), symptomsText: z.string().optional(), growthStage: z.string().optional(), noticedWhen: z.string().optional(), notes: z.string().optional(), language: z.enum(['en', 'hi']) });
function DiagnosePage() {
  const { data: farms } = useListFarms({ query: { queryKey: getListFarmsQueryKey() } });
  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const form = useForm<z.infer<typeof diagnosisSchema>>({ resolver: zodResolver(diagnosisSchema), defaultValues: { cropName: '', farmId: '', symptomsText: '', growthStage: '', noticedWhen: '', notes: '', language: currentUser?.preferredLanguage || 'en' } });
  const [imageData, setImageData] = useState(''); const [preview, setPreview] = useState(''); const [imageName, setImageName] = useState('');
  const create = useCreateDiagnosis(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const onPhoto = (file?: File) => {
    if (!file) { setImageData(''); setPreview(''); setImageName(''); return; }
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader(); reader.onload = () => { const data = String(reader.result || ''); setPreview(data); setImageData(data); setImageName(file.name); }; reader.readAsDataURL(file);
  };
  const submit = form.handleSubmit((values) => {
    if (!values.symptomsText?.trim() && !imageData) { form.setError('symptomsText', { message: 'Describe a symptom or add a field photo' }); return; }
    create.mutate({ data: { cropName: values.cropName.trim(), farmId: values.farmId || null, symptomsText: values.symptomsText || null, imageData: imageData || undefined, growthStage: values.growthStage || null, noticedWhen: values.noticedWhen || null, notes: values.notes || null, language: values.language } }, { onSuccess: (result) => { qc.invalidateQueries({ queryKey: getListDiagnosesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getListHistoryQueryKey() }); setLocation(`/diagnose/${result.id}`); } });
  });
  return <><PageTitle eyebrow="Crop health" title="Let’s look closer." subtitle="Describe what you’re seeing. A clear photo and a few details can help make the first assessment more useful." />
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1fr_330px]" noValidate>
      <div className="space-y-5">
        <Surface className="p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e5eddd] text-primary"><Bug size={19} /></span><div><h2 className="font-display text-2xl">What’s happening?</h2><p className="text-sm text-muted-foreground">Start with the crop and the symptoms you’ve noticed.</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="diagnosis-crop">Crop</label><input id="diagnosis-crop" className={inputClass} placeholder="e.g. Tomato" {...form.register('cropName')} data-testid="input-diagnosis-crop" />{form.formState.errors.cropName && <p className="mt-1 text-xs text-destructive">{form.formState.errors.cropName.message}</p>}</div>
            <div><label className={labelClass} htmlFor="diagnosis-farm">Farm <span className="font-normal text-muted-foreground">optional</span></label><select id="diagnosis-farm" className={inputClass} {...form.register('farmId')} data-testid="select-diagnosis-farm"><option value="">Choose a farm</option>{farms?.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="diagnosis-stage">Growth stage</label><select id="diagnosis-stage" className={inputClass} {...form.register('growthStage')} data-testid="select-growth-stage"><option value="">Choose if you know</option><option>Seedling</option><option>Vegetative growth</option><option>Flowering</option><option>Fruiting / grain filling</option><option>Harvest</option></select></div>
            <div><label className={labelClass} htmlFor="diagnosis-timing">When did you first notice it?</label><select id="diagnosis-timing" className={inputClass} {...form.register('noticedWhen')} data-testid="select-noticed-when"><option value="">Choose if you know</option><option>Today</option><option>In the last few days</option><option>About a week ago</option><option>More than a week ago</option></select></div>
          </div>
          <div className="mt-5"><label className={labelClass} htmlFor="diagnosis-symptoms">What are you seeing?</label><textarea id="diagnosis-symptoms" rows={5} className={inputClass} placeholder="Tell us what looks different — leaf colour, spots, wilting, where it appears…" {...form.register('symptomsText')} data-testid="textarea-symptoms" />{form.formState.errors.symptomsText && <p className="mt-1 text-xs text-destructive">{form.formState.errors.symptomsText.message}</p>}</div>
          <div className="mt-5"><label className={labelClass} htmlFor="diagnosis-notes">Anything else to know?</label><textarea id="diagnosis-notes" rows={3} className={inputClass} placeholder="Recent rain, changes in the field, or what you have already tried…" {...form.register('notes')} data-testid="textarea-diagnosis-notes" /></div>
        </Surface>
        <Surface className="p-5 sm:p-7"><div className="mb-4"><h2 className="font-display text-2xl">Add a field photo</h2><p className="mt-1 text-sm text-muted-foreground">A close, clear photo of the affected leaves can help. Your photo is used for this check only.</p></div>
          {preview ? <div className="relative overflow-hidden rounded-xl border border-border"><img src={preview} alt={`Selected crop photo: ${imageName}`} className="max-h-[360px] w-full object-contain bg-muted/50" data-testid="img-diagnosis-preview" /><button type="button" onClick={() => onPhoto()} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-card shadow" aria-label="Remove photo" data-testid="button-remove-photo"><X size={17} /></button><p className="px-3 py-2 text-xs text-muted-foreground">{imageName}</p></div> :
            <label htmlFor="photo-upload" className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-border bg-muted/35 px-6 py-9 text-center transition-colors hover:border-primary/50 hover:bg-accent/25" data-testid="dropzone-photo"><span className="mb-3 grid size-12 place-items-center rounded-xl bg-card text-primary shadow-sm"><ImagePlus size={22} /></span><span className="text-sm font-semibold">Choose a photo from your device</span><span className="mt-1 text-xs text-muted-foreground">JPG or PNG · photo stays on this device until you submit</span><span className={`${quietButton} mt-4`}><Upload size={15} />Browse photos</span><input id="photo-upload" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} data-testid="input-diagnosis-photo" /></label>}
        </Surface>
      </div>
      <div className="space-y-4">
        <Surface className="p-5"><label className={labelClass} htmlFor="diagnosis-language">Reply language</label><select id="diagnosis-language" className={inputClass} {...form.register('language')} data-testid="select-diagnosis-language"><option value="en">English</option><option value="hi">हिंदी</option></select><p className="mt-2 text-xs leading-5 text-muted-foreground">Your results and steps will be prepared in this language.</p></Surface>
        <div className="rounded-2xl border border-[#e2d9c4] bg-[#f1ebdc] p-5"><div className="flex gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">A careful first look</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Crop checks are guidance, not a laboratory diagnosis. If the issue is spreading quickly, ask a local agriculture officer too.</p></div></div></div>
        {create.isError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" role="alert" data-testid="status-diagnosis-error">We couldn’t complete this crop check. Please try again.</p>}
        <button className={`${primaryButton} w-full py-3.5`} disabled={create.isPending} data-testid="button-submit-diagnosis">{create.isPending ? <><LoaderCircle className="animate-spin" size={17} />Looking closely…</> : <><Bug size={17} />Get a crop check</>}</button>
      </div>
    </form>
  </>;
}

function DiagnosisResultPage() {
  const params = useParams<{ id: string }>(); const id = params.id || '';
  const { data, isLoading, isError, refetch } = useGetDiagnosis(id, { query: { queryKey: getGetDiagnosisQueryKey(id), enabled: !!id } });
  if (isLoading) return <LoadingPanel rows={4} />;
  if (isError || !data) return <><PageTitle title="Crop check" /><ErrorPanel onRetry={() => refetch()} message="This crop check isn’t available right now." /></>;
  const result = data.result; const severityColor = result.severity === 'critical' || result.severity === 'high' ? 'bg-[#f3dfd9] text-[#8a4538]' : result.severity === 'medium' ? 'bg-[#f1ebd8] text-[#85652c]' : 'bg-[#e3eddf] text-[#3d6747]';
  const groups = [{ title: 'What to do now', values: result.immediateActions, icon: CheckCircle2 }, { title: 'Organic treatment options', values: result.treatmentOrganic, icon: Leaf }, { title: 'Other treatment options', values: result.treatmentChemical, icon: ShieldCheck }, { title: 'Help prevent a repeat', values: result.preventionTips, icon: Sprout }];
  return <><Link href="/history" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-history"><ArrowLeft size={16} />Back to your history</Link>
    <div className="mb-7 rounded-[1.7rem] bg-[#2e503d] p-6 text-[#f7f4e9] sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#ddca92]">Crop check · {format(new Date(data.createdAt), 'd MMM yyyy')}</p><h1 className="mt-3 font-display text-4xl" data-testid="text-diagnosis-title">{result.diseaseName}</h1>{result.scientificName && <p className="mt-1 text-sm italic text-white/60">{result.scientificName}</p>}<p className="mt-4 text-sm text-white/75">{data.cropName}{data.farmName ? ` · ${data.farmName}` : ''}</p></div><div className="flex gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${severityColor}`}>{result.severity} attention</span><span className="rounded-full border border-white/20 px-3 py-1.5 text-xs">{result.confidenceScore}% confidence</span></div></div></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_310px]">
      <div className="space-y-5">
        <Surface className="p-5 sm:p-7"><h2 className="font-display text-2xl">What we noticed</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{data.symptomsText || 'The check was based on the photo you shared.'}</p>{result.matchedSymptoms.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{result.matchedSymptoms.map((s, i) => <span key={`${s}-${i}`} className="rounded-full bg-muted px-3 py-1.5 text-xs">{s}</span>)}</div>}<div className="mt-5 border-t border-border pt-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Possible contributing factors</p><ul className="mt-3 space-y-2">{result.possibleCauses.map((x, i) => <li className="flex gap-2 text-sm" key={`${x}-${i}`}><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{x}</li>)}</ul></div></Surface>
        {groups.map(({ title, values, icon: Icon }) => values.length > 0 && <Surface className="p-5 sm:p-7" key={title}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-accent/70 text-primary"><Icon size={18} /></span><h2 className="font-display text-2xl">{title}</h2></div><ol className="mt-5 space-y-3">{values.map((x, i) => <li key={`${title}-${i}`} className="flex gap-3 text-sm leading-6"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-primary">{i + 1}</span>{x}</li>)}</ol></Surface>)}
      </div>
      <aside className="space-y-4"><Surface className="p-5"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">When to ask for help</p><p className="mt-3 text-sm leading-6">{result.whenToSeekHelp}</p></Surface><div className="rounded-2xl border border-[#e2d9c4] bg-[#f1ebdc] p-5"><div className="flex gap-3"><CircleHelp size={18} className="shrink-0 text-[#85652c]" /><div><h3 className="text-sm font-semibold">Keep a local expert close</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{result.disclaimer}</p></div></div></div><ButtonLink href="/diagnose" variant="quiet" testId="link-another-diagnosis"><Plus size={16} />Check another crop</ButtonLink></aside>
    </div>
  </>;
}

const adviceSchema = z.object({ farmId: z.string().min(1, 'Choose a farm to shape your plan'), goal: z.enum(['yield', 'cost', 'organic', 'drought']), season: z.string().min(1, 'Tell us which season'), currentCrops: z.string().optional(), specificQuestions: z.string().optional(), language: z.enum(['en', 'hi']) });
function AdvicePage() {
  const { data: farms, isLoading, isError, refetch } = useListFarms({ query: { queryKey: getListFarmsQueryKey() } });
  const { data: user } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const form = useForm<z.infer<typeof adviceSchema>>({ resolver: zodResolver(adviceSchema), defaultValues: { farmId: '', goal: 'yield', season: '', currentCrops: '', specificQuestions: '', language: user?.preferredLanguage || 'en' } });
  const create = useCreateAdvice(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const submit = form.handleSubmit((values) => create.mutate({ data: { ...values, currentCrops: values.currentCrops || null, specificQuestions: values.specificQuestions || null } }, { onSuccess: (plan) => { qc.invalidateQueries({ queryKey: getListAdviceQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getListHistoryQueryKey() }); setLocation(`/advice/${plan.id}`); } }));
  return <><PageTitle eyebrow="Plan ahead" title="A plan for your season." subtitle="Tell us what matters most this season. We’ll start with your farm and build from there." />
    {isLoading ? <LoadingPanel rows={3} /> : isError ? <ErrorPanel onRetry={() => refetch()} message="Your farm list is unavailable right now. Try again from the farms page." /> : !farms?.length ? <EmptyState icon={Tractor} title="Add a farm before planning" copy="A field plan works best when it starts with your soil, location and irrigation." action={<ButtonLink href="/farms/new" testId="link-add-farm-for-advice"><Plus size={16} />Add your farm</ButtonLink>} /> :
      <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1fr_320px]" noValidate>
        <div className="space-y-5"><Surface className="p-5 sm:p-7"><h2 className="font-display text-2xl">What matters this season?</h2><p className="mt-1 text-sm text-muted-foreground">Choose the goal that feels most important right now.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{([{ value: 'yield', title: 'A stronger harvest', note: 'Support healthy growth and yield', icon: Wheat }, { value: 'cost', title: 'Spend more carefully', note: 'Make each input work harder', icon: Activity }, { value: 'organic', title: 'Grow more naturally', note: 'Explore organic practices', icon: Leaf }, { value: 'drought', title: 'Prepare for dry weather', note: 'Make water go further', icon: Droplets }] as const).map(({ value, title, note, icon: Icon }) => <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${form.watch('goal') === value ? 'border-primary bg-accent/35 ring-1 ring-primary/25' : 'border-border hover:bg-muted/60'}`}><input type="radio" value={value} className="sr-only" {...form.register('goal')} data-testid={`radio-goal-${value}`} /><span className="mt-0.5 text-primary"><Icon size={19} /></span><span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs text-muted-foreground">{note}</span></span>{form.watch('goal') === value && <Check size={16} className="ml-auto text-primary" />}</label>)}</div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><label className={labelClass} htmlFor="advice-farm">Which farm?</label><select id="advice-farm" className={inputClass} {...form.register('farmId')} data-testid="select-advice-farm"><option value="">Choose a farm</option>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select>{form.formState.errors.farmId && <p className="mt-1 text-xs text-destructive">{form.formState.errors.farmId.message}</p>}</div><div><label className={labelClass} htmlFor="advice-season">Season</label><input id="advice-season" className={inputClass} placeholder="e.g. Kharif 2025" {...form.register('season')} data-testid="input-advice-season" />{form.formState.errors.season && <p className="mt-1 text-xs text-destructive">{form.formState.errors.season.message}</p>}</div></div>
        </Surface>
        <Surface className="p-5 sm:p-7"><h2 className="font-display text-2xl">A little more context</h2><p className="mt-1 text-sm text-muted-foreground">Add what you’re growing or what you’d like to ask.</p><div className="mt-5 space-y-5"><div><label className={labelClass} htmlFor="advice-crops">Current crops</label><input id="advice-crops" className={inputClass} placeholder="e.g. Soybean, tur dal" {...form.register('currentCrops')} data-testid="input-current-crops" /></div><div><label className={labelClass} htmlFor="advice-question">Specific questions</label><textarea id="advice-question" rows={4} className={inputClass} placeholder="What would make this plan especially useful for you?" {...form.register('specificQuestions')} data-testid="textarea-advice-question" /></div></div></Surface></div>
        <aside className="space-y-4"><Surface className="p-5"><label className={labelClass} htmlFor="advice-language">Plan language</label><select id="advice-language" className={inputClass} {...form.register('language')} data-testid="select-advice-language"><option value="en">English</option><option value="hi">हिंदी</option></select></Surface><div className="rounded-2xl border border-[#d9dfcf] bg-[#e9eee2] p-5"><span className="grid size-9 place-items-center rounded-xl bg-card text-primary"><Flower2 size={19} /></span><h3 className="mt-4 font-display text-xl">Grounded in your farm</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Your saved crops, soil and water method help shape each suggestion.</p></div>
          {create.isError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" role="alert" data-testid="status-advice-error">We couldn’t prepare the plan. Please try again.</p>}
          <button className={`${primaryButton} w-full py-3.5`} disabled={create.isPending} data-testid="button-create-advice">{create.isPending ? <><LoaderCircle className="animate-spin" size={17} />Thinking through your season…</> : <><BookOpen size={17} />Prepare my field plan</>}</button>
        </aside>
      </form>}
  </>;
}

function AdviceResultPage() {
  const params = useParams<{ id: string }>(); const id = params.id || '';
  const { data, isLoading, isError, refetch } = useGetAdvice(id, { query: { queryKey: getGetAdviceQueryKey(id), enabled: !!id } });
  if (isLoading) return <LoadingPanel rows={4} />;
  if (isError || !data) return <><PageTitle title="Your field plan" /><ErrorPanel onRetry={() => refetch()} message="This field plan isn’t available right now." /></>;
  const plan = data.result;
  const groups = [{ title: 'Crop recommendations', content: plan.cropRecommendations, icon: Wheat }, { title: 'Fertilizer & nutrients', content: plan.fertilizerPlan, icon: Flower2 }, { title: 'Watering plan', content: plan.irrigationPlan, icon: Droplets }, { title: 'Soil actions', content: plan.soilActions, icon: Sprout }, { title: 'Risks to keep in mind', content: plan.riskNotes, icon: TriangleAlert }];
  return <><Link href="/history" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-history-advice"><ArrowLeft size={16} />Back to your history</Link>
    <div className="mb-7 rounded-[1.7rem] bg-[#2e503d] p-6 text-[#f7f4e9] sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#ddca92]">Field plan · {format(new Date(data.createdAt), 'd MMM yyyy')}</p><h1 className="mt-3 font-display text-4xl" data-testid="text-advice-title">{data.season}</h1><p className="mt-2 text-sm text-white/75">{data.farmName || 'Your farm'} · Goal: {data.goal === 'yield' ? 'a stronger harvest' : data.goal === 'cost' ? 'spend carefully' : data.goal === 'organic' ? 'grow more naturally' : 'prepare for dry weather'}</p></div>
    <div className="grid gap-4 md:grid-cols-2">{groups.map(({ title, content, icon: Icon }) => <Surface key={title} className="p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-accent/70 text-primary"><Icon size={18} /></span><h2 className="font-display text-xl">{title}</h2></div>{content.length ? <ul className="mt-4 space-y-3">{content.map((item, i) => <li key={`${title}-${i}`} className="flex gap-3 text-sm leading-6"><CheckCircle2 size={16} className="mt-1 shrink-0 text-primary" />{item}</li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No specific recommendations for this section.</p>}</Surface>)}</div>
    <div className="mt-5 rounded-2xl border border-[#e2d9c4] bg-[#f1ebdc] p-5 text-sm leading-6 text-muted-foreground"><strong className="mb-1 block text-foreground">A note on this guidance</strong>{plan.disclaimer}</div><div className="mt-5 flex flex-wrap gap-3"><ButtonLink href="/advice" testId="link-create-another-plan"><Plus size={16} />Create another plan</ButtonLink><ButtonLink href="/chat" variant="quiet" testId="link-ask-about-plan"><MessageCircle size={16} />Ask a follow-up</ButtonLink></div>
  </>;
}

function ChatListPage() {
  const { data: sessions, isLoading, isError, refetch } = useListChatSessions({ query: { queryKey: getListChatSessionsQueryKey() } });
  const { data: user } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const create = useCreateChatSession(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const start = (language: 'en' | 'hi') => create.mutate({ data: { language } }, { onSuccess: (session) => { qc.invalidateQueries({ queryKey: getListChatSessionsQueryKey() }); setLocation(`/chat/${session.id}`); } });
  return <><PageTitle eyebrow="Ask CropPilot" title="Let’s talk it through." subtitle="A place to ask about your crops, your farm or the next decision ahead." action={<button className={primaryButton} disabled={create.isPending} onClick={() => start(user?.preferredLanguage || 'en')} data-testid="button-new-chat"><Plus size={16} />{create.isPending ? 'Opening…' : 'New conversation'}</button>} />
    <Surface className="mb-7 flex flex-col justify-between gap-5 overflow-hidden bg-[#e8eee2] p-5 sm:flex-row sm:items-center sm:p-7"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-card text-primary"><MessageSquareText size={22} /></span><div><h2 className="font-display text-2xl">Ask in your own words.</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Chat in English or Hindi, and choose whether CropPilot should use your saved farm details for context.</p></div></div><button onClick={() => start(user?.preferredLanguage === 'hi' ? 'en' : 'hi')} className={quietButton} disabled={create.isPending} data-testid="button-new-chat-hindi"><Globe2 size={16} />Start in {user?.preferredLanguage === 'hi' ? 'English' : 'हिंदी'}</button></Surface>
    <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">Your conversations</h2><span className="text-xs text-muted-foreground">{sessions?.length || 0} saved</span></div>
    {isLoading ? <LoadingPanel rows={4} /> : isError ? <ErrorPanel onRetry={() => refetch()} /> : !sessions?.length ? <EmptyState icon={MessageCircle} title="Your first conversation is waiting" copy="Ask a question about your field, a crop symptom or something in your season plan." action={<button className={primaryButton} disabled={create.isPending} onClick={() => start(user?.preferredLanguage || 'en')} data-testid="button-start-first-chat"><MessageCircle size={16} />Start a conversation</button>} /> :
      <div className="space-y-3">{sessions.map((session) => <Link key={session.id} href={`/chat/${session.id}`} className="flex items-center gap-4 rounded-2xl border border-card-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5" data-testid={`chat-session-${session.id}`}><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/70 text-primary"><MessageCircle size={20} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{session.title || 'Field conversation'}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">{session.lastMessage || 'Start the conversation when you’re ready'}</span></span><span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block"><span className="block">{formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}</span><span className="mt-1 block uppercase">{session.language === 'hi' ? 'हिंदी' : 'English'}</span></span><ChevronRight size={17} className="text-muted-foreground" /></Link>)}</div>}
    {create.isError && <p className="mt-4 text-sm text-destructive" role="alert" data-testid="status-chat-create-error">We couldn’t open a conversation. Please try again.</p>}
  </>;
}

function ChatDetailPage() {
  const params = useParams<{ id: string }>(); const id = params.id || '';
  const { data: sessions } = useListChatSessions({ query: { queryKey: getListChatSessionsQueryKey() } });
  const { data: messages, isLoading, isError, refetch } = useListChatMessages(id, { query: { queryKey: getListChatMessagesQueryKey(id), enabled: !!id } });
  const [text, setText] = useState(''); const [useFarmContext, setUseFarmContext] = useState(true);
  const send = useSendChatMessage(); const qc = useQueryClient();
  const session = sessions?.find((s) => s.id === id);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!text.trim() || send.isPending) return; const content = text.trim(); send.mutate({ id, data: { content, useFarmContext } }, { onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: getListChatMessagesQueryKey(id) }); qc.invalidateQueries({ queryKey: getListChatSessionsQueryKey() }); } }); };
  return <><Link href="/chat" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-chats"><ArrowLeft size={16} />All conversations</Link>
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border p-4 sm:p-5"><span className="grid size-10 place-items-center rounded-xl bg-accent/70 text-primary"><MessageCircle size={19} /></span><div className="min-w-0 flex-1"><h1 className="truncate font-display text-xl sm:text-2xl" data-testid="text-chat-title">{session?.title || 'Field conversation'}</h1><p className="text-xs text-muted-foreground">{session?.language === 'hi' ? 'हिंदी में बातचीत' : 'English conversation'} · CropPilot agricultural companion</p></div><span className="hidden items-center gap-1.5 rounded-full bg-[#e4eddd] px-3 py-1.5 text-[11px] font-semibold text-[#3d6747] sm:flex"><span className="size-1.5 rounded-full bg-[#56805a]" />Ready to help</span></div>
      <div className="min-h-[380px] space-y-4 bg-background/55 p-4 sm:min-h-[460px] sm:p-6">
        {isLoading ? <LoadingPanel rows={3} /> : isError ? <ErrorPanel onRetry={() => refetch()} message="Messages for this conversation could not be loaded." /> : !messages?.length ? <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center"><span className="grid size-14 place-items-center rounded-full bg-accent text-primary"><Sprout size={25} /></span><h2 className="mt-4 font-display text-2xl">Where should we begin?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Tell CropPilot what’s on your mind. Your farm context is optional and can be switched off below.</p><div className="mt-5 flex flex-wrap justify-center gap-2">{['Leaves are turning yellow', 'Help me plan this season', 'How can I save water?'].map((s) => <button key={s} onClick={() => setText(s)} className="rounded-full border border-border bg-card px-3 py-2 text-xs hover:bg-accent/40" data-testid={`suggestion-${s.toLowerCase().replaceAll(' ', '-')}`}>{s}</button>)}</div></div> :
          messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} data-testid={`message-${message.id}`}><div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card'}`}><p className="whitespace-pre-wrap">{message.content}</p><time className={`mt-2 block text-[10px] ${message.role === 'user' ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{format(new Date(message.createdAt), 'h:mm a')}</time></div></div>)}
        {send.isPending && <div className="flex"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground"><span className="flex gap-1"><i className="size-1.5 animate-pulse rounded-full bg-primary" /><i className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" /><i className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" /></span>Thinking through your question…</div></div>}
        {send.isError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" role="alert" data-testid="status-chat-send-error">Your message wasn’t sent. Please try again.</p>}
      </div>
      <form onSubmit={submit} className="border-t border-border bg-card p-3 sm:p-4"><div className="mb-3 flex items-center justify-between"><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={useFarmContext} onChange={(e) => setUseFarmContext(e.target.checked)} className="size-4 accent-[#355d43]" data-testid="checkbox-farm-context" />Use my farm details for context</label><span className="text-[10px] text-muted-foreground">CropPilot can make mistakes</span></div><div className="flex items-end gap-2"><textarea aria-label="Your message" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder="Ask about your field…" className={`${inputClass} min-h-[52px] resize-none`} data-testid="textarea-chat-message" /><button type="submit" disabled={!text.trim() || send.isPending} className={`${primaryButton} size-[50px] shrink-0 px-0`} aria-label="Send message" data-testid="button-send-message">{send.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}</button></div></form>
    </div>
  </>;
}

function HistoryPage() {
  const [filter, setFilter] = useState<'all' | 'diagnosis' | 'advice' | 'chat'>('all');
  const params = filter === 'all' ? undefined : { kind: filter };
  const { data, isLoading, isError, refetch } = useListHistory(params, { query: { queryKey: getListHistoryQueryKey(params) } });
  return <><PageTitle eyebrow="Your field notebook" title="A history worth keeping." subtitle="Every crop check, field plan and conversation, all together." />
    <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filter history">{([{ value: 'all', label: 'All notes' }, { value: 'diagnosis', label: 'Crop checks' }, { value: 'advice', label: 'Field plans' }, { value: 'chat', label: 'Conversations' }] as const).map(({ value, label }) => <button key={value} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${filter === value ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-secondary'}`} onClick={() => setFilter(value)} data-testid={`filter-history-${value}`}>{label}</button>)}</div>
    {isLoading ? <LoadingPanel rows={5} /> : isError ? <ErrorPanel onRetry={() => refetch()} /> : !data?.length ? <EmptyState icon={FileClock} title="Your notebook is ready" copy="Your crop checks, plans and conversations will appear here. It’s a useful place to see how the season unfolds." action={<ButtonLink href={filter === 'advice' ? '/advice' : filter === 'chat' ? '/chat' : '/diagnose'} testId="link-add-history-item">Start a note <ArrowRight size={16} /></ButtonLink>} /> :
      <Surface className="divide-y divide-border/70 overflow-hidden">{data.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.path} className="flex items-start gap-4 p-4 transition-colors hover:bg-muted/35 sm:p-5" data-testid={`history-item-${item.id}`}><span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${item.kind === 'diagnosis' ? 'bg-[#f1e8d9] text-[#8d6430]' : item.kind === 'advice' ? 'bg-[#e4eddd] text-[#3d6747]' : 'bg-[#e1eceb] text-[#356766]'}`}>{item.kind === 'diagnosis' ? <Bug size={18} /> : item.kind === 'advice' ? <BookOpen size={18} /> : <MessageCircle size={18} />}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-sm leading-5 text-muted-foreground">{item.summary}</span><span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-primary">{item.kind === 'diagnosis' ? 'Crop check' : item.kind === 'advice' ? 'Field plan' : 'Conversation'}</span></span><time className="shrink-0 pt-1 text-[11px] text-muted-foreground" dateTime={item.createdAt}>{format(new Date(item.createdAt), 'd MMM yyyy')}</time><ChevronRight size={16} className="mt-1 text-muted-foreground" /></Link>)}</Surface>}
  </>;
}

const profileSchema = z.object({ fullName: z.string().min(2, 'Use at least 2 characters'), phone: z.string().optional(), regionState: z.string().optional(), preferredLanguage: z.enum(['en', 'hi']) });
function ProfilePage() {
  const { data: user, isLoading, isError, refetch } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const update = useUpdateProfile(); const qc = useQueryClient();
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { fullName: '', phone: '', regionState: '', preferredLanguage: 'en' } });
  useEffect(() => { if (user) form.reset({ fullName: user.fullName, phone: user.phone || '', regionState: user.regionState || '', preferredLanguage: user.preferredLanguage }); }, [user, form]);
  if (isLoading) return <LoadingPanel rows={3} />;
  if (isError || !user) return <><PageTitle title="Your profile" /><ErrorPanel onRetry={() => refetch()} /></>;
  const submit = form.handleSubmit(({ phone, regionState, ...values }) => update.mutate({ data: { ...values, phone: phone || null, regionState: regionState || null } }, { onSuccess: (updatedUser) => qc.setQueryData(getGetCurrentUserQueryKey(), updatedUser) }));
  return <><PageTitle eyebrow="Your account" title="Your details, your way." subtitle="Keep your contact and language preferences up to date." />
    <form onSubmit={submit} className="max-w-3xl space-y-5" noValidate>
      <Surface className="p-5 sm:p-7"><div className="mb-6 flex items-center gap-4"><span className="grid size-14 place-items-center rounded-full bg-accent font-display text-xl font-semibold text-primary">{user.fullName.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span><div><h2 className="font-display text-2xl">{user.fullName}</h2><p className="text-sm text-muted-foreground">{user.email}</p></div></div>
        <div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><label className={labelClass} htmlFor="profile-name">Full name</label><input id="profile-name" className={inputClass} {...form.register('fullName')} data-testid="input-profile-name" />{form.formState.errors.fullName && <p className="mt-1 text-xs text-destructive">{form.formState.errors.fullName.message}</p>}</div>
        <div><label className={labelClass} htmlFor="profile-email">Email address</label><input id="profile-email" className={`${inputClass} bg-muted/60 text-muted-foreground`} value={user.email} readOnly data-testid="input-profile-email" /><p className="mt-1 text-xs text-muted-foreground">Email is used to sign in.</p></div>
        <div><label className={labelClass} htmlFor="profile-phone">Phone number</label><input id="profile-phone" type="tel" className={inputClass} {...form.register('phone')} data-testid="input-profile-phone" /></div>
        <div><label className={labelClass} htmlFor="profile-region">State or region</label><input id="profile-region" className={inputClass} placeholder="e.g. Karnataka" {...form.register('regionState')} data-testid="input-profile-region" /></div>
        <div><label className={labelClass} htmlFor="profile-language">Preferred language</label><select id="profile-language" className={inputClass} {...form.register('preferredLanguage')} data-testid="select-profile-language"><option value="en">English</option><option value="hi">हिंदी</option></select><p className="mt-1 text-xs text-muted-foreground">New advice and chats will use this language.</p></div></div>
      </Surface>
      {update.isError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-destructive" role="alert" data-testid="status-profile-error">Your details could not be saved. Please try again.</p>}
      {update.isSuccess && <p className="flex items-center gap-2 rounded-xl bg-[#e3eddf] px-4 py-3 text-sm text-[#3d6747]" role="status" data-testid="status-profile-saved"><CheckCircle2 size={17} />Your profile is up to date.</p>}
      <button className={primaryButton} disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? <><LoaderCircle size={16} className="animate-spin" />Saving…</> : <><Save size={16} />Save changes</>}</button>
    </form>
  </>;
}

function NotFoundPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-background p-5"><div className="max-w-md text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-primary"><Search size={26} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-primary">404 · field path not found</p><h1 className="mt-2 font-display text-4xl">Let’s find our way back.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">That page may have moved. Your field desk is just a step away.</p><div className="mt-6 flex justify-center gap-3"><ButtonLink href="/" variant="quiet" testId="link-not-found-home">Home</ButtonLink><ButtonLink href="/dashboard" testId="link-not-found-dashboard">Field desk <ArrowRight size={15} /></ButtonLink></div></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/login" component={LoginPage} />
    <Route path="/register" component={RegisterPage} />
    <Route path="/dashboard"><Protected><DashboardPage /></Protected></Route>
    <Route path="/farms"><Protected><FarmsPage /></Protected></Route>
    <Route path="/farms/new"><Protected><NewFarmPage /></Protected></Route>
    <Route path="/farms/:id/edit"><Protected><EditFarmPage /></Protected></Route>
    <Route path="/diagnose"><Protected><DiagnosePage /></Protected></Route>
    <Route path="/diagnose/:id"><Protected><DiagnosisResultPage /></Protected></Route>
    <Route path="/advice"><Protected><AdvicePage /></Protected></Route>
    <Route path="/advice/:id"><Protected><AdviceResultPage /></Protected></Route>
    <Route path="/chat"><Protected><ChatListPage /></Protected></Route>
    <Route path="/chat/:id"><Protected><ChatDetailPage /></Protected></Route>
    <Route path="/history"><Protected><HistoryPage /></Protected></Route>
    <Route path="/profile"><Protected><ProfilePage /></Protected></Route>
    <Route component={NotFoundPage} />
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;