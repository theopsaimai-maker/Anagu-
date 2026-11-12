import React from 'react';
import { FigmaFrame, FigmaFrameId } from '../../types/anagu';
import { Compass, Maximize2 } from 'lucide-react';

interface Props {
  frames: FigmaFrame[];
  selectedFrameId: FigmaFrameId;
  onSelectFrame: (id: FigmaFrameId) => void;
  pan: { x: number; y: number };
  zoomLevel: number;
  onPanTo: (x: number, y: number) => void;
  onFocusFrame: (frame: FigmaFrame) => void;
}

export const FigmaMiniMap: React.FC<Props> = ({
  frames,
  selectedFrameId,
  onSelectFrame,
  pan,
  zoomLevel,
  onPanTo,
  onFocusFrame
}) => {
  // Canvas virtual boundary with offset support for frame-landing at x: -1600
  const worldMinX = -1800;
  const worldMinY = -100;
  const worldWidth = 9000;
  const worldHeight = 2300;

  // Mini-map dimensions
  const mapWidth = 240;
  const mapHeight = (mapWidth / worldWidth) * worldHeight; // ~61px
  const scale = mapWidth / worldWidth;

  // Calculate viewport rect in world coordinates
  const viewportWidth = (typeof window !== 'undefined' ? window.innerWidth - 300 : 1200) / zoomLevel;
  const viewportHeight = (typeof window !== 'undefined' ? window.innerHeight - 100 : 800) / zoomLevel;
  const viewportX = -pan.x / zoomLevel;
  const viewportY = -pan.y / zoomLevel;

  const handleMiniMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click in minimap to world coordinates
    const targetWorldX = (clickX / scale) + worldMinX;
    const targetWorldY = (clickY / scale) + worldMinY;

    // Center viewport on this point
    const newPanX = -(targetWorldX * zoomLevel - (window.innerWidth - 300) / 2);
    const newPanY = -(targetWorldY * zoomLevel - (window.innerHeight - 100) / 2);
    onPanTo(newPanX, newPanY);
  };

  return (
    <div className="absolute bottom-5 right-5 z-30 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#383838] p-2.5 rounded-xl shadow-2xl flex flex-col gap-2 select-none">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pb-1 border-b border-[#2d2d2d]">
        <span className="flex items-center gap-1 text-slate-300 font-semibold">
          <Compass className="w-3 h-3 text-emerald-400" />
          Canvas Radar
        </span>
        <span>{frames.length} Artboards</span>
      </div>

      <div
        onClick={handleMiniMapClick}
        style={{ width: `${mapWidth}px`, height: `${mapHeight}px` }}
        className="relative bg-slate-950/90 rounded-lg border border-[#333] overflow-hidden cursor-crosshair group"
      >
        {/* Render each frame box */}
        {frames.map((frame) => {
          const isSelected = frame.id === selectedFrameId;
          const fx = (frame.x - worldMinX) * scale;
          const fy = (frame.y - worldMinY) * scale;
          const fw = Math.max(3, frame.width * scale);
          const fh = Math.max(3, frame.height * scale);

          return (
            <div
              key={frame.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFrame(frame.id);
                onFocusFrame(frame);
              }}
              style={{
                left: `${fx}px`,
                top: `${fy}px`,
                width: `${fw}px`,
                height: `${fh}px`,
              }}
              title={`${frame.title} (Click to focus)`}
              className={`absolute rounded-xs transition-colors ${
                isSelected
                  ? 'bg-emerald-500 ring-1 ring-emerald-300 z-10'
                  : 'bg-slate-700 hover:bg-slate-500'
              }`}
            />
          );
        })}

        {/* Viewport Indicator */}
        <div
          style={{
            left: `${Math.max(0, Math.min(mapWidth - 10, (viewportX - worldMinX) * scale))}px`,
            top: `${Math.max(0, Math.min(mapHeight - 10, (viewportY - worldMinY) * scale))}px`,
            width: `${Math.min(mapWidth, viewportWidth * scale)}px`,
            height: `${Math.min(mapHeight, viewportHeight * scale)}px`,
          }}
          className="absolute border border-emerald-400/80 bg-emerald-500/10 rounded-xs pointer-events-none shadow-sm"
        />
      </div>
    </div>
  );
};
