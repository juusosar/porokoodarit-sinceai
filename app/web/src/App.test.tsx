import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App shell", () => {
  it("renders intro with why chip and start button", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<App />);
    expect(screen.getByRole("heading", { name: /find your fit/i })).toBeTruthy();
    expect(screen.getByTestId("why-chip").textContent).toMatch(/measured, not guessed/i);
    expect(screen.getByRole("link", { name: /start fitting/i }).getAttribute("href")).toBe("/profile");
  });
});
