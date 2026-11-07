import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { FitProvider } from "@/lib/fit-store";
import { Intro } from "@/pages/Intro";
import { StepPage } from "@/pages/StepPage";
import { Swing } from "@/pages/Swing";

export default function App() {
  return (
    <FitProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Intro />} />
            <Route path="profile" element={<StepPage index={1} />} />
            <Route path="swing" element={<Swing />} />
            <Route path="launch-monitor" element={<StepPage index={3} />} />
            <Route path="result" element={<StepPage index={4} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FitProvider>
  );
}
