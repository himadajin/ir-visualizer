import {
  Box,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  type SelectChangeEvent,
} from "@mui/material";
import { IR_MODE_LIST, type IRModeKey } from "../../irModes";

interface ToolbarPaneProps {
  mode: IRModeKey;
  onModeChange: (event: SelectChangeEvent) => void;
  isNarrow: boolean;
  activePane: "editor" | "graph";
  onActivePaneChange: (pane: "editor" | "graph") => void;
}

export function ToolbarPane({
  mode,
  onModeChange,
  isNarrow,
  activePane,
  onActivePaneChange,
}: ToolbarPaneProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 1.5,
        py: 0.5,
        borderBottom: "1px solid #e8e8e8",
        backgroundColor: "#fafafa",
        minHeight: 36,
        maxHeight: 36,
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: "16px",
          color: "#333",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        IR Visualizer
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isNarrow && (
          <ToggleButtonGroup
            value={activePane}
            exclusive
            onChange={(_e, v) => {
              if (v !== null) onActivePaneChange(v);
            }}
            size="small"
            sx={{
              height: 26,
              "& .MuiToggleButton-root": {
                fontSize: "11px",
                px: 1.2,
                py: 0,
                textTransform: "none",
                color: "#666",
                borderColor: "#d0d0d0",
                "&.Mui-selected": {
                  backgroundColor: "#e8e8e8",
                  color: "#222",
                  fontWeight: 600,
                },
              },
            }}
          >
            <ToggleButton value="editor">Code</ToggleButton>
            <ToggleButton value="graph">Graph</ToggleButton>
          </ToggleButtonGroup>
        )}

        <Select
          value={mode}
          onChange={onModeChange}
          size="small"
          variant="outlined"
          sx={{
            fontSize: "12px",
            height: 26,
            color: "#555",
            backgroundColor: "#fff",
            borderRadius: "4px",
            ".MuiOutlinedInput-notchedOutline": {
              borderColor: "#d0d0d0",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#999",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "#777",
              borderWidth: "1px",
            },
            ".MuiSvgIcon-root": {
              color: "#999",
              fontSize: "16px",
            },
            ".MuiSelect-select": {
              py: "2px",
              pr: "24px !important",
              pl: "8px",
            },
          }}
        >
          {IR_MODE_LIST.map((irMode) => (
            <MenuItem
              key={irMode.key}
              value={irMode.key}
              sx={{ fontSize: "12px" }}
            >
              {irMode.label}
            </MenuItem>
          ))}
        </Select>
      </Box>
    </Box>
  );
}
