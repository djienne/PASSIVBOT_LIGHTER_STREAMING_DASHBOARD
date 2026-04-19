import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Dashboard from "./routes/Dashboard";
import Stream from "./routes/Stream";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stream" element={<Stream />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
