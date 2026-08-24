import React, { useState, useMemo, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid
} from 'recharts';
import { CableAsset, PEAUser } from '../types';
import { PEA_AREAS, PEA_AREA_NAMES, PEA_AREA_CITIES, getAssetArea } from '../utils/peaData';
import { AssetActivityLog } from '../utils/auditLogger';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Building2,
  MapPin,
  Layers,
  Zap,
  Filter,
  Search,
  ArrowUpRight,
  ChevronRight,
  Download,
  CheckCircle2,
  DollarSign,
  PieChart as PieIcon,
  BarChart3,
  Globe2,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Info
} from 'lucide-react';

interface AssetValueOverviewProps {
  user: PEAUser;
  assets: CableAsset[];
  onSelectAsset?: (asset: CableAsset, log?: AssetActivityLog) => void;
  onRefresh?: () => void;
}

// Color palette for charts
const ASSET_TYPE_COLORS: Record<string, string> = {
  'Underground Cable': '#4f46e5', // Indigo
  'Submarine Cable': '#06b6d4', // Cyan
  'Oil Insulated Termination': '#8b5cf6', // Purple
  'Joint': '#f59e0b', // Amber
  'Ring Main Unit': '#10b981', // Emerald
  'Unit Substation': '#ec4899', // Pink
  'Plug in Termination': '#3b82f6', // Blue
  'Dry Type Termination': '#6366f1', // Indigo
  'Heat Shrink Termination': '#a855f7', // Purple
  'GND Link box': '#64748b', // Slate
  'Lightning Arrester': '#f97316', // Orange
  'Surge Arrester': '#eab308', // Yellow
  'Termination': '#14b8a6', // Teal
  'Ground Box': '#94a3b8', // Gray
  'SVL': '#78716c', // Stone
  'Other': '#94a3b8'
};

const AREA_COLORS: Record<string, string> = {
  N1: '#3b82f6', N2: '#60a5fa', N3: '#93c5fd',
  C1: '#6366f1', C2: '#4f46e5', C3: '#4338ca',
  NE1: '#f59e0b', NE2: '#d97706', NE3: '#b45309',
  S1: '#10b981', S2: '#059669', S3: '#047857'
};

export function parseAssetValue(raw?: string | number): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const s = String(raw).trim().toUpperCase();
  if (!s || s === 'N/A' || s === 'NULL' || s === '-' || s === 'NONE') return 0;

  if (s.includes('M') || s.includes('MILLION') || s.includes('ล้าน')) {
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) return num * 1_000_000;
  }
  if (s.includes('K') || s.includes('พัน')) {
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) return num * 1_000;
  }
  if (s.includes('B') || s.includes('BILLION') || s.includes('พันล้าน')) {
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) return num * 1_000_000_000;
  }

  const clean = s.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export function getCalculatedAssetValue(asset: CableAsset): { value: number; isEstimated: boolean } {
  const explicit = parseAssetValue(asset.assetValue);
  if (explicit > 0) {
    return { value: explicit, isEstimated: false };
  }

  // Realistic PEA benchmark catalog values based on Equipment Type & Voltage
  const eqType = asset.equipmentType || 'Underground Cable';
  const voltage = String(asset.voltageLevel || '115').replace(/[^0-9.]/g, '');

  let estimated = 1_500_000;
  if (eqType === 'Submarine Cable') {
    estimated = voltage === '115' ? 28_500_000 : 16_000_000;
  } else if (eqType === 'Underground Cable') {
    if (voltage === '115') estimated = 12_500_000;
    else if (voltage === '33') estimated = 4_800_000;
    else if (voltage === '22') estimated = 3_800_000;
    else estimated = 2_500_000;
  } else if (eqType.includes('Termination')) {
    estimated = voltage === '115' ? 3_200_000 : 950_000;
  } else if (eqType === 'Joint') {
    estimated = voltage === '115' ? 1_850_000 : 650_000;
  } else if (eqType === 'Ring Main Unit' || eqType === 'Unit Substation') {
    estimated = 2_400_000;
  } else if (eqType === 'GND Link box' || eqType === 'Ground Box' || eqType === 'SVL') {
    estimated = 480_000;
  } else if (eqType === 'Lightning Arrester' || eqType === 'Surge Arrester') {
    estimated = 550_000;
  }

  return { value: estimated, isEstimated: true };
}

