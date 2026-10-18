// MAIN workflow screens — SURVEY_STEP_1..3, UPLOAD, GENERATING, RESULT, DELIVERY, DELIVERED, ERROR (02_Main_Flow)
import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import catGreeting from '../assets/cat-greeting.png';
import helloSvg from '../assets/hello.svg?raw';
import { API_MODE, api } from '../api/client';
import { ApiError, generationErrorKind, inputErrorMessage, isAbortError, isInputError } from '../api/errors';
import { IMAGE_ACCEPT } from '../api/contract';
import { MediaPrepareError } from '../media/compressImage';
import { prepareProductImage } from '../media/prepareProductImage';
import { isValidEmail } from '../api/validation';
import { SECTIONS, STEP_SECTIONS, type AnswerValue } from '../data/questions';
import { fileStore, generationTicket, INTERRUPTED_MESSAGE, LOST_FILES_MESSAGE, surveyRoute, useEmailAvailability, useWorkflows, type SurveyStatus } from '../state/workflows';
import { ContentCard, Divider, Screen, SectionHeader } from '../components/shell';
import { Button, InlineMessage, QuestionBlock } from '../components/controls';
import { DeliverySuccess, EmailDeliveryForm, ErrorState, FileUploader, LoadingState, ReportBrandTable, ReportSection, type DeliveryFormState } from '../components/blocks';

const TITLE = '소규모 수공예 브랜드 문진표';

/** Keeps the URL and the workflow status in sync (status is the source of truth). */
function useSyncStatus(status: SurveyStatus) {
  const { survey, patchSurvey } = useWorkflows();
  useEffect(() => { if (survey.status !== status) patchSurvey({ status }); }, [status, survey.status, patchSurvey]);
}

