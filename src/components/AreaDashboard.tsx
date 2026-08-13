import { useState, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  CableAsset, 
  DashboardFilters, 
  EquipmentType, 
  HealthStatus 
} from '../types';
import { 
  PEA_AREA_NAMES, 
  PEA_AREA_CITIES, 
  PEA_AREAS,
  EQUIPMENT_TYPES, 
  COUNTRIES_OF_ORIGIN, 
  MANUFACTURERS, 
  VOLTAGE_LEVELS 
} from '../utils/peaData';
import MapChart from './MapChart';
import RiskMatrix from './RiskMatrix';
import TelemetryAlerts from './TelemetryAlerts';
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  Layers, 
  MapPin, 
  Sliders, 
  Search, 
  RefreshCw, 
  Zap, 
  Wrench,
  TrendingUp,
  FileText,
  ExternalLink,
  X,
  QrCode
} from 'lucide-react';
import { exportAssetToPDF } from '../utils/pdfGenerator';

interface AreaDashboardProps {
  assets: CableAsset[];
  userArea: string; // The selected area of interest of the logged in user
  userEmail: string;
  isAdmin: boolean;
  onRefresh: () => void;
}

export default function AreaDashboard({ assets, userArea, userEmail, isAdmin, onRefresh }: AreaDashboardProps) {
  // Filters State
  const [filters, setFilters] = useState<Omit<DashboardFilters, 'area'>>({
    city: 'All',
    voltageLevel: 'All',
    equipmentType: 'All',
    ageRange: 'All',
    countryOfOrigin: 'All',
    manufacturer: 'All',
    assetOrPeaNumber: ''
  });

  const [displayedArea, setDisplayedArea] = useState<string>(userArea);

  // Risk matrix selection states (Suggestion 1)
  const [selectedLikelihood, setSelectedLikelihood] = useState<'Low' | 'Medium' | 'High' | null>(null);
  const [selectedConsequence, setSelectedConsequence] = useState<'Minor' | 'Moderate' | 'Major' | null>(null);

  // Auto-refresh data every 5 minutes
  useEffect(() => {
    const interval = setInterval(onRefresh, 300000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  // Selected Asset for modal detail
  const [selectedAsset, setSelectedAsset] = useState<CableAsset | null>(null);

  // AI Guidance State
  const [aiGuidanceContent, setAiGuidanceContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Available cities in user's selected area
  const areaCities = useMemo(() => {
    return PEA_AREA_CITIES[displayedArea === 'ALL' ? 'N1' : displayedArea] || [];
  }, [displayedArea]);

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      city: 'All',
      voltageLevel: 'All',
      equipmentType: 'All',
      ageRange: 'All',
      countryOfOrigin: 'All',
      manufacturer: 'All',
      assetOrPeaNumber: ''
    });
    setSelectedLikelihood(null);
    setSelectedConsequence(null);
  };

  // Deduplicate assets to only keep the latest entry per equipmentId
  const uniqueAssets = useMemo(() => {
    const latestMap = new Map<string, CableAsset>();
    assets.forEach(asset => {
      if (!asset.equipmentId) return;
      const existing = latestMap.get(asset.equipmentId);
      // Keep the one with the highest running number or latest timestamp
      if (!existing || (Number(asset.number) || 0) > (Number(existing.number) || 0)) {
        latestMap.set(asset.equipmentId, asset);
      }
    });
    return Array.from(latestMap.values());
  }, [assets]);

  // Filter Assets specifically for user's selected area first
  const areaAssets = useMemo(() => {
    return uniqueAssets.filter(asset => {
      const areaCode = asset.equipmentId.split('-')[0];
      if (displayedArea === 'ALL') return true;
      return areaCode === displayedArea;
    });
  }, [uniqueAssets, displayedArea]);

  // Filter regional assets by localized filter inputs & risk matrix selections
  const filteredAssets = useMemo(() => {
    return areaAssets.filter(asset => {
      // City Filter
      if (filters.city !== 'All' && asset.city !== filters.city) return false;
      // Voltage Level Filter
      if (filters.voltageLevel !== 'All' && asset.voltageLevel !== filters.voltageLevel) return false;
      // Equipment Type Filter
      if (filters.equipmentType !== 'All' && asset.equipmentType !== filters.equipmentType) return false;
      // Age Filter
      const currentYear = new Date().getFullYear();
      const age = currentYear - asset.yearOfRegistration;
      if (filters.ageRange !== 'All') {
        if (filters.ageRange === '0-5' && (age < 0 || age > 5)) return false;
        if (filters.ageRange === '5-15' && (age <= 5 || age > 15)) return false;
        if (filters.ageRange === '15-25' && (age <= 15 || age > 25)) return false;
        if (filters.ageRange === '25+' && age <= 25) return false;
      }
      // Country of Origin Filter
      if (filters.countryOfOrigin !== 'All' && asset.country !== filters.countryOfOrigin) return false;
      // Product Manufacturer Filter
      if (filters.manufacturer !== 'All' && asset.manufacturer !== filters.manufacturer) return false;
      // Search
      if (filters.assetOrPeaNumber.trim() !== '') {
        const query = filters.assetOrPeaNumber.toLowerCase();
        const matchesAsset = asset.assetNumber.toLowerCase().includes(query);
        const matchesPea = asset.peaNumber.toLowerCase().includes(query);
        const matchesId = asset.equipmentId.toLowerCase().includes(query);
        if (!matchesAsset && !matchesPea && !matchesId) return false;
      }

      // Risk matrix filtering (Suggestion 1)
      if (selectedLikelihood || selectedConsequence) {
        let likelihood: 'Low' | 'Medium' | 'High' = 'Low';
        if (asset.healthScore < 50) likelihood = 'High';
        else if (asset.healthScore < 75) likelihood = 'Medium';

        let consequence: 'Minor' | 'Moderate' | 'Major' = 'Moderate';
        const volt = parseFloat(asset.voltageLevel);
        if (!isNaN(volt)) {
          if (volt >= 115) consequence = 'Major';
          else if (volt <= 24) consequence = 'Minor';
        }

        if (selectedLikelihood && likelihood !== selectedLikelihood) return false;
        if (selectedConsequence && consequence !== selectedConsequence) return false;
      }

      return true;
    });
  }, [areaAssets, filters, selectedLikelihood, selectedConsequence]);

  // Regional metrics calculation
  const metrics = useMemo(() => {
    const total = filteredAssets.length;
    if (total === 0) {
      return { total: 0, criticalCount: 0, avgHealth: 100 };
    }
    let critical = 0, scoreSum = 0;
    filteredAssets.forEach(a => {
      scoreSum += a.healthScore;
      if (a.healthStatus === 'Red' || a.healthStatus === 'Orange') {
        critical++;
      }
    });
    return {
      total,
      criticalCount: critical,
      avgHealth: Math.round(scoreSum / total)
    };
  }, [filteredAssets]);

  // Total amount of equipment by type (regional)
  const equipmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    EQUIPMENT_TYPES.forEach(t => { counts[t] = 0; });
    filteredAssets.forEach(a => {
      if (counts[a.equipmentType] !== undefined) {
        counts[a.equipmentType]++;
      }
    });
    return counts;
  }, [filteredAssets]);

  // Age distribution ranges (regional)
  const ageDistribution = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const bands = { '0-5 Yrs': 0, '5-15 Yrs': 0, '15-25 Yrs': 0, '25+ Yrs': 0 };
    filteredAssets.forEach(a => {
      const age = currentYear - a.yearOfRegistration;
      if (age <= 5) bands['0-5 Yrs']++;
      else if (age <= 15) bands['5-15 Yrs']++;
      else if (age <= 25) bands['15-25 Yrs']++;
      else bands['25+ Yrs']++;
    });
    return bands;
  }, [filteredAssets]);

  // Grab top 10 critical assets in this specific region to feed the AI guidance
  const criticalAssetsForAI = useMemo(() => {
    return filteredAssets
      .filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange')
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 10);
  }, [filteredAssets]);

  // Fetch AI guidance for top 10 critical assets
  const handleFetchGuidance = async () => {
    setAiLoading(true);
    try {
      const cleanAssets = criticalAssetsForAI.map(a => ({
        equipmentId: a.equipmentId || '',
        equipmentType: a.equipmentType || '',
        voltageLevel: a.voltageLevel || '',
        substationName: a.substationName || '',
        city: a.city || '',
        yearOfRegistration: a.yearOfRegistration || 2020,
        healthScore: typeof a.healthScore === 'number' ? a.healthScore : 100,
        healthStatus: a.healthStatus || 'Green',
        surfaceTemperature: a.surfaceTemperature ?? 35,
        externalDischarge: a.externalDischarge ?? 0,
        insulationResistance: a.insulationResistance ?? 15,
        sheathCurrent: a.sheathCurrent ?? 0,
        loadCurrent: a.loadCurrent ?? 0,
        tanDeltaValue: a.tanDeltaValue ?? 0,
        oilDielectricKV: a.oilDielectricKV ?? 0,
        mainDefectReason: a.mainDefectReason || '',
        peaNumber: a.peaNumber || ''
      }));

      const res = await fetch('/api/ai-guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          assets: cleanAssets,
          area: `${userArea} (${PEA_AREA_NAMES[userArea]})`
        })
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          const text = await res.text();
          if (text) errMsg = text;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      setAiGuidanceContent(data.guidance || '');
    } catch (err: any) {
      alert(`AI Advisory Error: ${err.message || 'Cannot retrieve guidance details'}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Trigger guidance load when critical assets or selected region changes
  useEffect(() => {
    if (criticalAssetsForAI.length > 0) {
      handleFetchGuidance();
    } else {
      setAiGuidanceContent(null);
    }
  }, [userArea, criticalAssetsForAI.length]);

  return (
    <div className="space-y-6" id="area-panel-root">
      {/* Upper Area Banner Info */}
      <div className="bg-purple-900 rounded-2xl border border-purple-900 shadow-sm p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest bg-purple-800 text-purple-200 px-2.5 py-1 rounded-md">
            Active Regional Account Scope
          </span>
          <h2 className="text-xl font-bold mt-1">{PEA_AREA_NAMES[userArea] || `District ${userArea}`}</h2>
          <p className="text-xs text-purple-200 mt-1">Logged in as {userEmail} | Visualizing only related area data as configured.</p>
        </div>
        <div className="flex gap-4">
          {isAdmin && (
            <div className="bg-purple-800/60 rounded-xl py-2 px-4 border border-purple-700/50 flex flex-col">
              <label className="text-[10px] text-purple-200 block font-bold uppercase">Area Filter</label>
              <select
                value={displayedArea}
                onChange={e => setDisplayedArea(e.target.value)}
                className="bg-purple-900 text-white text-xs font-bold rounded-lg border-none p-1"
              >
                <option value="ALL">ALL AREAS</option>
                {PEA_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div className="bg-purple-800/60 rounded-xl py-2 px-4 border border-purple-700/50">
            <span className="text-[10px] text-purple-200 block font-bold uppercase">Area Assets</span>
            <span className="text-xl font-black">{areaAssets.length}</span>
          </div>
          <div className="bg-purple-800/60 rounded-xl py-2 px-4 border border-purple-700/50">
            <span className="text-[10px] text-purple-200 block font-bold uppercase">Total Critical</span>
            <span className="text-xl font-black text-rose-300">
              {areaAssets.filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange').length}
            </span>
          </div>
        </div>
      </div>

      {/* Regional Filters Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5" id="area-filters-card">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-700" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Localized Area Filters</h3>
          </div>
          <button 
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-xs text-purple-700 hover:text-purple-900 font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset localized filters
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* City */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">PEA City / Province</label>
            <select
              value={filters.city}
              onChange={e => setFilters(prev => ({ ...prev, city: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Cities</option>
              {areaCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* Voltage */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Voltage Level</label>
            <select
              value={filters.voltageLevel}
              onChange={e => setFilters(prev => ({ ...prev, voltageLevel: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Voltages</option>
              {VOLTAGE_LEVELS.map(v => (
                <option key={v} value={v}>{v} kV</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Equipment Type</label>
            <select
              value={filters.equipmentType}
              onChange={e => setFilters(prev => ({ ...prev, equipmentType: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Types</option>
              {EQUIPMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Age Range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Age Range</label>
            <select
              value={filters.ageRange}
              onChange={e => setFilters(prev => ({ ...prev, ageRange: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Ages</option>
              <option value="0-5">0 - 5 Years</option>
              <option value="5-15">5 - 15 Years</option>
              <option value="15-25">15 - 25 Years</option>
              <option value="25+">25+ Years</option>
            </select>
          </div>

          {/* Brand */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Brand Manufacturer</label>
            <select
              value={filters.manufacturer}
              onChange={e => setFilters(prev => ({ ...prev, manufacturer: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Brands</option>
              {MANUFACTURERS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Search Asset Code */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Search Code / ID</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={filters.assetOrPeaNumber}
                onChange={e => setFilters(prev => ({ ...prev, assetOrPeaNumber: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 pl-8 pr-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Localized KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total scoped assets */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Area Scoped Assets</span>
            <span className="text-2xl font-bold text-gray-900">{metrics.total}</span>
            <span className="text-[10px] text-gray-400 block font-medium mt-0.5">Filtered assets in area</span>
          </div>
        </div>

        {/* Localized Critical assets */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Critical Regional Assets</span>
            <span className="text-2xl font-bold text-red-600">{metrics.criticalCount}</span>
            <span className="text-[10px] text-red-500 font-semibold block mt-0.5">Red & Orange condition level</span>
          </div>
        </div>

        {/* Localized average health */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Area Average Health</span>
            <span className="text-2xl font-bold text-emerald-600">{metrics.avgHealth}%</span>
            <span className="text-[10px] text-emerald-500 block font-medium mt-0.5">Composite area integrity index</span>
          </div>
        </div>
      </div>

      {/* Dynamic Grid: Suggestion 1 (Risk Matrix) and Suggestion 2 (Telemetry Alerts Feed) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="analytical-suggestions-grid">
        <RiskMatrix 
          assets={areaAssets} 
          selectedLikelihood={selectedLikelihood}
          selectedConsequence={selectedConsequence}
          onSelectCell={(like, cons) => {
            setSelectedLikelihood(like);
            setSelectedConsequence(cons);
          }}
        />
        <TelemetryAlerts 
          assets={areaAssets} 
          onSelectAsset={setSelectedAsset}
        />
      </div>

      {/* Leaflet map of scoped assets */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col gap-3">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-700" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Regional Assets Location Map</h3>
          </div>
          <span className="text-[10px] text-purple-700 font-bold uppercase block">
            Plotting {filteredAssets.length} scoped assets in {userArea}
          </span>
        </div>
        <div className="h-[400px]">
          <MapChart assets={filteredAssets} onSelectAsset={setSelectedAsset} />
        </div>
      </div>

      {/* Telemetry Charts: Online PD amplitude and Tan Delta amplitude */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="telemetry-charts-section">
        {/* Chart 1: Online PD Amplitude */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[340px]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Discharge Severity Profile</span>
              <h4 className="text-sm font-bold text-gray-900 uppercase">Online PD Amplitude (pC)</h4>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-700 font-extrabold px-2.5 py-1 rounded-md uppercase">
              Micro-Discharge Pulse
            </span>
          </div>
          <div className="flex-1 flex flex-col justify-end gap-3 min-h-0">
            {/* Draw beautiful custom bar graphs for the top 5 assets by PD amplitude */}
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {filteredAssets
                .filter(a => (a.onlinePdAmplitude !== undefined && a.onlinePdAmplitude > 0) || (a.externalDischarge !== undefined && a.externalDischarge > 0))
                .sort((a, b) => (b.onlinePdAmplitude || b.externalDischarge || 0) - (a.onlinePdAmplitude || a.externalDischarge || 0))
                .slice(0, 5)
                .map(a => {
                  const val = a.onlinePdAmplitude || a.externalDischarge || 0;
                  const maxVal = Math.max(...filteredAssets.map(x => x.onlinePdAmplitude || x.externalDischarge || 0), 100);
                  const percent = Math.min(100, Math.round((val / maxVal) * 100));
                  let barColor = 'bg-emerald-500';
                  let textColor = 'text-emerald-700 bg-emerald-50';
                  if (val > 100) {
                    barColor = 'bg-rose-500';
                    textColor = 'text-rose-700 bg-rose-50';
                  } else if (val > 20) {
                    barColor = 'bg-amber-500';
                    textColor = 'text-amber-700 bg-amber-50';
                  }
                  return (
                    <div key={a.equipmentId} className="flex items-center gap-4">
                      <div className="w-[140px] shrink-0">
                        <span className="text-xs font-bold text-gray-800 block truncate">{a.equipmentType}</span>
                        <span className="text-[10px] font-mono text-gray-400 block truncate">{a.equipmentId}</span>
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                      <div className="w-[75px] text-right shrink-0">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-sm ${textColor}`}>
                          {val} pC
                        </span>
                      </div>
                    </div>
                  );
                })}
              {filteredAssets.filter(a => (a.onlinePdAmplitude || a.externalDischarge || 0) > 0).length === 0 && (
                <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                  No active discharge telemetry recorded in this region
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chart 2: Tan Delta Amplitude */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[340px]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Dielectric Integrity Profile</span>
              <h4 className="text-sm font-bold text-gray-900 uppercase">Tan Delta Loss Factor (%)</h4>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-700 font-extrabold px-2.5 py-1 rounded-md uppercase">
              Tan δ Loss Angle
            </span>
          </div>
          <div className="flex-1 flex flex-col justify-end gap-3 min-h-0">
            {/* Draw beautiful custom bar graphs for the top 5 assets by Tan Delta amplitude */}
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {filteredAssets
                .filter(a => a.tanDeltaAmplitude !== undefined && a.tanDeltaAmplitude > 0)
                .sort((a, b) => (b.tanDeltaAmplitude || 0) - (a.tanDeltaAmplitude || 0))
                .slice(0, 5)
                .map(a => {
                  const val = a.tanDeltaAmplitude || 0;
                  const maxVal = Math.max(...filteredAssets.map(x => x.tanDeltaAmplitude || 0), 1.0);
                  const percent = Math.min(100, Math.round((val / maxVal) * 100));
                  let barColor = 'bg-emerald-500';
                  let textColor = 'text-emerald-700 bg-emerald-50';
                  if (val > 1.0) {
                    barColor = 'bg-rose-500';
                    textColor = 'text-rose-700 bg-rose-50';
                  } else if (val > 0.3) {
                    barColor = 'bg-amber-500';
                    textColor = 'text-amber-700 bg-amber-50';
                  }
                  return (
                    <div key={a.equipmentId} className="flex items-center gap-4">
                      <div className="w-[140px] shrink-0">
                        <span className="text-xs font-bold text-gray-800 block truncate">{a.equipmentType}</span>
                        <span className="text-[10px] font-mono text-gray-400 block truncate">{a.equipmentId}</span>
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                      <div className="w-[75px] text-right shrink-0">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-sm ${textColor}`}>
                          {val.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              {filteredAssets.filter(a => (a.tanDeltaAmplitude || 0) > 0).length === 0 && (
                <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                  No active dielectric loss factor telemetry recorded in this region
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Charts & AI Advisory guidance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: localized Charts */}
        <div className="lg:col-span-1 space-y-6">
          {/* Chart 1: Scoped Equipment types */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[280px]">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Asset Density</span>
            <h4 className="text-xs font-bold text-gray-900 mb-4 uppercase">Equipment Scopes in {userArea}</h4>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
              {Object.entries(equipmentCounts).map(([type, count]) => {
                const max = Math.max(...(Object.values(equipmentCounts) as number[]), 1);
                const countVal = count as number;
                const percent = Math.round((countVal / max) * 100);
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-gray-700">
                      <span>{type}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-purple-700 h-full rounded-full transition-all" 
                        style={{ width: `${percent}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 2: localized Age profile */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[250px]">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Asset Age Profile</span>
            <h4 className="text-xs font-bold text-gray-900 mb-4 uppercase">Area Age Distribution</h4>
            <div className="flex-1 flex items-end justify-between gap-3 pt-2">
              {Object.entries(ageDistribution).map(([band, val]) => {
                const total = Math.max(...(Object.values(ageDistribution) as number[]), 1);
                const valNum = val as number;
                const pct = (valNum / total) * 75;
                return (
                  <div key={band} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-xs font-extrabold text-gray-900">{val}</span>
                    <div 
                      className="w-full bg-purple-100 hover:bg-purple-300 rounded-t-md transition-all"
                      style={{ height: `${pct || 4}px` }}
                    />
                    <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{band}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Col: AI Advisory Guidance */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[554px]">
          <div className="border-b border-gray-100 pb-3 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-purple-700" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">AI Guidance & Field Advisory</h3>
            </div>
            <p className="text-[11px] text-gray-400">Localized preventative directives and troubleshooting for critical assets inside {userArea}</p>
          </div>

          {criticalAssetsForAI.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-2" />
              <span className="text-xs font-semibold text-gray-800">Regional Integrity Normal</span>
              <p className="text-[10px] text-gray-400 max-w-[260px] mt-1">No critical assets found in your area. Regular standard operating procedures are sufficient.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 space-y-4">
              {aiLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs">
                  <RefreshCw className="w-8 h-8 animate-spin text-purple-700 mb-2" />
                  <span>Consulting PEA AI Guidance Assistant...</span>
                </div>
              ) : aiGuidanceContent ? (
                <div className="flex-1 overflow-y-auto bg-gray-50/70 border border-gray-100 rounded-xl p-4 text-xs text-gray-700 space-y-3 leading-relaxed">
                  <div 
                    className="prose prose-sm text-[11px] max-w-none text-gray-800"
                    dangerouslySetInnerHTML={{ 
                      __html: aiGuidanceContent
                        .replace(/\n/g, '<br/>')
                        .replace(/###\s*(.*)/g, '<h4 class="font-bold text-xs text-purple-950 mt-3">$1</h4>')
                        .replace(/##\s*(.*)/g, '<h3 class="font-bold text-sm text-purple-900 border-b border-purple-100 pb-1 mt-4">$1</h3>')
                        .replace(/#\s*(.*)/g, '<h2 class="font-black text-sm text-purple-950 mt-2 border-b border-purple-200 pb-1.5">$1</h2>')
                    }}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <button
                    onClick={handleFetchGuidance}
                    className="bg-purple-700 hover:bg-purple-900 text-white rounded-lg py-2 px-5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Load AI Guidance & Advisory Checklist
                  </button>
                </div>
              )}

              {/* List of Scoped Critical items */}
              <div className="border-t border-gray-100 pt-3 flex flex-col gap-1">
                <span className="text-[9px] font-bold text-gray-400 uppercase">Top 5 Critical Assets Queue</span>
                <div className="flex gap-2 overflow-x-auto pb-1.5">
                  {criticalAssetsForAI.slice(0, 5).map((a, idx) => (
                    <div 
                      key={`${a.equipmentId}-${idx}`} 
                      onClick={() => setSelectedAsset(a)}
                      className="bg-red-50/50 hover:bg-red-50 border border-red-100 rounded-lg p-2 cursor-pointer text-[10px] shrink-0 w-[140px] transition-all"
                    >
                      <span className="font-bold text-red-700 truncate block">{a.equipmentType}</span>
                      <span className="font-mono text-gray-500 block truncate">{a.equipmentId.substring(a.equipmentId.lastIndexOf('-') + 1)}</span>
                      <span className="font-black text-red-600 block mt-1">Health: {a.healthScore}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Asset Full Inspection Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]" id="area-inspect-modal">
          <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-purple-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black tracking-widest uppercase bg-purple-800 text-purple-200 px-2 py-0.5 rounded-md">
                  {selectedAsset.equipmentType} Registry Card
                </span>
                <h3 className="text-sm font-bold font-mono mt-0.5">{selectedAsset.equipmentId}</h3>
              </div>
              <button 
                onClick={() => setSelectedAsset(null)}
                className="text-white hover:bg-purple-800 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Top Row: Health and General Meta */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 flex flex-col justify-center items-center text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Operational Health Index</span>
                  <span className="text-4xl font-black text-purple-800 mt-1">{selectedAsset.healthScore}%</span>
                  <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-sm mt-2 ${
                    selectedAsset.healthStatus === 'Red' ? 'bg-red-50 text-red-700 border border-red-100' :
                    selectedAsset.healthStatus === 'Orange' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                    selectedAsset.healthStatus === 'Yellow' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  }`}>
                    {selectedAsset.healthStatus}
                  </span>
                </div>

                <div className="md:col-span-2 bg-gray-50 border border-gray-100 rounded-xl p-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400 font-medium block">PEA Area District</span>
                    <span className="font-bold text-gray-800">
                      {selectedAsset.equipmentId ? selectedAsset.equipmentId.split('-')[0] : 'N/A'} - {PEA_AREA_NAMES[selectedAsset.equipmentId?.split('-')?.[0] || ''] || 'PEA Region'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-medium block">Substation/Location</span>
                    <span className="font-bold text-gray-800">{selectedAsset.substationName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-medium block">City / Province</span>
                    <span className="font-bold text-gray-800">{selectedAsset.city || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-medium block">Voltage Level</span>
                    <span className="font-bold text-gray-800">{selectedAsset.voltageLevel || '22'} kV</span>
                  </div>
                </div>
              </div>

              {/* Specs & Engineering Parameters Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* General Information */}
                <div>
                  <h4 className="text-xs font-bold text-purple-900 uppercase border-b border-gray-100 pb-1.5 mb-2.5">General Registry Details</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Equipment Number ADS:</span><span className="font-mono font-bold text-gray-800">{selectedAsset.assetNumber || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">PEA Grid Number:</span><span className="font-mono font-bold text-gray-800">{selectedAsset.peaNumber || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Brand Manufacturer:</span><span className="font-bold text-gray-800">{selectedAsset.manufacturer || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Country of Origin:</span><span className="font-bold text-gray-800">{selectedAsset.country || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Installation Year:</span><span className="font-bold text-gray-800">{selectedAsset.yearOfRegistration || '2026'} (Age: {new Date().getFullYear() - (selectedAsset.yearOfRegistration || new Date().getFullYear())} Yrs)</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Asset Valuation:</span><span className="font-bold text-emerald-700 font-mono">{selectedAsset.assetValue || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">GPS Location:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-800">{selectedAsset.gps?.lat ?? 13.7563}, {selectedAsset.gps?.lng ?? 100.5018}</span>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${selectedAsset.gps?.lat ?? 13.7563},${selectedAsset.gps?.lng ?? 100.5018}`} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:text-purple-900">
                          <MapPin className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Engineering Document QR Code (Column AH) */}
                  <div className="mt-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-amber-500 text-white rounded-md shadow-2xs">
                          <QrCode className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h5 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                            QR Document (Col AH)
                          </h5>
                          <p className="text-[9px] text-amber-800 font-medium">
                            As-built drawings, catalog & type test cloud link
                          </p>
                        </div>
                      </div>
                      {selectedAsset.qrDocument && (
                        <a
                          href={selectedAsset.qrDocument}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1 transition-all shadow-2xs cursor-pointer shrink-0"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span>Open</span>
                        </a>
                      )}
                    </div>

                    {selectedAsset.qrDocument ? (
                      <div className="flex items-center gap-2.5 bg-white/90 p-2 rounded-lg border border-amber-100">
                        <div className="p-1 bg-white rounded-md border border-amber-200 shadow-2xs shrink-0">
                          <QRCodeSVG value={selectedAsset.qrDocument} size={65} level="M" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="text-[10px] font-bold text-gray-800 font-mono truncate">
                            {selectedAsset.qrDocument}
                          </div>
                          <p className="text-[9px] text-gray-500 leading-tight">
                            Scan with camera to view equipment catalogue and drawings.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-800 italic bg-white/60 p-1.5 rounded-lg border border-amber-100 text-center">
                        No cloud engineering document URL in Column AH.
                      </div>
                    )}
                  </div>
                </div>

                {/* Engineering Information */}
                <div>
                  <h4 className="text-xs font-bold text-purple-900 uppercase border-b border-gray-100 pb-1.5 mb-2.5">Engineering Parameters Log</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Load Current (Amps):</span><span className="font-bold text-gray-800">{selectedAsset.loadCurrent ?? 'No Log'} A</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Sheath Current (Amps):</span><span className="font-bold text-gray-800">{selectedAsset.sheathCurrent ?? 'No Log'} A</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Surface Temp (Celsius):</span><span className="font-bold text-gray-800">{selectedAsset.surfaceTemperature ?? 'No Log'} °C</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Partial Discharge (pC):</span><span className="font-bold text-gray-800">{selectedAsset.externalDischarge ?? 'No Log'} pC</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Online PD Result:</span><span className="font-bold text-gray-800">{selectedAsset.pdResult ?? 'No Log'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Insulation Resistance:</span><span className="font-bold text-gray-800">{selectedAsset.insulationResistance ?? 'No Log'} GOhm</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Tan Delta Analysis:</span><span className="font-bold text-gray-800">{selectedAsset.tanDelta ?? 'No Log'}</span></div>
                  </div>
                </div>
              </div>

              {/* Visual and Thermal Uploaded Images */}
              <div>
                <h4 className="text-xs font-bold text-purple-900 uppercase border-b border-gray-100 pb-1.5 mb-3">Field Inspection & Location Map</h4>
                <div className="grid grid-cols-2 gap-4">
                  {/* Visual Image */}
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center justify-center text-center min-h-[160px] overflow-hidden">
                    <span className="text-[10px] font-bold text-gray-400 uppercase mb-2">Visual Inspection Photo</span>
                    {selectedAsset.visualPictureUrl ? (
                      <img 
                        src={selectedAsset.visualPictureUrl} 
                        alt="Visual Asset Inspection" 
                        referrerPolicy="no-referrer"
                        className="w-full h-32 object-cover rounded-lg border border-gray-200 shadow-xs" 
                      />
                    ) : (
                      <span className="text-xs text-gray-400 italic">No visual inspection image submitted</span>
                    )}
                  </div>

                  {/* Thermal Image */}
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center justify-center text-center min-h-[160px] overflow-hidden">
                    <span className="text-[10px] font-bold text-gray-400 uppercase mb-2">Thermal Hotspot thermogram</span>
                    {selectedAsset.thermalImageUrl ? (
                      <img 
                        src={selectedAsset.thermalImageUrl} 
                        alt="Thermal Thermography scan" 
                        referrerPolicy="no-referrer"
                        className="w-full h-32 object-cover rounded-lg border border-gray-200 shadow-xs" 
                      />
                    ) : (
                      <span className="text-xs text-gray-400 italic">No thermal scans submitted</span>
                    )}
                  </div>
                  
                  {/* Satellite Image */}
                  {(() => {
                    const lat = selectedAsset?.gps?.lat || 13.7563;
                    const lng = selectedAsset?.gps?.lng || 100.5018;
                    return (
                      <div className="col-span-2 bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center justify-center text-center min-h-[140px] overflow-hidden">
                        <div className="w-full flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Equipment Satellite Location</span>
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[9px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            <span>Open Maps</span>
                          </a>
                        </div>
                        <div className="w-full relative overflow-hidden rounded-lg">
                          <img 
                            src={`/api/map-image?lat=${lat}&lng=${lng}`}
                            alt="Equipment Satellite Location"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.currentTarget;
                              const fallbackUrl = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${lng - 0.002},${lat - 0.001},${lng + 0.002},${lat + 0.001}&bboxSR=4326&size=600,300&format=png&f=image`;
                              if (target.src !== fallbackUrl) {
                                target.src = fallbackUrl;
                              }
                            }}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200 shadow-xs"
                          />
                          <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[9px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                            <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="text-[10px] text-gray-500 font-semibold space-y-0.5">
                <div>Original Registered by: <span className="text-gray-800">{selectedAsset.operatorName}</span> ({selectedAsset.timestamp})</div>
                {selectedAsset.latestUpdatedBy && selectedAsset.latestUpdatedAt && (
                  <div className="text-purple-900 flex items-center gap-1 mt-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                    Latest Integrity Update: <span className="font-bold">{selectedAsset.latestUpdatedBy}</span> ({selectedAsset.latestUpdatedAt})
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                  onClick={() => exportAssetToPDF(selectedAsset)}
                  className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileText className="w-4 h-4 text-purple-700" />
                  Create PDF file
                </button>
                <button 
                  onClick={() => setSelectedAsset(null)}
                  className="bg-purple-900 hover:bg-purple-800 text-white rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
