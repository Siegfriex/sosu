// FileUploader · UploadedFileItem · StagedProgress · LoadingState · ErrorState · ReportSection · ReportBrandTable
// EmailDeliveryForm · DeliverySuccess · ExampleThumbnail · Lightbox
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import folderSvg from '../assets/folder.svg?raw';
import catLoading from '../assets/cat-loading.png';
import catDelivery from '../assets/cat-delivery.png';
import { STAGES, type StageIndex } from '../data/report';
import { fileStore, type FileMeta } from '../state/workflows';
import { Button, EmailField, InlineMessage } from './controls';
import { isValidEmail } from '../api/validation';

/* ---------- FileUploader (27:513) + UploadedFileItem (27:441) ---------- */
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function UploadedFileItem({ file, onRemove }: { file: FileMeta; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const f = fileStore.get(file.id); if (!f || !f.type.startsWith('image/')) return;
    const u = URL.createObjectURL(f); setUrl(u); return () => URL.revokeObjectURL(u);
  }, [file.id]);
  return (
    <div className={`file-item${file.valid ? '' : ' file-item--invalid'}`}>
      {url ? <img className="file-item__thumb" src={url} alt="" /> : <span className="file-item__thumb" />}
      <div className="file-item__info">
        <span className="file-item__name t-body-2">{file.name}</span>
        <span className="file-item__meta t-micro">{file.valid ? fmtSize(file.size) : '지원하지 않는 형식이에요'}</span>
      </div>
      <button type="button" className="file-item__remove" aria-label={`${file.name} 삭제`} onClick={onRemove}>✕</button>
    </div>
  );
}

export function FileUploader({ files, onChange, accept = 'image/jpeg,image/png,application/pdf', max }: { files: FileMeta[]; onChange: (f: FileMeta[]) => void; accept?: string; max?: number }) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) { if (max && next.length >= max) break; next.push(fileStore.put(f)); }
    onChange(next);
  };
  const remove = (id: string) => { fileStore.remove(id); onChange(files.filter((f) => f.id !== id)); };
  const state = drag ? 'drag-over' : files.some((f) => !f.valid) ? 'invalid-file' : files.length ? 'file-selected' : 'empty';
  return (
    <div className="uploader">
      <div className="dropzone" data-state={state} role="button" tabIndex={0} aria-label="이미지 및 파일 업로드"
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
        <span className="dropzone__icon" aria-hidden dangerouslySetInnerHTML={{ __html: folderSvg }} />
        <p className="t-body">{drag ? '여기에 놓으면 업로드돼요' : '이미지 및 파일을 업로드하세요.'}</p>
        <p className="dropzone__hint t-helper">{'파일을 드래그하거나 클릭하여 파일을 선택하세요.\n지원 파일 형식: jpg, png, pdf'}</p>
        <input ref={input} className="sr-only" type="file" tabIndex={-1} aria-label="파일 선택" accept={accept} multiple={!max || max > 1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && <div className="file-list">{files.map((f) => <UploadedFileItem key={f.id} file={f} onRemove={() => remove(f.id)} />)}</div>}
      {state === 'invalid-file' && <InlineMessage tone="error">지원하지 않는 형식의 파일이 있어요. jpg, png{accept.includes('pdf') ? ', pdf' : ''}만 업로드할 수 있어요.</InlineMessage>}
    </div>
  );
}

/* ---------- StagedProgress (28:471) + LoadingState (28:516) ---------- */
export function StagedProgress({ stage }: { stage: StageIndex | 'indeterminate' }) {
  return (
    <div className="staged" role="progressbar" aria-busy aria-label={stage === 'indeterminate' ? '진단 준비 중' : STAGES[stage]}>
      <div className="staged__bar">
        {stage === 'indeterminate'
          ? <div className="staged__track"><div className="staged__runner" /></div>
          : [1, 2, 3, 4].map((i) => <span key={i} className={`staged__seg${i <= stage ? ' staged__seg--on' : ''}`} />)}
      </div>
      <p className="t-body" role="status" aria-live="polite">{stage === 'indeterminate' ? '진단을 준비하고 있어요' : STAGES[stage]}</p>
    </div>
  );
}

// The 4 stages are a deterministic visual sequence, not a backend progress protocol (advance every STAGE_MS, hold at 4).
const STAGE_MS = 700;
function useStageSequence(): StageIndex {
  const [stage, setStage] = useState<StageIndex>(1);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => (s < 4 ? ((s + 1) as StageIndex) : s)), STAGE_MS);
    return () => clearInterval(t);
  }, []);
  return stage;
}

