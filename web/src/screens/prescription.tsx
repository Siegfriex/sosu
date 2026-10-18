// PRESCRIPTION workflow screens — INPUT, GENERATING, RESULT, DELIVERY, DELIVERED, ERROR (03_Prescription_Flow)
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import insight1 from '../assets/insight-1.jpg';
import insight2 from '../assets/insight-2.jpg';
import insight3 from '../assets/insight-3.jpg';
import { API_MODE, api } from '../api/client';
import { generationErrorKind, inputErrorMessage, isAbortError, isInputError } from '../api/errors';
import { IMAGE_ACCEPT } from '../api/contract';
import { MediaPrepareError } from '../media/compressImage';
import { prepareInsightImages } from '../media/prepareInsightImage';
import { isValidEmail, isValidInstagramUrl } from '../api/validation';
import { fileStore, generationTicket, INTERRUPTED_MESSAGE, LOST_FILES_MESSAGE, prescriptionRoute, useWorkflows, type PrescriptionStatus } from '../state/workflows';
import { ContentCard, Screen, SectionHeader } from '../components/shell';
import { Button, InlineMessage, URLField } from '../components/controls';
import { DeliverySuccess, EmailDeliveryForm, ErrorState, ExampleThumbnail, FileUploader, Lightbox, LoadingState, ReportSection, type DeliveryFormState } from '../components/blocks';

const EXAMPLES = [insight1, insight2, insight3];
const REQUIRED_IMAGES = 3; // explicit requirement (owner directive)

function useSyncStatus(status: PrescriptionStatus) {
  const { prescription, patchPrescription } = useWorkflows();
  useEffect(() => { if (prescription.status !== status) patchPrescription({ status }); }, [status, prescription.status, patchPrescription]);
}

export function PrescriptionInput() {
  const navigate = useNavigate();
  const { prescription, patchPrescription } = useWorkflows();
  useSyncStatus('INPUT');
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const urlValid = isValidInstagramUrl(prescription.url);
  const validImages = prescription.files.filter((f) => f.valid && f.type.startsWith('image/')).length;
  const ready = urlValid && validImages === REQUIRED_IMAGES && prescription.files.length === REQUIRED_IMAGES;
  return (
    <Screen theme="light" workflow="prescription" status="form">
      <ContentCard title="릴스 처방전">
        <SectionHeader title="인사이트 업로드" />
        <p className="t-body">{'릴스 url과 인사이트 탭 내의 3가지를 캡쳐해서 업로드 해주세요.\n*인스타그램 업로드 3일 후 인사이트부터 업로드 해주세요.\n*예시를 참고하여 인사이트 탭을 모두 캡쳐 후 업로드 해주세요.'}</p>
        <div onBlur={() => setTouched(true)}>
          <URLField value={prescription.url} onChange={(url) => patchPrescription({ url, inputError: null })} ariaLabel="릴스 URL"
            validMark={urlValid} error={touched && prescription.url && !urlValid ? '인스타그램 릴스 URL을 입력해 주세요 (instagram.com/reel/…)' : null} />
        </div>
        <FileUploader files={prescription.files} onChange={(files) => patchPrescription({ files, inputError: null })} accept={IMAGE_ACCEPT} max={REQUIRED_IMAGES} />
        {prescription.inputError && <div data-input-error="prescription"><InlineMessage tone="error">{prescription.inputError}</InlineMessage></div>}
        <div className="gallery">
          <p className="gallery__caption t-helper">{'인사이트 탭 캡쳐 예시\n( 사진을 누르면 자세히 보실 수 있습니다 )'}</p>
          <div className="gallery__row">
            {EXAMPLES.map((src, i) => (
              <ExampleThumbnail key={src} src={src} index={i + 1} onOpen={() => { trigger.current = document.activeElement as HTMLElement; setOpen(i); }} />
            ))}
          </div>
        </div>
      </ContentCard>
      <Button state={ready ? 'idle' : 'disabled'} onClick={() => { patchPrescription({ inputError: null }); generationTicket.prescription = true; navigate(prescriptionRoute.GENERATING); }}>처방</Button>
      {open !== null && <Lightbox src={EXAMPLES[open]} caption={`인사이트 탭 캡쳐 예시 ${open + 1}/3`} onClose={() => setOpen(null)} returnFocusTo={trigger.current} />}
    </Screen>
  );
}

