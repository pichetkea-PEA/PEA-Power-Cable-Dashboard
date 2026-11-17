import React, { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CableAsset,
  CableTopologyNode,
  OfflineIndividualDefect
} from '../../types';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Activity,
  ExternalLink,
  Zap,
  Compass,
  Grid3X3,
  QrCode,
  TrendingUp,
  Maximize2,
  Database
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Area
} from 'recharts';

interface OfflinePdDiagnosticsProps {
  asset: CableAsset;
  onSelectRiskAsset?: (assetId: string) => void;
}

interface NormalizedDefectItem {
  id: string;
  defectNumber: number;
  defectType: string;
  locationM: number;
  amplitudePc: number;
  maxChargeNc: number;
  avgChargePc?: number;
  shotsPerPeriod?: number;
  inceptionVoltageKv?: number;
  extinctionVoltageKv?: number;
  phase?: string;
  prpdImageUrl?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  riskLikelihood: 'Low' | 'Medium' | 'High';
  riskConsequence: 'Minor' | 'Moderate' | 'Critical';
  topologyLabel: string;
  notes?: string;
}

function safeParseJsonArray<T>(rawValue: any): T[] {
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  if (url.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${url}`;
  }
  return url;
}

export default function OfflinePdDiagnostics({ asset }: OfflinePdDiagnosticsProps) {
  const diag = asset.pdDiagnostics || {};

  // Extract Columns R - AQ cleanly from pdDiagnostics or top-level asset
  const record = useMemo(() => {
    const pdfUrl =
      diag.offlinePdfReportUrl ||
      diag.offlinePdfUrl ||
      asset.offlinePdfReportUrl ||
      asset.offlinePdfUrl ||
      '';
    const pdfName =
      diag.offlinePdfReportName ||
      diag.offlinePdfName ||
      asset.offlinePdfReportName ||
      (pdfUrl ? 'Offline_Diagnostic_Report.pdf' : '');
    const testVoltage = diag.offlineTestVoltage || asset.offlineTestVoltage || '';
    const maxDischargeNc =
      diag.offlineMaxDischarge ??
      diag.offlineMaxApparentCharge ??
      asset.offlineMaxDischarge ??
      asset.offlineMaxApparentCharge;
    const defectLocation = diag.offlineDefectLocation || asset.offlineDefectLocation || '';
    const inceptionVoltage = diag.offlineInceptionVoltage ?? asset.offlineInceptionVoltage;
    const defectClassification =
      diag.offlineDefectClassification ||
      diag.offlineDefectType ||
      asset.offlineDefectClassification ||
      '';
    const ieeeVerdict =
      diag.offlineIeeeVerdict ||
      diag.offlineIeeeStatus ||
      asset.offlineIeeeVerdict ||
      '';
    const riskLevel =
      diag.offlineRiskLevel ||
      diag.offlineRiskMatrixLevel ||
      asset.offlineRiskLevel ||
      '';
    const diagnosticSummary =
      diag.diagnosticSummary ||
      diag.summaryAnalysis ||
      diag.diagnosticNotes ||
      asset.diagnosticSummary ||
      asset.pdDiagnosticSummary ||
      '';

    const testDate = diag.offlineTestDate || asset.offlineTestDate || '';
    const cableLengthRaw = diag.offlineCableLengthM ?? asset.offlineCableLengthM;
    const rawTopology = safeParseJsonArray<CableTopologyNode>(
      diag.offlineTopology ??
        diag.offlineTopologyJson ??
        asset.offlineTopology ??
        asset.offlineTopologyJson
    );
    const rawDefects = safeParseJsonArray<OfflineIndividualDefect>(
      diag.offlineIndividualDefects ??
        diag.offlineIndividualDefectsJson ??
        asset.offlineIndividualDefects ??
        asset.offlineIndividualDefectsJson
    );

    const numberOfDefects =
      diag.offlineNumberOfDefects ??
      asset.offlineNumberOfDefects ??
      (rawDefects.length > 0 ? rawDefects.length : undefined);

    const tdStage1Kv = diag.tdStage1VoltageKv ?? asset.tdStage1VoltageKv;
    const tdStage1Mean = diag.tdStage1Mean ?? asset.tdStage1Mean;
    const tdStage1Sdtd = diag.tdStage1Sdtd ?? asset.tdStage1Sdtd;
    const tdStage2Kv = diag.tdStage2VoltageKv ?? asset.tdStage2VoltageKv;
    const tdStage2Mean = diag.tdStage2Mean ?? asset.tdStage2Mean;
    const tdStage2Sdtd = diag.tdStage2Sdtd ?? asset.tdStage2Sdtd;
    const tdStage3Kv = diag.tdStage3VoltageKv ?? asset.tdStage3VoltageKv;
    const tdStage3Mean = diag.tdStage3Mean ?? asset.tdStage3Mean;
    const tdStage3Sdtd = diag.tdStage3Sdtd ?? asset.tdStage3Sdtd;
    const tdDeltaTipUp = diag.tdDeltaTipUp ?? asset.tdDeltaTipUp;
    const tdIeee4002Criteria = diag.tdIeee4002Criteria || asset.tdIeee4002Criteria || '';

    const hasTanDelta =
      tdStage1Mean !== undefined ||
      tdStage2Mean !== undefined ||
      tdStage3Mean !== undefined ||
      Boolean(tdIeee4002Criteria);

    const hasOfflineData = Boolean(
      pdfUrl ||
        testVoltage ||
        maxDischargeNc !== undefined ||
        defectLocation ||
        inceptionVoltage !== undefined ||
        defectClassification ||
        ieeeVerdict ||
        riskLevel ||
        testDate ||
        cableLengthRaw !== undefined ||
        rawTopology.length > 0 ||
        rawDefects.length > 0 ||
        hasTanDelta
    );

    // Derive circuit length cleanly from DB field, topology max, or defect max
    const maxTopoEnd = rawTopology.reduce((mx, n) => Math.max(mx, Number(n.endM ?? n.startM ?? 0)), 0);
    const maxDefLoc = rawDefects.reduce((mx, d) => Math.max(mx, Number(d.locationM ?? 0)), 0);
    const cableLengthM =
      cableLengthRaw && Number(cableLengthRaw) > 0
        ? Number(cableLengthRaw)
        : Math.max(maxTopoEnd, maxDefLoc, 100);

    return {
      pdfUrl,
      pdfName,
      testVoltage,
      maxDischargeNc,
      defectLocation,
      inceptionVoltage,
      defectClassification,
      ieeeVerdict,
      riskLevel,
      diagnosticSummary,
      testDate,
      cableLengthM,
      hasExplicitLength: cableLengthRaw !== undefined && Number(cableLengthRaw) > 0,
      topology: rawTopology,
      rawDefects,
      numberOfDefects,
      hasTanDelta,
      hasOfflineData,
      tdStage1Kv,
      tdStage1Mean,
      tdStage1Sdtd,
      tdStage2Kv,
      tdStage2Mean,
      tdStage2Sdtd,
      tdStage3Kv,
      tdStage3Mean,
      tdStage3Sdtd,
      tdDeltaTipUp,
      tdIeee4002Criteria
    };
  }, [diag, asset]);

  // Normalize individual defects (from Col AQ, or scalar fallback from Cols U-X if AQ is empty)
  const defects: NormalizedDefectItem[] = useMemo(() => {
    const assetVoltageNum = parseFloat(String(asset.voltageLevel || '22').replace(/[^0-9.]/g, '')) || 22;
    const voltageConsequence: 'Minor' | 'Moderate' | 'Critical' =
      assetVoltageNum >= 115 ? 'Critical' : assetVoltageNum >= 22 ? 'Moderate' : 'Minor';

    const findNearestTopologyLabel = (locM: number): string => {
      if (record.topology.length === 0) return `Position ${locM.toFixed(2)} m`;
      let closest: CableTopologyNode | null = null;
      let minDist = Infinity;
      record.topology.forEach((node) => {
        const start = Number(node.startM ?? 0);
        const end = Number(node.endM ?? start);
        const dist =
          locM >= start && locM <= end
            ? 0
            : Math.min(Math.abs(locM - start), Math.abs(locM - end));
        if (dist < minDist) {
          minDist = dist;
          closest = node;
        }
      });
      return closest ? `${(closest as CableTopologyNode).label}` : `Position ${locM.toFixed(2)} m`;
    };

    if (record.rawDefects.length > 0) {
      return record.rawDefects.map((d, idx) => {
        const locM = Number(d.locationM ?? 0);
        const ampPc = Number(d.amplitudePc ?? (d.maxChargeNc ? d.maxChargeNc * 1000 : 0));
        const maxNc = d.maxChargeNc !== undefined ? Number(d.maxChargeNc) : Number((ampPc / 1000).toFixed(2));
        const sevRaw = String(d.severity || '').toLowerCase();
        const severity: 'Low' | 'Medium' | 'High' | 'Critical' =
          sevRaw === 'critical' || maxNc >= 2.5 || ampPc >= 2500
            ? 'Critical'
            : sevRaw === 'high' || maxNc >= 1.5 || ampPc >= 1500
            ? 'High'
            : sevRaw === 'medium' || maxNc >= 0.5 || ampPc >= 500
            ? 'Medium'
            : 'Low';

        const likelihood: 'Low' | 'Medium' | 'High' =
          severity === 'Critical' || severity === 'High'
            ? 'High'
            : severity === 'Medium'
            ? 'Medium'
            : 'Low';

        const consequence: 'Minor' | 'Moderate' | 'Critical' =
          severity === 'Critical'
            ? 'Critical'
            : severity === 'High'
            ? (voltageConsequence === 'Minor' ? 'Moderate' : voltageConsequence)
            : severity === 'Medium'
            ? 'Moderate'
            : 'Minor';

        return {
          id: d.id || `defect-${idx + 1}`,
          defectNumber: d.defectNumber || idx + 1,
          defectType: d.defectType || record.defectClassification || 'Offline PD Defect',
          locationM: locM,
          amplitudePc: ampPc,
          maxChargeNc: maxNc,
          avgChargePc: d.avgChargePc,
          shotsPerPeriod: d.shotsPerPeriod,
          inceptionVoltageKv: d.inceptionVoltageKv,
          extinctionVoltageKv: d.extinctionVoltageKv,
          phase: d.phase,
          prpdImageUrl: d.prpdImageUrl,
          severity,
          riskLikelihood: likelihood,
          riskConsequence: consequence,
          topologyLabel: findNearestTopologyLabel(locM),
          notes: d.notes
        };
      });
    }

    // Fallback: if aggregate Columns U/V/W exist without Col AQ JSON
    if (record.maxDischargeNc !== undefined || record.defectLocation) {
      const parsedLocMatch = String(record.defectLocation || '').match(/(\d+(?:\.\d+)?)/);
      const locM = parsedLocMatch ? parseFloat(parsedLocMatch[1]) : 0;
      const maxNc = Number(record.maxDischargeNc ?? 0);
      const ampPc = Math.round(maxNc * 1000);
      const riskRaw = String(record.riskLevel || '').toLowerCase();
      const severity: 'Low' | 'Medium' | 'High' | 'Critical' =
        riskRaw === 'critical' || maxNc >= 2.5
          ? 'Critical'
          : riskRaw === 'high' || maxNc >= 1.5
          ? 'High'
          : riskRaw === 'medium' || maxNc >= 0.5
          ? 'Medium'
          : 'Low';

      return [
        {
          id: 'defect-summary-1',
          defectNumber: 1,
          defectType: record.defectClassification || 'Recorded Offline Defect',
          locationM: locM,
          amplitudePc: ampPc,
          maxChargeNc: maxNc,
          inceptionVoltageKv: record.inceptionVoltage,
          severity,
          riskLikelihood: severity === 'Critical' || severity === 'High' ? 'High' : severity === 'Medium' ? 'Medium' : 'Low',
          riskConsequence: severity === 'Critical' ? 'Critical' : severity === 'Medium' ? 'Moderate' : 'Minor',
          topologyLabel: record.defectLocation || findNearestTopologyLabel(locM),
          notes: record.diagnosticSummary
        }
      ];
    }

    return [];
  }, [record, asset.voltageLevel]);

  const [activeDefectId, setActiveDefectId] = useState<string>('');
  const [selectedRiskCell, setSelectedRiskCell] = useState<{ likelihood: string; consequence: string } | null>(null);
  const [viewPdfModal, setViewPdfModal] = useState<boolean>(false);
  const [prpdLightbox, setPrpdLightbox] = useState<NormalizedDefectItem | null>(null);

  React.useEffect(() => {
    if (defects.length > 0) {
      setActiveDefectId(defects[0].id);
    } else {
      setActiveDefectId('');
    }
    setSelectedRiskCell(null);
  }, [asset.equipmentId, defects.length]);

  const activeDefect = useMemo(
    () => defects.find((d) => d.id === activeDefectId) || defects[0] || null,
    [defects, activeDefectId]
  );

  // Dynamic TDR Curve derived strictly from DB defects and cableLengthM
  const tdrChartData = useMemo(() => {
    const totalLen = Math.max(10, record.cableLengthM);
    const step = totalLen <= 120 ? 1 : Math.max(2, Math.round(totalLen / 100));
    const widthSigma = Math.max(2, totalLen * 0.035);
    const points: { distance: number; chargeNc: number }[] = [];

    for (let d = 0; d <= totalLen; d += step) {
      let peakNc = 0;
      defects.forEach((def) => {
        const delta = Math.abs(d - def.locationM);
        const val = def.maxChargeNc * Math.exp(-(delta * delta) / (widthSigma * widthSigma));
        if (val > peakNc) peakNc = val;
      });
      points.push({
        distance: parseFloat(d.toFixed(1)),
        chargeNc: parseFloat(peakNc.toFixed(3))
      });
    }

    // Guarantee exact coordinates of each defect appear on the curve
    defects.forEach((def) => {
      if (!points.some((p) => Math.abs(p.distance - def.locationM) < 0.05)) {
        points.push({
          distance: parseFloat(def.locationM.toFixed(2)),
          chargeNc: parseFloat(def.maxChargeNc.toFixed(3))
        });
      }
    });

    return points.sort((a, b) => a.distance - b.distance);
  }, [defects, record.cableLengthM]);

  const maxTdrY = useMemo(() => {
    const peak = defects.reduce((m, d) => Math.max(m, d.maxChargeNc), 0);
    return Math.max(3.0, Math.ceil((peak + 0.5) * 2) / 2);
  }, [defects]);

  // Tan Delta 3-Stage Data derived strictly from Columns AF - AP
  const tanDeltaChartData = useMemo(() => {
    if (!record.hasTanDelta) return [];
    return [
      {
        stage: `0.5 U₀ (${record.tdStage1Kv ?? 'N/A'} kV)`,
        meanTd: record.tdStage1Mean ?? 0,
        sdtd: record.tdStage1Sdtd ?? 0
      },
      {
        stage: `1.0 U₀ (${record.tdStage2Kv ?? 'N/A'} kV)`,
        meanTd: record.tdStage2Mean ?? 0,
        sdtd: record.tdStage2Sdtd ?? 0
      },
      {
        stage: `1.5 U₀ (${record.tdStage3Kv ?? 'N/A'} kV)`,
        meanTd: record.tdStage3Mean ?? 0,
        sdtd: record.tdStage3Sdtd ?? 0
      }
    ];
  }, [record]);

  // Dynamic 3x3 Risk Matrix mapping recorded defects (or overall asset offline risk level from Col Z)
  const riskMatrixItems = useMemo(() => {
    if (defects.length > 0) {
      return defects.map((d) => ({
        id: d.id,
        name: `Defect #${d.defectNumber}: ${d.defectType} (${d.locationM} m)`,
        subLabel: d.topologyLabel,
        likelihood: d.riskLikelihood,
        consequence: d.riskConsequence,
        status:
          d.severity === 'Critical'
            ? 'Action Required'
            : d.severity === 'High' || d.severity === 'Medium'
            ? 'Further Study'
            : 'Normal',
        pdLevel: `${d.maxChargeNc} nC (${d.amplitudePc} pC)`,
        badgeColor:
          d.severity === 'Critical'
            ? 'bg-red-100 text-red-800 border-red-200'
            : d.severity === 'High'
            ? 'bg-orange-100 text-orange-800 border-orange-200'
            : d.severity === 'Medium'
            ? 'bg-amber-100 text-amber-800 border-amber-200'
            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
      }));
    }

    if (record.hasOfflineData) {
      const riskStr = (record.riskLevel || record.tdIeee4002Criteria || '').toLowerCase();
      const likelihood: 'Low' | 'Medium' | 'High' =
        riskStr.includes('critical') || riskStr.includes('action') || riskStr.includes('high')
          ? 'High'
          : riskStr.includes('medium') || riskStr.includes('study')
          ? 'Medium'
          : 'Low';
      const consequence: 'Minor' | 'Moderate' | 'Critical' =
        riskStr.includes('critical') || riskStr.includes('action')
          ? 'Critical'
          : riskStr.includes('medium') || riskStr.includes('study') || riskStr.includes('high')
          ? 'Moderate'
          : 'Minor';

      return [
        {
          id: 'overall-asset-risk',
          name: `${asset.equipmentId} (Overall Offline Assessment)`,
          subLabel: record.tdIeee4002Criteria || record.ieeeVerdict || 'Recorded in Tab 4',
          likelihood,
          consequence,
          status: record.riskLevel || 'Recorded',
          pdLevel: record.tdDeltaTipUp !== undefined ? `TD Tip-Up: ${record.tdDeltaTipUp} E-3` : 'No Localized Defect Peaks',
          badgeColor:
            likelihood === 'High'
              ? 'bg-red-100 text-red-800 border-red-200'
              : likelihood === 'Medium'
              ? 'bg-amber-100 text-amber-800 border-amber-200'
              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
        }
      ];
    }

    return [];
  }, [defects, record, asset.equipmentId]);

  const riskGrid = useMemo(() => {
    const grid: Record<string, Record<string, typeof riskMatrixItems>> = {
      High: { Minor: [], Moderate: [], Critical: [] },
      Medium: { Minor: [], Moderate: [], Critical: [] },
      Low: { Minor: [], Moderate: [], Critical: [] }
    };
    riskMatrixItems.forEach((item) => {
      grid[item.likelihood][item.consequence].push(item);
    });
    return grid;
  }, [riskMatrixItems]);

  const maxPeakNc = useMemo(() => {
    if (record.maxDischargeNc !== undefined) return record.maxDischargeNc;
    if (defects.length > 0) return Math.max(...defects.map((d) => d.maxChargeNc));
    return undefined;
  }, [record.maxDischargeNc, defects]);

  const resolvedQrUrl = useMemo(() => {
    if (record.pdfUrl) return toAbsoluteUrl(record.pdfUrl);
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${window.location.pathname}?equipmentId=${encodeURIComponent(asset.equipmentId || '')}&tab=offline_pd`;
    }
    return '';
  }, [record.pdfUrl, asset.equipmentId]);

  // Empty State when DB Columns R - AQ are completely blank
  if (!record.hasOfflineData) {
    return (
      <div className="space-y-6 animate-fadeIn" id="offline-pd-diagnostics-root">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="space-y-1">
              <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                <Compass className="w-3 h-3 text-indigo-300" />
                Page 3 : Offline PD, Tan Delta & 3x3 Risk Matrix (DB Tab 4 Cols R–AQ)
              </span>
              <h3 className="text-xl font-black tracking-tight">
                Offline PD Localization, Tan Delta & Failure Risk Assessment
              </h3>
              <p className="text-xs text-slate-300/80 max-w-2xl">
                Read-only engineering results loaded directly from Google Sheet Tab 4 (Columns R–AQ).
              </p>
            </div>
            <span className="bg-slate-800 text-emerald-300 border border-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Result View Only</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-500">
            <Database className="w-8 h-8" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">
              No Offline PD or Tan Delta Result Recorded in Database
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Google Sheet Tab 4 (Columns R–AQ) currently has no offline diagnostic test record for{' '}
              <span className="font-mono font-bold text-indigo-700">{asset.equipmentId}</span>.
              To record offline cable topology, Tan Delta (0.5 U₀ / 1.0 U₀ / 1.5 U₀), individual PD defect pinpointing, or upload a PDF test report, use the <strong>Submit Log Panel → Step 5 (Offline Measurement)</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" id="offline-pd-diagnostics-root">
      {/* Header & DB Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Compass className="w-3 h-3 text-indigo-300" />
                Page 3 : Offline PD, Tan Delta & 3x3 Risk Matrix (DB Tab 4 Cols R–AQ)
              </span>
              {record.testDate && (
                <span className="bg-purple-500/20 text-purple-200 border border-purple-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Test Date (Col AB): {record.testDate}
                </span>
              )}
            </div>
            <h3 className="text-xl font-black tracking-tight">
              Cable Topology PD Localization, Tan Delta & 3x3 Risk Matrix
            </h3>
            <p className="text-xs text-slate-300/80 max-w-2xl">
              Live database inspection displaying recorded cable circuit topology, VLF offline partial discharge pinpointing, 3-stage Tan Delta (IEEE 400.2-2024) criteria, and asset failure risk matrix for <span className="font-mono font-bold text-white">{asset.equipmentId}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            {record.pdfUrl ? (
              <a
                href={record.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Open PDF Report (Col R)</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setViewPdfModal(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Recorded DB Summary</span>
              </button>
            )}
            <span className="bg-slate-800 text-emerald-300 border border-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Result View Only</span>
            </span>
          </div>
        </div>

        {/* DB KPI Strip (Cols R–AQ) */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Cable Circuit Length (Col AC)</span>
            <span className="text-sm font-black text-white">
              {record.hasExplicitLength ? `${record.cableLengthM} Meters` : `${record.cableLengthM} m (Derived)`}
            </span>
            <span className="text-[10px] text-indigo-300 block">
              Test Date: {record.testDate || 'Not Specified'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Test Voltage (Col T)</span>
            <span className="text-sm font-black text-white">
              {record.testVoltage || 'Not Recorded'}
            </span>
            <span className="text-[10px] text-indigo-300 block">
              PDIV (Col W): {record.inceptionVoltage !== undefined ? `${record.inceptionVoltage} kV` : 'N/A'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Max Discharge Qmax (Col U)</span>
            <span className={`text-sm font-black ${maxPeakNc !== undefined && maxPeakNc >= 2.5 ? 'text-red-400' : maxPeakNc !== undefined ? 'text-amber-300' : 'text-slate-300'}`}>
              {maxPeakNc !== undefined ? `${maxPeakNc} nC (${Math.round(maxPeakNc * 1000)} pC)` : 'No Defect Peak'}
            </span>
            <span className="text-[10px] text-red-200 block truncate">
              {record.defectLocation || (activeDefect ? `@ ${activeDefect.locationM} m` : 'Location Not Recorded')}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">IEEE 400.2 Verdict & Risk</span>
            <span className="text-sm font-black text-amber-300 block truncate">
              {record.ieeeVerdict || record.tdIeee4002Criteria || 'Not Evaluated'}
            </span>
            <span className="text-[10px] text-slate-300 block">
              Risk (Col Z): {record.riskLevel || 'N/A'} • {record.numberOfDefects ?? defects.length} Defect(s)
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 1: GRAPHICAL CABLE TOPOLOGY, TDR LOCALIZATION & INDIVIDUAL DEFECTS (Cols AC, AD, AQ, U-X) */}
      <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                1. Cable Topology Map & Offline PD Defect Localization (Cols AC, AD, U–X, AQ)
              </h4>
              <p className="text-[11px] text-gray-500">
                Circuit span from Near End (0.0 m) to Far End ({record.cableLengthM} m) with plotted termination/joint nodes and PD defect pins
              </p>
            </div>
          </div>

          {defects.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Defects:</span>
              {defects.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveDefectId(d.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer flex items-center gap-1 ${
                    activeDefect?.id === d.id
                      ? d.severity === 'Critical'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>#{d.defectNumber}: {d.locationM} m ({d.maxChargeNc} nC)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Graphical Cable Topology Track with Overlaid PD Defect Pinpoints */}
        <div className="bg-slate-900 rounded-xl p-5 text-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-300">
            <span>NEAR END (0 m)</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Termination</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Joint / Splice</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" /> Cable Segment</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block ring-2 ring-red-300/60" /> Offline PD Defect Pin</span>
            </div>
            <span>FAR END ({record.cableLengthM} m)</span>
          </div>

          <div className="relative pt-8 pb-9 px-3">
            {/* Base Cable Axis */}
            <div className="w-full h-3 bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 rounded-full shadow-inner" />

            {/* Topology Nodes along Cable */}
            {record.topology.map((node, i) => {
              const pct = Math.min(100, Math.max(0, (Number(node.startM ?? 0) / Math.max(1, record.cableLengthM)) * 100));
              const isJoint = node.type === 'joint';
              const isTerm = node.type.includes('termination');
              return (
                <div
                  key={node.id || i}
                  style={{ left: `${pct}%` }}
                  className="absolute top-[30px] -translate-x-1/2 flex flex-col items-center z-10"
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 border-white shadow ${
                      isJoint ? 'bg-amber-400' : isTerm ? 'bg-emerald-400' : 'bg-indigo-400'
                    }`}
                    title={`${node.label} (${node.startM} m)`}
                  />
                  <span className="text-[9px] font-bold text-slate-200 mt-1.5 whitespace-nowrap bg-slate-950/80 px-1.5 py-0.5 rounded">
                    {node.label} ({node.startM}m)
                  </span>
                </div>
              );
            })}

            {/* PD Defect Pins overlaid along Cable */}
            {defects.map((def) => {
              const pct = Math.min(100, Math.max(0, (def.locationM / Math.max(1, record.cableLengthM)) * 100));
              const isSelected = activeDefect?.id === def.id;
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setActiveDefectId(def.id)}
                  style={{ left: `${pct}%` }}
                  className="absolute top-0 -translate-x-1/2 flex flex-col items-center z-20 cursor-pointer group"
                  title={`Defect #${def.defectNumber}: ${def.defectType} @ ${def.locationM} m (${def.maxChargeNc} nC)`}
                >
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap shadow ${
                      isSelected
                        ? 'bg-red-500 text-white ring-2 ring-white'
                        : 'bg-red-900/90 text-red-100 border border-red-400/60 group-hover:bg-red-600'
                    }`}
                  >
                    ⚡ #{def.defectNumber} ({def.locationM}m)
                  </span>
                  <div className="w-0.5 h-3 bg-red-400" />
                </button>
              );
            })}
          </div>

          {record.topology.length === 0 && (
            <p className="text-[11px] text-slate-400 text-center">
              No detailed topology segments logged in Col AD — showing overall 0 m to {record.cableLengthM} m span.
            </p>
          )}
        </div>

        {/* TDR Charge vs Distance Plot */}
        {defects.length > 0 ? (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={tdrChartData} margin={{ top: 18, right: 25, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="tdrDbGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="distance"
                  type="number"
                  domain={[0, record.cableLengthM]}
                  fontSize={10}
                  stroke="#64748b"
                  unit=" m"
                  label={{
                    value: `Cable Position [m] (0 m → ${record.cableLengthM} m)`,
                    position: 'insideBottom',
                    offset: -12,
                    fontSize: 10,
                    fill: '#64748b',
                    fontWeight: 'bold'
                  }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  domain={[0, maxTdrY]}
                  label={{
                    value: 'Charge [nC]',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 10, fill: '#64748b', fontWeight: 'bold' }
                  }}
                />
                <Tooltip
                  formatter={(val: any) => [
                    `${val} nC (${(Number(val) * 1000).toFixed(0)} pC)`,
                    'Apparent Charge Q'
                  ]}
                  labelFormatter={(label) => `Position: ${label} m`}
                />

                {defects.map((def) => (
                  <ReferenceLine
                    key={`ref-${def.id}`}
                    x={def.locationM}
                    stroke={def.severity === 'Critical' ? '#dc2626' : '#f59e0b'}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    label={{
                      value: `#${def.defectNumber} (${def.locationM}m • ${def.maxChargeNc}nC)`,
                      fill: def.severity === 'Critical' ? '#b91c1c' : '#b45309',
                      fontSize: 9,
                      position: 'top'
                    }}
                  />
                ))}

                <ReferenceLine y={1.0} stroke="#ca8a04" strokeDasharray="4 4" label={{ value: 'Advisory (1.0 nC)', fill: '#ca8a04', fontSize: 9 }} />
                <ReferenceLine y={2.5} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Critical (2.5 nC)', fill: '#dc2626', fontSize: 9 }} />

                <Area type="monotone" dataKey="chargeNc" stroke="#dc2626" strokeWidth={2} fill="url(#tdrDbGradient)" name="chargeNc" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 text-center">
            No localized offline PD defect peaks recorded in Columns U / V / AQ for this measurement.
          </div>
        )}

        {/* Recorded Individual Defect Cards Grid */}
        {defects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {defects.map((d) => {
              const isSelected = activeDefect?.id === d.id;
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
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">
                        Defect #{d.defectNumber} @ {d.locationM} m • {d.topologyLabel}
                      </span>
                      <h5 className="text-xs font-black text-gray-900">{d.defectType}</h5>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        d.severity === 'Critical'
                          ? 'bg-red-100 text-red-800'
                          : d.severity === 'High'
                          ? 'bg-orange-100 text-orange-800'
                          : d.severity === 'Medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {d.maxChargeNc} nC ({d.amplitudePc} pC)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-600">
                    <div><strong>Phase:</strong> {d.phase || 'N/A'}</div>
                    <div><strong>Shots/Period:</strong> {d.shotsPerPeriod ?? 'N/A'}</div>
                    <div><strong>PDIV:</strong> {d.inceptionVoltageKv !== undefined ? `${d.inceptionVoltageKv} kV` : 'N/A'}</div>
                    <div><strong>PDEV:</strong> {d.extinctionVoltageKv !== undefined ? `${d.extinctionVoltageKv} kV` : 'N/A'}</div>
                  </div>

                  {d.prpdImageUrl && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrpdLightbox(d);
                      }}
                      className="relative bg-slate-900 rounded-lg p-2 flex items-center justify-center h-28 overflow-hidden group border border-slate-700"
                    >
                      <img
                        src={d.prpdImageUrl}
                        alt={`Defect #${d.defectNumber} PRPD`}
                        className="max-h-full w-auto object-contain"
                      />
                      <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <Maximize2 className="w-2.5 h-2.5" /> Zoom PRPD
                      </span>
                    </div>
                  )}

                  {d.notes && (
                    <p className="text-[10px] text-gray-600 italic line-clamp-2">{d.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: TAN DELTA 3-STAGE CHART & IEEE 400.2-2024 CRITERIA (Cols AF - AP) */}
      <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-700">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                2. Tan Delta (TD) 3-Stage Trend & IEEE 400.2-2024 Criteria Result (Cols AF–AP)
              </h4>
              <p className="text-[11px] text-gray-500">
                Mean Tan Delta [10⁻³], Standard Deviation SDTD [10⁻³], and Differential Tip-Up (ΔTD) at 0.5 U₀ / 1.0 U₀ / 1.5 U₀
              </p>
            </div>
          </div>

          {record.tdIeee4002Criteria && (
            <span
              className={`text-[11px] font-black px-3 py-1 rounded-full uppercase border ${
                record.tdIeee4002Criteria === 'Action Required'
                  ? 'bg-red-100 text-red-800 border-red-200'
                  : record.tdIeee4002Criteria === 'Further Study Advised'
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              IEEE 400.2-2024: {record.tdIeee4002Criteria}
            </span>
          )}
        </div>

        {record.hasTanDelta ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            {/* Left: Stage Table Cards (5 Cols) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Stage</th>
                      <th className="py-2 px-3">Voltage (kV)</th>
                      <th className="py-2 px-3">Mean TD [E-3]</th>
                      <th className="py-2 px-3">SDTD [E-3]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    <tr>
                      <td className="py-2 px-3 font-bold text-purple-900">0.5 U₀</td>
                      <td className="py-2 px-3 font-mono">{record.tdStage1Kv ?? 'N/A'}</td>
                      <td className="py-2 px-3 font-black">{record.tdStage1Mean ?? 'N/A'}</td>
                      <td className="py-2 px-3 font-mono text-gray-600">{record.tdStage1Sdtd ?? 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-purple-900">1.0 U₀</td>
                      <td className="py-2 px-3 font-mono">{record.tdStage2Kv ?? 'N/A'}</td>
                      <td className="py-2 px-3 font-black">{record.tdStage2Mean ?? 'N/A'}</td>
                      <td className="py-2 px-3 font-mono text-gray-600">{record.tdStage2Sdtd ?? 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-purple-900">1.5 U₀</td>
                      <td className="py-2 px-3 font-mono">{record.tdStage3Kv ?? 'N/A'}</td>
                      <td className="py-2 px-3 font-black">{record.tdStage3Mean ?? 'N/A'}</td>
                      <td className="py-2 px-3 font-mono text-gray-600">{record.tdStage3Sdtd ?? 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-purple-700 uppercase block">Tip-Up ΔTD (Col AO)</span>
                  <span className="text-sm font-black text-purple-950">
                    {record.tdDeltaTipUp !== undefined ? `${record.tdDeltaTipUp} × 10⁻³` : 'N/A'}
                  </span>
                  <span className="text-[10px] text-purple-700 block">TD(1.5 U₀) − TD(0.5 U₀)</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">IEEE 400.2-2024 (Col AP)</span>
                  <span className="text-xs font-black text-slate-900 block mt-0.5">
                    {record.tdIeee4002Criteria || 'Not Evaluated'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Tan Delta Chart (7 Cols) */}
            <div className="lg:col-span-7 h-[230px] bg-slate-50/50 rounded-xl border border-slate-200 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tanDeltaChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="stage" fontSize={10} stroke="#64748b" />
                  <YAxis fontSize={10} stroke="#64748b" unit=" E-3" />
                  <Tooltip />
                  <ReferenceLine y={1.5} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'IEEE Study (1.5 E-3)', fill: '#b45309', fontSize: 9 }} />
                  <ReferenceLine y={4.0} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'IEEE Action (4.0 E-3)', fill: '#b91c1c', fontSize: 9 }} />
                  <Bar dataKey="sdtd" fill="#a855f7" opacity={0.35} barSize={28} name="SDTD [10⁻³]" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="meanTd" stroke="#6b21a8" strokeWidth={3} dot={{ r: 5 }} name="Mean TD [10⁻³]" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 text-center">
            Tan Delta 3-stage values (Columns AF–AP) were not recorded in this offline test submission.
          </div>
        )}
      </div>

      {/* SECTION 3: 3X3 ASSET FAILURE RISK MATRIX, SUMMARY (Col AA) & FIELD REPORT QR (Cols R-S) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 3x3 Risk Matrix (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-purple-700" />
              <div>
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  3. Asset Failure Risk Matrix (3x3 DB Mapping)
                </h4>
                <p className="text-[11px] text-gray-500">
                  Plotted from recorded DB defect severities, inception voltages, & overall risk level (Col Z)
                </p>
              </div>
            </div>

            {selectedRiskCell && (
              <button
                type="button"
                onClick={() => setSelectedRiskCell(null)}
                className="text-[10px] text-purple-700 font-bold hover:underline cursor-pointer"
              >
                Clear Filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-12 gap-2 text-center text-xs">
            <div className="col-span-2 flex flex-col justify-center items-center font-bold text-gray-500 text-[10px] uppercase">
              <span>Probability</span>
              <span>of Failure</span>
            </div>

            <div className="col-span-10 grid grid-cols-3 gap-2">
              <div className="text-[10px] font-black text-gray-600 uppercase">Minor Consequence</div>
              <div className="text-[10px] font-black text-gray-600 uppercase">Moderate Consequence</div>
              <div className="text-[10px] font-black text-gray-600 uppercase">Critical Consequence</div>

              {/* HIGH */}
              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'High', consequence: 'Minor' })}
                className="h-24 rounded-xl border p-2 bg-amber-50 border-amber-200 flex flex-col justify-between hover:border-amber-400 cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-amber-800 text-left">High | Minor</span>
                <div className="text-xs font-black text-amber-900">{riskGrid.High.Minor.length} Plotted</div>
              </div>

              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'High', consequence: 'Moderate' })}
                className="h-24 rounded-xl border p-2 bg-orange-100 border-orange-300 flex flex-col justify-between hover:border-orange-500 cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-orange-800 text-left">High | Moderate</span>
                <div className="text-xs font-black text-orange-950">{riskGrid.High.Moderate.length} Plotted</div>
              </div>

              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'High', consequence: 'Critical' })}
                className={`h-24 rounded-xl border p-2 flex flex-col justify-between cursor-pointer transition-all ${
                  riskGrid.High.Critical.length > 0
                    ? 'bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-300'
                    : 'bg-red-50 text-red-900 border-red-200 hover:border-red-400'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-[9px] font-black uppercase ${riskGrid.High.Critical.length > 0 ? 'text-red-100' : 'text-red-800'}`}>
                    High | Critical
                  </span>
                  {riskGrid.High.Critical.length > 0 && <ShieldAlert className="w-4 h-4 text-white" />}
                </div>
                <div className="text-xs font-black text-left">
                  {riskGrid.High.Critical.length} Plotted
                </div>
              </div>

              {/* MEDIUM */}
              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'Medium', consequence: 'Minor' })}
                className="h-24 rounded-xl border p-2 bg-emerald-50 border-emerald-200 flex flex-col justify-between hover:border-emerald-400 cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-emerald-800 text-left">Medium | Minor</span>
                <div className="text-xs font-black text-emerald-900">{riskGrid.Medium.Minor.length} Plotted</div>
              </div>

              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'Medium', consequence: 'Moderate' })}
                className={`h-24 rounded-xl border p-2 flex flex-col justify-between cursor-pointer transition-all ${
                  riskGrid.Medium.Moderate.length > 0
                    ? 'bg-amber-200 border-amber-400 ring-2 ring-amber-300'
                    : 'bg-amber-100 border-amber-300 hover:border-amber-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black text-amber-900">Med | Moderate</span>
                  {riskGrid.Medium.Moderate.length > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-800" />}
                </div>
                <div className="text-xs font-black text-amber-950 text-left">{riskGrid.Medium.Moderate.length} Plotted</div>
              </div>

              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'Medium', consequence: 'Critical' })}
                className="h-24 rounded-xl border p-2 bg-orange-100 border-orange-300 flex flex-col justify-between hover:border-orange-500 cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-orange-800 text-left">Med | Critical</span>
                <div className="text-xs font-black text-orange-950">{riskGrid.Medium.Critical.length} Plotted</div>
              </div>

              {/* LOW */}
              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'Low', consequence: 'Minor' })}
                className={`h-24 rounded-xl border p-2 flex flex-col justify-between cursor-pointer transition-all ${
                  riskGrid.Low.Minor.length > 0
                    ? 'bg-emerald-200 border-emerald-400 ring-2 ring-emerald-300'
                    : 'bg-emerald-100 border-emerald-300 hover:border-emerald-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black text-emerald-900">Low | Minor</span>
                  {riskGrid.Low.Minor.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />}
                </div>
                <div className="text-xs font-black text-emerald-950 text-left">{riskGrid.Low.Minor.length} Plotted</div>
              </div>

              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'Low', consequence: 'Moderate' })}
                className="h-24 rounded-xl border p-2 bg-emerald-50 border-emerald-200 flex flex-col justify-between hover:border-emerald-400 cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-emerald-800 text-left">Low | Moderate</span>
                <div className="text-xs font-black text-emerald-900">{riskGrid.Low.Moderate.length} Plotted</div>
              </div>

              <div
                onClick={() => setSelectedRiskCell({ likelihood: 'Low', consequence: 'Critical' })}
                className="h-24 rounded-xl border p-2 bg-amber-50 border-amber-200 flex flex-col justify-between hover:border-amber-400 cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-amber-800 text-left">Low | Critical</span>
                <div className="text-xs font-black text-amber-900">{riskGrid.Low.Critical.length} Plotted</div>
              </div>
            </div>
          </div>

          {/* Plotted Matrix Items List */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              {selectedRiskCell
                ? `Filtered Items (${selectedRiskCell.likelihood} Likelihood | ${selectedRiskCell.consequence} Consequence):`
                : 'Recorded Asset / Defect Risk Items Plotted:'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {(selectedRiskCell
                ? riskGrid[selectedRiskCell.likelihood]?.[selectedRiskCell.consequence] || []
                : riskMatrixItems
              ).map((item) => (
                <div key={item.id} className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${item.badgeColor}`}>
                  <div className="min-w-0">
                    <span className="font-bold block truncate">{item.name}</span>
                    <span className="text-[10px] opacity-80 block truncate">{item.pdLevel} • {item.subLabel}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/70 shrink-0">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Engineering Summary (Col AA) & Field PDF QR Code (Cols R-S) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
          <div className="border-b border-gray-100 pb-2">
            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
              4. DB Diagnostic Summary & Field Report QR (Cols R–S, Y–AA)
            </h4>
            <p className="text-[11px] text-gray-500">
              Recorded IEEE 400.2-2024 diagnostic verdict, maintenance directive, and linked PDF report
            </p>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-xl space-y-1">
              <span className="text-[10px] font-black text-purple-800 uppercase block">
                Diagnostic & Maintenance Summary (Col AA)
              </span>
              <p className="text-[11px] text-purple-950 leading-relaxed font-medium">
                {record.diagnosticSummary || 'No narrative summary recorded in Column AA for this offline submission.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Offline Verdict (Col Y)</span>
                <span className="font-black text-slate-900">{record.ieeeVerdict || 'Not Evaluated'}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Risk Level (Col Z)</span>
                <span className="font-black text-slate-900">{record.riskLevel || 'Not Evaluated'}</span>
              </div>
            </div>
          </div>

          {/* QR Code & PDF Link */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs uppercase">
                <QrCode className="w-4 h-4 text-purple-700" />
                <span>Offline PDF Report QR Code</span>
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                {record.pdfUrl ? 'Cols R–S Linked' : 'Asset Deep Link'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-xs shrink-0">
                <QRCodeSVG
                  value={resolvedQrUrl}
                  size={76}
                  bgColor="#ffffff"
                  fgColor="#1e1b4b"
                  level="M"
                />
              </div>

              <div className="space-y-1 text-xs min-w-0">
                <span className="font-bold text-gray-900 block truncate">
                  {record.pdfName || 'No PDF Report Uploaded'}
                </span>
                <p className="text-[10px] text-gray-500 leading-tight">
                  {record.pdfUrl
                    ? 'Scan QR code or click below to open the uploaded PDF test report.'
                    : 'No PDF report URL in Col R; QR links directly to this offline diagnostic record.'}
                </p>
                {record.pdfUrl && (
                  <a
                    href={record.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 underline pt-0.5"
                  >
                    <ExternalLink className="w-3 h-3" /> Open Uploaded PDF
                  </a>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setViewPdfModal(true)}
            className="w-full bg-slate-900 hover:bg-slate-950 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
          >
            <FileText className="w-4 h-4 text-purple-400" />
            <span>Inspect Complete DB Report Summary (Cols R–AQ)</span>
          </button>
        </div>
      </div>

      {/* Certified DB Summary Modal */}
      {viewPdfModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-700" />
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase">
                    Offline Diagnostic Database Record — {asset.equipmentId}
                  </h3>
                  <span className="text-[11px] text-gray-500">
                    Test Date (Col AB): {record.testDate || 'Recorded'} • Report File: {record.pdfName || 'N/A'}
                  </span>
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

            <div className="bg-slate-900 text-white rounded-xl p-6 space-y-4 text-xs font-mono">
              <div className="border-b border-slate-700 pb-3 flex flex-wrap justify-between gap-2">
                <span className="text-purple-300 font-bold">Google Sheet Tab 4 — Offline Telemetry (Cols R–AQ)</span>
                <span className="text-slate-400">Equipment ID: {asset.equipmentId}</span>
              </div>

              <div className="space-y-1.5">
                <h5 className="text-amber-400 font-bold uppercase text-xs">General & Offline PD Defects</h5>
                <p className="text-slate-300">
                  Cable Length: {record.cableLengthM} m | Test Voltage: {record.testVoltage || 'N/A'} | Max Discharge: {maxPeakNc !== undefined ? `${maxPeakNc} nC` : 'N/A'} | Risk: {record.riskLevel || 'N/A'}
                </p>
                {defects.length > 0 && (
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                    {defects.map((d) => (
                      <div key={d.id}>
                        • Defect #{d.defectNumber} @ {d.locationM} m ({d.topologyLabel}): {d.defectType} | {d.amplitudePc} pC ({d.maxChargeNc} nC) | PDIV {d.inceptionVoltageKv ?? '-'} kV
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {record.hasTanDelta && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <h5 className="text-indigo-400 font-bold uppercase text-xs">Tan Delta (IEEE 400.2-2024)</h5>
                  <p className="text-slate-300">
                    0.5 U₀: {record.tdStage1Mean ?? 'N/A'} E-3 (SDTD {record.tdStage1Sdtd ?? 'N/A'}) | 1.0 U₀: {record.tdStage2Mean ?? 'N/A'} E-3 (SDTD {record.tdStage2Sdtd ?? 'N/A'}) | 1.5 U₀: {record.tdStage3Mean ?? 'N/A'} E-3 (SDTD {record.tdStage3Sdtd ?? 'N/A'}) | Tip-Up: {record.tdDeltaTipUp ?? 'N/A'} E-3 | Verdict: {record.tdIeee4002Criteria || 'N/A'}
                  </p>
                </div>
              )}

              {record.diagnosticSummary && (
                <div className="space-y-1 pt-2 border-t border-slate-800">
                  <h5 className="text-emerald-400 font-bold uppercase text-xs">Diagnostic Summary (Col AA)</h5>
                  <p className="text-slate-200">{record.diagnosticSummary}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 gap-2">
              {record.pdfUrl ? (
                <a
                  href={record.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Original PDF Report</span>
                </a>
              ) : (
                <span className="text-[11px] text-gray-500">No external PDF file linked in Column R.</span>
              )}
              <button
                type="button"
                onClick={() => setViewPdfModal(false)}
                className="bg-purple-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-purple-950 cursor-pointer"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-Defect PRPD Image Lightbox */}
      {prpdLightbox && prpdLightbox.prpdImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase">
                  Defect #{prpdLightbox.defectNumber} PRPD Capture — {prpdLightbox.defectType}
                </h3>
                <span className="text-[11px] text-gray-500">
                  Location: {prpdLightbox.locationM} m ({prpdLightbox.topologyLabel}) • Amplitude: {prpdLightbox.amplitudePc} pC
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPrpdLightbox(null)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>
            <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-center">
              <img
                src={prpdLightbox.prpdImageUrl}
                alt={`Defect #${prpdLightbox.defectNumber} PRPD`}
                className="max-h-[60vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <a
                href={prpdLightbox.prpdImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Full Image
              </a>
              <button
                type="button"
                onClick={() => setPrpdLightbox(null)}
                className="bg-purple-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-purple-950 cursor-pointer"
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
