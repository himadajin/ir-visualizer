// Mantine's styles first, so component CSS Modules can override them.
import "@mantine/core/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { ReactFlowProvider } from "@xyflow/react";
import App from "./App.tsx";
import { cssVariablesResolver, theme } from "./theme";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
    >
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </MantineProvider>
  </React.StrictMode>,
);