// Gallop cycle built from one drawing: anticipation → launch (stretch) → apex → fall → landing (squash) → recoil,
// with trailing speed lines, dust puffs on contact and a contact shadow. Static under prefers-reduced-motion.
function RunningCat() {
  return (
    <div className="runner" aria-hidden>
      <svg className="runner__fx" viewBox="0 0 260 180" fill="none" stroke="currentColor" strokeLinecap="round">
        <path className="runner__line runner__line--1" d="M214 84 H252" strokeWidth="3" />
        <path className="runner__line runner__line--2" d="M222 98 H256" strokeWidth="2.5" />
        <path className="runner__line runner__line--3" d="M210 112 H244" strokeWidth="2" />
        <circle className="runner__dust runner__dust--1" cx="206" cy="128" r="5" fill="currentColor" stroke="none" />
        <circle className="runner__dust runner__dust--2" cx="220" cy="124" r="3.5" fill="currentColor" stroke="none" />
        <circle className="runner__dust runner__dust--3" cx="196" cy="133" r="2.5" fill="currentColor" stroke="none" />
      </svg>
      <span className="runner__shadow" />
      <img className="runner__cat" src={catLoading} alt="" />
    </div>
  );
}

export function LoadingState({ workflow }: { workflow: 'survey' | 'prescription' }) {
  const stage = useStageSequence();
  return (
    <div className="state">
      <RunningCat />
      <StagedProgress stage={stage} />
      <p className="state__msg t-body">{workflow === 'survey' ? '소수냥이가 열심히 진단중입니다.\n조금만 기다려주세요!' : '소수냥이가 열심히 처방중입니다.\n조금만 기다려주세요!'}</p>
      <p className="state__meta t-micro">평균 소요시간 : 약 1분</p>
    </div>
  );
}

/* ---------- ErrorState (28:557) ---------- */
// Kneading cat built from one drawing: body + each front paw as clip-path layers of the same image.
// Paws poke down alternately (anticipation → fast press → hold → eased return); body leans into each press.
// Fill colour == dark page background, so the seam under a moving paw never shows. Static under prefers-reduced-motion.
export function PokingCat({ className = '' }: { className?: string }) {
  return (
    <div className={`poker ${className}`.trim()} aria-hidden>
      <img className="poker__body" src={catDelivery} alt="" />
      <img className="poker__paw poker__paw--l" src={catDelivery} alt="" />
      <img className="poker__paw poker__paw--r" src={catDelivery} alt="" />
      <svg className="poker__fx" viewBox="0 0 720 720" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="6">
        <g className="poker__tap poker__tap--l"><path d="M228 668 l-14 14" /><path d="M262 676 v18" /><path d="M300 668 l14 12" /></g>
        <g className="poker__tap poker__tap--r"><path d="M470 700 l-14 12" /><path d="M512 706 v14" /><path d="M556 698 l14 12" /></g>
      </svg>
    </div>
  );
}

export function ErrorState({ workflow, kind, onRetry, onReset }: { workflow: 'survey' | 'prescription'; kind: 'timeout' | 'error'; onRetry: () => void; onReset: () => void }) {
  const noun = workflow === 'survey' ? '진단' : '처방';
  return (
    <div className="state state--error" role="alert">
      <PokingCat className="state__art state__art--sm" />
      <h2 className="t-section">{kind === 'timeout' ? `${noun}이 예상보다 오래 걸리고 있어요` : `${noun}을 완료하지 못했어요`}</h2>
      <p className="state__msg state__meta t-body">{'입력하신 내용은 그대로 남아 있어요.\n다시 시도해 주세요.'}</p>
      <div className="state__actions">
        <Button size="md" onClick={onRetry}>다시 시도</Button>
        <Button variant="secondary" size="md" onClick={onReset}>첫 화면으로 돌아가기</Button>
      </div>
    </div>
  );
}

/* ---------- Report (30:474 / 30:488 / 30:489) ---------- */
export function ReportSection({ title, emphasis = 'default', fieldKey, children }: { title: string; emphasis?: 'default' | 'accent'; fieldKey?: string; children: ReactNode }) {
  return (
    <section className={`report-card${emphasis === 'accent' ? ' report-card--accent' : ''}`} data-field={fieldKey}>
      <div className="report-card__header"><h3 className="report-card__title t-strong">{title}</h3><div className="report-card__rule" /></div>
      <div className="report-card__body t-body-2">{children}</div>
    </section>
  );
}