export function SurveyStep() {
  const { n } = useParams();
  const step = (Math.min(3, Math.max(1, Number(n) || 1)) as 1 | 2 | 3);
  const navigate = useNavigate();
  const { survey, patchSurvey } = useWorkflows();
  useSyncStatus(`STEP_${step}` as SurveyStatus);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  const questions = STEP_SECTIONS[step];
  const setAnswer = (id: string, v: AnswerValue) => patchSurvey({ answers: { ...survey.answers, [id]: v } });
  const next = () => navigate(step < 3 ? surveyRoute[`STEP_${step + 1}` as SurveyStatus] : surveyRoute.UPLOAD);
  return (
    <Screen theme="light" workflow="survey" status="form" step={step}>
      <ContentCard title={TITLE}>
        {step === 1 && (
          <div className="intro">
            <p className="intro__text t-body">
              {'안녕하세요!\n당신과 앞으로 함께 달려줄\n릴스 컨설턴트 '}<strong>소수</strong>{'입니다.\n\n총 20문항으로 구성돼 있으며, 답변해 주시면\n브랜드에 맞는 릴스 방향을 진단해드릴게요.'}
            </p>
            <div className="intro__art" aria-hidden>
              <img src={catGreeting} alt="" />
              <span className="intro__hello" dangerouslySetInnerHTML={{ __html: helloSvg }} />
            </div>
          </div>
        )}
        <SectionHeader title={SECTIONS[step]} />
        {questions.map((q, i) => (
          <Fragment key={q.id}>
            <QuestionBlock question={q} value={survey.answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
            {i < questions.length - 1 && <Divider />}
          </Fragment>
        ))}
      </ContentCard>
      <Button onClick={next}>다음</Button>
    </Screen>
  );
}

export function SurveyUpload() {
  const navigate = useNavigate();
  const { survey, patchSurvey } = useWorkflows();
  useSyncStatus('UPLOAD');
  return (
    <Screen theme="light" workflow="survey" status="form" step={4}>
      <ContentCard title={TITLE}>
        <SectionHeader title="제품 이미지 업로드" />
        <p className="t-body">{'마지막으로 업로드 할 제품 이미지가 있으면 업로드 해주세요.\n*없으면 바로 아래 진단 버튼을 눌러주세요'}</p>
        <FileUploader files={survey.files} onChange={(files) => patchSurvey({ files, inputError: null })} accept={IMAGE_ACCEPT} max={1} />
        {survey.inputError && <div data-input-error="survey"><InlineMessage tone="error">{survey.inputError}</InlineMessage></div>}
      </ContentCard>
      <Button onClick={() => {
        // Contract: 0..1 product image, jpeg/png/webp. An unsupported file blocks submission (the uploader already flags it).
        if (survey.files.some((f) => !f.valid)) return patchSurvey({ inputError: 'jpg, png, webp 이미지만 업로드할 수 있어요. 지원하지 않는 파일을 삭제해 주세요.' });
        patchSurvey({ inputError: null });
        generationTicket.survey = true;
        navigate(surveyRoute.GENERATING);
      }}>진단</Button>
    </Screen>
  );
}

export function SurveyGenerating() {
  const navigate = useNavigate();
  const { survey, patchSurvey } = useWorkflows();
  useSyncStatus('GENERATING');
  // Latest callbacks via refs so the request effect runs exactly once per mount (StrictMode-safe: cleanup aborts, remount restarts).
  const latest = useRef({ navigate, patch: patchSurvey, survey });
  latest.current = { navigate, patch: patchSurvey, survey };
  useEffect(() => {
    const ctrl = new AbortController();
    const { survey: s } = latest.current;
    const backToUpload = (inputError: string) => { generationTicket.survey = false; latest.current.patch({ inputError }); latest.current.navigate(surveyRoute.UPLOAD, { replace: true }); };
    (async () => {
      let productImage: File | undefined;
      if (API_MODE === 'http') {
        if (!generationTicket.survey) return backToUpload(s.inputError ?? INTERRUPTED_MESSAGE);
        // A chosen image that no longer exists (reload) must not be silently skipped — return to upload.
        const meta = s.files[0];
        const file = meta ? fileStore.get(meta.id) : undefined;
        if (s.inputError === LOST_FILES_MESSAGE || (meta && !file)) return backToUpload(LOST_FILES_MESSAGE);
        if (file) {
          try { productImage = await prepareProductImage(file); }
          catch (e) { if (e instanceof MediaPrepareError) return backToUpload(e.message); throw e; }
        }
        if (ctrl.signal.aborted) return; // StrictMode first mount / unmounted while preparing
      }
      const { report: result, delivery } = await api.generateDiagnosis(s.answers, { signal: ctrl.signal, productImage });
      if (ctrl.signal.aborted) return; // stale response
      generationTicket.survey = false;
      latest.current.patch({ result, delivery, sent: false, errorKind: null, inputError: null }); latest.current.navigate(surveyRoute.RESULT, { replace: true });
    })().catch((e: unknown) => {
      if (isAbortError(e) || ctrl.signal.aborted) return;
      generationTicket.survey = false;
      if (isInputError(e)) return backToUpload(inputErrorMessage(e, 'survey'));
      latest.current.patch({ errorKind: generationErrorKind(e) }); latest.current.navigate(surveyRoute.ERROR, { replace: true });
    });
    return () => ctrl.abort();
  }, []);
  return (
    <Screen theme="dark" workflow="survey" status="generating">
      <LoadingState workflow="survey" />
    </Screen>
  );
}

export function SurveyError() {
  const navigate = useNavigate();
  const { survey, resetSurvey } = useWorkflows();
  useSyncStatus('ERROR');
  return (
    <Screen theme="dark" workflow="survey" status="result">
      <ErrorState workflow="survey" kind={survey.errorKind ?? 'error'} onRetry={() => { generationTicket.survey = true; navigate(surveyRoute.GENERATING); }} onReset={() => { resetSurvey(); navigate(surveyRoute.STEP_1); }} onBack={() => navigate(surveyRoute.UPLOAD)} />
    </Screen>
  );
}

export function SurveyResult() {
  const navigate = useNavigate();
  const { survey } = useWorkflows();
  useSyncStatus('RESULT');
  const r = survey.result;
  useEffect(() => { if (!r) navigate(surveyRoute.UPLOAD, { replace: true }); }, [r, navigate]);
  if (!r) return null;
  return (
    <Screen theme="dark" workflow="survey" status="result" tight>
      <h1 className="report-title t-display">릴스 진단서</h1>
      <ReportBrandTable brand={r.brand} />
      <ReportSection title="추천 포지셔닝" emphasis="accent" fieldKey="positioning">
        {r.positioningRationale ? <div className="kv"><div>{r.positioning}</div><div><div className="kv__k">근거</div><div>{r.positioningRationale}</div></div></div> : r.positioning}
      </ReportSection>
      <ReportSection title="핵심 강점" fieldKey="strengths">{r.strengths}</ReportSection>
      <ReportSection title="메인 타깃" fieldKey="target">{r.target}</ReportSection>
      <ReportSection title="톤앤매너" fieldKey="tone">{r.tone}</ReportSection>
      <ReportSection title="추천 폰트" fieldKey="fonts">
        <div className="kv"><div><div className="kv__k">제목(썸네일&카피)</div><div>{r.fonts.title}</div></div><div><div className="kv__k">자막</div><div>{r.fonts.subtitle}</div></div>{r.fonts.reason && <div><div className="kv__k">선택 이유</div><div>{r.fonts.reason}</div></div>}</div>
      </ReportSection>
      <ReportSection title="릴스에서 가장 먼저 보여줘야 할 것" emphasis="accent" fieldKey="priorities">
        <div className="kv">{r.priorities.map((p, i) => <div key={i}><div className="kv__k">{i + 1}순위</div><div>{p}</div></div>)}</div>
      </ReportSection>
      <ReportSection title="추천 릴스 유형 조합" fieldKey="reelTypes">
        <div className="kv">{r.reelTypes.map((t, i) => <div key={i}><div className="kv__k">유형 ○</div><div>{t}</div></div>)}{r.guidebookNote && <div className="t-strong">{r.guidebookNote}</div>}</div>
      </ReportSection>
      <ReportSection title="추천 릴스 구조" fieldKey="structure">
        <div className="kv">{r.structure.map((s) => <div key={s.range}><div className="kv__k">{s.range}</div><div>{s.guide}</div></div>)}</div>
      </ReportSection>
      {/* OPEN L5: duplicate title in source — kept verbatim */}
      <ReportSection title="릴스에서 가장 먼저 보여줘야 할 것" fieldKey="finalGuidance">{r.finalGuidance}</ReportSection>
      <Button onClick={() => navigate(surveyRoute.DELIVERY)}>진단서 받기</Button>
    </Screen>
  );
}

export function SurveyDelivery() {
  const navigate = useNavigate();
  const { survey, patchSurvey, resetSurvey } = useWorkflows();
  useSyncStatus('DELIVERY');
  const [state, setState] = useState<DeliveryFormState>('empty');
  const [availability, setAvailability] = useEmailAvailability(survey.delivery);
  const submit = async () => {
    if (!isValidEmail(survey.email)) return setState('invalid-email');
    setState('submitting');
    try { await api.sendReportEmail(survey.email, survey.delivery); patchSurvey({ sent: true }); navigate(surveyRoute.DELIVERED); }
    catch (e) { if (e instanceof ApiError && e.kind === 'unavailable') { setAvailability('unavailable'); setState('empty'); } else setState('send-error'); }
  };
  return (
    <Screen theme="dark" workflow="survey" status="delivery">
      <EmailDeliveryForm docName="진단서" email={survey.email} onEmail={(email) => { patchSurvey({ email }); if (state !== 'submitting') setState('empty'); }}
        state={state} onSubmit={submit} unavailable={availability === 'unavailable'} checking={availability === 'checking'} onReset={() => { resetSurvey(); navigate(surveyRoute.STEP_1); }} />
    </Screen>
  );
}

export function SurveyDelivered() {
  const navigate = useNavigate();
  const { survey, resetSurvey } = useWorkflows();
  useSyncStatus('DELIVERED');
  // http mode: only reachable after the backend confirmed sent/duplicate — a direct visit never shows a fake "sent" screen.
  const confirmed = api.emailDelivery || survey.sent;
  useEffect(() => { if (!confirmed) navigate(surveyRoute.DELIVERY, { replace: true }); }, [confirmed, navigate]);
  if (!confirmed) return null;
  return (
    <Screen theme="dark" workflow="survey" status="delivery">
      <DeliverySuccess docName="진단서" email={survey.email} onReset={() => { resetSurvey(); navigate(surveyRoute.STEP_1); }} />
    </Screen>
  );
}
