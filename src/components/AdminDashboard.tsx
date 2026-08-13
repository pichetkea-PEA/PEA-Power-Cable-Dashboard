import { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  CableAsset, 
  DashboardFilters, 
  EquipmentType, 
  HealthStatus,
  TanDeltaResult,
  PDResultType,
  PEAUser
} from '../types';
import { getPendingUsers, approveUserAccount, rejectUserAccount } from '../utils/userManagement';
import { 
  PEA_AREAS, 
  PEA_AREA_NAMES, 
  PEA_AREA_CITIES, 
  EQUIPMENT_TYPES, 
  COUNTRIES_OF_ORIGIN, 
  MANUFACTURERS, 
  VOLTAGE_LEVELS 
} from '../utils/peaData';
import MapChart from './MapChart';
import WorldMapChart from './WorldMapChart';
import { exportAssetToPDF } from '../utils/pdfGenerator';
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Wrench, 
  Layers, 
  MapPin, 
  Filter, 
  Search, 
  RefreshCw,
  TrendingUp,
  Sliders,
  Calendar,
  ExternalLink,
  X,
  FileSpreadsheet,
  QrCode
} from 'lucide-react';

interface AdminDashboardProps {
  assets: CableAsset[];
  spreadsheetId: string | null;
  onRefresh: () => void;
  onMigrateEquipmentIds?: () => void;
  isMigratingIds?: boolean;
}