export function ReportBrandTable({ brand }: { brand: { name: string; material: string; product: string; keywords: string } }) {
  const Cell = ({ k, v }: { k: string; v: string }) => <div className="brand-table__cell"><span className="brand-table__k t-strong">{k}</span><span className="brand-table__v t-body-2">{v}</span></div>;
  return (
    <section className="report-card brand-table" aria-label="브랜드 요약">
      <div className="brand-table__row"><Cell k="브랜드 이름" v={brand.name} /></div>
      <div className="brand-table__row"><Cell k="주 소재" v={brand.material} /><Cell k="대표 제품" v={brand.product} /></div>
      <div className="brand-table__row"><Cell k="핵심 키워드" v={brand.keywords} /></div>
    </section>
  );
}

/* ---------- EmailDeliveryForm (31:551) + DeliverySuccess (31:474) ---------- */
export type DeliveryFormState = 'empty' | 'invalid-email' | 'submitting' | 'send-error';
export function EmailDeliveryForm({ docName, email, onEmail, state, onSubmit, onReset }:
  { docName: '진단서' | '처방전'; email: string; onEmail: (v: string) => void; state: DeliveryFormState; onSubmit: () => void; onReset: () => void }) {
  const valid = isValidEmail(email);
  const submitting = state === 'submitting';
  return (
    <form className="delivery" noValidate onSubmit={(e) => { e.preventDefault(); if (!submitting) onSubmit(); }}>
      <PokingCat className="delivery__art" />
      <p className="delivery__msg t-body">{`${docName}를 제공해 드리기 위해\n이메일 주소를 입력해 주세요.`}</p>
      <div className="delivery__form">
        <EmailField value={email} onChange={onEmail} disabled={submitting} ariaLabel="이메일 주소"
          error={state === 'invalid-email' ? '이메일 형식을 확인해 주세요' : null} />
        {state === 'send-error' && <InlineMessage tone="error">메일 전송에 실패했어요. 다시 시도해 주세요.</InlineMessage>}
        <div className="delivery__actions">
          <Button type="submit" size="md" state={submitting ? 'loading' : valid ? 'idle' : 'disabled'}>{state === 'send-error' ? '다시 보내기' : `메일로 ${docName} 받기`}</Button>
          <Button variant="secondary" size="md" state={submitting ? 'disabled' : 'idle'} onClick={onReset}>첫 화면으로 돌아가기</Button>
        </div>
      </div>
    </form>
  );
}

export function DeliverySuccess({ docName, email, onReset }: { docName: '진단서' | '처방전'; email: string; onReset: () => void }) {
  return (
    <div className="delivery">
      <PokingCat className="delivery__art" />
      <h2 className="t-section">{docName}를 보냈어요</h2>
      <p className="delivery__msg state__meta t-body">{`${email} 으로 PDF를 보내드렸어요.\n메일함을 확인해 주세요.`}</p>
      <InlineMessage tone="success">전송 완료</InlineMessage>
      <div className="delivery__form"><Button variant="secondary" size="md" onClick={onReset}>첫 화면으로 돌아가기</Button></div>
    </div>
  );
}

/* ---------- ExampleThumbnail (26:439) + Lightbox (31:552) ---------- */
export function ExampleThumbnail({ src, index, onOpen }: { src: string; index: number; onOpen: () => void }) {
  return <button type="button" className="thumb" aria-label={`예시 ${index} 크게 보기`} onClick={onOpen}><img src={src} alt="" /></button>;
}

export function Lightbox({ src, caption, onClose, returnFocusTo }: { src: string; caption: string; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const captionId = useId();
  useEffect(() => {
    document.body.setAttribute('data-scroll-locked', '');
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { // focus trap: the close button is the only focusable element
        e.preventDefault(); closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.removeAttribute('data-scroll-locked'); returnFocusTo?.focus(); };
  }, [onClose, returnFocusTo]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="예시 이미지" aria-describedby={`${captionId}`} data-layer="modal">
      <div className="lightbox__backdrop" onClick={onClose} />
      <button ref={closeRef} type="button" className="lightbox__close t-body" aria-label="닫기" onClick={onClose}>✕</button>
      <div className="lightbox__panel">
        <img className="lightbox__img" src={src} alt={caption} />
        <p id={captionId} className="lightbox__caption t-helper">{caption}</p>
      </div>
    </div>
  );
}
