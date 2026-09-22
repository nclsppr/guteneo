import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { C } from "../design";

/** Design in 1080-wide units, then render each device at its native aspect. */
export const usePortraitLayout = () => {
  const { width, height: outputHeight } = useVideoConfig();
  const scale = width / 1080;
  const height = outputHeight / scale;
  return { height, scale, y: (position: number) => (position * height) / 1920 };
};

export const PortraitStage: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { height, scale } = usePortraitLayout();
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height,
          scale,
          transformOrigin: "top left",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
