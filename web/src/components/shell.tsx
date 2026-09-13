// AppHeader · TopTabs · SurveyProgress · Logo · Screen · ContentCard  (Figma 01_Components 25:635 / 15:242 / 13:236 / 13:192)
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import logoUrl from '../assets/logo.svg?raw';
import { prescriptionRoute, surveyRoute, useWorkflows } from '../state/workflows';

export type Theme = 'light' | 'dark';
export type Workflow = 'survey' | 'prescription';
export type HeaderStatus = 'form' | 'generating' | 'result' | 'delivery';

export function Logo() {
  return <span className="logo" role="img" aria-label="SOSU" dangerouslySetInnerHTML={{ __html: logoUrl }} />;
}

export function SurveyProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="progress" role="img" aria-label={`4단계 중 ${step}단계`}>
      {[1, 2, 3, 4].map((i) => <span key={i} className={`progress__dot${i === step ? ' progress__dot--active' : ''}`} />)}
    </div>
  );
}

export function TopTabs({ active, state }: { active: Workflow; state: 'enabled' | 'locked' }) {
  const navigate = useNavigate();
  const { survey, prescription } = useWorkflows();
  const go = (wf: Workflow) => {
    if (state === 'locked' || wf === active) return;
    navigate(wf === 'survey' ? surveyRoute[survey.status] : prescriptionRoute[prescription.status]);
  };
  const tabs: { key: Workflow; label: string }[] = [{ key: 'survey', label: '문진표' }, { key: 'prescription', label: '처방전' }];
  return (
    <div className="tabs" role="tablist" aria-label="워크플로우" data-state={state}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" className="tab t-tab" aria-selected={t.key === active} aria-disabled={state === 'locked'} tabIndex={t.key === active ? 0 : -1}
          onClick={() => go(t.key)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') go(t.key === 'survey' ? 'prescription' : 'survey'); }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function AppHeader({ theme, workflow, status, step }: { theme: Theme; workflow: Workflow; status: HeaderStatus; step?: 1 | 2 | 3 | 4 }) {
  const showProgress = workflow === 'survey' && status === 'form' && step;
  return (
    <header className="header" data-theme={theme}>
      <div className="header__row">
        <Logo />
        {showProgress ? <SurveyProgress step={step} /> : <span />}
      </div>
      <TopTabs active={workflow} state={status === 'generating' ? 'locked' : 'enabled'} />
    </header>
  );
}

const WORKFLOW_TITLE: Record<Workflow, string> = { survey: 'SOSU | 문진표', prescription: 'SOSU | 처방전' };

export function Screen({ theme, workflow, status, step, tight, children }: { theme: Theme; workflow: Workflow; status: HeaderStatus; step?: 1 | 2 | 3 | 4; tight?: boolean; children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => { document.title = WORKFLOW_TITLE[workflow]; }, [workflow]);
  return (
    <div className="app" data-theme={theme} data-path={pathname}>
      <div className="screen">
        <AppHeader theme={theme} workflow={workflow} status={status} step={step} />
        <main className={`screen__content${tight ? ' screen__content--tight' : ''}`}>{children}</main>
      </div>
    </div>
  );
}

export function ContentCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h1 className="card__title t-display">{title}</h1>
      {children}
    </section>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="section-header">
      <h2 className="t-section">{title}</h2>
      <Divider />
    </div>
  );
}

export const Divider = () => <hr className="divider" style={{ border: 0, margin: 0 }} />;