export default function AdminDashboard({ assets, spreadsheetId, onRefresh, onMigrateEquipmentIds, isMigratingIds }: AdminDashboardProps) {
  // Filters State
  const [filters, setFilters] = useState<DashboardFilters>({
    area: 'All',
    city: 'All',
    voltageLevel: 'All',
    equipmentType: 'All',
    yearOfRegistration: 'All',
    ageRange: 'All',
    countryOfOrigin: 'All',
    manufacturer: 'All',
    assetOrPeaNumber: ''
  });

  // Health chart filter inside card
  const [healthChartEqType, setHealthChartEqType] = useState<string>('All');

  // Selected Asset for modal detail
  const [selectedAsset, setSelectedAsset] = useState<CableAsset | null>(null);

  // AI Modal States
  const [aiReportContent, setAiReportContent] = useState<string | null>(null);
  const [aiPlanContent, setAiPlanContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiType, setAiType] = useState<'report' | 'plan' | null>(null);

  // Handle nested city filter options
  const cityOptions = useMemo(() => {
    if (filters.area === 'All') {
      const allCities = Object.entries(PEA_AREA_CITIES)
        .filter(([key]) => key !== 'ALL')
        .flatMap(([, cities]) => cities);
      return Array.from(new Set(allCities)).sort();
    }
    return PEA_AREA_CITIES[filters.area] || [];
  }, [filters.area]);

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      area: 'All',
      city: 'All',
      voltageLevel: 'All',
      equipmentType: 'All',
      ageRange: 'All',
      countryOfOrigin: 'All',
      manufacturer: 'All',
      assetOrPeaNumber: ''
    });
    setHealthChartEqType('All');
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

  // Filter Assets
  const filteredAssets = useMemo(() => {
    return uniqueAssets.filter(asset => {
      // Area Filter
      if (filters.area !== 'All') {
        const areaCode = asset.equipmentId.split('-')[0];
        if (areaCode !== filters.area) return false;
      }
      // City Filter
      if (filters.city !== 'All' && asset.city !== filters.city) return false;
      // Voltage Level Filter
      if (filters.voltageLevel !== 'All' && asset.voltageLevel !== filters.voltageLevel) return false;
      // Equipment Type Filter
      if (filters.equipmentType !== 'All' && asset.equipmentType !== filters.equipmentType) return false;
      // Year of Registration Filter
      if (filters.yearOfRegistration && filters.yearOfRegistration !== 'All' && String(asset.yearOfRegistration) !== filters.yearOfRegistration) return false;
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
      // Asset Number or PEA Number Filter
      if (filters.assetOrPeaNumber.trim() !== '') {
        const query = filters.assetOrPeaNumber.toLowerCase();
        const matchesAsset = asset.assetNumber.toLowerCase().includes(query);
        const matchesPea = asset.peaNumber.toLowerCase().includes(query);
        const matchesId = asset.equipmentId.toLowerCase().includes(query);
        if (!matchesAsset && !matchesPea && !matchesId) return false;
      }

      return true;
    });
  }, [assets, filters]);

  // Core metrics calculated from filtered assets
  const metrics = useMemo(() => {
    const total = filteredAssets.length;
    if (total === 0) {
      return { total: 0, redCount: 0, orangeCount: 0, yellowCount: 0, greenCount: 0, avgHealth: 100 };
    }
    let red = 0, orange = 0, yellow = 0, green = 0, scoreSum = 0;
    filteredAssets.forEach(a => {
      scoreSum += a.healthScore;
      if (a.healthStatus === 'Red') red++;
      else if (a.healthStatus === 'Orange') orange++;
      else if (a.healthStatus === 'Yellow') yellow++;
      else green++;
    });
    return {
      total,
      redCount: red,
      orangeCount: orange,
      yellowCount: yellow,
      greenCount: green,
      avgHealth: Math.round(scoreSum / total)
    };
  }, [filteredAssets]);

  // Specific Equipment type health counts
  const healthFilteredAssets = useMemo(() => {
    if (healthChartEqType === 'All') return filteredAssets;
    return filteredAssets.filter(a => a.equipmentType === healthChartEqType);
  }, [filteredAssets, healthChartEqType]);

  const healthChartMetrics = useMemo(() => {
    const total = healthFilteredAssets.length;
    if (total === 0) return { red: 0, orange: 0, yellow: 0, green: 0 };
    let red = 0, orange = 0, yellow = 0, green = 0;
    healthFilteredAssets.forEach(a => {
      if (a.healthStatus === 'Red') red++;
      else if (a.healthStatus === 'Orange') orange++;
      else if (a.healthStatus === 'Yellow') yellow++;
      else green++;
    });
    return { red, orange, yellow, green, total };
  }, [healthFilteredAssets]);

  // Total amount of equipment by type
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

  // Age distribution ranges for filtered assets
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

  // Asset Count sorted by Area & City
  const areaCityRanking = useMemo(() => {
    const mapping: Record<string, Record<string, number>> = {};
    filteredAssets.forEach(a => {
      const areaCode = a.equipmentId.split('-')[0] || 'Unknown';
      if (!mapping[areaCode]) mapping[areaCode] = {};
      if (!mapping[areaCode][a.city]) mapping[areaCode][a.city] = 0;
      mapping[areaCode][a.city]++;
    });

    const list: { area: string; city: string; count: number }[] = [];
    Object.keys(mapping).forEach(area => {
      Object.keys(mapping[area]).forEach(city => {
        list.push({ area, city, count: mapping[area][city] });
      });
    });

    return list.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [filteredAssets]);

  // Critical Assets
  const criticalAssets = useMemo(() => {
    return filteredAssets.filter(
      a => a.healthStatus === 'Red' || a.healthStatus === 'Orange' || 
          (a.surfaceTemperature && a.surfaceTemperature > 70) ||
          (a.externalDischarge && a.externalDischarge > 100)
    ).sort((a, b) => a.healthScore - b.healthScore);
  }, [filteredAssets]);

  // Specific selected critical asset inside panel details
  const [criticalSelectId, setCriticalSelectId] = useState<string>('');
  const activeCriticalAsset = useMemo(() => {
    if (criticalSelectId) {
      return criticalAssets.find(a => a.equipmentId === criticalSelectId);
    }
    return criticalAssets[0];
  }, [criticalAssets, criticalSelectId]);

  // Trigger server-side AI summary generation
  const handleGenerateAI = async (type: 'report' | 'plan') => {
    setAiLoading(true);
    setAiType(type);
    try {
      // Strip out heavy base64 image data and history arrays before posting
      const cleanAssets = filteredAssets.map(a => ({
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

      const endpoint = type === 'report' ? '/api/ai-report' : '/api/ai-plan';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: cleanAssets })
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
      if (type === 'report') {
        setAiReportContent(data.report || '');
      } else {
        setAiPlanContent(data.plan || '');
      }
    } catch (err: any) {
      alert(`AI Engine Error: ${err.message || 'Error occurred while contacting server.'}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Printable HTML preview with trigger
  const handlePrintHTML = () => {
    const printContent = aiType === 'report' ? aiReportContent : aiPlanContent;
    if (!printContent) return;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Popup blocker prevented printing. Please allow popups.');
      return;
    }

    win.document.write(`
      <html>
        <head>
          <title>${aiType === 'report' ? 'PEA Cable Asset Report' : 'PEA Cable Maintenance Plan'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; }
            h1 { font-size: 24px; color: #7b1fa2; border-bottom: 2px solid #7b1fa2; padding-bottom: 8px; margin-bottom: 20px; }
            h2 { font-size: 18px; color: #111827; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
            h3 { font-size: 15px; color: #374151; margin-top: 16px; }
            p, li { font-size: 13px; }
            code { font-family: monospace; background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-size: 12px; }
            pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 16px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; font-size: 12px; }
            th { background-color: #f9fafb; font-weight: 600; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
            .no-print {
              margin-bottom: 20px;
              background-color: #f3e5f5;
              padding: 12px;
              border-radius: 8px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border: 1px solid #e1bee7;
            }
            .btn-print {
              background-color: #7b1fa2;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="no-print">
            <span style="font-weight: 600; color: #7b1fa2; font-size: 13px;">PEA Asset Intelligence Center - PDF Print Desk</span>
            <button class="btn-print" onclick="window.print()">Print or Export PDF</button>
          </div>
          <div>
            ${printContent.replace(/\n/g, '<br/>').replace(/###\s*(.*)/g, '<h3>$1</h3>').replace(/##\s*(.*)/g, '<h2>$1</h2>').replace(/#\s*(.*)/g, '<h1>$1</h1>')}
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const [pendingUsers, setPendingUsers] = useState<PEAUser[]>(() => getPendingUsers());

  const handleApproveUser = (email: string) => {
    approveUserAccount(email);
    setPendingUsers(getPendingUsers());
  };

  const handleRejectUser = (email: string) => {
    rejectUserAccount(email);
    setPendingUsers(getPendingUsers());
  };

  return (
    <div className="space-y-6" id="admin-panel-root">
      {/* Pending Account Authorization Requests (If any) */}
      {pendingUsers.length > 0 && (
        <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-purple-950 rounded-2xl border border-purple-500/40 p-5 shadow-xl text-white space-y-4">
          <div className="flex items-center justify-between border-b border-purple-700/50 pb-3">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-yellow-400 shrink-0 animate-pulse" />
              <div>
                <h3 className="text-sm font-black tracking-tight uppercase text-yellow-300">
                  Pending Account Registration Requests ({pendingUsers.length})
                </h3>
                <p className="text-[11px] text-purple-200">
                  New PEA users requiring PEA Executive Admin authorization before system access is granted.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2.5 py-1 rounded-full">
              Authorization Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingUsers.map(u => (
              <div key={u.email} className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-3.5 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-yellow-400 font-bold">{u.requestId || 'REQ-PEA-84192'}</span>
                    <span className="bg-purple-900/80 text-purple-200 px-2 py-0.5 rounded text-[10px]">
                      Emp ID: {u.employeeId || 'PEA-58291'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white">{u.name}</h4>
                  <p className="text-[11px] text-purple-300 font-mono">{u.email}</p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-300 pt-1">
                    <span className="bg-slate-700 px-2 py-0.5 rounded font-semibold text-white">Role: {u.role}</span>
                    <span className="bg-slate-700 px-2 py-0.5 rounded font-semibold text-white">Sector: {u.interestArea}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                  <button
                    onClick={() => handleApproveUser(u.email)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-3 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approve Account
                  </button>
                  <button
                    onClick={() => handleRejectUser(u.email)}
                    className="bg-slate-700 hover:bg-red-900/80 text-gray-300 hover:text-white py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5" id="admin-filters-card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-3 mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-700" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Multi-Level System Filter</h3>
          </div>
          <div className="flex items-center gap-3">
            {onMigrateEquipmentIds && (
              <button
                onClick={onMigrateEquipmentIds}
                disabled={isMigratingIds}
                className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-50 transition-all"
                title="Scan and revise Column AG Equipment IDs in all 12 Google Sheets according to the latest PEA rules"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
                {isMigratingIds ? 'Updating 12 Sheets Column AG...' : 'Update Column AG (Equipment ID) in All 12 Sheets'}
              </button>
            )}
            <button 
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 text-xs text-purple-700 hover:text-purple-900 font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Area Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">PEA Area (12 Region)</label>
            <select
              value={filters.area}
              onChange={e => setFilters(prev => ({ ...prev, area: e.target.value, city: 'All' }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All 12 Areas</option>
              {PEA_AREAS.map(area => (
                <option key={area} value={area}>{area} - {PEA_AREA_NAMES[area]}</option>
              ))}
            </select>
          </div>

          {/* City Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">PEA City / Province</label>
            <select
              value={filters.city}
              onChange={e => setFilters(prev => ({ ...prev, city: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Cities</option>
              {cityOptions.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* Voltage Level */}
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

          {/* Equipment Type */}
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

          {/* Year of Register */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Year of Register</label>
            <select
              value={filters.yearOfRegistration || 'All'}
              onChange={e => setFilters(prev => ({ ...prev, yearOfRegistration: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Years</option>
              {Array.from({ length: 25 }, (_, i) => {
                const yr = new Date().getFullYear() - i;
                const bYr = yr + 543;
                return (
                  <option key={yr} value={String(yr)}>
                    {yr} (B.E. {bYr})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Age Distribution */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Equipment Age Range</label>
            <select
              value={filters.ageRange}
              onChange={e => setFilters(prev => ({ ...prev, ageRange: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Ages</option>
              <option value="0-5">0 - 5 Years (New)</option>
              <option value="5-15">5 - 15 Years (Mid-life)</option>
              <option value="15-25">15 - 25 Years (Aged)</option>
              <option value="25+">25+ Years (End of Life)</option>
            </select>
          </div>

          {/* Country of Origin */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Country of Origin</label>
            <select
              value={filters.countryOfOrigin}
              onChange={e => setFilters(prev => ({ ...prev, countryOfOrigin: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Countries</option>
              {COUNTRIES_OF_ORIGIN.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Product Manufacturer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Product Manufacturer</label>
            <select
              value={filters.manufacturer}
              onChange={e => setFilters(prev => ({ ...prev, manufacturer: e.target.value }))}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
            >
              <option value="All">All Manufacturers</option>
              {MANUFACTURERS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Asset/PEA Number Search */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Asset # / PEA # / ID</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search values..."
                value={filters.assetOrPeaNumber}
                onChange={e => setFilters(prev => ({ ...prev, assetOrPeaNumber: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 pl-8 pr-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Overview Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="admin-kpi-row">
        {/* Metric 1 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Total Assets</span>
            <span className="text-2xl font-bold text-gray-900">{metrics.total}</span>
            <span className="text-[10px] text-gray-400 block font-medium mt-0.5">Tracked in spreadsheet</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Dangerous (Red)</span>
            <span className="text-2xl font-bold text-rose-600">{metrics.redCount}</span>
            <span className="text-[10px] text-rose-500 font-semibold block bg-rose-50/50 px-1.5 py-0.5 rounded-sm mt-1 w-max">
              Needs immediate action
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Degrading (Orange)</span>
            <span className="text-2xl font-bold text-orange-600">{metrics.orangeCount}</span>
            <span className="text-[10px] text-orange-500 font-medium block mt-0.5">
              Alert: degradation monitor
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-400 block uppercase">Average Health</span>
            <span className="text-2xl font-bold text-emerald-600">{metrics.avgHealth}%</span>
            <span className="text-[10px] text-emerald-500 font-medium block mt-0.5">
              Normal operational safety
            </span>
          </div>
        </div>
      </div>

      {/* Main Map & Critical Assets Panel Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="admin-map-critical-row">
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex justify-between items-center bg-white border border-gray-100 px-5 py-3 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-purple-700" />
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Equipment Location Map</h3>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-700 font-semibold px-2 py-0.5 rounded-full uppercase">
              Free OpenStreetMap Leaflet layer
            </span>
          </div>
          <div className="bg-white p-2 rounded-b-2xl border border-gray-100 h-[450px]">
            <MapChart assets={filteredAssets} onSelectAsset={setSelectedAsset} />
          </div>
        </div>

        {/* Critical Asset Panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[502px]">
          <div className="border-b border-gray-100 pb-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Critical Assets Advisory</h3>
            </div>
            <p className="text-[11px] text-gray-400">Severe issues (PD, Hotspots, Insulation) requiring instant focus</p>
          </div>

          {criticalAssets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <CheckCircle className="w-10 h-10 text-emerald-500 mb-2" />
              <span className="text-xs font-semibold text-gray-800">No Critical Assets Found</span>
              <p className="text-[10px] text-gray-400 max-w-[200px] mt-1">All filtered system assets operating within green guidelines.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {/* Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-gray-400 uppercase">Critical Equipment Registry ({criticalAssets.length})</label>
                <select
                  value={criticalSelectId}
                  onChange={e => setCriticalSelectId(e.target.value)}
                  className="w-full bg-red-50/50 border border-red-100 rounded-lg py-1.5 px-2.5 text-xs font-bold text-red-700 focus:outline-hidden focus:ring-1 focus:ring-red-400"
                >
                  {criticalAssets.map((a, idx) => (
                    <option key={`${a.equipmentId}-${idx}`} value={a.equipmentId} className="text-gray-900">
                      [H:{a.healthScore}%] {a.equipmentType} - {a.equipmentId.substring(a.equipmentId.lastIndexOf('-') + 1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Asset Specific Details */}
              {activeCriticalAsset && (
                <div className="flex-1 bg-gray-50/70 border border-gray-100 rounded-xl p-3 space-y-3 overflow-y-auto">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">{activeCriticalAsset.equipmentType}</span>
                      <h4 className="text-xs font-bold text-gray-900 truncate max-w-[180px] font-mono">{activeCriticalAsset.equipmentId}</h4>
                    </div>
                    <span className="text-xs font-black text-white bg-red-600 rounded-md px-1.5 py-0.5">
                      {activeCriticalAsset.healthScore}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] border-t border-gray-100 pt-2.5">
                    <div>
                      <span className="text-gray-400 block font-medium">Temperature</span>
                      <span className={`font-bold ${activeCriticalAsset.surfaceTemperature && activeCriticalAsset.surfaceTemperature > 70 ? 'text-red-600' : 'text-gray-800'}`}>
                        {activeCriticalAsset.surfaceTemperature ?? 'N/A'} °C
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-medium">Partial Discharge</span>
                      <span className={`font-bold ${activeCriticalAsset.externalDischarge && activeCriticalAsset.externalDischarge > 100 ? 'text-red-600' : 'text-gray-800'}`}>
                        {activeCriticalAsset.externalDischarge ?? 'N/A'} pC ({activeCriticalAsset.pdResult})
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-medium">Insulation Res.</span>
                      <span className={`font-bold ${activeCriticalAsset.insulationResistance && activeCriticalAsset.insulationResistance < 1 ? 'text-red-600' : 'text-gray-800'}`}>
                        {activeCriticalAsset.insulationResistance ?? 'N/A'} GOhm
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-medium">Tan Delta</span>
                      <span className={`font-bold ${activeCriticalAsset.tanDelta === 'Action Required' ? 'text-red-600' : 'text-gray-800'}`}>
                        {activeCriticalAsset.tanDelta || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-medium">Load / Sheath</span>
                      <span className="font-bold text-gray-800">
                        {activeCriticalAsset.loadCurrent}A / {activeCriticalAsset.sheathCurrent}A
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-medium">Equipment Number ADS</span>
                      <span className="font-bold text-gray-800 font-mono">{activeCriticalAsset.assetNumber}</span>
                    </div>
                  </div>

                  {/* Hotspots Analysis Badge */}
                  <div className="border-t border-gray-100 pt-2.5 space-y-1.5">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">System Diagnostic Flag</span>
                    <div className="flex flex-col gap-1 text-[10px]">
                      {activeCriticalAsset.surfaceTemperature && activeCriticalAsset.surfaceTemperature > 70 && (
                        <div className="bg-red-50 text-red-700 px-2 py-1 rounded-sm border border-red-100 font-semibold">
                          ⚠️ THERMAL HOTSPOT IN CABLE JOINT/TERM
                        </div>
                      )}
                      {activeCriticalAsset.externalDischarge && activeCriticalAsset.externalDischarge > 100 && (
                        <div className="bg-rose-50 text-rose-700 px-2 py-1 rounded-sm border border-rose-100 font-semibold">
                          ⚡ CRITICAL PARTIAL DISCHARGE DETECTED
                        </div>
                      )}
                      {activeCriticalAsset.sheathCurrent && activeCriticalAsset.loadCurrent && activeCriticalAsset.sheathCurrent / activeCriticalAsset.loadCurrent > 0.3 && (
                        <div className="bg-orange-50 text-orange-700 px-2 py-1 rounded-sm border border-orange-100 font-semibold">
                          🔄 EXCESSIVE SHEATH CIRCULATING CURRENT
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedAsset(activeCriticalAsset)}
                    className="w-full bg-purple-700 hover:bg-purple-900 text-white rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer mt-2"
                  >
                    Investigate Full Details
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Country of Origin Global World Map Chart */}
      <WorldMapChart assets={filteredAssets} />

      {/* Analytical Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="admin-charts-grid">
        {/* Chart 1: Total Amount of All Equipment */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[320px]">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Asset Inventory</span>
          <h4 className="text-xs font-bold text-gray-900 mb-4 uppercase">Equipment Type Breakdown</h4>
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
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-purple-700 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${percent}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Health Index with specific filter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[320px]">
          <div className="flex justify-between items-start mb-3">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Health Indexes</span>
              <h4 className="text-xs font-bold text-gray-900 uppercase">Condition Breakdown</h4>
            </div>
            {/* Filter inside chart */}
            <select
              value={healthChartEqType}
              onChange={e => setHealthChartEqType(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-md py-1 px-1.5 text-[10px] font-bold text-gray-600 focus:outline-hidden"
            >
              <option value="All">All Types</option>
              {EQUIPMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {healthChartMetrics.total === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-[11px] text-gray-400">
              No matching assets
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-3">
              {/* Horizontal Bar Chart representation */}
              <div className="space-y-2">
                {/* Red */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-600">
                    <span className="text-red-600">RED: Dangerous</span>
                    <span>{healthChartMetrics.red} ({Math.round((healthChartMetrics.red / healthChartMetrics.total) * 100)}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-red-500 h-full rounded-full" style={{ width: `${(healthChartMetrics.red / healthChartMetrics.total) * 100}%` }} />
                  </div>
                </div>

                {/* Orange */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-600">
                    <span className="text-orange-500">ORANGE: Alert</span>
                    <span>{healthChartMetrics.orange} ({Math.round((healthChartMetrics.orange / healthChartMetrics.total) * 100)}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-orange-500 h-full rounded-full" style={{ width: `${(healthChartMetrics.orange / healthChartMetrics.total) * 100}%` }} />
                  </div>
                </div>

                {/* Yellow */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-600">
                    <span className="text-yellow-600">YELLOW: Monitor</span>
                    <span>{healthChartMetrics.yellow} ({Math.round((healthChartMetrics.yellow / healthChartMetrics.total) * 100)}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${(healthChartMetrics.yellow / healthChartMetrics.total) * 100}%` }} />
                  </div>
                </div>

                {/* Green */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-600">
                    <span className="text-emerald-600">GREEN: Normal</span>
                    <span>{healthChartMetrics.green} ({Math.round((healthChartMetrics.green / healthChartMetrics.total) * 100)}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(healthChartMetrics.green / healthChartMetrics.total) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chart 3: Age Distribution Range */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[320px]">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Asset Age Profile</span>
          <h4 className="text-xs font-bold text-gray-900 mb-4 uppercase">Age Range Distribution</h4>
          <div className="flex-1 flex items-end justify-between gap-3 pt-4">
            {Object.entries(ageDistribution).map(([band, val]) => {
              const total = Math.max(...(Object.values(ageDistribution) as number[]), 1);
              const valNum = val as number;
              const pct = (valNum / total) * 80; // Scale down for layout fitting
              return (
                <div key={band} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-extrabold text-gray-900">{val}</span>
                  <div 
                    className="w-full bg-purple-100 hover:bg-purple-300 rounded-t-lg transition-all duration-300"
                    style={{ height: `${pct || 4}px` }}
                  />
                  <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{band}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 4: Asset Density by Area and City */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-[320px]">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Spatial Concentration</span>
          <h4 className="text-xs font-bold text-gray-900 mb-2 uppercase">Top Areas & Cities</h4>
          
          <div className="flex-1 flex flex-col justify-between py-1">
            {areaCityRanking.length === 0 ? (
              <span className="text-xs text-gray-400 text-center flex-1 flex items-center justify-center">No locations matched</span>
            ) : (
              <div className="space-y-3">
                {areaCityRanking.map((rank, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-purple-50 text-purple-700 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-800 block leading-tight">{rank.city}</span>
                        <span className="text-[9px] text-gray-400 font-semibold block uppercase">PEA District {rank.area}</span>
                      </div>
                    </div>
                    <span className="text-xs font-black text-purple-700 bg-purple-50 rounded-full px-2.5 py-0.5">
                      {rank.count} Assets
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Generative Document Suites Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6" id="admin-ai-suites-card">
        <div className="border-b border-gray-100 pb-3 mb-5">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">PEA Grid AI Document & Advisory Suites</h3>
          <p className="text-xs text-gray-400 mt-1">
            Utilize server-side Generative AI (Gemini 3.5 Flash) to analyze the current database and compile printable, executive summary files instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Doc 1: Executive Report */}
          <div className="border border-gray-100 rounded-xl p-5 hover:border-purple-200 hover:bg-purple-50/10 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-gray-900 uppercase">Executive summary Meeting Report</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
                Generates a formal strategic brief of total assets breakdown, geographical hotspots, degradation status, and engineering risks. Ready for Board of Directors and PEA management presentation.
              </p>
            </div>
            
            {aiReportContent ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg p-3 text-xs flex justify-between items-center font-semibold">
                  <span>Report Generated!</span>
                  <button 
                    onClick={() => { setAiType('report'); handlePrintHTML(); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md text-[10px] uppercase font-bold"
                  >
                    Open & Print PDF
                  </button>
                </div>
                <button
                  onClick={() => handleGenerateAI('report')}
                  className="text-[11px] text-purple-700 hover:underline font-bold"
                >
                  Regenerate Report
                </button>
              </div>
            ) : (
              <button
                disabled={aiLoading}
                onClick={() => handleGenerateAI('report')}
                className="w-full bg-purple-700 hover:bg-purple-900 text-white rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {aiLoading && aiType === 'report' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing Portfolio...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Compile executive Report
                  </>
                )}
              </button>
            )}
          </div>

          {/* Doc 2: Maintenance Plan */}
          <div className="border border-gray-100 rounded-xl p-5 hover:border-purple-200 hover:bg-purple-50/10 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-gray-900 uppercase">Yearly & Monthly Maintenance Plan</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
                Compiles a risk-prioritized engineering scheduled test-run, diagnostic plan, and budget requirements prioritized entirely by asset health score anomalies.
              </p>
            </div>

            {aiPlanContent ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg p-3 text-xs flex justify-between items-center font-semibold">
                  <span>Plan Generated!</span>
                  <button 
                    onClick={() => { setAiType('plan'); handlePrintHTML(); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md text-[10px] uppercase font-bold"
                  >
                    Open & Print PDF
                  </button>
                </div>
                <button
                  onClick={() => handleGenerateAI('plan')}
                  className="text-[11px] text-purple-700 hover:underline font-bold"
                >
                  Regenerate Maintenance Plan
                </button>
              </div>
            ) : (
              <button
                disabled={aiLoading}
                onClick={() => handleGenerateAI('plan')}
                className="w-full bg-purple-700 hover:bg-purple-900 text-white rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {aiLoading && aiType === 'plan' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating Engineering Schedule...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Compile Maintenance Plan
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Asset Full Inspection Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]" id="asset-inspect-modal">
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
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">GPS Location coordinates:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-800">{selectedAsset.gps?.lat ?? 13.7563}, {selectedAsset.gps?.lng ?? 100.5018}</span>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${selectedAsset.gps?.lat ?? 13.7563},${selectedAsset.gps?.lng ?? 100.5018}`} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:text-purple-900">
                          <MapPin className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Substation landmark:</span><span className="font-bold text-gray-800 truncate max-w-[180px]">{selectedAsset.landmark || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 font-medium">Asset Valuation:</span><span className="font-bold text-emerald-700 font-mono">{selectedAsset.assetValue || 'N/A'}</span></div>
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
