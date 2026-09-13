// Button · TextField · TextArea · EmailField · URLField · ChoiceChip · ChoiceGroup · QuestionBlock · InlineMessage
import { useId, type ReactNode } from 'react';
import type { Question, AnswerValue, ChoiceOption } from '../data/questions';

/* ---------- Buttons (17:350 / 17:369) ---------- */
export function Button({ variant = 'primary', size = 'lg', state = 'idle', children, onClick, type = 'button' }:
  { variant?: 'primary' | 'secondary'; size?: 'lg' | 'md'; state?: 'idle' | 'disabled' | 'loading'; children: ReactNode; onClick?: () => void; type?: 'button' | 'submit' }) {
  const disabled = state !== 'idle';
  return (
    <button type={type} className={`btn btn--${variant} btn--${size} ${size === 'lg' ? 't-action' : 't-action-2'}`}
      aria-disabled={disabled} aria-busy={state === 'loading'} onClick={disabled ? undefined : onClick}>
      {state === 'loading' ? <span className="btn__dots" aria-label="처리 중"><i /><i /><i /></span> : children}
    </button>
  );
}

/* ---------- Fields (18:339 / 18:365 / 27:419 / 18:392) ---------- */
interface FieldProps { value: string; onChange: (v: string) => void; placeholder?: string; helper?: string; error?: string | null; disabled?: boolean; id?: string; type?: 'text' | 'email' | 'url'; multiline?: boolean; validMark?: boolean; ariaLabel?: string; labelledBy?: string }
export function TextField({ value, onChange, placeholder = '입력', helper, error, disabled, id, type = 'text', multiline, validMark, ariaLabel, labelledBy }: FieldProps) {
  const auto = useId(); const fid = id ?? auto;
  const cls = `field${error ? ' field--invalid' : ''}${disabled ? ' field--disabled' : ''}`;
  const common = { id: fid, className: 'field__input t-body-2', value, placeholder, disabled, 'aria-invalid': !!error, 'aria-describedby': error ? `${fid}-err` : helper ? `${fid}-help` : undefined, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy };
  return (
    <div className={cls}>
      <div className={`field__box${multiline ? ' field__box--area' : ''}`}>
        {multiline
          ? <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
          : <input {...common} type={type} inputMode={type === 'email' ? 'email' : type === 'url' ? 'url' : undefined} autoComplete={type === 'email' ? 'email' : 'off'} onChange={(e) => onChange(e.target.value)} />}
        {validMark && !error && <span className="field__mark t-body-2" aria-label="유효한 링크">✓</span>}
      </div>
      {helper && !error && <span id={`${fid}-help`} className="field__helper t-helper">{helper}</span>}
      {error && <span id={`${fid}-err`} className="field__error t-helper" role="alert">{error}</span>}
    </div>
  );
}
export const TextArea = (p: FieldProps) => <TextField {...p} multiline />;
export const EmailField = (p: FieldProps) => <TextField {...p} type="email" />;
export const URLField = (p: FieldProps) => <TextField {...p} type="url" placeholder="URL 입력" />;

export function InlineMessage({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return <span className={`inline-msg inline-msg--${tone} t-helper`} role={tone === 'error' ? 'alert' : 'status'}>{children}</span>;
}

/* ---------- Choice (18:415 / 19:390) ---------- */
// Toggle-button semantics (aria-pressed): native Enter/Space, no roving tabindex needed.
export function ChoiceChip({ label, pressed, disabled, onToggle }: { label: string; pressed: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="chip t-body-2" aria-pressed={pressed} disabled={disabled} onClick={onToggle}>{label}</button>
  );
}

export function ChoiceGroup({ layout, options, selection, max, value, onChange, error, labelledBy }:
  { layout: 'grid3' | 'grid2' | 'full'; options: ChoiceOption[]; selection: 'single' | 'multiple'; max?: number; value: string[]; onChange: (v: string[]) => void; error?: string | null; labelledBy?: string }) {
  const id = useId();
  const maxReached = selection === 'multiple' && !!max && value.length >= max;
  const mode = selection === 'single' ? '하나만 선택' : max ? `최대 ${max}개 선택` : '여러 개 선택 가능';
  const toggle = (code: string) => {
    if (selection === 'single') return onChange(value[0] === code ? [] : [code]);
    if (value.includes(code)) return onChange(value.filter((v) => v !== code));
    if (maxReached) return;
    onChange([...value, code]);
  };
  return (
    <div className="choice-group" data-layout={layout}>
      <span id={`${id}-mode`} className="sr-only">{mode}</span>
      <div className="choice-group__options" role="group" aria-labelledby={labelledBy} aria-describedby={`${id}-mode`}>
        {options.map((opt) => (
          <ChoiceChip key={opt.code} label={opt.label} pressed={value.includes(opt.code)} disabled={maxReached && !value.includes(opt.code)} onToggle={() => toggle(opt.code)} />
        ))}
      </div>
      <span className="sr-only" role="status">{maxReached ? `${max}개를 모두 선택했어요. 다른 항목을 고르려면 선택을 해제하세요.` : ''}</span>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  );
}

/* ---------- QuestionBlock (19:431) ---------- */
export function QuestionBlock({ question, value, onChange, error }: { question: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void; error?: string | null }) {
  const id = useId();
  return (
    <div className="question" data-q={question.id}>
      <div className="question__label t-body" id={`${id}-label`}>
        <span>{question.label}</span>
        {question.required && <span className="question__req" aria-label="필수">*</span>}
      </div>
      {question.type === 'text'
        ? <TextField id={id} value={typeof value === 'string' ? value : ''} onChange={onChange} placeholder={question.placeholder ?? '입력'} helper={question.helperText} error={error} labelledBy={`${id}-label`} />
        : <ChoiceGroup layout={question.layout} options={question.options} selection={question.selection} max={question.maxSelection}
            value={Array.isArray(value) ? value : []} onChange={onChange} error={error} labelledBy={`${id}-label`} />}
    </div>
  );
}
