import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WorkflowProvider, surveyRoute, useWorkflows } from './state/workflows';
import { SurveyDelivered, SurveyDelivery, SurveyError, SurveyGenerating, SurveyResult, SurveyStep, SurveyUpload } from './screens/survey';
import { PrescriptionDelivered, PrescriptionDelivery, PrescriptionError, PrescriptionGenerating, PrescriptionInput, PrescriptionResult } from './screens/prescription';

function SurveyEntry() {
  const { survey } = useWorkflows();
  return <Navigate to={surveyRoute[survey.status]} replace />;
}

export default function App() {
  return (
    <WorkflowProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/survey" replace />} />
          <Route path="/survey" element={<SurveyEntry />} />
          <Route path="/survey/step/:n" element={<SurveyStep />} />
          <Route path="/survey/upload" element={<SurveyUpload />} />
          <Route path="/survey/generating" element={<SurveyGenerating />} />
          <Route path="/survey/result" element={<SurveyResult />} />
          <Route path="/survey/delivery" element={<SurveyDelivery />} />
          <Route path="/survey/delivered" element={<SurveyDelivered />} />
          <Route path="/survey/error" element={<SurveyError />} />
          <Route path="/prescription" element={<PrescriptionInput />} />
          <Route path="/prescription/generating" element={<PrescriptionGenerating />} />
          <Route path="/prescription/result" element={<PrescriptionResult />} />
          <Route path="/prescription/delivery" element={<PrescriptionDelivery />} />
          <Route path="/prescription/delivered" element={<PrescriptionDelivered />} />
          <Route path="/prescription/error" element={<PrescriptionError />} />
          <Route path="*" element={<Navigate to="/survey" replace />} />
        </Routes>
      </BrowserRouter>
    </WorkflowProvider>
  );
}
