import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Intro } from "@/pages/Intro";
import { StepPage } from "@/pages/StepPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Intro />} />
          <Route path="profile" element={<StepPage index={1} />} />
          <Route path="swing" element={<StepPage index={2} />} />
          <Route path="launch-monitor" element={<StepPage index={3} />} />
          <Route path="result" element={<StepPage index={4} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