export function formatTHB(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `฿${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  if (amount >= 1_000_000) {
    return `฿${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `฿${(amount / 1_000).toFixed(1)}k`;
  }
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatFullTHB(amount: number): string {
  return `฿${Math.round(amount).toLocaleString('en-US')} THB`;
}

export default function AssetValueOverview({
  user,
  assets,
  onSelectAsset,
  onRefresh
}: AssetValueOverviewProps) {
  // Filter States
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedVoltage, setSelectedVoltage] = useState<string>('All');
  const [selectedValueTier, setSelectedValueTier] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'value-desc' | 'value-asc' | 'id' | 'type'>('value-desc');
  const [activeChartView, setActiveChartView] = useState<'type' | 'region' | 'city' | 'voltage'>('type');

  // Leaflet Map Ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);

  // Available cities based on selected area
  const availableCities = useMemo(() => {
    if (selectedArea !== 'All' && PEA_AREA_CITIES[selectedArea]) {
      return PEA_AREA_CITIES[selectedArea];
    }
    // Collect all unique cities from assets
    const citySet = new Set<string>();
    assets.forEach(a => {
      if (a.city && a.city.trim()) citySet.add(a.city.trim());
    });
    return Array.from(citySet).sort();
  }, [selectedArea, assets]);

  // Reset city filter if area changes and city is no longer in area
  useEffect(() => {
    if (selectedArea !== 'All' && selectedCity !== 'All') {
      const citiesInArea = PEA_AREA_CITIES[selectedArea] || [];
      if (!citiesInArea.includes(selectedCity)) {
        setSelectedCity('All');
      }
    }
  }, [selectedArea, selectedCity]);

  // Pre-process assets with area and normalized valuation
  const processedAssets = useMemo(() => {
    return assets.map(a => {
      const area = getAssetArea(a);
      const { value, isEstimated } = getCalculatedAssetValue(a);
      return {
        ...a,
        area: area || 'UNKNOWN',
        calculatedValue: value,
        isEstimatedValue: isEstimated
      };
    });
  }, [assets]);

  // Filtered Assets based on user criteria
  const filteredAssets = useMemo(() => {
    return processedAssets.filter(a => {
      // Area filter
      if (selectedArea !== 'All' && a.area !== selectedArea) return false;

      // City filter
      if (selectedCity !== 'All') {
        const cityMatch = (a.city || '').toLowerCase().includes(selectedCity.toLowerCase()) ||
                          selectedCity.toLowerCase().includes((a.city || '').toLowerCase());
        if (!cityMatch) return false;
      }

      // Equipment Type filter
      if (selectedType !== 'All' && a.equipmentType !== selectedType) return false;

      // Voltage filter
      if (selectedVoltage !== 'All') {
        const v = String(a.voltageLevel || '');
        if (!v.includes(selectedVoltage)) return false;
      }

      // Value Tier filter
      if (selectedValueTier !== 'All') {
        const v = a.calculatedValue;
        if (selectedValueTier === 'tier1' && v < 10_000_000) return false; // > 10M
        if (selectedValueTier === 'tier2' && (v < 5_000_000 || v >= 10_000_000)) return false; // 5M - 10M
        if (selectedValueTier === 'tier3' && (v < 1_000_000 || v >= 5_000_000)) return false; // 1M - 5M
        if (selectedValueTier === 'tier4' && v >= 1_000_000) return false; // < 1M
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = (a.equipmentId || '').toLowerCase().includes(q) || (a.peaNumber || '').toLowerCase().includes(q);
        const matchType = (a.equipmentType || '').toLowerCase().includes(q);
        const matchSub = (a.substationName || '').toLowerCase().includes(q);
        const matchLand = (a.landmark || '').toLowerCase().includes(q);
        const matchWbs = (a.wbs || '').toLowerCase().includes(q);
        const matchCity = (a.city || '').toLowerCase().includes(q);
        if (!matchId && !matchType && !matchSub && !matchLand && !matchWbs && !matchCity) return false;
      }

      return true;
    });
  }, [processedAssets, selectedArea, selectedCity, selectedType, selectedVoltage, selectedValueTier, searchQuery]);

  // Sorted Assets for table and rank list
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      if (sortBy === 'value-desc') return b.calculatedValue - a.calculatedValue;
      if (sortBy === 'value-asc') return a.calculatedValue - b.calculatedValue;
      if (sortBy === 'type') return (a.equipmentType || '').localeCompare(b.equipmentType || '');
      return (a.equipmentId || '').localeCompare(b.equipmentId || '');
    });
  }, [filteredAssets, sortBy]);

  // Total CapEx and Key Metrics
  const metrics = useMemo(() => {
    const totalValue = filteredAssets.reduce((sum, a) => sum + a.calculatedValue, 0);
    const count = filteredAssets.length;
    const avgValue = count > 0 ? totalValue / count : 0;
    const maxValue = filteredAssets.reduce((max, a) => Math.max(max, a.calculatedValue), 0);
    const highestValuedAsset = filteredAssets.find(a => a.calculatedValue === maxValue);

    return { totalValue, count, avgValue, maxValue, highestValuedAsset };
  }, [filteredAssets]);

  // 1. Asset Type Breakdown (Values & Share)
  const typeBreakdownData = useMemo(() => {
    const map: Record<string, { count: number; totalValue: number }> = {};
    filteredAssets.forEach(a => {
      const t = a.equipmentType || 'Other';
      if (!map[t]) map[t] = { count: 0, totalValue: 0 };
      map[t].count += 1;
      map[t].totalValue += a.calculatedValue;
    });

    const totalPortfolio = metrics.totalValue || 1;
    return Object.entries(map)
      .map(([type, d]) => ({
        name: type,
        value: d.totalValue,
        valueInM: parseFloat((d.totalValue / 1_000_000).toFixed(2)),
        count: d.count,
        avgValue: d.count > 0 ? d.totalValue / d.count : 0,
        pct: ((d.totalValue / totalPortfolio) * 100),
        color: ASSET_TYPE_COLORS[type] || '#6366f1'
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAssets, metrics.totalValue]);

  // 2. Regional 12 Areas Breakdown (Highest to Lowest)
  const regionalBreakdownData = useMemo(() => {
    const map: Record<string, { count: number; totalValue: number; name: string }> = {};
    PEA_AREAS.forEach(area => {
      map[area] = { count: 0, totalValue: 0, name: PEA_AREA_NAMES[area] || area };
    });

    filteredAssets.forEach(a => {
      if (map[a.area]) {
        map[a.area].count += 1;
        map[a.area].totalValue += a.calculatedValue;
      }
    });

    const totalPortfolio = metrics.totalValue || 1;
    const list = Object.entries(map).map(([area, d]) => ({
      area,
      fullName: d.name,
      totalValue: d.totalValue,
      valueInM: parseFloat((d.totalValue / 1_000_000).toFixed(2)),
      count: d.count,
      avgValue: d.count > 0 ? d.totalValue / d.count : 0,
      pct: parseFloat(((d.totalValue / totalPortfolio) * 100).toFixed(1)),
      color: AREA_COLORS[area] || '#4f46e5'
    }));

    // Find highest and lowest active
    const activeList = list.filter(r => r.count > 0);
    const sorted = [...activeList].sort((a, b) => b.totalValue - a.totalValue);
    const mostInvested = sorted[0] || null;
    const leastInvested = sorted[sorted.length - 1] || null;

    return { list, sorted, mostInvested, leastInvested };
  }, [filteredAssets, metrics.totalValue]);

  // 3. City Breakdown (Top 5 Most Invested vs 5 Least Invested)
  const cityBreakdownData = useMemo(() => {
    const map: Record<string, { count: number; totalValue: number; area: string }> = {};
    filteredAssets.forEach(a => {
      const city = a.city && a.city.trim() ? a.city.trim() : 'Unknown City';
      if (!map[city]) map[city] = { count: 0, totalValue: 0, area: a.area };
      map[city].count += 1;
      map[city].totalValue += a.calculatedValue;
    });

    const totalPortfolio = metrics.totalValue || 1;
    const allCities = Object.entries(map).map(([city, d]) => ({
      city,
      area: d.area,
      totalValue: d.totalValue,
      valueInM: parseFloat((d.totalValue / 1_000_000).toFixed(2)),
      count: d.count,
      avgValue: d.count > 0 ? d.totalValue / d.count : 0,
      pct: parseFloat(((d.totalValue / totalPortfolio) * 100).toFixed(1))
    })).sort((a, b) => b.totalValue - a.totalValue);

    const top5 = allCities.slice(0, 5);
    const least5 = allCities.length > 5 ? allCities.slice(-5).reverse() : [];

    return { allCities, top5, least5 };
  }, [filteredAssets, metrics.totalValue]);

  // 4. Voltage Level Capital Breakdown
  const voltageBreakdownData = useMemo(() => {
    const map: Record<string, { count: number; totalValue: number }> = {};
    filteredAssets.forEach(a => {
      const v = String(a.voltageLevel || 'Unspecified').replace(/[^0-9.]/g, '') || 'Other';
      const label = v ? `${v} kV` : 'Other';
      if (!map[label]) map[label] = { count: 0, totalValue: 0 };
      map[label].count += 1;
      map[label].totalValue += a.calculatedValue;
    });

    const totalPortfolio = metrics.totalValue || 1;
    return Object.entries(map).map(([volt, d]) => ({
      voltage: volt,
      totalValue: d.totalValue,
      valueInM: parseFloat((d.totalValue / 1_000_000).toFixed(2)),
      count: d.count,
      avgValue: d.count > 0 ? d.totalValue / d.count : 0,
      pct: parseFloat(((d.totalValue / totalPortfolio) * 100).toFixed(1))
    })).sort((a, b) => b.totalValue - a.totalValue);
  }, [filteredAssets, metrics.totalValue]);

  // 5. Value Tiers Distribution (Stock / Histogram)
  const tierDistributionData = useMemo(() => {
    const tiers = [
      { key: 'tier1', label: 'Super-CapEx (> ฿10M)', count: 0, totalValue: 0, color: '#10b981', badge: 'Tier 1' },
      { key: 'tier2', label: 'High-CapEx (฿5M - ฿10M)', count: 0, totalValue: 0, color: '#6366f1', badge: 'Tier 2' },
      { key: 'tier3', label: 'Mid-CapEx (฿1M - ฿5M)', count: 0, totalValue: 0, color: '#3b82f6', badge: 'Tier 3' },
      { key: 'tier4', label: 'Standard (< ฿1M)', count: 0, totalValue: 0, color: '#f59e0b', badge: 'Tier 4' }
    ];

    filteredAssets.forEach(a => {
      const v = a.calculatedValue;
      if (v >= 10_000_000) {
        tiers[0].count += 1;
        tiers[0].totalValue += v;
      } else if (v >= 5_000_000) {
        tiers[1].count += 1;
        tiers[1].totalValue += v;
      } else if (v >= 1_000_000) {
        tiers[2].count += 1;
        tiers[2].totalValue += v;
      } else {
        tiers[3].count += 1;
        tiers[3].totalValue += v;
      }
    });

    const totalPortfolio = metrics.totalValue || 1;
    return tiers.map(t => ({
      ...t,
      pct: parseFloat(((t.totalValue / totalPortfolio) * 100).toFixed(1)),
      valueInM: parseFloat((t.totalValue / 1_000_000).toFixed(2))
    }));
  }, [filteredAssets, metrics.totalValue]);

  // Leaflet Map Initialization & Markers Update
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        preferCanvas: true,
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

    // Map pins for filtered assets with GPS
    const validAssets = filteredAssets.filter(
      a => a.gps && typeof a.gps.lat === 'number' && typeof a.gps.lng === 'number'
    );

    validAssets.forEach(asset => {
      if (!asset.gps) return;

      const v = asset.calculatedValue;
      let color = '#94a3b8';
      let radius = 6;
      let tierLabel = 'Standard (< ฿1M)';

      if (v >= 10_000_000) {
        color = '#10b981'; // Emerald
        radius = 11;
        tierLabel = 'Super-CapEx (> ฿10M)';
      } else if (v >= 5_000_000) {
        color = '#6366f1'; // Indigo
        radius = 9;
        tierLabel = 'High-CapEx (฿5M - ฿10M)';
      } else if (v >= 1_000_000) {
        color = '#3b82f6'; // Blue
        radius = 7;
        tierLabel = 'Mid-CapEx (฿1M - ฿5M)';
      }

      const marker = L.circleMarker([asset.gps.lat, asset.gps.lng], {
        radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1.0,
        fillOpacity: 0.85
      });

      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px; max-width: 230px;">
          <div style="background: ${color}; color: #ffffff; font-size: 9px; font-weight: 800; text-align: center; padding: 2.5px 6px; border-radius: 4px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">
            ${tierLabel}
          </div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a;">
            ${asset.equipmentId}
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 3px;">
            Type: <strong>${asset.equipmentType}</strong> (${asset.voltageLevel || '115'} kV)
          </div>
          <div style="font-size: 11px; color: #475569;">
            Location: <strong>${asset.city || 'N/A'}</strong> (${asset.area})
          </div>
          <div style="font-size: 12px; font-weight: 800; color: #047857; margin-top: 6px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-family: monospace;">
            CapEx Value: ${formatFullTHB(asset.calculatedValue)}
          </div>
          ${asset.isEstimatedValue ? '<div style="font-size: 8.5px; color: #64748b; font-style: italic; margin-top: 1px;">(Catalog benchmark value)</div>' : '<div style="font-size: 8.5px; color: #059669; font-weight: 700; margin-top: 1px;">✓ Registered ledger value</div>'}
        </div>
      `);

      markerGroup.addLayer(marker);
    });

  }, [filteredAssets]);

  // Export Filtered Table to CSV
  const handleExportCSV = () => {
    const headers = [
      'Equipment ID',
      'PEA Number',
      'Area',
      'City',
      'Substation',
      'Equipment Type',
      'Voltage Level (kV)',
      'CapEx Value (THB)',
      'Valuation Source',
      'Manufacturer',
      'Installation Date'
    ];

    const rows = filteredAssets.map(a => [
      `"${a.equipmentId || ''}"`,
      `"${a.peaNumber || ''}"`,
      `"${a.area || ''}"`,
      `"${a.city || ''}"`,
      `"${a.substationName || ''}"`,
      `"${a.equipmentType || ''}"`,
      `"${a.voltageLevel || ''}"`,
      `"${Math.round(a.calculatedValue)}"`,
      `"${a.isEstimatedValue ? 'Catalog Benchmark' : 'Explicit Registered'}"`,
      `"${a.manufacturer || ''}"`,
      `"${a.installationDate || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PEA_Asset_Valuation_Overview_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 select-none animate-fadeIn">
      
      {/* 1. EXECUTIVE KPI SUMMARY METRICS HEADER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total CapEx Valuation */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
            <Coins className="w-28 h-28 text-indigo-400" />
          </div>
          <div className="space-y-1 relative z-10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-yellow-400" />
              Total Portfolio CapEx
            </span>
            <div className="text-2xl lg:text-3xl font-black font-mono text-white tracking-tight">
              {formatTHB(metrics.totalValue)}
            </div>
            <p className="text-[11px] text-indigo-200/90 font-medium flex items-center justify-between pt-1">
              <span>Assets Filtered: <strong>{metrics.count}</strong> units</span>
              <span className="font-mono text-[10px] text-emerald-300">100% Covered</span>
            </p>
          </div>
        </div>

        {/* Card 2: Average Unit Valuation */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Average Unit Value
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {formatTHB(metrics.avgValue)}
            </div>
            <p className="text-[10px] text-slate-500">
              Mean Capital Cost per Asset Unit
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Top Invested Region & CapEx Share */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block flex items-center gap-1">
              <span className="text-amber-500">🥇</span> Top Invested Sector
            </span>
            <div className="text-xl font-black text-slate-900 flex items-baseline gap-1.5">
              <span>{regionalBreakdownData.mostInvested?.area || 'N/A'}</span>
              <span className="text-xs font-mono text-indigo-600 font-bold">
                {formatTHB(regionalBreakdownData.mostInvested?.totalValue || 0)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 truncate max-w-[170px]">
              {regionalBreakdownData.mostInvested?.fullName || 'N/A'} ({regionalBreakdownData.mostInvested?.pct || 0}% Share)
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Top Asset Class by Investment */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Top Asset Investment Class
            </span>
            <div className="text-lg font-black text-slate-900 truncate max-w-[150px]">
              {typeBreakdownData[0]?.name || 'N/A'}
            </div>
            <p className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 font-mono">
              <span>{formatTHB(typeBreakdownData[0]?.value || 0)}</span>
              <span className="text-slate-400 font-normal">({typeBreakdownData[0]?.pct ? typeBreakdownData[0].pct.toFixed(1) : 0}% of CapEx)</span>
            </p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 border border-purple-200 rounded-xl">
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. MULTI-FILTER TOOLBAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
            <span>Valuation Multi-Filter Controls</span>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-semibold">
              Showing {filteredAssets.length} of {assets.length} Assets
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedArea('All');
                setSelectedCity('All');
                setSelectedType('All');
                setSelectedVoltage('All');
                setSelectedValueTier('All');
                setSearchQuery('');
              }}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              title="Download filtered valuation dataset as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Regional Area Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">1. PEA Regional Area</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">All 12 PEA Areas</option>
              {PEA_AREAS.map(area => (
                <option key={area} value={area}>
                  {area} - {PEA_AREA_NAMES[area] || area}
                </option>
              ))}
            </select>
          </div>

          {/* 2. City / Province Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">2. City / Province</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">All Cities ({availableCities.length})</option>
              {availableCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* 3. Asset Type Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">3. Asset Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">All Asset Types</option>
              <option value="Underground Cable">Underground Cable</option>
              <option value="Submarine Cable">Submarine Cable</option>
              <option value="Joint">Joint</option>
              <option value="Oil Insulated Termination">Oil Insulated Termination</option>
              <option value="Dry Type Termination">Dry Type Termination</option>
              <option value="Plug in Termination">Plug in Termination</option>
              <option value="Ring Main Unit">Ring Main Unit</option>
              <option value="Unit Substation">Unit Substation</option>
              <option value="GND Link box">GND Link box</option>
              <option value="Lightning Arrester">Lightning Arrester</option>
            </select>
          </div>

          {/* 4. Voltage Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">4. Voltage Rating</label>
            <select
              value={selectedVoltage}
              onChange={(e) => setSelectedVoltage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">All Voltages</option>
              <option value="115">115 kV</option>
              <option value="33">33 kV</option>
              <option value="22">22 kV</option>
              <option value="230">230 kV</option>
            </select>
          </div>

          {/* 5. Value Range Tier */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">5. CapEx Tier</label>
            <select
              value={selectedValueTier}
              onChange={(e) => setSelectedValueTier(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">All Valuations</option>
              <option value="tier1">&gt; ฿10M (Super-CapEx)</option>
              <option value="tier2">฿5M - ฿10M (High)</option>
              <option value="tier3">฿1M - ฿5M (Medium)</option>
              <option value="tier4">&lt; ฿1M (Standard)</option>
            </select>
          </div>

          {/* 6. Search Bar */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">6. Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="ID, Substation, WBS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. CORE ANALYTICAL CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* CHART 1: ASSET TYPE INVESTMENT BREAKDOWN (WHICH TYPE HAS MOST MONEY) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-indigo-600" />
                <span>Asset Type Capital Investment Share</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Identifies which equipment category represents the largest financial investment
              </p>
            </div>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-[10px] font-bold rounded-full border border-indigo-200">
              {typeBreakdownData.length} Equipment Types
            </span>
          </div>

          {/* Pie / Donut Chart with Recharts */}
          <div className="h-64 w-full">
            {typeBreakdownData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No matching asset type data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {typeBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [formatFullTHB(Number(val)), 'Total CapEx']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '11px',
                      border: 'none'
                    }}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Ranked List with Values & Share % */}
          <div className="space-y-2 pt-2 border-t border-slate-100 max-h-48 overflow-y-auto pr-1">
            {typeBreakdownData.map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between text-xs p-1.5 hover:bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-md shrink-0 shadow-2xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-semibold text-slate-800 truncate max-w-[180px]">{item.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({item.count} units)</span>
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold text-slate-900">{formatTHB(item.value)}</span>
                  <span className="text-[10px] text-indigo-600 font-bold ml-1.5">({item.pct.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CHART 2: REGIONAL 12 AREAS INVESTMENT (MOST VS LEAST INVESTED AREA) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>12 Regional Areas Investment Comparison</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Direct comparison of capital allocation across all 12 PEA regional sectors (N1 to S3)
              </p>
            </div>

            {/* Quick Most vs Least Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {regionalBreakdownData.mostInvested && (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                  Most: {regionalBreakdownData.mostInvested.area} ({formatTHB(regionalBreakdownData.mostInvested.totalValue)})
                </span>
              )}
              {regionalBreakdownData.leastInvested && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-amber-600" />
                  Least: {regionalBreakdownData.leastInvested.area} ({formatTHB(regionalBreakdownData.leastInvested.totalValue)})
                </span>
              )}
            </div>
          </div>

          {/* Bar Chart with Recharts */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionalBreakdownData.list} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="area"
                  tick={{ fontSize: 10, fill: '#475569', fontWeight: 'bold' }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(val) => `฿${val}M`}
                />
                <Tooltip
                  formatter={(val: any) => [`฿${val}M THB`, 'CapEx Investment']}
                  labelFormatter={(area) => `${area} - ${PEA_AREA_NAMES[area as string] || area}`}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '11px',
                    border: 'none'
                  }}
                />
                <Bar dataKey="valueInM" radius={[4, 4, 0, 0]}>
                  {regionalBreakdownData.list.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.area === regionalBreakdownData.mostInvested?.area ? '#10b981' : entry.color}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Regional Table Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
            {regionalBreakdownData.sorted.slice(0, 4).map((r, idx) => (
              <div key={r.area} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900 flex items-center gap-1">
                    {idx === 0 && '🥇'} {r.area}
                  </span>
                  <span className="text-[10px] font-mono text-indigo-700 font-black">{r.pct}%</span>
                </div>
                <div className="font-mono font-bold text-slate-800 text-xs">{formatTHB(r.totalValue)}</div>
                <div className="text-[10px] text-slate-400">{r.count} units</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 4. CITY BREAKDOWN (MOST VS LEAST INVESTED CITIES) & VALUE TIERS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Top 5 Most Invested Cities */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Top 5 Most Invested Cities</span>
            </h3>
            <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
              Highest CapEx
            </span>
          </div>

          <div className="space-y-2">
            {cityBreakdownData.top5.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No city data available</div>
            ) : (
              cityBreakdownData.top5.map((c, idx) => (
                <div key={c.city} className="p-2.5 bg-emerald-50/40 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">{c.city}</span>
                      <span className="text-[10px] text-slate-500 block">
                        Area: <strong>{c.area}</strong> • {c.count} assets
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-emerald-900">{formatTHB(c.totalValue)}</span>
                    <span className="text-[10px] text-emerald-600 block font-semibold">{c.pct}% share</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 5 Least Invested / Emerging Cities */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-600" />
              <span>5 Least Invested Cities</span>
            </h3>
            <span className="text-[10px] font-mono text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full">
              Lowest CapEx
            </span>
          </div>

          <div className="space-y-2">
            {cityBreakdownData.least5.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No city data available</div>
            ) : (
              cityBreakdownData.least5.map((c, idx) => (
                <div key={c.city} className="p-2.5 bg-amber-50/40 rounded-xl border border-amber-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">{c.city}</span>
                      <span className="text-[10px] text-slate-500 block">
                        Area: <strong>{c.area}</strong> • {c.count} assets
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-amber-900">{formatTHB(c.totalValue)}</span>
                    <span className="text-[10px] text-amber-700 block font-semibold">{c.pct}% share</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CapEx Valuation Tier Distribution */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Coins className="w-4 h-4 text-indigo-600" />
              <span>Investment Tier Distribution</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-500">4 Tiers</span>
          </div>

          <div className="space-y-2.5">
            {tierDistributionData.map(tier => (
              <div key={tier.key} className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-semibold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tier.color }} />
                    {tier.label}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatTHB(tier.totalValue)} <span className="text-slate-400 font-normal">({tier.count})</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${tier.pct}%`, backgroundColor: tier.color }}
                    className="h-full rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 mt-2 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-indigo-600" />
              <span>Valuation Methodology</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Values originate from recorded ledger parameters (Col AF) and PEA benchmark infrastructure costing models.
            </p>
          </div>
        </div>

      </div>

      {/* 5. GEOGRAPHIC VALUE MAP (LEAFLET) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              <span>National Geographic CapEx Value Map (12 Regions)</span>
            </h3>
            <p className="text-[10px] text-slate-500">
              Interactive spatial distribution sized and color-coded by asset valuation tiers
            </p>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-semibold flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> &gt; ฿10M
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> ฿5M-฿10M
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> ฿1M-฿5M
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> &lt; ฿1M
            </span>
          </div>
        </div>

        <div className="h-[460px] rounded-xl border border-slate-200 overflow-hidden relative shadow-inner">
          <div ref={mapContainerRef} className="w-full h-full z-10" />
        </div>
      </div>

      {/* 6. DETAILED ASSET VALUATION EXPLORER TABLE */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Asset Valuation Catalog Explorer ({filteredAssets.length} Records)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Detailed breakdown of asset values with single-click inspection to the Asset Record panel
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <option value="value-desc">Highest Value First (฿)</option>
              <option value="value-asc">Lowest Value First (฿)</option>
              <option value="id">Equipment ID</option>
              <option value="type">Equipment Type</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto pr-1 border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-xs">
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3">Equipment ID</th>
                <th className="py-2.5 px-3">Equipment Type</th>
                <th className="py-2.5 px-3">Voltage</th>
                <th className="py-2.5 px-3">Area / Sector</th>
                <th className="py-2.5 px-3">City / Substation</th>
                <th className="py-2.5 px-3">CapEx Value (THB)</th>
                <th className="py-2.5 px-3">Valuation Source</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No assets found matching the selected valuation filters.
                  </td>
                </tr>
              ) : (
                sortedAssets.slice(0, 150).map((asset) => {
                  const val = asset.calculatedValue;
                  const isTopTier = val >= 10_000_000;
                  const isMidHigh = val >= 5_000_000;

                  return (
                    <tr
                      key={asset.equipmentId || asset.number}
                      className={`transition-colors hover:bg-indigo-50/40 ${
                        isTopTier ? 'bg-emerald-50/30' : isMidHigh ? 'bg-indigo-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          {isTopTier && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Super-CapEx Asset (> ฿10M)" />
                          )}
                          <span>{asset.equipmentId}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {asset.equipmentType}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[10px] font-bold border border-slate-200/60">
                          {asset.voltageLevel || '115'} kV
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900">{asset.area}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800">{asset.city || 'N/A'}</span>
                        {asset.substationName && (
                          <span className="text-[10px] text-slate-500 block truncate max-w-[130px]">
                            {asset.substationName}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className={isTopTier ? 'text-emerald-800 text-sm font-black' : 'text-slate-900'}>
                            {formatFullTHB(val)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {asset.isEstimatedValue ? (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-md border border-slate-200">
                            Catalog Benchmark
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md border border-emerald-200 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Registered Ledger
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {onSelectAsset && (
                          <button
                            onClick={() => onSelectAsset(asset)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ml-auto cursor-pointer border border-indigo-200"
                            title="Inspect in Asset Record panel"
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
