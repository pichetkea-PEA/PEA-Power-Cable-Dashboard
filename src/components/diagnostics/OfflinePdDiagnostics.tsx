import React, { useState, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CableAsset } from '../../types';
import { 
  FileText, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Activity, 
  Layers, 
  MapPin, 
  ExternalLink, 
  Download, 
  Zap, 
  Compass, 
  Sparkles, 
  Maximize2,
  Table,
  Grid3X3,
  Sliders,
  HelpCircle,
  Eye,
  QrCode
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Scatter, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine,
  ReferenceArea,
  AreaChart,
  Area
} from 'recharts';

interface OfflinePdDiagnosticsProps {
  asset: CableAsset;
  onSelectRiskAsset?: (assetId: string) => void;
}

export interface OfflineDefectLocation {
  id: string;
  distance: number;
  distanceFormatted: string;
  shotsPerPeriod: number;
  averageChargePc: number;
  maxChargeNc: number;
  maxChargePc: number;
  inceptionVoltageKv: number;
  extinctionVoltageKv: number;
  defectType: string;
  affectedAsset: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  riskLikelihood: 'Low' | 'Medium' | 'High';
  riskConsequence: 'Minor' | 'Moderate' | 'Critical';
  notes: string;
}

export default function OfflinePdDiagnostics({ asset }: OfflinePdDiagnosticsProps) {
  const [selectedReportPreset, setSelectedReportPreset] = useState<'b2_vlf' | 'custom_pdf'>(
    asset.pdDiagnostics?.offlinePdfUrl || asset.pdDiagnostics?.offlineRiskLevel ? 'custom_pdf' : 'b2_vlf'
  );
  const [uploadedPdfName, setUploadedPdfName] = useState<string>(
    asset.pdDiagnostics?.offlinePdfReportName || (asset.pdDiagnostics?.offlinePdfUrl ? 'Offline_PD_Report.pdf' : '')
  );
  const [activeDefectId, setActiveDefectId] = useState<string>('defect-3');
  const [selectedRiskCell, setSelectedRiskCell] = useState<{ likelihood: string; consequence: string } | null>(null);
  const [viewPdfModal, setViewPdfModal] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Sync with asset.pdDiagnostics if prop changes
  React.useEffect(() => {
    if (asset.pdDiagnostics?.offlinePdfUrl || asset.pdDiagnostics?.offlineRiskLevel) {
      setSelectedReportPreset('custom_pdf');
      setUploadedPdfName(asset.pdDiagnostics.offlinePdfReportName || 'Offline_PD_Report.pdf');
    }
  }, [asset.pdDiagnostics]);

  // Defect locations from the b2 electronics smart VLF combined report (Page 12-13)
  const defects: OfflineDefectLocation[] = useMemo(() => [
    {
      id: 'defect-1',
      distance: 20.32,
      distanceFormatted: '20.32 m',
      shotsPerPeriod: 108,
      averageChargePc: 532.8,
      maxChargeNc: 2.1,
      maxChargePc: 2100,
      inceptionVoltageKv: 6.4,
      extinctionVoltageKv: 6.4,
      defectType: 'Bad Contacts',
      affectedAsset: 'Cable Span (Near Section Joint)',
      severity: 'Medium',
      riskLikelihood: 'Medium',
      riskConsequence: 'Moderate',
      notes: 'Localized discharge cluster at 20.32m. Elevated repetition rate (108 shots/period). Recommend connector torque verification.'
    },
    {
      id: 'defect-2',
      distance: 53.92,
      distanceFormatted: '53.92 m',
      shotsPerPeriod: 29,
      averageChargePc: 511.2,
      maxChargeNc: 1.6,
      maxChargePc: 1600,
      inceptionVoltageKv: 6.4,
      extinctionVoltageKv: 6.4,
      defectType: 'Bad Contacts',
      affectedAsset: 'Cable Span (Mid Section Joint)',
      severity: 'Medium',
      riskLikelihood: 'Medium',
      riskConsequence: 'Moderate',
      notes: 'Secondary discharge cluster at 53.92m with 29 shots/period. Moderate energy discharge.'
    },
    {
      id: 'defect-3',
      distance: 80.00,
      distanceFormatted: '80.00 m',
      shotsPerPeriod: 141,
      averageChargePc: 1300.0,
      maxChargeNc: 3.6,
      maxChargePc: 3600,
      inceptionVoltageKv: 6.4,
      extinctionVoltageKv: 6.4,
      defectType: 'Surface Discharges',
      affectedAsset: 'Far End Cable Termination (80.0 m)',
      severity: 'Critical',
      riskLikelihood: 'High',
      riskConsequence: 'Critical',
      notes: 'Critical high-amplitude surface discharge exceeding 3.6 nC (3,600 pC) at far termination stress cone interface. Immediate servicing mandated.'
    }
  ], []);

  // Time Domain Reflectometry (TDR) Charge vs Distance Simulation Profile based on report data
  const tdrChartData = useMemo(() => {
    const points = [];
    const totalLength = 80.0; // meters

    for (let d = 0; d <= totalLength; d += 0.5) {
      let chargeNc = 0.05 + Math.random() * 0.04; // baseline noise floor ~50 pC

      // Defect 1: 20.32m (peak 2.1 nC, cluster from 15m to 25m)
      if (d >= 15 && d <= 25) {
        const distDelta = Math.abs(d - 20.32);
        const peak = Math.max(0, 2.1 * Math.exp(-(distDelta * distDelta) / 4.0));
        chargeNc = Math.max(chargeNc, peak + (Math.random() * 0.4 - 0.2));
      }

      // Defect 2: 53.92m (peak 1.6 nC, cluster from 50m to 58m)
      if (d >= 50 && d <= 58) {
        const distDelta = Math.abs(d - 53.92);
        const peak = Math.max(0, 1.6 * Math.exp(-(distDelta * distDelta) / 3.5));
        chargeNc = Math.max(chargeNc, peak + (Math.random() * 0.3 - 0.15));
      }

      // Defect 3: 80.00m (peak 3.6 nC at termination)
      if (d >= 78) {
        const distDelta = Math.abs(d - 80.0);
        const peak = Math.max(0, 3.6 * Math.exp(-(distDelta * distDelta) / 1.5));
        chargeNc = Math.max(chargeNc, peak + (Math.random() * 0.2));
      }

      points.push({
        distance: parseFloat(d.toFixed(1)),
        chargeNc: parseFloat(Math.max(0, chargeNc).toFixed(2)),
        thresholdWarning: 1.0, // 1000 pC (1.0 nC) threshold
        thresholdAction: 2.5   // 2500 pC (2.5 nC) critical threshold
      });
    }

    return points;
  }, []);

  // Phase Pattern Data (Phase Angle 0 to 360 deg vs Charge in nC)
  const phasePatternData = useMemo(() => {
    const points = [];
    for (let deg = 0; deg <= 360; deg += 5) {
      // 50Hz AC voltage wave scaled to 4.0 nC height for overlay
      const sineVal = 2.0 + 2.0 * Math.sin((deg * Math.PI) / 180);
      
      // Discharge cluster in positive half cycle (180 to 320 deg in Page 2 of report)
      let clusterCharge = 0.5 + Math.random() * 0.15;
      if (deg >= 180 && deg <= 330) {
        const peak = 2.8 * Math.sin(((deg - 180) / 150) * Math.PI);
        clusterCharge = Math.max(clusterCharge, peak * (0.6 + Math.random() * 0.6));
      }

      points.push({
        phaseDeg: deg,
        chargeNc: parseFloat(clusterCharge.toFixed(2)),
        sineWave: parseFloat(sineVal.toFixed(2))
      });
    }
    return points;
  }, []);

  // Asset Failure Risk Matrix (3x3) Asset Categorization
  const riskMatrixAssets = useMemo(() => [
    {
      id: 'asset-near-term',
      name: 'Near End Termination (0.0 m)',
      type: 'Cable Termination',
      likelihood: 'Low' as const,
      consequence: 'Minor' as const,
      status: 'Normal',
      pdLevel: '< 50 pC',
      score: 92,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    },
    {
      id: 'asset-joint-1',
      name: 'Joint #1 / Bad Contact (20.32 m)',
      type: 'Cable Joint',
      likelihood: 'Medium' as const,
      consequence: 'Moderate' as const,
      status: 'Further Study',
      pdLevel: '2.1 nC (2,100 pC)',
      score: 64,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    {
      id: 'asset-joint-2',
      name: 'Joint #2 / Bad Contact (53.92 m)',
      type: 'Cable Joint',
      likelihood: 'Medium' as const,
      consequence: 'Moderate' as const,
      status: 'Further Study',
      pdLevel: '1.6 nC (1,600 pC)',
      score: 68,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    {
      id: 'asset-far-term',
      name: 'Far End Termination (80.00 m)',
      type: 'Cable Termination',
      likelihood: 'High' as const,
      consequence: 'Critical' as const,
      status: 'Action Required',
      pdLevel: '3.6 nC (3,600 pC)',
      score: 38,
      badgeColor: 'bg-red-100 text-red-800 border-red-200'
    }
  ], []);

  // 3x3 Risk Matrix Cell Counts
  const riskGrid = useMemo(() => {
    const grid: Record<string, Record<string, typeof riskMatrixAssets>> = {
      High: { Minor: [], Moderate: [], Critical: [] },
      Medium: { Minor: [], Moderate: [], Critical: [] },
      Low: { Minor: [], Moderate: [], Critical: [] }
    };

    riskMatrixAssets.forEach(a => {
      grid[a.likelihood][a.consequence].push(a);
    });

    return grid;
  }, [riskMatrixAssets]);

  const activeDefect = useMemo(() => {
    return defects.find(d => d.id === activeDefectId) || defects[2];
  }, [defects, activeDefectId]);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPdfName(file.name);
    setSelectedReportPreset('custom_pdf');
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="offline-pd-diagnostics-root">
      
      {/* Header & Source Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Compass className="w-3 h-3 text-indigo-300" />
                Page 3 : Offline PD Diagnostics & TDR Localization
              </span>
              <span className="bg-red-500/20 text-red-300 border border-red-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                VLF Diagnostic Test Report (b2 electronics smart VLF)
              </span>
            </div>
            <h3 className="text-xl font-black tracking-tight">
              Cable Circuit PD Localization & Failure Risk Matrix
            </h3>
            <p className="text-xs text-slate-300/80 max-w-2xl">
              Very Low Frequency (VLF) Time Domain Reflectometry (TDR) charge distance mapping, multi-asset fault correlation across cable circuit spans, and IEEE 400.2 / CIGRE WG B1.28 asset failure risk matrix.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => setViewPdfModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>View Certified Test Report (PDF)</span>
            </button>

            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>{uploadedPdfName ? `Custom: ${uploadedPdfName.substring(0, 14)}...` : 'Smart PDF Upload'}</span>
            </button>
            <input
              type="file"
              ref={pdfInputRef}
              onChange={handlePdfUpload}
              accept=".pdf,image/*"
              className="hidden"
            />
          </div>
        </div>

        {/* Cable Circuit Overview Strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Circuit Span</span>
            <span className="text-sm font-black text-white">80.00 Meters</span>
            <span className="text-[10px] text-indigo-300 block">VPE / XLPE Insulation</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Test Voltage U₀</span>
            <span className="text-sm font-black text-white">6.4 kV / 2.0 × U₀</span>
            <span className="text-[10px] text-indigo-300 block">Sinusoidal smart VLF</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Critical Defect Peak</span>
            <span className="text-sm font-black text-red-400">3.6 nC (3,600 pC)</span>
            <span className="text-[10px] text-red-300 block">@ 80.0m Far Termination</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Circuit Health Verdict</span>
            <span className="text-sm font-black text-amber-400">Action Required</span>
            <span className="text-[10px] text-amber-300 block">IEEE 400.2 Level 3 Alert</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: CHARGE / DISTANCE (TDR LOCALIZATION) PLOT */}
      <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                1. Charge vs. Distance (TDR Localization Plot)
              </h4>
              <p className="text-[11px] text-gray-500">
                Discharge Apparent Charge Q [nC] vs. Physical Cable Position [m] from Near End (0.0 m) to Far End (80.0 m)
              </p>
            </div>
          </div>

          {/* Quick Pinpoint Jump Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Pinpoint Defects:</span>
            {defects.map((d, index) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveDefectId(d.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer flex items-center gap-1 ${
                  activeDefectId === d.id
                    ? d.severity === 'Critical' ? 'bg-red-600 text-white border-red-600 shadow-xs' : 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>{d.distanceFormatted} ({d.maxChargeNc} nC)</span>
              </button>
            ))}
          </div>
        </div>

        {/* TDR Recharts Graph */}
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={tdrChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="tdrGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
              <XAxis 
                dataKey="distance" 
                fontSize={10} 
                stroke="#64748b" 
                unit=" m" 
                ticks={[0, 10, 20.3, 30, 40, 53.9, 60, 70, 80]}
                label={{ value: 'Distance [m] (Near End → Far End)', position: 'insideBottom', offset: -12, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                domain={[0, 4.2]}
                ticks={[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]}
                label={{ value: 'Charge [nC]', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#64748b', fontWeight: 'bold' } }}
              />
              <Tooltip 
                formatter={(val: any, name: string) => [
                  name === 'chargeNc' ? `${val} nC (${(Number(val) * 1000).toFixed(0)} pC)` : `${val} nC`,
                  name === 'chargeNc' ? 'Discharge Magnitude' : name
                ]}
                labelFormatter={(label) => `Position: ${label} meters`}
              />

              {/* Defect Vertical Marker Lines */}
              <ReferenceLine x={20.3} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" label={{ value: '⚡ 20.32m Bad Contact', fill: '#b45309', fontSize: 10, position: 'top' }} />
              <ReferenceLine x={53.9} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" label={{ value: '⚡ 53.92m Bad Contact', fill: '#b45309', fontSize: 10, position: 'top' }} />
              <ReferenceLine x={80.0} stroke="#dc2626" strokeWidth={2.5} label={{ value: '🚨 80.00m Surface PD (3.6 nC)', fill: '#b91c1c', fontSize: 10, position: 'insideTopRight' }} />

              {/* Threshold Zones */}
              <ReferenceLine y={1.0} stroke="#ca8a04" strokeDasharray="4 4" label={{ value: 'Warning Limit (1.0 nC)', fill: '#ca8a04', fontSize: 9 }} />
              <ReferenceLine y={2.5} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Critical Action (2.5 nC)', fill: '#dc2626', fontSize: 9 }} />

              <Area type="monotone" dataKey="chargeNc" stroke="#dc2626" strokeWidth={2} fill="url(#tdrGradient)" name="chargeNc" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Defect Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {defects.map(d => {
            const isSelected = activeDefectId === d.id;
            return (
              <div
                key={d.id}
                onClick={() => setActiveDefectId(d.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                  isSelected 
                    ? d.severity === 'Critical' 
                      ? 'bg-red-50/80 border-red-300 ring-2 ring-red-400' 
                      : 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400'
                    : 'bg-gray-50/70 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase block">Defect at {d.distanceFormatted}</span>
                    <h5 className="text-xs font-black text-gray-900">{d.defectType}</h5>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    d.severity === 'Critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {d.maxChargeNc} nC Max
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-600">
                  <div><strong>Avg Charge:</strong> {d.averageChargePc} pC</div>
                  <div><strong>Shots/Period:</strong> {d.shotsPerPeriod}</div>
                  <div><strong>Inception:</strong> {d.inceptionVoltageKv} kV</div>
                  <div><strong>Extinction:</strong> {d.extinctionVoltageKv} kV</div>
                </div>

                <p className="text-[10px] text-gray-500 italic line-clamp-2">
                  {d.notes}
                </p>
              </div>
            );
          })}
        </div>

      </div>

      {/* SECTION 2: SYNCHRONIZED PHASE PATTERN & PHASE TOPOLOGY TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Phase Pattern Plot (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="border-b border-gray-100 pb-2">
            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-700" />
              2. Synchronized Phase Pattern (Φ vs. Charge)
            </h4>
            <p className="text-[11px] text-gray-500">
              Phase Angle Φ (0° → 360°) vs. Apparent Charge [nC]
            </p>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={phasePatternData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="phaseDeg" stroke="#64748b" fontSize={10} unit="°" ticks={[0, 90, 180, 270, 360]} />
                <YAxis stroke="#64748b" fontSize={10} domain={[0, 4.0]} label={{ value: 'nC', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                <Tooltip />
                <Line type="monotone" dataKey="sineWave" stroke="#94a3b8" strokeDasharray="4 4" dot={false} strokeWidth={1.5} name="50Hz Reference" />
                <Area type="monotone" dataKey="chargeNc" stroke="#dc2626" fill="#fecaca" fillOpacity={0.4} strokeWidth={2} name="Discharge Cluster" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-700">
            <strong>Phase Inception Verdict:</strong> Dominant discharge activity concentrates in the range 180° - 315° during the negative AC slope, characteristic of surface insulation degradation at the termination boundary.
          </div>
        </div>

        {/* Right: Phase Topology Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-3">
          <div className="border-b border-gray-100 pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Table className="w-4 h-4 text-purple-700" />
                3. Phase Topology & Multi-Voltage Summary Table
              </h4>
              <p className="text-[11px] text-gray-500">
                Segment-by-segment breakdown at U₀ (6.4 kV) and 2.0 × U₀ test voltages
              </p>
            </div>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
              b2 smart VLF Page 13
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-2.5">No</th>
                  <th className="py-2 px-2.5">Asset Type</th>
                  <th className="py-2 px-2.5">Length / Loc</th>
                  <th className="py-2 px-2.5">U₀ Top10 Avg</th>
                  <th className="py-2 px-2.5">2.0 × U₀ Top10</th>
                  <th className="py-2 px-2.5">Defect Radius</th>
                  <th className="py-2 px-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                <tr className="hover:bg-gray-50/50">
                  <td className="py-2.5 px-2.5 font-bold">0</td>
                  <td className="py-2.5 px-2.5">Near Termination</td>
                  <td className="py-2.5 px-2.5">0.0 m</td>
                  <td className="py-2.5 px-2.5 font-mono text-emerald-700">&lt; 50 pC</td>
                  <td className="py-2.5 px-2.5 font-mono text-emerald-700">&lt; 80 pC</td>
                  <td className="py-2.5 px-2.5">-</td>
                  <td className="py-2.5 px-2.5"><span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded">Good</span></td>
                </tr>
                <tr className="hover:bg-gray-50/50 bg-amber-50/30">
                  <td className="py-2.5 px-2.5 font-bold">1A</td>
                  <td className="py-2.5 px-2.5">Cable Span (Joint 1)</td>
                  <td className="py-2.5 px-2.5 font-bold text-amber-900">20.32 m</td>
                  <td className="py-2.5 px-2.5 font-mono text-amber-800">611.7 pC (137 #)</td>
                  <td className="py-2.5 px-2.5 font-mono text-amber-800">557.9 pC (35 #)</td>
                  <td className="py-2.5 px-2.5">8.3 m - 32.3 m</td>
                  <td className="py-2.5 px-2.5"><span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded">Study</span></td>
                </tr>
                <tr className="hover:bg-gray-50/50 bg-amber-50/30">
                  <td className="py-2.5 px-2.5 font-bold">1B</td>
                  <td className="py-2.5 px-2.5">Cable Span (Joint 2)</td>
                  <td className="py-2.5 px-2.5 font-bold text-amber-900">53.92 m</td>
                  <td className="py-2.5 px-2.5 font-mono text-amber-800">577.7 pC (37 #)</td>
                  <td className="py-2.5 px-2.5 font-mono text-amber-800">549.2 pC (26 #)</td>
                  <td className="py-2.5 px-2.5">46.1 m - 61.8 m</td>
                  <td className="py-2.5 px-2.5"><span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded">Study</span></td>
                </tr>
                <tr className="hover:bg-gray-50/50 bg-red-50/40">
                  <td className="py-2.5 px-2.5 font-bold">2</td>
                  <td className="py-2.5 px-2.5 font-bold text-red-950">Far Termination</td>
                  <td className="py-2.5 px-2.5 font-bold text-red-700">80.00 m</td>
                  <td className="py-2.5 px-2.5 font-mono text-red-700 font-bold">552.5 pC (11 #)</td>
                  <td className="py-2.5 px-2.5 font-mono text-red-700 font-bold">626.3 pC (6 #)</td>
                  <td className="py-2.5 px-2.5">76.0 m - 84.0 m</td>
                  <td className="py-2.5 px-2.5"><span className="bg-red-100 text-red-800 text-[9px] font-black px-1.5 py-0.5 rounded">Action</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SECTION 3: ASSET FAILURE RISK MATRIX (3X3) & WORLDWIDE ENGINEERING ASSESSMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: 3x3 Asset Failure Risk Matrix (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-purple-700" />
              <div>
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  4. Asset Failure Risk Matrix (3x3 Diagnostic Mapping)
                </h4>
                <p className="text-[11px] text-gray-500">
                  Probability of Failure (PD & Inception) vs. Consequence of Failure (Voltage & Criticality)
                </p>
              </div>
            </div>

            {selectedRiskCell && (
              <button
                type="button"
                onClick={() => setSelectedRiskCell(null)}
                className="text-[10px] text-purple-700 font-bold hover:underline cursor-pointer"
              >
                Clear Matrix Filter
              </button>
            )}
          </div>

          {/* 3x3 Visual Grid */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-2 text-center text-xs">
              
              {/* Y-Axis Label */}
              <div className="col-span-2 flex flex-col justify-center items-center font-bold text-gray-500 text-[10px] uppercase">
                <span>Probability</span>
                <span>of Failure</span>
              </div>

              {/* 3x3 Content Cells (10 Cols) */}
              <div className="col-span-10 grid grid-cols-3 gap-2">
                
                {/* Column Headers */}
                <div className="text-[10px] font-black text-gray-600 uppercase">Minor Consequence</div>
                <div className="text-[10px] font-black text-gray-600 uppercase">Moderate Consequence</div>
                <div className="text-[10px] font-black text-gray-600 uppercase">Critical Consequence</div>

                {/* ROW 1: HIGH PROBABILITY */}
                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'High', consequence: 'Minor' })}
                  className="h-24 rounded-xl border p-2 bg-amber-50 border-amber-200 flex flex-col justify-between hover:border-amber-400 cursor-pointer transition-all"
                >
                  <span className="text-[9px] font-bold text-amber-800 text-left">High | Minor</span>
                  <div className="text-xs font-black text-amber-900">{riskGrid.High.Minor.length} Assets</div>
                </div>

                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'High', consequence: 'Moderate' })}
                  className="h-24 rounded-xl border p-2 bg-orange-100 border-orange-300 flex flex-col justify-between hover:border-orange-500 cursor-pointer transition-all"
                >
                  <span className="text-[9px] font-bold text-orange-800 text-left">High | Moderate</span>
                  <div className="text-xs font-black text-orange-950">{riskGrid.High.Moderate.length} Assets</div>
                </div>

                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'High', consequence: 'Critical' })}
                  className="h-24 rounded-xl border p-2 bg-red-600 text-white border-red-700 flex flex-col justify-between hover:ring-4 hover:ring-red-300 cursor-pointer shadow-md transition-all animate-pulse"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase text-red-200">High | Critical</span>
                    <ShieldAlert className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-left space-y-0.5">
                    <span className="text-xs font-black block">1 Asset Plotted</span>
                    <span className="text-[9px] text-red-100 font-bold truncate block">Far Termination (80m)</span>
                  </div>
                </div>

                {/* ROW 2: MEDIUM PROBABILITY */}
                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'Medium', consequence: 'Minor' })}
                  className="h-24 rounded-xl border p-2 bg-emerald-50 border-emerald-200 flex flex-col justify-between hover:border-emerald-400 cursor-pointer transition-all"
                >
                  <span className="text-[9px] font-bold text-emerald-800 text-left">Medium | Minor</span>
                  <div className="text-xs font-black text-emerald-900">{riskGrid.Medium.Minor.length} Assets</div>
                </div>

                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'Medium', consequence: 'Moderate' })}
                  className="h-24 rounded-xl border p-2 bg-amber-100 border-amber-300 flex flex-col justify-between hover:border-amber-500 cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black text-amber-900">Med | Moderate</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <div className="text-left space-y-0.5">
                    <span className="text-xs font-black text-amber-950 block">2 Assets Plotted</span>
                    <span className="text-[9px] text-amber-800 font-bold block">Joint 1 & Joint 2</span>
                  </div>
                </div>

                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'Medium', consequence: 'Critical' })}
                  className="h-24 rounded-xl border p-2 bg-orange-100 border-orange-300 flex flex-col justify-between hover:border-orange-500 cursor-pointer transition-all"
                >
                  <span className="text-[9px] font-bold text-orange-800 text-left">Med | Critical</span>
                  <div className="text-xs font-black text-orange-950">{riskGrid.Medium.Critical.length} Assets</div>
                </div>

                {/* ROW 3: LOW PROBABILITY */}
                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'Low', consequence: 'Minor' })}
                  className="h-24 rounded-xl border p-2 bg-emerald-100 border-emerald-300 flex flex-col justify-between hover:border-emerald-500 cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black text-emerald-900">Low | Minor</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  </div>
                  <div className="text-left space-y-0.5">
                    <span className="text-xs font-black text-emerald-950 block">1 Asset Plotted</span>
                    <span className="text-[9px] text-emerald-800 font-bold block">Near Termination (0m)</span>
                  </div>
                </div>

                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'Low', consequence: 'Moderate' })}
                  className="h-24 rounded-xl border p-2 bg-emerald-50 border-emerald-200 flex flex-col justify-between hover:border-emerald-400 cursor-pointer transition-all"
                >
                  <span className="text-[9px] font-bold text-emerald-800 text-left">Low | Moderate</span>
                  <div className="text-xs font-black text-emerald-900">{riskGrid.Low.Moderate.length} Assets</div>
                </div>

                <div 
                  onClick={() => setSelectedRiskCell({ likelihood: 'Low', consequence: 'Critical' })}
                  className="h-24 rounded-xl border p-2 bg-amber-50 border-amber-200 flex flex-col justify-between hover:border-amber-400 cursor-pointer transition-all"
                >
                  <span className="text-[9px] font-bold text-amber-800 text-left">Low | Critical</span>
                  <div className="text-xs font-black text-amber-900">{riskGrid.Low.Critical.length} Assets</div>
                </div>

              </div>

            </div>
          </div>

          {/* Asset Marker Badges in Scope */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              Tested Circuit Assets Mapped into Matrix:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {riskMatrixAssets.map(a => (
                <div key={a.id} className={`p-2.5 rounded-lg border flex items-center justify-between ${a.badgeColor}`}>
                  <div>
                    <span className="font-bold block">{a.name}</span>
                    <span className="text-[10px] opacity-80">{a.pdLevel} | Score: {a.score}/100</span>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/60">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right: Engineering Standards Guidelines & Action Directives (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
          <div className="border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-700 animate-pulse" />
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                5. Worldwide Engineering Assessment
              </h4>
            </div>
            <p className="text-[11px] text-gray-500">
              Benchmark analysis based on IEEE 400.2, IEEE 400.3, CIGRE WG B1.28
            </p>
          </div>

          {/* Standard Guidelines Accordions */}
          <div className="space-y-2.5 text-xs">
            <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl space-y-1">
              <span className="font-black text-purple-950 block">IEEE 400.2 Evaluation (VLF Testing)</span>
              <p className="text-[11px] text-purple-900 leading-relaxed font-medium">
                Under 1.0 × U₀ and 2.0 × U₀, XLPE cable sections showing partial discharge greater than 1,000 pC require immediate planned maintenance. The tested Far Termination exceeds 3,600 pC (3.6 nC).
              </p>
            </div>

            <div className="p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-red-900 font-bold uppercase">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>Priority Mitigation Directive</span>
              </div>
              <p className="text-[11px] text-red-950 leading-relaxed font-medium">
                <strong>Far Termination (80.0 m):</strong> Disassemble stress relief cone within <strong>14 operational days</strong>. Clean surface carbonization tracking and re-apply stress control mastic.
              </p>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
              <span className="font-black text-amber-900 block">Joints at 20.32m & 53.92m Directive</span>
              <p className="text-[11px] text-amber-950 leading-relaxed font-medium">
                Re-torque bolted connector sleeves and execute follow-up HFCT online PD monitoring sweep during peak load operation.
              </p>
            </div>
          </div>

          {/* Auto-Generated QR Code Card for Offline Test Report */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs uppercase">
                <QrCode className="w-4 h-4 text-purple-700" />
                <span>Field Report Auto-Generated QR Code</span>
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                Tab 4 Linked
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-xs shrink-0">
                <QRCodeSVG
                  value={
                    asset.pdDiagnostics?.offlinePdfReportUrl || 
                    asset.pdDiagnostics?.offlinePdfUrl || 
                    `${window.location.origin}${window.location.pathname}?equipmentId=${encodeURIComponent(asset.equipmentId || '')}&tab=offline_pd`
                  }
                  size={76}
                  bgColor="#ffffff"
                  fgColor="#1e1b4b"
                  level="M"
                />
              </div>

              <div className="space-y-1 text-xs">
                <span className="font-bold text-gray-900 block truncate max-w-[200px]">
                  {asset.pdDiagnostics?.offlinePdfReportName || 'Offline_PD_Report.pdf'}
                </span>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Scan QR code with field mobile device to open external test report or download PDF directly.
                </p>
                {(asset.pdDiagnostics?.offlinePdfReportUrl || asset.pdDiagnostics?.offlinePdfUrl) && (
                  <a
                    href={asset.pdDiagnostics.offlinePdfReportUrl || asset.pdDiagnostics.offlinePdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 underline pt-0.5"
                  >
                    <ExternalLink className="w-3 h-3" /> External Link
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Export Action */}
          <button
            type="button"
            onClick={() => setViewPdfModal(true)}
            className="w-full bg-slate-900 hover:bg-slate-950 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
          >
            <FileText className="w-4 h-4 text-purple-400" />
            <span>Open b2 electronics VLF Combined PDF Report</span>
          </button>

        </div>

      </div>

      {/* Certified PDF Viewer Modal */}
      {viewPdfModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-700" />
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase">
                    b2 electronics smart VLF Combined Report (Page 12-13 Summary)
                  </h3>
                  <span className="text-[11px] text-gray-500">Certified Test Date: 21. February 2024</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewPdfModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Embedded Report Review Display */}
            <div className="bg-slate-900 text-white rounded-xl p-6 space-y-4 text-xs font-mono">
              <div className="border-b border-slate-700 pb-3 flex justify-between">
                <span className="text-purple-300 font-bold">b2 electronics GmbH - smart VLF Cable Diagnostic System</span>
                <span className="text-slate-400">Page 12 of 17</span>
              </div>

              <div className="space-y-2">
                <h5 className="text-amber-400 font-bold uppercase text-xs">Summary P1 - Charge / Distance Plots</h5>
                <p className="text-slate-300">
                  Total Cable Span: 80.00 m | Insulation: VPE/XLPE | Near End: 0.0 m | Far End: 80.0 m
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div>• Defect 20.32 m: Bad Contacts | Avg: 532.8 pC | Max: 2.1 nC | Shots: 108</div>
                  <div>• Defect 53.92 m: Bad Contacts | Avg: 511.2 pC | Max: 1.6 nC | Shots: 29</div>
                  <div className="text-red-400 font-bold">• Defect 80.00 m: Surface Discharges | Avg: 1.3 nC | Max: 3.6 nC | Shots: 141</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h5 className="text-indigo-400 font-bold uppercase text-xs">Phase Topology & Test Results</h5>
                <p className="text-slate-300">
                  U0 Top10 Average: 611.7 pC (20.3m) | 577.7 pC (53.9m) | 552.5 pC (80.0m)<br />
                  2.00*U0 Top10 Average: 557.9 pC (20.3m) | 549.2 pC (53.9m) | 626.3 pC (80.0m)
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-gray-500">
                Report archived in PEA Central Diagnostic Repository.
              </span>
              <button
                type="button"
                onClick={() => setViewPdfModal(false)}
                className="bg-purple-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-purple-950 cursor-pointer"
              >
                Close Report View
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
