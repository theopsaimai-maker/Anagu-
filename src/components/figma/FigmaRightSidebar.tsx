import React, { useState } from 'react';
import { 
  Sliders, 
  Code2, 
  Play, 
  Copy, 
  Check, 
  ExternalLink, 
  Layers, 
  Eye, 
  Sparkles,
  Maximize,
  FileCode2,
  Cpu
} from 'lucide-react';
import { FigmaFrame, FigmaFrameId } from '../../types/anagu';

interface Props {
  selectedFrame: FigmaFrame;
  isDevMode: boolean;
  onEnterPrototype: () => void;
}

export const FigmaRightSidebar: React.FC<Props> = ({
  selectedFrame,
  isDevMode,
  onEnterPrototype
}) => {
  const [activeTab, setActiveTab] = useState<'design' | 'prototype' | 'code'>(isDevMode ? 'code' : 'design');
  const [copiedCode, setCopiedCode] = useState(false);

  const getSoliditySnippet = () => {
    if (selectedFrame.id === 'frame-governor') {
      return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract LandTitleNFT is ERC721, AccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    
    enum RevocationGround { OverridingPublicInterest, BreachOfStatutoryCondition }
    mapping(uint256 => bool) public isRevoked;

    event TitleRevoked(
        uint256 indexed tokenId,
        RevocationGround ground,
        address indexed revokedBy,
        uint256 timestamp
    );

    function revoke(uint256 tokenId, RevocationGround ground)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        require(_ownerOf(tokenId) != address(0), "token does not exist");
        require(!isRevoked[tokenId], "already revoked");
        isRevoked[tokenId] = true;
        emit TitleRevoked(tokenId, ground, msg.sender, block.timestamp);
    }

    // OpenZeppelin v5 transfer hook
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        require(!isRevoked[tokenId], "LandTitleNFT: token is revoked");
        return super._update(to, tokenId, auth);
    }
}`;
    }

    if (selectedFrame.id === 'frame-surveyor') {
      return `-- PostGIS 3.4 Spatial Verification Query
-- 1. Validate boundary polygon topology
SELECT ST_IsValid(geom) AS is_valid,
       ST_IsValidReason(geom) AS reason
FROM parcels
WHERE id = 'PAR-2026-0902';

-- 2. Detect 0.5m buffer collision with existing registered titles
SELECT ST_Intersects(
  ST_Buffer(new_parcel.geom, 0.5),
  existing.geom
) AS has_overlap
FROM parcels existing
WHERE existing.id != new_parcel.id;`;
    }

    return `// React / Tailwind Component Architecture
export const ${selectedFrame.title.split(' ')[0]}Screen: React.FC = () => {
  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between">
        <h1 className="font-bold text-white">${selectedFrame.title}</h1>
      </header>
      {/* Cadastral Cadastre Grid */}
      <main className="flex-1 p-6 grid grid-cols-12 gap-6">
        {/* PostGIS GIS Vector Canvas & Smart Contract Pipeline */}
      </main>
    </div>
  );
};`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getSoliditySnippet());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="w-72 bg-[#252525] border-l border-[#383838] flex flex-col text-slate-300 select-none shrink-0 z-30">
      {/* Header Tabs */}
      <div className="h-10 border-b border-[#383838] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('design')}
            className={`font-semibold transition-colors pb-1 ${
              activeTab === 'design' 
                ? 'text-white border-b-2 border-emerald-500' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Design
          </button>
          <button
            onClick={() => setActiveTab('prototype')}
            className={`font-semibold transition-colors pb-1 ${
              activeTab === 'prototype' 
                ? 'text-white border-b-2 border-emerald-500' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Prototype
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`font-semibold transition-colors pb-1 flex items-center gap-1 ${
              activeTab === 'code' 
                ? 'text-emerald-400 border-b-2 border-emerald-500' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Code / ABI
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {activeTab === 'design' && (
          <>
            {/* Frame Dimensions Card */}
            <div className="space-y-3 pb-4 border-b border-[#383838]">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Frame Geometry
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-[#1e1e1e] p-2 rounded border border-[#3c3c3c] flex items-center justify-between">
                  <span className="text-slate-500">W</span>
                  <span className="text-slate-200 font-bold">{selectedFrame.width}px</span>
                </div>
                <div className="bg-[#1e1e1e] p-2 rounded border border-[#3c3c3c] flex items-center justify-between">
                  <span className="text-slate-500">H</span>
                  <span className="text-slate-200 font-bold">{selectedFrame.height}px</span>
                </div>
                <div className="bg-[#1e1e1e] p-2 rounded border border-[#3c3c3c] flex items-center justify-between">
                  <span className="text-slate-500">X</span>
                  <span className="text-slate-200 font-bold">{selectedFrame.x}</span>
                </div>
                <div className="bg-[#1e1e1e] p-2 rounded border border-[#3c3c3c] flex items-center justify-between">
                  <span className="text-slate-500">Y</span>
                  <span className="text-slate-200 font-bold">{selectedFrame.y}</span>
                </div>
              </div>
            </div>

            {/* Layout Specifications */}
            <div className="space-y-3 pb-4 border-b border-[#383838]">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Auto Layout Architecture
              </div>
              <div className="space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Direction:</span>
                  <span className="text-slate-200">Vertical Flex</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Container Padding:</span>
                  <span className="text-slate-200">32px (p-8)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Child Gap:</span>
                  <span className="text-slate-200">24px (gap-6)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Corner Radius:</span>
                  <span className="text-slate-200">16px (rounded-2xl)</span>
                </div>
              </div>
            </div>

            {/* Color Fills & Strokes */}
            <div className="space-y-3 pb-4 border-b border-[#383838]">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Fill & Surface Tokens
              </div>
              <div className="space-y-2 text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-900 border border-slate-700" />
                  <span className="text-slate-300">#0f172a (Sovereign Slate)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-emerald-600" />
                  <span className="text-slate-300">#047857 (Cadastral Green)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-800 border border-slate-700" />
                  <span className="text-slate-300">#1e293b (Surface Hairline)</span>
                </div>
              </div>
            </div>

            {/* Typography Tokens */}
            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Typography Scale
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="text-slate-200 font-sans font-bold">Display: Plus Jakarta Sans</div>
                <div className="text-slate-400 font-mono text-[10px]">Data & Hashes: JetBrains Mono (tabular-nums)</div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'prototype' && (
          <div className="space-y-4">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Prototype Interaction Flows
            </div>

            <div className="bg-[#1e1e1e] p-3 rounded-lg border border-[#3c3c3c] space-y-2 text-xs">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 fill-current" />
                Pipeline Flow Link
              </div>
              <p className="text-[11px] text-slate-400">
                Trigger: <strong>On User Click</strong>
              </p>
              <p className="text-[11px] text-slate-400">
                Action: <strong>Navigate to Next Pipeline Stage</strong>
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                Easing: cubic-bezier(0.16, 1, 0.3, 1) · 200ms
              </p>
            </div>

            <button
              onClick={onEnterPrototype}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Launch Live Prototype on This Frame
            </button>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {selectedFrame.id === 'frame-governor' ? 'Solidity Smart Contract' : selectedFrame.id === 'frame-surveyor' ? 'PostGIS Query' : 'React + Tailwind'}
              </span>
              <button
                onClick={handleCopyCode}
                className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <pre className="bg-[#1e1e1e] p-3 rounded-lg border border-[#3c3c3c] font-mono text-[10px] text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
              {getSoliditySnippet()}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
