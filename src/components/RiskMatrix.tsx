import React, { useMemo } from 'react';
import { CableAsset } from '../types';
import { 
  Grid3X3, 
  RefreshCw, 
  HelpCircle,
  AlertTriangle 
} from 'lucide-react';

interface RiskMatrixProps {
  assets: CableAsset[];
  selectedLikelihood: 'Low' | 'Medium' | 'High' | null;
  selectedConsequence: 'Minor' | 'Moderate' | 'Major' | null;
  onSelectCell: (
    likelihood: 'Low' | 'Medium' | 'High' | null, 
    consequence: 'Minor' | 'Moderate' | 'Major' | null
  ) => void;
}

export default function RiskMatrix({ 
  assets, 
  selectedLikelihood, 
  selectedConsequence, 
  onSelectCell 
}: RiskMatrixProps) {

  // Categorize Likelihood & Consequence for each asset
  const categorizedAssets = useMemo(() => {
    return assets.map(asset => {
      // Likelihood based on health score
      let likelihood: 'Low' | 'Medium' | 'High' = 'Low';
      if (asset.healthScore < 50) likelihood = 'High';
      else if (asset.healthScore < 75) likelihood = 'Medium';

      // Consequence based on Voltage Level
      let consequence: 'Minor' | 'Moderate' | 'Major' = 'Moderate';
      const volt = parseFloat(asset.voltageLevel);
      if (!isNaN(volt)) {
        if (volt >= 115) consequence = 'Major'; // High voltage transmission
        else if (volt <= 24) consequence = 'Minor';  // Low voltage distribution
      }

      return {
        ...asset,
        likelihood,
        consequence
      };
    });
  }, [assets]);

  // Compute cell counts
  const cellData = useMemo(() => {
    const grid = {
      High: { Minor: 0, Moderate: 0, Major: 0 },
      Medium: { Minor: 0, Moderate: 0, Major: 0 },
      Low: { Minor: 0, Moderate: 0, Major: 0 }
    };

    categorizedAssets.forEach(a => {
      grid[a.likelihood][a.consequence]++;
    });

    return grid;
  }, [categorizedAssets]);

  // Handler for cell clicks
  const handleCellClick = (likelihood: 'Low' | 'Medium' | 'High', consequence: 'Minor' | 'Moderate' | 'Major') => {
    if (selectedLikelihood === likelihood && selectedConsequence === consequence) {
      // Toggle off if clicking the already selected cell
      onSelectCell(null, null);
    } else {
      onSelectCell(likelihood, consequence);
    }
  };

  const handleClear = () => {
    onSelectCell(null, null);
  };

  // Get color for matrix cells based on standard risk heat levels (3x3 grid)
  const getCellBgClass = (
    likelihood: 'Low' | 'Medium' | 'High', 
    consequence: 'Minor' | 'Moderate' | 'Major',
    isSelected: boolean
  ) => {
    // Risk matrix standard zones:
    // Low-Minor, Low-Mod, Med-Minor = Low (Green)
    // High-Minor, Med-Mod, Low-Major = Medium (Yellow/Orange)
    // High-Mod, Med-Major, High-Major = Critical (Red)

    let colorStyle = "";

    if (likelihood === 'High' && consequence === 'Major') {
      colorStyle = isSelected ? 'bg-red-600 text-white ring-4 ring-red-400' : 'bg-red-500 text-white hover:bg-red-600';
    } else if (
      (likelihood === 'High' && consequence === 'Moderate') || 
      (likelihood === 'Medium' && consequence === 'Major')
    ) {
      colorStyle = isSelected ? 'bg-orange-500 text-white ring-4 ring-orange-300' : 'bg-orange-100 text-orange-900 border border-orange-200 hover:bg-orange-200';
    } else if (
      (likelihood === 'High' && consequence === 'Minor') || 
      (likelihood === 'Medium' && consequence === 'Moderate') || 
      (likelihood === 'Low' && consequence === 'Major')
    ) {
      colorStyle = isSelected ? 'bg-yellow-500 text-yellow-950 ring-4 ring-yellow-300' : 'bg-yellow-100 text-yellow-900 border border-yellow-200 hover:bg-yellow-200';
    } else {
      // Low risk zones (Low-Minor, Low-Moderate, Medium-Minor)
      colorStyle = isSelected ? 'bg-emerald-600 text-white ring-4 ring-emerald-300' : 'bg-emerald-50 text-emerald-900 border border-emerald-100 hover:bg-emerald-100';
    }

    return `h-16 flex flex-col items-center justify-center rounded-xl transition-all duration-200 cursor-pointer text-center relative ${colorStyle}`;
  };

  const totalFilteredCount = useMemo(() => {
    if (!selectedLikelihood || !selectedConsequence) return assets.length;
    return categorizedAssets.filter(a => a.likelihood === selectedLikelihood && a.consequence === selectedConsequence).length;
  }, [categorizedAssets, selectedLikelihood, selectedConsequence, assets.length]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-full" id="risk-matrix-panel">
      {/* Title */}
      <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
            Suggestion 1
          </span>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mt-1 flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-purple-700" />
            Asset Failure Risk Matrix (3x3)
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Cross-references likelihood of degradation with voltage operational criticality.
          </p>
        </div>
        {(selectedLikelihood || selectedConsequence) && (
          <button
            onClick={handleClear}
            className="text-[10px] bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 animate-spin-slow" />
            Clear
          </button>
        )}
      </div>

      {/* Grid Layout */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-12 gap-2">
          
          {/* Y Axis Label (Likelihood) */}
          <div className="col-span-1 flex flex-col justify-between py-8 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest text-center h-full min-h-[220px]">
            <span className="rotate-275 inline-block shrink-0">High</span>
            <span className="rotate-275 inline-block shrink-0">Med</span>
            <span className="rotate-275 inline-block shrink-0">Low</span>
          </div>

          {/* Core Risk Matrix Blocks */}
          <div className="col-span-11 grid grid-cols-3 gap-2 text-xs font-bold select-none">
            
            {/* Row 1: High Likelihood */}
            {getCellBgClass('High', 'Minor', selectedLikelihood === 'High' && selectedConsequence === 'Minor') && (
              <div 
                onClick={() => handleCellClick('High', 'Minor')}
                className={getCellBgClass('High', 'Minor', selectedLikelihood === 'High' && selectedConsequence === 'Minor')}
              >
                <span className="text-lg font-black">{cellData.High.Minor}</span>
                <span className="text-[9px] font-semibold opacity-75">High-Minor</span>
              </div>
            )}
            <div 
              onClick={() => handleCellClick('High', 'Moderate')}
              className={getCellBgClass('High', 'Moderate', selectedLikelihood === 'High' && selectedConsequence === 'Moderate')}
            >
              <span className="text-lg font-black">{cellData.High.Moderate}</span>
              <span className="text-[9px] font-semibold opacity-75">High-Mod</span>
            </div>
            <div 
              onClick={() => handleCellClick('High', 'Major')}
              className={getCellBgClass('High', 'Major', selectedLikelihood === 'High' && selectedConsequence === 'Major')}
            >
              <span className="text-lg font-black">{cellData.High.Major}</span>
              <span className="text-[9px] font-semibold opacity-75">High-Major</span>
              {cellData.High.Major > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </div>

            {/* Row 2: Medium Likelihood */}
            <div 
              onClick={() => handleCellClick('Medium', 'Minor')}
              className={getCellBgClass('Medium', 'Minor', selectedLikelihood === 'Medium' && selectedConsequence === 'Minor')}
            >
              <span className="text-lg font-black">{cellData.Medium.Minor}</span>
              <span className="text-[9px] font-semibold opacity-75">Med-Minor</span>
            </div>
            <div 
              onClick={() => handleCellClick('Medium', 'Moderate')}
              className={getCellBgClass('Medium', 'Moderate', selectedLikelihood === 'Medium' && selectedConsequence === 'Moderate')}
            >
              <span className="text-lg font-black">{cellData.Medium.Moderate}</span>
              <span className="text-[9px] font-semibold opacity-75">Med-Mod</span>
            </div>
            <div 
              onClick={() => handleCellClick('Medium', 'Major')}
              className={getCellBgClass('Medium', 'Major', selectedLikelihood === 'Medium' && selectedConsequence === 'Major')}
            >
              <span className="text-lg font-black">{cellData.Medium.Major}</span>
              <span className="text-[9px] font-semibold opacity-75">Med-Major</span>
            </div>

            {/* Row 3: Low Likelihood */}
            <div 
              onClick={() => handleCellClick('Low', 'Minor')}
              className={getCellBgClass('Low', 'Minor', selectedLikelihood === 'Low' && selectedConsequence === 'Minor')}
            >
              <span className="text-lg font-black">{cellData.Low.Minor}</span>
              <span className="text-[9px] font-semibold opacity-75">Low-Minor</span>
            </div>
            <div 
              onClick={() => handleCellClick('Low', 'Moderate')}
              className={getCellBgClass('Low', 'Moderate', selectedLikelihood === 'Low' && selectedConsequence === 'Moderate')}
            >
              <span className="text-lg font-black">{cellData.Low.Moderate}</span>
              <span className="text-[9px] font-semibold opacity-75">Low-Mod</span>
            </div>
            <div 
              onClick={() => handleCellClick('Low', 'Major')}
              className={getCellBgClass('Low', 'Major', selectedLikelihood === 'Low' && selectedConsequence === 'Major')}
            >
              <span className="text-lg font-black">{cellData.Low.Major}</span>
              <span className="text-[9px] font-semibold opacity-75">Low-Major</span>
            </div>

          </div>

          {/* Empty Space bottom left */}
          <div className="col-span-1"></div>
          {/* X Axis Labels (Consequence) */}
          <div className="col-span-11 grid grid-cols-3 gap-2 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mt-1">
            <span>Minor</span>
            <span>Moderate</span>
            <span>Major</span>
          </div>

        </div>
      </div>

      {/* Footer Info Card with Selected status */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        {selectedLikelihood && selectedConsequence ? (
          <div className="flex items-center gap-2 bg-purple-50/70 border border-purple-100 rounded-lg p-2 w-full">
            <AlertTriangle className="w-4 h-4 text-purple-700 shrink-0" />
            <span className="text-[10px] text-purple-950 font-bold leading-tight">
              Active Filter: <strong className="text-purple-700">{selectedLikelihood} Likelihood + {selectedConsequence} Consequence</strong> ({totalFilteredCount} matching assets)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Interactive Grid: Click cells to isolate assets by risk density.</span>
          </div>
        )}
      </div>
    </div>
  );
}
