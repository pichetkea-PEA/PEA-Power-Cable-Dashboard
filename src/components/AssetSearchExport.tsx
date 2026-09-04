import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Filter, 
  Sparkles, 
  Database, 
  Eye, 
  Wind, 
  CheckCircle2, 
  AlertTriangle, 
  ChevronRight, 
  Layers, 
  RefreshCw, 
  Info, 
  SlidersHorizontal,
  FileSpreadsheet,
  Check,
  ChevronLeft
} from 'lucide-react';
import { CableAsset, PEAUser, EquipmentType } from '../types';
import { 
  PEA_AREAS, 
  PEA_AREA_NAMES, 
  PEA_AREA_CITIES, 
  EQUIPMENT_TYPES, 
  VOLTAGE_LEVELS, 
  getAvailableEquipmentTypes,
  getAssetArea 
} from '../utils/peaData';
import { 
  estimateSF6ForAsset, 
  fetchAIEstimatedSF6, 
  isSF6Equipment, 
  SF6EstimationResult 
} from '../utils/sf6Estimator';

interface AssetSearchExportProps {
  user: PEAUser;
  assets: CableAsset[];
  onSelectAssetForInspect?: (asset: CableAsset) => void;
  onRefreshDatabase?: () => void;
}

export default function AssetSearchExport({
  user,
  assets,
  onSelectAssetForInspect,
  onRefreshDatabase
}: AssetSearchExportProps) {
  // --- Filter State ---
  const [filterArea, setFilterArea] = useState<string>(
    (user.role === 'Admin' || user.role === 'Manager') ? 'All' : user.interestArea
  );
  const [filterCity, setFilterCity] = useState<string>('All');
  const [filterVoltage, setFilterVoltage] = useState<string>('All');
  const [filterEqType, setFilterEqType] = useState<string>('All');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [searchField, setSearchField] = useState<'All' | 'PEA Number' | 'Equipment Number ADS' | 'Account Asset Number (AA)' | 'Equipment ID' | 'WBS' | 'Substation' | 'Feeder' | 'Manufacturer' | 'Model'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Table pagination & view
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [hasSearched, setHasSearched] = useState<boolean>(true);
  const [isSearchingAI, setIsSearchingAI] = useState<boolean>(false);
  const [aiEstimations, setAiEstimations] = useState<Record<string, SF6EstimationResult>>({});
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [selectedSf6Detail, setSelectedSf6Detail] = useState<{ asset: CableAsset; sf6: SF6EstimationResult } | null>(null);

  // Available cities based on selected area
  const availableCities = useMemo(() => {
    if (filterArea === 'All' || filterArea === 'ALL') {
      const all: string[] = [];
      Object.values(PEA_AREA_CITIES).forEach(cities => {
        cities.forEach(c => {
          if (!all.includes(c)) all.push(c);
        });
      });
      return all.sort();
    }
    return PEA_AREA_CITIES[filterArea] || [];
  }, [filterArea]);

  // Available equipment types based on selected voltage
  const availableEquipmentTypes = useMemo(() => {
    if (filterVoltage === 'All') {
      return EQUIPMENT_TYPES;
    }
    return getAvailableEquipmentTypes(filterVoltage);
  }, [filterVoltage]);

  // Reset filterEqType if voltage changed and current eqType is not available
  useEffect(() => {
    if (filterEqType !== 'All' && !availableEquipmentTypes.includes(filterEqType as EquipmentType)) {
      setFilterEqType('All');
    }
  }, [availableEquipmentTypes, filterEqType]);

  // Unique latest assets deduplication
  const uniqueAssets = useMemo(() => {
    const map = new Map<string, CableAsset>();
    const sorted = [...assets].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp.replace(/-/g, '/')).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp.replace(/-/g, '/')).getTime() : 0;
      return aTime - bTime;
    });
    for (const asset of sorted) {
      if (asset.equipmentId) {
        map.set(asset.equipmentId, asset);
      }
    }
    return Array.from(map.values());
  }, [assets]);

  // Filtered Assets based on user criteria
  const filteredAssets = useMemo(() => {
    let result = uniqueAssets;

    // 1. Role & Area Filter
    if (user.role !== 'Admin' && user.role !== 'Manager' && user.interestArea !== 'ALL' && user.interestArea !== 'All') {
      result = result.filter(a => getAssetArea(a) === user.interestArea);
    } else if (filterArea !== 'All' && filterArea !== 'ALL') {
      result = result.filter(a => getAssetArea(a) === filterArea);
    }

    // 2. City Filter
    if (filterCity !== 'All') {
      result = result.filter(a => a.city === filterCity);
    }

    // 3. Voltage Filter
    if (filterVoltage !== 'All') {
      result = result.filter(a => a.voltageLevel === filterVoltage);
    }

    // 4. Equipment Type Filter
    if (filterEqType !== 'All') {
      result = result.filter(a => a.equipmentType === filterEqType);
    }

    // 5. Year Filter
    if (filterYear !== 'All') {
      result = result.filter(a => String(a.yearOfRegistration) === filterYear);
    }

    // 6. Text Search Filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(a => {
        if (searchField === 'PEA Number') return a.peaNumber?.toLowerCase().includes(query);
        if (searchField === 'Equipment Number ADS') return (a.adsNumber || a.assetNumber)?.toLowerCase().includes(query);
        if (searchField === 'Account Asset Number (AA)') return (a.assetNumber || a.adsNumber)?.toLowerCase().includes(query);
        if (searchField === 'Equipment ID') return a.equipmentId?.toLowerCase().includes(query);
        if (searchField === 'WBS') return a.wbs?.toLowerCase().includes(query);
        if (searchField === 'Substation') return a.substationName?.toLowerCase().includes(query);
        if (searchField === 'Feeder') return a.feeder?.toLowerCase().includes(query);
        if (searchField === 'Manufacturer') return a.manufacturer?.toLowerCase().includes(query);
        if (searchField === 'Model') return a.model?.toLowerCase().includes(query);

        // 'All' fields search
        return (
          a.equipmentId?.toLowerCase().includes(query) ||
          a.peaNumber?.toLowerCase().includes(query) ||
          a.assetNumber?.toLowerCase().includes(query) ||
          a.adsNumber?.toLowerCase().includes(query) ||
          a.wbs?.toLowerCase().includes(query) ||
          a.substationName?.toLowerCase().includes(query) ||
          a.feeder?.toLowerCase().includes(query) ||
          a.manufacturer?.toLowerCase().includes(query) ||
          a.model?.toLowerCase().includes(query) ||
          a.city?.toLowerCase().includes(query) ||
          a.serialNumber?.toLowerCase().includes(query) ||
          a.landmark?.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [uniqueAssets, user, filterArea, filterCity, filterVoltage, filterEqType, filterYear, searchField, searchQuery]);

  // Check if current search result set contains any RMU or Unit Substation
  const hasSF6InResults = useMemo(() => {
    return filteredAssets.some(a => isSF6Equipment(a.equipmentType));
  }, [filteredAssets]);

  // Aggregate SF6 metrics
  const sf6Summary = useMemo(() => {
    let count = 0;
    let totalKg = 0;
    filteredAssets.forEach(asset => {
      if (isSF6Equipment(asset.equipmentType)) {
        count++;
        const est = aiEstimations[asset.equipmentId] || estimateSF6ForAsset(asset);
        if (est.estimatedGasKg) {
          totalKg += est.estimatedGasKg;
        }
      }
    });
    const co2Tonnes = Math.round(totalKg * 23.5 * 10) / 10;
    return {
      count,
      totalKg: Math.round(totalKg * 100) / 100,
      co2Tonnes
    };
  }, [filteredAssets, aiEstimations]);

  // Automatically trigger SF6 AI datasheet estimation when searching if SF6 items are present
  const runSearch = async () => {
    setHasSearched(true);
    setCurrentPage(1);

    const sf6Items = filteredAssets.filter(a => isSF6Equipment(a.equipmentType));
    if (sf6Items.length > 0) {
      setIsSearchingAI(true);
      try {
        const enriched = await fetchAIEstimatedSF6(
          sf6Items.slice(0, 50).map(a => ({
            equipmentId: a.equipmentId,
            manufacturer: a.manufacturer,
            model: a.model,
            voltageLevel: a.voltageLevel,
            equipmentType: a.equipmentType,
            substationName: a.substationName
          }))
        );
        setAiEstimations(prev => ({ ...prev, ...enriched }));
      } catch (err) {
        console.warn('AI SF6 estimation notice:', err);
      } finally {
        setIsSearchingAI(false);
      }
    }
  };

  // Run auto estimation whenever filteredAssets changes and has SF6
  useEffect(() => {
    const sf6Items = filteredAssets.filter(a => isSF6Equipment(a.equipmentType));
    if (sf6Items.length > 0 && sf6Items.length <= 25) {
      fetchAIEstimatedSF6(
        sf6Items.map(a => ({
          equipmentId: a.equipmentId,
          manufacturer: a.manufacturer,
          model: a.model,
          voltageLevel: a.voltageLevel,
          equipmentType: a.equipmentType,
          substationName: a.substationName
        }))
      ).then(enriched => {
        setAiEstimations(prev => ({ ...prev, ...enriched }));
      }).catch(e => console.warn(e));
    }
  }, [filterEqType, filterVoltage, filterArea]);

  // Paginated equipment list
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, currentPage, pageSize]);

  // Helper for quick preset buttons
  const applyPreset = (eqType: string, label?: string) => {
    setFilterEqType(eqType);
    setSearchQuery('');
    setSearchField('All');
    setCurrentPage(1);
  };

  // --- CSV Export Handler ---
  const handleExportCSV = () => {
    if (filteredAssets.length === 0) return;

    // Base Columns
    const baseHeaders = [
      'Number',
      'Equipment ID',
      'PEA Number',
      'Asset Number (AA)',
      'Equipment Number (ADS)',
      'Voltage Level (kV)',
      'Equipment Type',
      'PEA Area',
      'City / Province',
      'Location Type',
      'Substation Name',
      'Substation ID',
      'Feeder',
      'Operate ID',
      'Manufacturer',
      'Country of Origin',
      'Model',
      'Serial Number',
      'Size',
      'Installation Date',
      'Year of Registration',
      'Production Month',
      'WBS Code',
      'Business Type',
      'Cost Center',
      'GIS Tag',
      'Asset Class',
      'Contract Number',
      'Work Order',
      'Asset Value (THB)',
      'Landmark',
      'GPS Coordinates',
      'QR Engineering Document URL',
      'Health Score (/100)',
      'Health Status Classification',
      'Measured Surface Temp (°C)',
      'Load Current (A)',
      'Sheath Current (A)',
      'Partial Discharge Level (pC)',
      'PD Result Type',
      'Online PD Amplitude (mV)',
      'Insulation Resistance (GΩ)',
      'Tan Delta Result',
      'Tan Delta Amplitude (%)',
      'Latest Updated By',
      'Latest Updated At'
    ];

    // SF6 Extra Columns if present in results
    const sf6Headers = hasSF6InResults ? [
      'Estimated SF6 Gas Used (kg)',
      'SF6 Gas Compartment & Configuration',
      'Nominal SF6 Filling Pressure (bar rel @ 20°C)',
      'GWP CO2 Equivalent (Tonnes CO2e)',
      'SF6 Datasheet & Engineering Source',
      'SF6 Estimation Notes & Technical Rationale'
    ] : [];

    const allHeaders = [...baseHeaders, ...sf6Headers];

    const escapeVal = (val: any) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/"/g, '""');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str}"`;
      }
      return str;
    };

    const rows = filteredAssets.map((asset, idx) => {
      const area = getAssetArea(asset);
      const sf6Info = isSF6Equipment(asset.equipmentType) 
        ? (aiEstimations[asset.equipmentId] || estimateSF6ForAsset(asset))
        : null;

      const baseRow = [
        asset.number || idx + 1,
        escapeVal(asset.equipmentId),
        escapeVal(asset.peaNumber),
        escapeVal(asset.assetNumber),
        escapeVal(asset.adsNumber),
        escapeVal(asset.voltageLevel),
        escapeVal(asset.equipmentType),
        escapeVal(area),
        escapeVal(asset.city),
        escapeVal(asset.locationType),
        escapeVal(asset.substationName),
        escapeVal(asset.substationId),
        escapeVal(asset.feeder),
        escapeVal(asset.operateId),
        escapeVal(asset.manufacturer),
        escapeVal(asset.country),
        escapeVal(asset.model),
        escapeVal(asset.serialNumber),
        escapeVal(asset.size),
        escapeVal(asset.installationDate),
        escapeVal(asset.yearOfRegistration),
        escapeVal(asset.productionMonth),
        escapeVal(asset.wbs),
        escapeVal(asset.businessType),
        escapeVal(asset.costCenter),
        escapeVal(asset.gistag),
        escapeVal(asset.class),
        escapeVal(asset.contractNumber),
        escapeVal(asset.workOrder),
        escapeVal(asset.assetValue),
        escapeVal(asset.landmark),
        escapeVal(asset.gps ? `${asset.gps.lat}, ${asset.gps.lng}` : ''),
        escapeVal(asset.qrDocument),
        escapeVal(asset.healthScore ?? 100),
        escapeVal(asset.healthStatus ?? 'Green'),
        escapeVal(asset.surfaceTemperature ?? 'N/A'),
        escapeVal(asset.loadCurrent ?? 'N/A'),
        escapeVal(asset.sheathCurrent ?? 'N/A'),
        escapeVal(asset.externalDischarge ?? 'N/A'),
        escapeVal(asset.pdResult ?? 'None'),
        escapeVal(asset.onlinePdAmplitude ?? 'N/A'),
        escapeVal(asset.insulationResistance ?? 'N/A'),
        escapeVal(asset.tanDelta ?? 'No record'),
        escapeVal(asset.tanDeltaAmplitude ?? 'N/A'),
        escapeVal(asset.latestUpdatedBy || asset.operatorName || 'System'),
        escapeVal(asset.latestUpdatedAt || asset.timestamp || 'N/A')
      ];

      if (hasSF6InResults) {
        if (sf6Info && sf6Info.isApplicable) {
          baseRow.push(
            escapeVal(sf6Info.estimatedGasKg ? `${sf6Info.estimatedGasKg.toFixed(2)} kg` : 'N/A'),
            escapeVal(sf6Info.compartmentType),
            escapeVal(sf6Info.nominalPressureBar ? `${sf6Info.nominalPressureBar} bar` : '1.4 bar'),
            escapeVal(sf6Info.co2EquivalentTons ? `${sf6Info.co2EquivalentTons} tCO2e` : 'N/A'),
            escapeVal(sf6Info.referenceSource),
            escapeVal(sf6Info.notes)
          );
        } else {
          baseRow.push(
            'N/A (Non-SF6 Equipment)',
            'Air / Solid Insulated',
            'N/A',
            '0.0 tCO2e',
            'Standard Non-Gas Dielectric',
            'Equipment uses solid or air insulation dielectric'
          );
        }
      }

      return baseRow.join(',');
    });

    // Add UTF-8 BOM so Excel opens Thai / Unicode correctly
    const csvContent = '\uFEFF' + [allHeaders.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    const dateStr = new Date().toISOString().slice(0, 10);
    const eqLabel = filterEqType !== 'All' ? filterEqType.replace(/\s+/g, '_') : 'Assets';
    link.setAttribute('download', `PEA_Search_Export_${eqLabel}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 4000);
  };

  return (
    <div className="space-y-6" id="asset-search-export-container">
      {/* 1. Header & Overview Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-purple-700 tracking-wider uppercase bg-purple-50 border border-purple-200/60 px-2.5 py-0.5 rounded-full">
              Comprehensive Query & Bulk Export
            </span>
            {hasSF6InResults && (
              <span className="text-[10px] font-black text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Wind className="w-3 h-3 text-sky-600" />
                SF6 Gas Intelligence Active
              </span>
            )}
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mt-1.5 flex items-center gap-2">
            Search & Export Assets
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-3xl">
            Query power grid equipment across all 12 PEA operational sectors by condition, inspect technical telemetry, and export full general details and engineering specifications with automated SF6 gas estimations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {onRefreshDatabase && (
            <button
              type="button"
              onClick={onRefreshDatabase}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
              <span>Refresh Pool</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredAssets.length === 0}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm cursor-pointer ${
              exportSuccess 
                ? 'bg-emerald-600 text-white' 
                : 'bg-gradient-to-r from-purple-800 to-purple-900 hover:from-purple-900 hover:to-purple-950 text-white disabled:opacity-50'
            }`}
          >
            {exportSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span>Export Complete!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-purple-200" />
                <span>Export CSV ({filteredAssets.length} Units)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Quick Filter Presets */}
      <div className="bg-gray-50/80 border border-gray-200/80 p-3 rounded-2xl flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1 ml-1 mr-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-purple-700" />
          Quick Filters:
        </span>

        <button
          type="button"
          onClick={() => applyPreset('All')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterEqType === 'All' ? 'bg-purple-900 text-white shadow-xs' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          All Equipment ({uniqueAssets.length})
        </button>

        <button
          type="button"
          onClick={() => applyPreset('Ring Main Unit')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            filterEqType === 'Ring Main Unit' ? 'bg-purple-900 text-white shadow-xs' : 'bg-white text-purple-900 hover:bg-purple-50 border border-purple-200'
          }`}
        >
          <Wind className="w-3.5 h-3.5 text-sky-500" />
          <span>Ring Main Unit (RMU)</span>
          <span className="text-[10px] font-mono opacity-80">
            ({uniqueAssets.filter(a => a.equipmentType === 'Ring Main Unit').length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => applyPreset('Unit Substation')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            filterEqType === 'Unit Substation' ? 'bg-purple-900 text-white shadow-xs' : 'bg-white text-purple-900 hover:bg-purple-50 border border-purple-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-amber-500" />
          <span>Unit Substation (USS)</span>
          <span className="text-[10px] font-mono opacity-80">
            ({uniqueAssets.filter(a => a.equipmentType === 'Unit Substation').length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => applyPreset('Oil Insulated Termination')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterEqType === 'Oil Insulated Termination' ? 'bg-purple-900 text-white shadow-xs' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          Oil Insulated Termination ({uniqueAssets.filter(a => a.equipmentType === 'Oil Insulated Termination').length})
        </button>

        <button
          type="button"
          onClick={() => applyPreset('Underground Cable')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterEqType === 'Underground Cable' ? 'bg-purple-900 text-white shadow-xs' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          Underground Cable ({uniqueAssets.filter(a => a.equipmentType === 'Underground Cable').length})
        </button>
      </div>

      {/* 3. Filter & Condition Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4" id="search-export-filters">
        <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2.5">
          <Filter className="w-4 h-4 text-purple-700" />
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            Filter Parameters & Search Interest Conditions
          </h3>
        </div>

        {/* 5-Dropdown Filter Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Area Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">PEA Operational Area</label>
            <select
              value={filterArea}
              onChange={e => { setFilterArea(e.target.value); setCurrentPage(1); }}
              disabled={user.role !== 'Admin' && user.role !== 'Manager'}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 disabled:bg-gray-100 disabled:text-gray-400"
            >
              {(user.role === 'Admin' || user.role === 'Manager') && (
                <option value="All">All 12 Regional Areas</option>
              )}
              {PEA_AREAS.map(area => (
                <option key={area} value={area}>Area {area} - {PEA_AREA_NAMES[area]}</option>
              ))}
            </select>
          </div>

          {/* 2. City Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">City / Province</label>
            <select
              value={filterCity}
              onChange={e => { setFilterCity(e.target.value); setCurrentPage(1); }}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
            >
              <option value="All">All Cities</option>
              {availableCities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 3. Voltage Level */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Voltage Level</label>
            <select
              value={filterVoltage}
              onChange={e => { setFilterVoltage(e.target.value); setCurrentPage(1); }}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
            >
              <option value="All">All Voltages</option>
              {VOLTAGE_LEVELS.map(v => (
                <option key={v} value={v}>{v} kV</option>
              ))}
            </select>
          </div>

          {/* 4. Equipment Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Equipment Classification</label>
            <select
              value={filterEqType}
              onChange={e => { setFilterEqType(e.target.value); setCurrentPage(1); }}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
            >
              <option value="All">All Equipment Types</option>
              {availableEquipmentTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* 5. Year Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Registration Year</label>
            <select
              value={filterYear}
              onChange={e => { setFilterYear(e.target.value); setCurrentPage(1); }}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
            >
              <option value="All">All Registration Years</option>
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
        </div>

        {/* Search Field & Query Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-gray-50">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Specific Search Field</label>
            <select
              value={searchField}
              onChange={e => setSearchField(e.target.value as any)}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
            >
              <option value="All">Any Field / Broad Query</option>
              <option value="PEA Number">PEA Number (ID)</option>
              <option value="Equipment Number ADS">Equipment Number (ADS)</option>
              <option value="Account Asset Number (AA)">Account Asset Number (AA)</option>
              <option value="Equipment ID">Equipment ID</option>
              <option value="WBS">WBS Code</option>
              <option value="Substation">Substation Name</option>
              <option value="Feeder">Feeder ID</option>
              <option value="Manufacturer">Manufacturer</option>
              <option value="Model">Model / Spec</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 md:col-span-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Search Query Value</label>
            <div className="flex gap-2">
              <div className="relative grow">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={`Search by ${searchField === 'All' ? 'keyword, ID, WBS, substation, model...' : searchField}...`}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-xs font-medium text-gray-800 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={runSearch}
                className="bg-purple-900 hover:bg-purple-950 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
              >
                {isSearchingAI ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-200" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Search Assets</span>
              </button>

              {(searchQuery || filterEqType !== 'All' || filterVoltage !== 'All' || filterCity !== 'All' || filterYear !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterCity('All');
                    setFilterVoltage('All');
                    setFilterEqType('All');
                    setFilterYear('All');
                    setSearchField('All');
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Real-time Summary Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Matched */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase block tracking-wider">
              Total Equipment Found
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-gray-900">{filteredAssets.length}</span>
              <span className="text-xs font-bold text-gray-400">units in system</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700">
            <Database className="w-5 h-5" />
          </div>
        </div>

        {/* Ring Main Units / SF6 Equipment Count */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase block tracking-wider">
              Ring Main & Substations
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-purple-900">{sf6Summary.count}</span>
              <span className="text-xs font-bold text-purple-600">RMU / USS units</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700">
            <Wind className="w-5 h-5" />
          </div>
        </div>

        {/* Estimated SF6 Gas Mass (kg) */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase block tracking-wider">
              Total Estimated SF6 Gas
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-sky-700">{sf6Summary.totalKg.toFixed(2)}</span>
              <span className="text-xs font-bold text-sky-600">kg SF6</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Equivalent GWP CO2 */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase block tracking-wider">
              Carbon Equivalent (GWP)
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-700">{sf6Summary.co2Tonnes.toLocaleString()}</span>
              <span className="text-xs font-bold text-emerald-600">tCO2e (GWP 23,500)</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 5. Results Table Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="asset-search-table-card">
        {/* Table Controls Bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
              Search Results ({filteredAssets.length} Total Units)
            </span>
            {hasSF6InResults && (
              <span className="text-[10px] font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-md">
                + SF6 Gas Spec Column Included
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Rows Per Page:</label>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-white border border-gray-200 rounded-lg py-1 px-2 text-xs font-bold text-gray-700"
              >
                <option value={10}>10 items (Standard)</option>
                <option value={20}>20 items</option>
                <option value={50}>50 items</option>
                <option value={100}>100 items</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredAssets.length === 0}
              className="bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-100/75 text-gray-700 text-[10px] font-black uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3.5">#</th>
                  <th className="py-3 px-3.5">Equipment ID</th>
                  <th className="py-3 px-3.5">Type & Classification</th>
                  <th className="py-3 px-3.5">Identifiers (PEA / ADS / AA)</th>
                  <th className="py-3 px-3.5">Location / Substation</th>
                  <th className="py-3 px-3.5">Voltage & Year</th>
                  <th className="py-3 px-3.5">Manufacturer & Model</th>
                  <th className="py-3 px-3.5 text-center">Health Index</th>
                  {hasSF6InResults && (
                    <th className="py-3 px-3.5 text-sky-900 bg-sky-50/70 border-l border-sky-100">
                      Estimated SF6 Gas (kg)
                    </th>
                  )}
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedAssets.map((asset, idx) => {
                  const isSF6 = isSF6Equipment(asset.equipmentType);
                  const sf6Info = isSF6 ? (aiEstimations[asset.equipmentId] || estimateSF6ForAsset(asset)) : null;
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;

                  return (
                    <tr 
                      key={asset.equipmentId || idx}
                      className="hover:bg-purple-50/40 transition-all group"
                    >
                      <td className="py-3 px-3.5 font-mono text-[11px] text-gray-400 font-bold">
                        {rowNumber}
                      </td>

                      <td className="py-3 px-3.5">
                        <span className="font-mono text-xs font-black text-gray-900 block group-hover:text-purple-900 transition-colors">
                          {asset.equipmentId}
                        </span>
                        {asset.wbs && (
                          <span className="text-[10px] text-gray-400 font-mono">
                            WBS: {asset.wbs}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          isSF6 
                            ? 'bg-sky-50 text-sky-800 border border-sky-200' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isSF6 && <Wind className="w-3 h-3 text-sky-600 shrink-0" />}
                          {asset.equipmentType}
                        </span>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="space-y-0.5">
                          {asset.peaNumber && (
                            <div className="text-[11px] font-semibold text-gray-800">
                              <span className="text-[9px] font-bold text-gray-400 mr-1">PEA:</span>
                              {asset.peaNumber}
                            </div>
                          )}
                          {(asset.adsNumber || asset.assetNumber) && (
                            <div className="text-[10px] text-gray-500 font-mono">
                              <span className="text-[9px] font-bold text-gray-400 mr-1">ADS:</span>
                              {asset.adsNumber || asset.assetNumber}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-gray-800 text-[11px]">
                          {asset.substationName || 'Regional Station'}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {asset.city || 'Thailand'} • {getAssetArea(asset)}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <span className="text-[11px] font-bold text-purple-900 bg-purple-50 px-1.5 py-0.5 rounded-sm">
                          {asset.voltageLevel ? `${asset.voltageLevel} kV` : '115 kV'}
                        </span>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Yr: {asset.yearOfRegistration || 'N/A'}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="font-medium text-gray-800 text-[11px]">
                          {asset.manufacturer || 'Standard Manufacturer'}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          {asset.model || asset.serialNumber || 'Standard Spec'}
                        </div>
                      </td>

                      <td className="py-3 px-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${
                          asset.healthStatus === 'Green' ? 'bg-emerald-100 text-emerald-800' :
                          asset.healthStatus === 'Yellow' ? 'bg-amber-100 text-amber-800' :
                          asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {asset.healthScore ?? 100}/100
                        </span>
                      </td>

                      {/* SF6 Gas Specification Column */}
                      {hasSF6InResults && (
                        <td className="py-3 px-3.5 bg-sky-50/40 border-l border-sky-100/80">
                          {sf6Info && sf6Info.isApplicable ? (
                            <button
                              type="button"
                              onClick={() => setSelectedSf6Detail({ asset, sf6: sf6Info })}
                              className="text-left group/sf6 hover:bg-sky-100/60 p-1.5 rounded-lg transition-all cursor-pointer block w-full"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-sky-900 text-xs font-mono">
                                  {sf6Info.displayEstimate}
                                </span>
                                <span className="text-[9px] font-bold bg-sky-200/80 text-sky-800 px-1.5 py-0.2 rounded-sm">
                                  {sf6Info.nominalPressureBar || 1.4} bar
                                </span>
                              </div>
                              <p className="text-[10px] text-sky-700/80 line-clamp-1 mt-0.5">
                                {sf6Info.referenceSource}
                              </p>
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">
                              Non-SF6 (Solid/Air)
                            </span>
                          )}
                        </td>
                      )}

                      <td className="py-3 px-3.5 text-right">
                        {onSelectAssetForInspect && (
                          <button
                            type="button"
                            onClick={() => onSelectAssetForInspect(asset)}
                            className="inline-flex items-center gap-1 bg-purple-100 hover:bg-purple-900 hover:text-white text-purple-900 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                            title="Inspect in Asset Record details view"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-gray-800">No Matching Equipment Found</h4>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              No registered grid assets match the selected filter conditions. Try loosening your area or voltage filters, or search for another query.
            </p>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredAssets.length > pageSize && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-gray-500 text-[11px]">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredAssets.length)} of {filteredAssets.length} total entries
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5 && currentPage > 3) {
                  pageNum = Math.min(totalPages, currentPage - 2 + i);
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-purple-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. SF6 Gas Detail Modal (when clicking on SF6 badge) */}
      {selectedSf6Detail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                  <Wind className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    SF6 Gas Technical Specification
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">
                    {selectedSf6Detail.asset.equipmentId} ({selectedSf6Detail.asset.equipmentType})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSf6Detail(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-sky-50/60 p-3 rounded-xl border border-sky-100">
                  <span className="text-[10px] font-bold text-sky-700 uppercase block">Estimated SF6 Gas</span>
                  <span className="text-xl font-black text-sky-950 mt-0.5 block">
                    {selectedSf6Detail.sf6.displayEstimate}
                  </span>
                  <span className="text-[10px] text-sky-600 font-semibold">
                    ~{selectedSf6Detail.sf6.nominalPressureBar || 1.4} bar rel @ 20°C
                  </span>
                </div>

                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">GWP Carbon Impact</span>
                  <span className="text-xl font-black text-emerald-950 mt-0.5 block">
                    {selectedSf6Detail.sf6.co2EquivalentTons || '43.5'} tCO2e
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold">
                    Global Warming Potential 23,500x
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 p-3.5 rounded-xl space-y-2 border border-gray-100">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Compartment & Enclosure</span>
                  <span className="font-semibold text-gray-800">{selectedSf6Detail.sf6.compartmentType}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Manufacturer & Model Specs</span>
                  <span className="font-semibold text-gray-800">
                    {selectedSf6Detail.asset.manufacturer || 'Standard'} • {selectedSf6Detail.asset.model || '24kV Standard Unit'} ({selectedSf6Detail.asset.voltageLevel || '22'} kV)
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Datasheet Reference / Source</span>
                  <span className="font-mono text-purple-900 text-[11px] block">
                    {selectedSf6Detail.sf6.referenceSource}
                  </span>
                </div>

                {selectedSf6Detail.sf6.notes && (
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Technical Notes</span>
                    <p className="text-gray-600 italic text-[11px]">{selectedSf6Detail.sf6.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedSf6Detail(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
