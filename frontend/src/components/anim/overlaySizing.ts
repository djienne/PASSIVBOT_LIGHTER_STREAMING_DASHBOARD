import type { CSSProperties } from "react";

export const GIF_FRAME_STYLE: CSSProperties = {
  width: 520,
  height: 320,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

export const GIF_IMAGE_STYLE: CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  pointerEvents: "none",
};
