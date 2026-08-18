import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CableAsset, PEAUser } from '../types';
import { PEA_AREAS, PEA_AREA_NAMES } from '../utils/peaData';
import { deriveAllActivityLogs, AssetActivityLog } from '../utils/auditLogger';
import { 
  ShieldAlert, 
  Activity, 
  PlusCircle, 
  FileEdit, 
  Calendar, 
  Filter, 
  MapPin, 
  User, 
  Zap, 
  Layers, 
  Search, 
  BarChart3, 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  CheckCircle2, 
  RefreshCw, 
  ExternalLink,
  Users,
  Building2,
  ChevronRight,
  Database
} from 'lucide-react';

interface AssetMonitorPanelProps {
  user: PEAUser;
  assets: CableAsset[];
  onSelectAsset?: (asset: CableAsset) => void;
  onRefresh?: () => void;
}

type TimeRangeOption = '7d' | '30d' | '90d' | 'all';

export default function AssetMonitorPanel({
  user,
  assets,
  onSelectAsset,
  onRefresh
}: AssetMonitorPanelProps) {
  // Admin Guard
  if (user.role !== 'Admin') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-8 bg-slate-900 text-white rounded-2xl border border-slate-800">
        <div className="p-4 bg-red-950/80 rounded-2xl border border-red-500/40 text-red-400 mb-4 animate-bounce">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h2 className="text-xl font-black tracking-tight mb-2 uppercase">Access Restricted (Admin Only)</h2>
        <p className="text-sm text-slate-400 max-w-md text-center leading-relaxed">
          The Asset Change & Registration Audit Monitor panel is strictly reserved for PEA System Administrator accounts.
        </p>
        <span className="mt-4 px-3 py-1 bg-red-500/10 text-red-300 border border-red-500/30 rounded-full text-xs font-mono">
          Current Role: {user.role}
        </span>
      </div>
    );
  }

  // Active View Tab: Part 1 ('registrations') or Part 2 ('edits')
  const [activeTab, setActiveTab] = useState<'registrations' | 'edits'>('registrations');

  // Filter States
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('30d');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedVoltage, setSelectedVoltage] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Loaded Activity Logs state
  const [registrationLogs, setRegistrationLogs] = useState<AssetActivityLog[]>([]);
  const [editLogs, setEditLogs] = useState<AssetActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(true);

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);

  // Fetch / synthesize logs
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { registrationLogs: regLogs, editLogs: edLogs } = await deriveAllActivityLogs(assets);
      setRegistrationLogs(regLogs);
      setEditLogs(edLogs);
    } catch (err) {
      console.error("Error loading activity logs:", err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [assets]);

  // Compute cutoff date for timeRange filtering
  const cutoffMs = useMemo(() => {
    if (timeRange === 'all') return 0;
    const now = new Date().getTime();
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    return now - days * 24 * 60 * 60 * 1000;
  }, [timeRange]);

  // Filter logs according to user control selections
  const currentLogs = useMemo(() => {
    const rawLogs = activeTab === 'registrations' ? registrationLogs : editLogs;

    return rawLogs.filter(log => {
      // Time filter
      if (cutoffMs > 0) {
        const logTime = new Date(log.timestamp).getTime();
        if (isNaN(logTime) || logTime < cutoffMs) return false;
      }

      // Area filter
      if (selectedArea !== 'All' && log.area !== selectedArea) return false;

      // Voltage filter
      if (selectedVoltage !== 'All' && !log.voltageLevel.includes(selectedVoltage)) return false;

      // Equipment Type filter
      if (selectedType !== 'All' && log.equipmentType !== selectedType) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchEqId = log.equipmentId.toLowerCase().includes(q);
        const matchUser = log.operatorName.toLowerCase().includes(q);
        const matchType = log.equipmentType.toLowerCase().includes(q);
        const matchSub = (log.substationName || '').toLowerCase().includes(q);
        if (!matchEqId && !matchUser && !matchType && !matchSub) return false;
      }

      return true;
    });
  }, [activeTab, registrationLogs, editLogs, cutoffMs, selectedArea, selectedVoltage, selectedType, searchQuery]);

  // Day-by-Day comparison grouping
  const dayByDayComparison = useMemo(() => {
    const dayCounts: Record<string, number> = {};
    const now = new Date();

    // Initialize days in range if timeRange !== 'all'
    const daysToInclude = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 14;
    for (let i = daysToInclude - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split('T')[0];
      dayCounts[dateKey] = 0;
    }

    currentLogs.forEach(log => {
      try {
        const dStr = new Date(log.timestamp).toISOString().split('T')[0];
        if (dayCounts[dStr] !== undefined) {
          dayCounts[dStr] += 1;
        } else {
          dayCounts[dStr] = (dayCounts[dStr] || 0) + 1;
        }
      } catch (e) {
        // ignore invalid dates
      }
    });

    const entries = Object.entries(dayCounts).sort((a, b) => a[0].localeCompare(b[0]));
    const maxCount = Math.max(...entries.map(e => e[1]), 1);

    // Calculate Day-over-Day metric
    const todayKey = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = yesterdayDate.toISOString().split('T')[0];

    const todayCount = dayCounts[todayKey] || 0;
    const yesterdayCount = dayCounts[yesterdayKey] || 0;
    // If there is no activity in the present day, it must show 0 for day-over-day comparison
    const dodDiff = todayCount === 0 ? 0 : todayCount - yesterdayCount;

    return { entries, maxCount, todayCount, yesterdayCount, dodDiff };
  }, [currentLogs, timeRange]);

  // Breakdown by Equipment Type
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    currentLogs.forEach(l => {
      const t = l.equipmentType || 'Other';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [currentLogs]);

  // Breakdown by Voltage Level
  const voltageBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    currentLogs.forEach(l => {
      const v = l.voltageLevel || 'Unspecified';
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [currentLogs]);

  // Breakdown by Area
  const areaBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    PEA_AREAS.forEach(area => { counts[area] = 0; });
    currentLogs.forEach(l => {
      if (counts[l.area] !== undefined) {
        counts[l.area] += 1;
      } else {
        counts[l.area] = 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [currentLogs]);

  // Breakdown by User / Operator
  const userBreakdown = useMemo(() => {
    const userMap: Record<string, { count: number; lastTime: string; areas: Set<string>; equipmentIds: string[] }> = {};
    currentLogs.forEach(l => {
      const name = l.operatorName || 'Unknown Operator';
      if (!userMap[name]) {
        userMap[name] = { count: 0, lastTime: l.timestamp, areas: new Set(), equipmentIds: [] };
      }
      userMap[name].count += 1;
      userMap[name].areas.add(l.area);
      if (userMap[name].equipmentIds.length < 5) {
        userMap[name].equipmentIds.push(l.equipmentId);
      }
      if (new Date(l.timestamp).getTime() > new Date(userMap[name].lastTime).getTime()) {
        userMap[name].lastTime = l.timestamp;
      }
    });

    return Object.entries(userMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [currentLogs]);

  // Leaflet Map Initialization & Pin Updates
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        preferCanvas: true, // Crucial for rendering thousands of pins with stellar performance
        center: [13.7563, 100.5018],
        zoom: 6,
        zoomControl: false
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      markerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !markerGroup) return;

    markerGroup.clearLayers();

    // Map pins for current filtered logs
    const validLogsWithGps = currentLogs.filter(l => l.gps && typeof l.gps.lat === 'number' && typeof l.gps.lng === 'number');

    validLogsWithGps.forEach(log => {
      if (!log.gps) return;

      const isReg = activeTab === 'registrations';
      const color = isReg ? '#10b981' : '#a855f7'; // Emerald for registration, Purple for edit

      const logDate = new Date(log.timestamp);
      const isToday = !isNaN(logDate.getTime()) && logDate.toDateString() === new Date().toDateString();

      // Highlight today's new registered pins with larger radius and distinct gold-yellow fill + red boundary
      const marker = L.circleMarker([log.gps.lat, log.gps.lng], {
        radius: isToday ? 11 : 6,
        fillColor: isToday ? '#f59e0b' : color, // Gold/Amber for today, standard for other days
        color: isToday ? '#ef4444' : '#ffffff', // Red boundary for today, white for other days
        weight: isToday ? 3.0 : 1.5,
        opacity: 1.0,
        fillOpacity: isToday ? 1.0 : 0.85
      });

      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px; max-width: 200px;">
          ${isToday ? `
            <div style="background-color: #ef4444; color: #ffffff; font-size: 8px; font-weight: 900; text-align: center; padding: 2px 4px; border-radius: 4px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
              ★ Added Today ★
            </div>
          ` : ''}
          <div style="font-size: 10px; font-weight: bold; color: ${isToday ? '#d97706' : color}; text-transform: uppercase;">
            ${isReg ? 'New Registration' : 'Asset Record Modification'}
          </div>
          <div style="font-size: 12px; font-weight: bold; color: #0f172a; margin-top: 2px;">
            ${log.equipmentId}
          </div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            Type: <strong>${log.equipmentType}</strong> (${log.voltageLevel})
          </div>
          <div style="font-size: 10px; color: #475569;">
            Operator: <strong>${log.operatorName}</strong>
          </div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">
            ${log.timestamp}
          </div>
        </div>
      `);

      markerGroup.addLayer(marker);
    });

  }, [currentLogs, activeTab]);

  return (
    <div className="space-y-6 select-none">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-6 border border-purple-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-purple-400" />
                Reserved Admin Suite
              </span>
              <span className="text-xs text-slate-400 font-medium">| Audit & Telemetry Control</span>
            </div>

            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-yellow-400 animate-pulse" />
              Asset Change & Registration Audit Monitor
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Real-time day-by-day comparison monitoring for newly registered assets and modifications to existing asset telemetry records across PEA sectors.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                loadLogs();
                if (onRefresh) onRefresh();
              }}
              className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 cursor-pointer transition-all shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Telemetry</span>
            </button>
          </div>
        </div>

        {/* Part 1 vs Part 2 Main Switcher Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('registrations')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'registrations'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Part 1: New Asset Registrations ({registrationLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('edits')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'edits'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>Part 2: Asset Changes & Edits ({editLogs.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span>Active Filtered Records: <strong>{currentLogs.length}</strong></span>
          </div>
        </div>
      </div>

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {activeTab === 'registrations' ? 'Total New Registered Assets' : 'Total Asset Modifications'}
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {currentLogs.length}
            </div>
            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Today Activity: +{dayByDayComparison.todayCount} records
            </p>
          </div>
          <div className={`p-3 rounded-xl border ${activeTab === 'registrations' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
            {activeTab === 'registrations' ? <PlusCircle className="w-6 h-6" /> : <FileEdit className="w-6 h-6" />}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              {activeTab === 'registrations' ? 'DoD: Part 1 New Registrations' : 'DoD: Part 2 Asset Edits'}
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono flex items-center gap-1">
              <span>{dayByDayComparison.dodDiff >= 0 ? `+${dayByDayComparison.dodDiff}` : dayByDayComparison.dodDiff}</span>
              <span className="text-xs font-normal text-slate-500">vs Yesterday</span>
            </div>
            <p className="text-[10px] text-slate-500">
              Today: {dayByDayComparison.todayCount} | Yesterday: {dayByDayComparison.yesterdayCount}
            </p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active Users / Editors
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {userBreakdown.length}
            </div>
            <p className="text-[10px] text-slate-500 truncate max-w-[140px]">
              Top: {userBreakdown[0]?.name || 'N/A'} ({userBreakdown[0]?.count || 0})
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Covered PEA Areas
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {areaBreakdown.filter(a => a[1] > 0).length} / 12
            </div>
            <p className="text-[10px] text-slate-500">
              Active Regional Sectors
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-purple-600" />
            <span>Audit Filters & Controls ({activeTab === 'registrations' ? 'New Registrations' : 'Asset Edits'})</span>
          </div>

          <button
            onClick={() => {
              setTimeRange('30d');
              setSelectedArea('All');
              setSelectedVoltage('All');
              setSelectedType('All');
              setSearchQuery('');
            }}
            className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Time Range */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeOption)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="all">All Historical Logs</option>
            </select>
          </div>

          {/* Area Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">PEA Area Sector</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="All">All 12 PEA Areas</option>
              {PEA_AREAS.map(area => (
                <option key={area} value={area}>
                  {area} - {PEA_AREA_NAMES[area] || area}
                </option>
              ))}
            </select>
          </div>

          {/* Voltage Level */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Voltage Rating</label>
            <select
              value={selectedVoltage}
              onChange={(e) => setSelectedVoltage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="All">All Voltages</option>
              <option value="115">115 kV</option>
              <option value="22">22 kV</option>
              <option value="33">33 kV</option>
              <option value="230">230 kV</option>
            </select>
          </div>

          {/* Equipment Type */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equipment Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="All">All Equipment Types</option>
              <option value="Underground Cable">Underground Cable</option>
              <option value="Joint">Joint</option>
              <option value="Oil Insulated Termination">Oil Insulated Termination</option>
              <option value="GND Link box">GND Link box</option>
              <option value="Lightning Arrester">Lightning Arrester</option>
              <option value="Ring Main Unit">Ring Main Unit</option>
              <option value="Unit Substation">Unit Substation</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Search Asset / User</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ID, Operator, Substation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Day-by-Day Visual Trend Comparison Panel */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span>Day-by-Day Comparison Trend ({activeTab === 'registrations' ? 'New Registrations' : 'Asset Edits & Modifications'})</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Daily comparison histogram showing record volume changes per calendar day.
            </p>
          </div>

          <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[10px] font-bold">
            Max Daily Volume: {dayByDayComparison.maxCount} records
          </span>
        </div>

        {/* Day-by-Day Histogram Bars */}
        <div className="pt-2">
          {dayByDayComparison.entries.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No activity data found for the selected filter range.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-end gap-1.5 h-36 pt-4 px-2 overflow-x-auto">
                {dayByDayComparison.entries.map(([dateKey, count]) => {
                  const pct = Math.max((count / dayByDayComparison.maxCount) * 100, 4);
                  const isToday = dateKey === new Date().toISOString().split('T')[0];

                  return (
                    <div key={dateKey} className="flex-1 min-w-[20px] flex flex-col items-center gap-1.5 group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 hidden group-hover:flex bg-slate-900 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap z-30">
                        {dateKey}: {count} records
                      </div>

                      <div className="w-full bg-slate-100 rounded-t-md h-full flex items-end overflow-hidden">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full transition-all duration-300 rounded-t-md ${
                            isToday
                              ? 'bg-gradient-to-t from-yellow-500 to-amber-400'
                              : activeTab === 'registrations'
                              ? 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:from-emerald-500 group-hover:to-teal-300'
                              : 'bg-gradient-to-t from-purple-600 to-indigo-400 group-hover:from-purple-500 group-hover:to-indigo-300'
                          }`}
                        />
                      </div>

                      <span className={`text-[9px] font-mono rotate-45 sm:rotate-0 origin-left ${isToday ? 'font-bold text-amber-600' : 'text-slate-400'}`}>
                        {dateKey.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4 Breakdown Analytics Cards (Grid 2x2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Breakdown 1: Equipment Type */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600" />
              <span>Sorted by Equipment Type</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-500">{typeBreakdown.length} Categories</span>
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {typeBreakdown.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No equipment type records</div>
            ) : (
              typeBreakdown.map(([type, count]) => {
                const pct = Math.round((count / (currentLogs.length || 1)) * 100);
                return (
                  <div key={type} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span className="font-semibold truncate max-w-[200px]">{type}</span>
                      <span className="font-mono text-slate-500">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className={`h-full rounded-full ${activeTab === 'registrations' ? 'bg-emerald-500' : 'bg-purple-500'}`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Breakdown 2: Voltage Level */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Sorted by Voltage Level Rating</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-500">{voltageBreakdown.length} Classes</span>
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {voltageBreakdown.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No voltage level records</div>
            ) : (
              voltageBreakdown.map(([volt, count]) => {
                const pct = Math.round((count / (currentLogs.length || 1)) * 100);
                return (
                  <div key={volt} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span className="font-semibold">{volt}</span>
                      <span className="font-mono text-slate-500">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full rounded-full bg-amber-500"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Breakdown 3: Area Map Chart */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3 md:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-600" />
                <span>Geographic Area Map Chart ({activeTab === 'registrations' ? 'New Registrations' : 'Asset Edits'})</span>
              </h3>
              <p className="text-[10px] text-slate-500">Spatial distribution across PEA 12 Regional Sectors (N1 to S3)</p>
            </div>

            <span className="text-[10px] font-mono text-slate-500">
              Pins with GPS: {currentLogs.filter(l => l.gps).length}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Embedded Leaflet Map */}
            <div className="lg:col-span-2 h-[450px] rounded-xl border border-slate-200 overflow-hidden relative shadow-inner">
              <div ref={mapContainerRef} className="w-full h-full z-10" />
            </div>

            {/* PEA Sector Distribution List */}
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Records per Sector Area
              </div>
              {areaBreakdown.map(([areaCode, count]) => {
                const pct = Math.round((count / (currentLogs.length || 1)) * 100);
                return (
                  <div key={areaCode} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{areaCode}</span>
                      <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">
                        {PEA_AREA_NAMES[areaCode] || areaCode}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-slate-800">{count}</span>
                      <span className="text-[10px] text-slate-400 block">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Breakdown 4: User / Operator Activity Leaderboard */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3 md:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-purple-600" />
                <span>User Activity Breakdown ({activeTab === 'registrations' ? 'Which User Added New Assets' : 'Which User Edited Assets'})</span>
              </h3>
              <p className="text-[11px] text-slate-500">Ranking of local operators and admins contributing changes to the system</p>
            </div>

            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[10px] font-bold">
              {userBreakdown.length} Contributing Users
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {userBreakdown.length === 0 ? (
              <div className="col-span-full text-center py-6 text-xs text-slate-400">No user activity recorded</div>
            ) : (
              userBreakdown.map((u, idx) => (
                <div key={u.name} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 hover:border-purple-300 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center justify-center border border-purple-200">
                        #{idx + 1}
                      </div>
                      <span className="font-bold text-xs text-slate-900 truncate max-w-[130px]">{u.name}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-purple-700 text-white font-mono text-[10px] font-bold rounded-full">
                      {u.count} {activeTab === 'registrations' ? 'Added' : 'Edits'}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500 space-y-0.5 pt-1 border-t border-slate-200/60">
                    <div className="flex justify-between">
                      <span>Areas Worked:</span>
                      <strong className="text-slate-700">{Array.from(u.areas).join(', ') || 'N/A'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Active:</span>
                      <strong className="text-slate-700">{u.lastTime ? u.lastTime.slice(0, 10) : 'N/A'}</strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detailed Activity Log Table */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600" />
              <span>Detailed Activity Stream Log ({activeTab === 'registrations' ? 'New Registrations' : 'Asset Edits & Changes'})</span>
            </h3>
            <p className="text-[11px] text-slate-500">Full audit log stream showing timestamped changes and user attribution</p>
          </div>

          <span className="text-xs font-mono text-slate-500 font-bold">
            Showing {currentLogs.length} Records
          </span>
        </div>

        <div className="overflow-x-auto max-h-[400px] overflow-y-auto pr-1 border border-slate-100 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                <th className="py-2.5 px-3">Equipment ID</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Voltage</th>
                <th className="py-2.5 px-3">Area / Substation</th>
                <th className="py-2.5 px-3">{activeTab === 'registrations' ? 'Registered By' : 'Edited By'}</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Activity Summary</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No activity logs matching the selected filters.
                  </td>
                </tr>
              ) : (
                currentLogs.slice(0, 100).map((log) => {
                  const targetAsset = assets.find(a => a.equipmentId === log.equipmentId);
                  const logDate = new Date(log.timestamp);
                  const isToday = !isNaN(logDate.getTime()) && logDate.toDateString() === new Date().toDateString();

                  return (
                    <tr 
                      key={log.id} 
                      className={`transition-colors border-l-4 ${
                        isToday 
                          ? 'bg-amber-50 hover:bg-amber-100/80 border-l-amber-500 font-semibold' 
                          : 'hover:bg-purple-50/40 border-l-transparent'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-900">
                        <div className="flex items-center gap-1.5">
                          {isToday && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                          )}
                          <span>{log.equipmentId}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {log.equipmentType}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[10px]">
                          {log.voltageLevel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900">{log.area}</span>
                        {log.substationName && (
                          <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">
                            {log.substationName}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-purple-500" />
                          <span className="font-bold text-slate-900">{log.operatorName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                        {log.timestamp}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-xs truncate">
                        <div className="flex items-center gap-2">
                          {isToday && (
                            <span className="px-1.5 py-0.5 bg-amber-500 text-white font-bold text-[8px] rounded tracking-wider whitespace-nowrap uppercase">
                              ★ New Today
                            </span>
                          )}
                          <span className="truncate">
                            {log.details || (activeTab === 'registrations' ? 'New asset added to database' : 'Asset telemetry & specs modified')}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {targetAsset && onSelectAsset && (
                          <button
                            onClick={() => onSelectAsset(targetAsset)}
                            className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ml-auto cursor-pointer"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
