import React from "react";
import ReactDOM from "react-dom/client";
import NodeDebugPage from "./pages/Debug/NodeDebugPage";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NodeDebugPage />
  </React.StrictMode>,
);