export function PrescriptionGenerating() {
  const navigate = useNavigate();
  const { prescription, patchPrescription } = useWorkflows();
  useSyncStatus('GENERATING');
  // Latest callbacks via refs so the request effect runs exactly once per mount (StrictMode-safe: cleanup aborts, remount restarts).
  const latest = useRef({ navigate, patch: patchPrescription, p: prescription });
  latest.current = { navigate, patch: patchPrescription, p: prescription };
  useEffect(() => {
    const ctrl = new AbortController();
    const { p } = latest.current;
    const backToInput = (inputError: string) => { generationTicket.prescription = false; latest.current.patch({ inputError }); latest.current.navigate(prescriptionRoute.INPUT, { replace: true }); };
    (async () => {
      let insightImages: File[] = [];
      if (API_MODE === 'http') {
        if (!generationTicket.prescription) return backToInput(p.inputError ?? INTERRUPTED_MESSAGE);
        // Exactly 3 insight captures are required; after a reload the binaries are gone → back to input.
        const files = p.files.map((f) => fileStore.get(f.id)).filter((f): f is File => !!f);
        if (p.inputError === LOST_FILES_MESSAGE || files.length !== REQUIRED_IMAGES || p.files.some((f) => !f.valid)) {
          return backToInput(files.length < p.files.length || p.inputError === LOST_FILES_MESSAGE ? LOST_FILES_MESSAGE : `인사이트 캡처 ${REQUIRED_IMAGES}장(jpg, png, webp)을 올려주세요.`);
        }
        if (!isValidInstagramUrl(p.url)) return backToInput('인스타그램 릴스 URL을 확인해 주세요. (예: https://www.instagram.com/reel/…)');
        try { insightImages = await prepareInsightImages(files); }
        catch (e) { if (e instanceof MediaPrepareError) return backToInput(e.message); throw e; }
        if (ctrl.signal.aborted) return; // StrictMode first mount / unmounted while preparing
      }
      const result = await api.generatePrescription(p.url, { signal: ctrl.signal, insightImages });
      if (ctrl.signal.aborted) return; // stale response
      generationTicket.prescription = false;
      latest.current.patch({ result, errorKind: null, inputError: null }); latest.current.navigate(prescriptionRoute.RESULT, { replace: true });
    })().catch((e: unknown) => {
      if (isAbortError(e) || ctrl.signal.aborted) return;
      generationTicket.prescription = false;
      if (isInputError(e)) return backToInput(inputErrorMessage(e, 'prescription'));
      latest.current.patch({ errorKind: generationErrorKind(e) }); latest.current.navigate(prescriptionRoute.ERROR, { replace: true });
    });
    return () => ctrl.abort();
  }, []);
  return (
    <Screen theme="dark" workflow="prescription" status="generating">
      <LoadingState workflow="prescription" />
    </Screen>
  );
}

export function PrescriptionError() {
  const navigate = useNavigate();
  const { prescription, resetPrescription } = useWorkflows();
  useSyncStatus('ERROR');
  return (
    <Screen theme="dark" workflow="prescription" status="result">
      <ErrorState workflow="prescription" kind={prescription.errorKind ?? 'error'} onRetry={() => { generationTicket.prescription = true; navigate(prescriptionRoute.GENERATING); }} onReset={() => { resetPrescription(); navigate(prescriptionRoute.INPUT); }} />
    </Screen>
  );
}

export function PrescriptionResult() {
  const navigate = useNavigate();
  const { prescription } = useWorkflows();
  useSyncStatus('RESULT');
  const r = prescription.result;
  useEffect(() => { if (!r) navigate(prescriptionRoute.INPUT, { replace: true }); }, [r, navigate]);
  if (!r) return null;
  return (
    <Screen theme="dark" workflow="prescription" status="result" tight>
      <h1 className="report-title t-display">릴스 처방전</h1>
      <ReportSection title="처방" emphasis="accent" fieldKey="prescription">{r.prescription}</ReportSection>
      <ReportSection title="다음 릴스 적용" fieldKey="nextActions">
        <ol>{r.nextActions.map((a, i) => <li key={i}>{a}</li>)}</ol>
      </ReportSection>
      <ReportSection title="톤앤매너" fieldKey="tone">{r.tone}</ReportSection>
      <Button onClick={() => navigate(prescriptionRoute.DELIVERY)}>처방전 받기</Button>
    </Screen>
  );
}

export function PrescriptionDelivery() {
  const navigate = useNavigate();
  const { prescription, patchPrescription, resetPrescription } = useWorkflows();
  useSyncStatus('DELIVERY');
  const [state, setState] = useState<DeliveryFormState>('empty');
  const submit = async () => {
    if (!isValidEmail(prescription.email)) return setState('invalid-email');
    setState('submitting');
    try { await api.sendReportEmail(prescription.email); navigate(prescriptionRoute.DELIVERED); }
    catch { setState('send-error'); }
  };
  return (
    <Screen theme="dark" workflow="prescription" status="delivery">
      <EmailDeliveryForm docName="처방전" email={prescription.email} onEmail={(email) => { patchPrescription({ email }); if (state !== 'submitting') setState('empty'); }}
        state={state} onSubmit={submit} unavailable={!api.emailDelivery} onReset={() => { resetPrescription(); navigate(prescriptionRoute.INPUT); }} />
    </Screen>
  );
}

export function PrescriptionDelivered() {
  const navigate = useNavigate();
  const { prescription, resetPrescription } = useWorkflows();
  useSyncStatus('DELIVERED');
  // No email backend in http mode: a direct visit must not show a fake "sent" screen.
  useEffect(() => { if (!api.emailDelivery) navigate(prescriptionRoute.DELIVERY, { replace: true }); }, [navigate]);
  if (!api.emailDelivery) return null;
  return (
    <Screen theme="dark" workflow="prescription" status="delivery">
      <DeliverySuccess docName="처방전" email={prescription.email} onReset={() => { resetPrescription(); navigate(prescriptionRoute.INPUT); }} />
    </Screen>
  );
}
