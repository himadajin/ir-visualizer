import { Box, Button } from "@mui/material";

interface EditorToolbarProps {
  onClear: () => void;
}

export function EditorToolbar({ onClear }: EditorToolbarProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        px: 1.5,
        py: 0,
        borderBottom: "1px solid #e8e8e8",
        backgroundColor: "#fafafa",
        minHeight: 30,
        maxHeight: 30,
      }}
    >
      <Button
        variant="outlined"
        size="small"
        onClick={onClear}
        sx={{
          height: 26,
          fontSize: "11px",
          textTransform: "none",
          color: "#666",
          borderColor: "#d0d0d0",
          "&:hover": {
            backgroundColor: "#e8e8e8",
            borderColor: "#999",
          },
        }}
      >
        Clear
      </Button>
    </Box>
  );
}
