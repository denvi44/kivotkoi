import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("racine")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
