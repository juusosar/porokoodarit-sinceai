import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { FitProvider } from "@/lib/fit-store";
import { Intro } from "@/pages/Intro";
import { LaunchMonitor } from "@/pages/LaunchMonitor";
import { Profile } from "@/pages/Profile";
import { Result } from "@/pages/Result";
import { Swing } from "@/pages/Swing";

export default function App() {
  return (
    <FitProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Intro />} />
            <Route path="profile" element={<Profile />} />
            <Route path="swing" element={<Swing />} />
            <Route path="launch-monitor" element={<LaunchMonitor />} />
            <Route path="result" element={<Result />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FitProvider>
  );
}
