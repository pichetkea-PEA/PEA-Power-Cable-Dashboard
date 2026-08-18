import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CableAsset, PDDiagnosticInformation } from '../types';
import { logAssetActivity, deriveAssetArea } from '../utils/auditLogger';
import { 
  X, 
  Save, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Activity, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Loader2,
  Calendar,
  Layers,
  Sparkles,
  ExternalLink,
  QrCode
} from 'lucide-react';
import { uploadFileToDrive, updateSheetRow, appendPdDiagnosticRow, fetchSheetsRowIndices } from '../utils/googleSheets';
import { getBangkokTimestamp } from '../utils/dateUtils';

interface DiagnosticEditModalProps {
  asset: CableAsset;
  isOpen: boolean;
  activeSection?: 'online_prpd' | 'offline_pd' | 'all';
  onClose: () => void;
  onSaveSuccess: (updatedAsset: CableAsset) => void;
  googleToken?: string;
  spreadsheetId?: string;
  driveFolderId?: string;
}

export default function DiagnosticEditModal({
  asset,
  isOpen,
  activeSection = 'all',
  onClose,
  onSaveSuccess,
  googleToken,
  spreadsheetId,
  driveFolderId
}: DiagnosticEditModalProps) {
  const pd = asset.pdDiagnostics || {};

  // Form State
  const [operatorName, setOperatorName] = useState<string>(pd.operatorName || asset.operatorName || 'Admin Operator');
  const [timestamp, setTimestamp] = useState<string>(pd.timestamp || getBangkokTimestamp());
  
  // Tab 4: Online HFCT PRPD Telemetry
  const [onlinePrpdImageUrl, setOnlinePrpdImageUrl] = useState<string>(pd.onlinePrpdImageUrl || asset.onlinePrpdImageUrl || '');
  const [onlinePrpdPhase, setOnlinePrpdPhase] = useState<string>(pd.onlinePrpdPhase || asset.onlinePrpdPhase || 'Phase A (Channel 1)');
  const [onlinePrpdAmplitude, setOnlinePrpdAmplitude] = useState<string>(pd.onlinePrpdAmplitude !== undefined ? String(pd.onlinePrpdAmplitude) : (asset.onlinePrpdAmplitude !== undefined ? String(asset.onlinePrpdAmplitude) : ''));
  const [onlinePrpdRepetitionRate, setOnlinePrpdRepetitionRate] = useState<string>(pd.onlinePrpdRepetitionRate !== undefined ? String(pd.onlinePrpdRepetitionRate) : (asset.onlinePrpdRepetitionRate !== undefined ? String(asset.onlinePrpdRepetitionRate) : ''));
  const [onlinePrpdPhaseRange, setOnlinePrpdPhaseRange] = useState<string>(pd.onlinePrpdPhaseRange || asset.onlinePrpdPhaseRange || '85° - 145° (Positive) & 265° - 325° (Negative)');
  const [onlinePrpdDefectType, setOnlinePrpdDefectType] = useState<string>(pd.onlinePrpdDefectType || asset.onlinePrpdDefectType || 'Internal Void / Cavity & Bad Contact Discharge');
  const [onlinePrpdSeverity, setOnlinePrpdSeverity] = useState<string>(pd.onlinePrpdSeverity || asset.onlinePrpdSeverity || 'Advisory');

  // Tab 4: Offline Cable PD & VLF Diagnostics
  const [offlinePdfReportUrl, setOfflinePdfReportUrl] = useState<string>(pd.offlinePdfReportUrl || pd.offlinePdfUrl || asset.offlinePdfReportUrl || asset.offlinePdfUrl || '');
  const [offlinePdfReportName, setOfflinePdfReportName] = useState<string>(pd.offlinePdfReportName || asset.offlinePdfReportName || 'VLF_Diagnostic_Report.pdf');
  const [offlineTestVoltage, setOfflineTestVoltage] = useState<string>(pd.offlineTestVoltage || asset.offlineTestVoltage || '13.2 kV (1.0 Uo)');
  const [offlineMaxDischarge, setOfflineMaxDischarge] = useState<string>(pd.offlineMaxDischarge !== undefined ? String(pd.offlineMaxDischarge) : (asset.offlineMaxDischarge !== undefined ? String(asset.offlineMaxDischarge) : ''));
  const [offlineDefectLocation, setOfflineDefectLocation] = useState<string>(pd.offlineDefectLocation || asset.offlineDefectLocation || '');
  const [offlineInceptionVoltage, setOfflineInceptionVoltage] = useState<string>(pd.offlineInceptionVoltage !== undefined ? String(pd.offlineInceptionVoltage) : (asset.offlineInceptionVoltage !== undefined ? String(asset.offlineInceptionVoltage) : ''));
  const [offlineDefectClassification, setOfflineDefectClassification] = useState<string>(pd.offlineDefectClassification || asset.offlineDefectClassification || 'Surface Discharges');
  const [offlineIeeeVerdict, setOfflineIeeeVerdict] = useState<string>(pd.offlineIeeeVerdict || asset.offlineIeeeVerdict || 'IEEE 400.2 - Level 2 Advisory');
  const [offlineRiskLevel, setOfflineRiskLevel] = useState<string>(pd.offlineRiskLevel || asset.offlineRiskLevel || 'Medium');
  const [diagnosticSummary, setDiagnosticSummary] = useState<string>(pd.diagnosticSummary || pd.summaryAnalysis || asset.diagnosticSummary || asset.pdDiagnosticSummary || '');

  // File Upload State
  const [selectedPrpdFile, setSelectedPrpdFile] = useState<File | null>(null);
  const [prpdPreviewUrl, setPrpdPreviewUrl] = useState<string>(pd.onlinePrpdImageUrl || asset.onlinePrpdImageUrl || '');
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>('');

  const prpdFileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize form state whenever modal opens or selected asset changes
  React.useEffect(() => {
    if (isOpen && asset) {
      const p = asset.pdDiagnostics || {};
      setOperatorName(p.operatorName || asset.operatorName || 'Admin Operator');
      setTimestamp(p.timestamp || getBangkokTimestamp());
      
      const img = p.onlinePrpdImageUrl || asset.onlinePrpdImageUrl || '';
      setOnlinePrpdImageUrl(img);
      setPrpdPreviewUrl(img);
      setOnlinePrpdPhase(p.onlinePrpdPhase || asset.onlinePrpdPhase || 'Phase A (Channel 1)');
      
      const ampVal = p.onlinePrpdAmplitude !== undefined ? p.onlinePrpdAmplitude : asset.onlinePrpdAmplitude;
      setOnlinePrpdAmplitude(ampVal !== undefined ? String(ampVal) : '');
      
      const pulseVal = p.onlinePrpdRepetitionRate !== undefined ? p.onlinePrpdRepetitionRate : asset.onlinePrpdRepetitionRate;
      setOnlinePrpdRepetitionRate(pulseVal !== undefined ? String(pulseVal) : '');
      
      setOnlinePrpdPhaseRange(p.onlinePrpdPhaseRange || asset.onlinePrpdPhaseRange || '85° - 145° (Positive) & 265° - 325° (Negative)');
      setOnlinePrpdDefectType(p.onlinePrpdDefectType || asset.onlinePrpdDefectType || 'Internal Void / Cavity & Bad Contact Discharge');
      setOnlinePrpdSeverity(p.onlinePrpdSeverity || asset.onlinePrpdSeverity || 'Advisory');
      
      const pdfUrl = p.offlinePdfReportUrl || p.offlinePdfUrl || asset.offlinePdfReportUrl || asset.offlinePdfUrl || '';
      setOfflinePdfReportUrl(pdfUrl);
      setOfflinePdfReportName(p.offlinePdfReportName || asset.offlinePdfReportName || 'VLF_Diagnostic_Report.pdf');
      setOfflineTestVoltage(p.offlineTestVoltage || asset.offlineTestVoltage || '13.2 kV (1.0 Uo)');
      
      const maxD = p.offlineMaxDischarge !== undefined ? p.offlineMaxDischarge : asset.offlineMaxDischarge;
      setOfflineMaxDischarge(maxD !== undefined ? String(maxD) : '');
      
      setOfflineDefectLocation(p.offlineDefectLocation || asset.offlineDefectLocation || '');
      
      const incep = p.offlineInceptionVoltage !== undefined ? p.offlineInceptionVoltage : asset.offlineInceptionVoltage;
      setOfflineInceptionVoltage(incep !== undefined ? String(incep) : '');
      
      setOfflineDefectClassification(p.offlineDefectClassification || asset.offlineDefectClassification || 'Surface Discharges');
      setOfflineIeeeVerdict(p.offlineIeeeVerdict || asset.offlineIeeeVerdict || 'IEEE 400.2 - Level 2 Advisory');
      setOfflineRiskLevel(p.offlineRiskLevel || asset.offlineRiskLevel || 'Medium');
      setDiagnosticSummary(p.diagnosticSummary || p.summaryAnalysis || asset.diagnosticSummary || asset.pdDiagnosticSummary || '');
      
      setSelectedPrpdFile(null);
      setSelectedPdfFile(null);
      setIsSaving(false);
      setSaveStatus('');
    }
  }, [isOpen, asset]);

  if (!isOpen) return null;

  const handlePrpdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedPrpdFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPrpdPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedPdfFile(file);
    setOfflinePdfReportName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus('Preparing diagnostic record...');

    try {
      let finalPrpdUrl = onlinePrpdImageUrl || prpdPreviewUrl || asset.pdDiagnostics?.onlinePrpdImageUrl || asset.onlinePrpdImageUrl || '';
      let finalPdfUrl = offlinePdfReportUrl || asset.pdDiagnostics?.offlinePdfReportUrl || asset.offlinePdfUrl || '';

      // 1. Upload PRPD Image to Drive if a new file was chosen and token is available
      if (selectedPrpdFile) {
        if (googleToken) {
          setSaveStatus('Uploading PRPD pattern image to Google Drive...');
          try {
            finalPrpdUrl = await uploadFileToDrive(googleToken, driveFolderId || '', selectedPrpdFile);
          } catch (uploadErr) {
            console.warn("Drive image upload failed, using local preview:", uploadErr);
            finalPrpdUrl = prpdPreviewUrl || finalPrpdUrl;
          }
        } else {
          finalPrpdUrl = prpdPreviewUrl || finalPrpdUrl;
        }
      }

      // 2. Upload PDF Report to Drive if a new file was chosen
      if (selectedPdfFile) {
        if (googleToken) {
          setSaveStatus('Uploading PDF test report to Google Drive...');
          try {
            finalPdfUrl = await uploadFileToDrive(googleToken, driveFolderId || '', selectedPdfFile);
          } catch (uploadErr) {
            console.warn("Drive PDF upload failed:", uploadErr);
          }
        }
      }

      // 3. Build updated PD Diagnostic object
      const parsedAmp = onlinePrpdAmplitude ? parseFloat(onlinePrpdAmplitude) : undefined;
      const parsedPulse = onlinePrpdRepetitionRate ? parseFloat(onlinePrpdRepetitionRate) : undefined;
      const parsedMaxDischarge = offlineMaxDischarge ? parseFloat(offlineMaxDischarge) : undefined;
      const parsedInception = offlineInceptionVoltage ? parseFloat(offlineInceptionVoltage) : undefined;

      const updatedPdDiag: PDDiagnosticInformation = {
        number: asset.number,
        timestamp: timestamp || getBangkokTimestamp(),
        operatorName: operatorName || asset.operatorName || 'Admin Operator',
        equipmentId: asset.equipmentId,
        peaNumber: asset.peaNumber || '',
        voltageLevel: asset.voltageLevel || '',
        city: asset.city || '',
        equipmentType: asset.equipmentType || '',
        locationType: asset.locationType || '',
        substation: asset.substationName || '',
        onlinePrpdImageUrl: finalPrpdUrl,
        onlinePrpdPhase,
        onlinePrpdAmplitude: parsedAmp,
        onlinePrpdRepetitionRate: parsedPulse,
        onlinePrpdPhaseRange,
        onlinePrpdDefectType,
        onlinePrpdSeverity: onlinePrpdSeverity as any,
        offlinePdfReportUrl: finalPdfUrl,
        offlinePdfReportName: offlinePdfReportName || 'Offline_Report.pdf',
        offlinePdfUrl: finalPdfUrl,
        offlineTestVoltage,
        offlineMaxDischarge: parsedMaxDischarge,
        offlineDefectLocation,
        offlineInceptionVoltage: parsedInception,
        offlineDefectClassification,
        offlineIeeeVerdict,
        offlineRiskLevel: offlineRiskLevel as any,
        diagnosticSummary
      };

      // 4. Update Google Sheets Tab 4 if token and target sheet ID exist
      const targetSheetId = asset.spreadsheetId || spreadsheetId;
      if (googleToken && targetSheetId) {
        setSaveStatus('Writing diagnostic telemetry to Google Sheet Tab 4...');
        try {
          const rowIndices = await fetchSheetsRowIndices(googleToken, targetSheetId, asset.equipmentId, asset.number);
          
          if (rowIndices.pdRowIndex > 0) {
            await updateSheetRow(
              googleToken,
              targetSheetId,
              'PD & Diagnostic Data',
              rowIndices.pdRowIndex,
              updatedPdDiag,
              'A:AA'
            );
          } else {
            await appendPdDiagnosticRow(
              googleToken,
              targetSheetId,
              updatedPdDiag
            );
          }
        } catch (sheetErr) {
          console.warn("Failed to update Tab 4 on Google Sheets directly:", sheetErr);
        }
      }

      // 5. Update parent asset state (both top-level and pdDiagnostics)
      const updatedAsset: CableAsset = {
        ...asset,
        onlinePrpdImageUrl: finalPrpdUrl,
        onlinePrpdPhase,
        onlinePrpdAmplitude: parsedAmp,
        onlinePrpdRepetitionRate: parsedPulse,
        onlinePrpdPhaseRange,
        onlinePrpdDefectType,
        onlinePrpdSeverity: onlinePrpdSeverity as any,
        offlinePdfUrl: finalPdfUrl,
        offlinePdfReportUrl: finalPdfUrl,
        offlinePdfReportName: offlinePdfReportName || 'Offline_Report.pdf',
        offlineTestVoltage,
        offlineMaxDischarge: parsedMaxDischarge,
        offlineDefectLocation,
        offlineInceptionVoltage: parsedInception,
        offlineDefectClassification,
        offlineIeeeVerdict,
        offlineRiskLevel: offlineRiskLevel as any,
        diagnosticSummary,
        pdDiagnostics: updatedPdDiag
      };

      // Log edit activity for Admin Asset Monitor
      await logAssetActivity({
        type: 'edit',
        equipmentId: asset.equipmentId,
        equipmentType: asset.equipmentType || 'Underground Cable',
        voltageLevel: asset.voltageLevel ? `${asset.voltageLevel} kV` : '115 kV',
        area: deriveAssetArea(asset),
        operatorName: operatorName || 'Operator',
        timestamp: getBangkokTimestamp(),
        details: `Updated PRPD telemetry & offline diagnostic report for ${asset.equipmentId}`,
        changedFields: ['PRPD Waveform', 'Offline VLF', 'Diagnostic Summary'],
        gps: asset.gps,
        substationName: asset.substationName,
        landmark: asset.landmark,
        city: asset.city
      });

      setSaveStatus('Done! Updating view...');
      setTimeout(() => {
        setIsSaving(false);
        onSaveSuccess(updatedAsset);
        onClose();
      }, 500);

    } catch (err: any) {
      console.error("Save Diagnostic Data Error:", err);
      setIsSaving(false);
      setSaveStatus(`Error saving: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white px-6 py-4 flex items-center justify-between border-b border-purple-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/30 rounded-xl border border-purple-400/30">
              <Activity className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                {activeSection === 'online_prpd'
                  ? 'Edit Online HFCT PRPD Telemetry & Pattern (Tab 4 Columns K-Q)'
                  : activeSection === 'offline_pd'
                  ? 'Edit Offline Cable PD & 3x3 Risk Matrix Data (Tab 4 Columns R-AA)'
                  : 'Edit Diagnostic Telemetry & PD Data (Tab 4)'}
              </h3>
              <p className="text-xs text-purple-200/80">
                Equipment ID: <span className="font-mono font-bold text-white">{asset.equipmentId}</span> • Area: <span className="font-bold text-purple-300">{asset.equipmentId ? asset.equipmentId.split('-')[0] : (asset.city || 'N/A')}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-purple-200 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Section 1: General Record Identity (Columns A-J) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-700" />
                Asset & Inspector Details (Google Sheet Tab 4 - Columns A-J)
              </h4>
              <span className="text-[11px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md">
                Auto-Synced from Tab 1
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Inspector / Operator Name</label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-purple-500 outline-hidden"
                  placeholder="Inspector Name"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Measurement Timestamp</label>
                <input
                  type="text"
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono font-medium focus:ring-2 focus:ring-purple-500 outline-hidden"
                  placeholder="YYYY-MM-DD HH:mm:ss"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">PEA Number (ID)</label>
                <input
                  type="text"
                  value={asset.peaNumber || ''}
                  disabled
                  className="w-full px-3 py-1.5 bg-slate-200/70 border border-slate-300 rounded-lg text-slate-600 font-mono font-bold cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Online HFCT PRPD Pattern Diagnostics (Columns K-Q) */}
          {(activeSection === 'all' || activeSection === 'online_prpd') && (
            <div className="border border-purple-200 rounded-xl p-5 bg-white space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-purple-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center text-purple-700">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-black text-purple-950 uppercase tracking-wider">
                    Online HFCT PRPD Telemetry (Columns K-Q)
                  </h4>
                </div>
                <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  Live Sensor Telemetry
                </span>
              </div>

              {/* PRPD Picture Upload / Preview */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-4 space-y-2">
                  <label className="block text-[11px] font-bold text-gray-700">
                    PRPD Waveform / Pattern Image (Google Sheet Tab 4 Column K)
                  </label>
                  <div 
                    onClick={() => prpdFileInputRef.current?.click()}
                    className="h-36 border-2 border-dashed border-purple-300 hover:border-purple-500 rounded-xl bg-purple-50/40 hover:bg-purple-50/70 flex flex-col items-center justify-center p-3 text-center cursor-pointer transition-all overflow-hidden relative group"
                  >
                    {prpdPreviewUrl ? (
                      <>
                        <img 
                          src={prpdPreviewUrl} 
                          alt="PRPD Pattern" 
                          className="w-full h-full object-contain rounded-md"
                        />
                        <div className="absolute inset-0 bg-purple-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                          <Upload className="w-4 h-4 mr-1" /> Change Image
                        </div>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-8 h-8 text-purple-400 mb-1" />
                        <span className="text-xs font-bold text-purple-900">Upload PRPD Capture</span>
                        <span className="text-[10px] text-purple-600/80 mt-0.5">Click to choose PNG / JPEG</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={prpdFileInputRef}
                    onChange={handlePrpdFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Sensor Channel / Phase
                    </label>
                    <select
                      value={onlinePrpdPhase}
                      onChange={(e) => setOnlinePrpdPhase(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-purple-500 outline-hidden"
                    >
                      <option value="Phase A (Channel 1)">Phase A (Channel 1)</option>
                      <option value="Phase B (Channel 2)">Phase B (Channel 2)</option>
                      <option value="Phase C (Channel 3)">Phase C (Channel 3)</option>
                      <option value="3-Phase Synchronized (CH1-3)">3-Phase Synchronized (CH1-3)</option>
                      <option value="Direct MV Coupling CH1">Direct MV Coupling CH1</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Peak Amplitude (mV / pC)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={onlinePrpdAmplitude}
                      onChange={(e) => setOnlinePrpdAmplitude(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
                      placeholder="e.g. 812.8"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Pulse Repetition Rate (pps)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={onlinePrpdRepetitionRate}
                      onChange={(e) => setOnlinePrpdRepetitionRate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
                      placeholder="e.g. 263.7"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Online PD Severity
                    </label>
                    <select
                      value={onlinePrpdSeverity}
                      onChange={(e) => setOnlinePrpdSeverity(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
                    >
                      <option value="Normal">Normal (Baseline)</option>
                      <option value="Advisory">Advisory (Level 1)</option>
                      <option value="Moderate">Moderate (Level 2)</option>
                      <option value="Critical">Critical (Immediate Alert)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Defect Classification Signature
                    </label>
                    <select
                      value={onlinePrpdDefectType}
                      onChange={(e) => setOnlinePrpdDefectType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-purple-500 outline-hidden"
                    >
                      <option value="Internal Void / Cavity & Bad Contact Discharge">Internal Void / Cavity & Bad Contact Discharge</option>
                      <option value="Surface Tracking & Creepage Discharge">Surface Tracking & Creepage Discharge</option>
                      <option value="Corona Discharge in Air Interface">Corona Discharge in Air Interface</option>
                      <option value="Electrical Treeing Breakdown">Electrical Treeing Breakdown</option>
                      <option value="Normal - Ambient Background Noise Floor">Normal - Ambient Background Noise Floor</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Phase Inception Range
                    </label>
                    <input
                      type="text"
                      value={onlinePrpdPhaseRange}
                      onChange={(e) => setOnlinePrpdPhaseRange(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-purple-500 outline-hidden"
                      placeholder="e.g. 85° - 145° (Positive) & 265° - 325° (Negative)"
                    />
                  </div>
                </div>
              </div>

              {/* Diagnostic Summary inside Online Section when edited standalone */}
              {activeSection === 'online_prpd' && (
                <div className="pt-2 border-t border-purple-100">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Diagnostic & Maintenance Summary / Engineering Recommendation
                  </label>
                  <textarea
                    rows={2}
                    value={diagnosticSummary}
                    onChange={(e) => setDiagnosticSummary(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-purple-500 outline-hidden text-xs"
                    placeholder="Enter maintenance directive, inspection recommendations, or follow-up protocol..."
                  />
                </div>
              )}
            </div>
          )}

          {/* Section 3: Offline Cable PD & 3X3 Risk Matrix (Columns R-AA) */}
          {(activeSection === 'all' || activeSection === 'offline_pd') && (
            <div className="border border-indigo-200 rounded-xl p-5 bg-white space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center text-indigo-700">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                    Offline Cable PD & VLF Diagnostics (Columns R-AA)
                  </h4>
                </div>
                <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  VLF / TDR Analysis
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Offline Test Voltage
                  </label>
                  <input
                    type="text"
                    value={offlineTestVoltage}
                    onChange={(e) => setOfflineTestVoltage(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    placeholder="e.g. 13.2 kV (1.0 Uo)"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Max Discharge Qmax (nC / pC)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={offlineMaxDischarge}
                    onChange={(e) => setOfflineMaxDischarge(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    placeholder="e.g. 3.6 nC"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    TDR Defect Location (m)
                  </label>
                  <input
                    type="text"
                    value={offlineDefectLocation}
                    onChange={(e) => setOfflineDefectLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    placeholder="e.g. 20.32 m (Near Section)"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Inception Voltage (kV)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={offlineInceptionVoltage}
                    onChange={(e) => setOfflineInceptionVoltage(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    placeholder="e.g. 6.4 kV"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    IEEE 400.2 Verdict
                  </label>
                  <select
                    value={offlineIeeeVerdict}
                    onChange={(e) => setOfflineIeeeVerdict(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  >
                    <option value="IEEE 400.2 - Level 1 Pass">IEEE 400.2 - Level 1 Pass</option>
                    <option value="IEEE 400.2 - Level 2 Advisory">IEEE 400.2 - Level 2 Advisory</option>
                    <option value="IEEE 400.2 - Level 3 Alert">IEEE 400.2 - Level 3 Alert</option>
                    <option value="Action Required - Cable Defect">Action Required - Cable Defect</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    3x3 Failure Risk Level
                  </label>
                  <select
                    value={offlineRiskLevel}
                    onChange={(e) => setOfflineRiskLevel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  >
                    <option value="Low">Low Risk (Green)</option>
                    <option value="Medium">Medium Risk (Yellow)</option>
                    <option value="High">High Risk (Orange)</option>
                    <option value="Critical">Critical Risk (Red)</option>
                  </select>
                </div>

                {/* PDF Report External Link & Upload with Auto-Generated QR Code */}
                <div className="sm:col-span-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                    <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs uppercase">
                      <QrCode className="w-4 h-4 text-indigo-700" />
                      <span>Offline VLF / Test PDF Report & Auto-Generated QR Code</span>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md">
                      Tab 4 Column R (External URL) & Column S (File Name)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-8 space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          External PDF Report Link / Google Drive URL
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="url"
                            value={offlinePdfReportUrl}
                            onChange={(e) => setOfflinePdfReportUrl(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                            placeholder="https://drive.google.com/file/d/..."
                          />
                          {offlinePdfReportUrl && (
                            <a
                              href={offlinePdfReportUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-lg transition-colors"
                              title="Open external report link"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">
                            Report File Title / Name
                          </label>
                          <input
                            type="text"
                            value={offlinePdfReportName}
                            onChange={(e) => setOfflinePdfReportName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-slate-900 font-medium text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                            placeholder="e.g. VLF_Diagnostic_Report.pdf"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">
                            Upload Local PDF File
                          </label>
                          <button
                            type="button"
                            onClick={() => pdfFileInputRef.current?.click()}
                            className="w-full px-3 py-1.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span className="truncate">{selectedPdfFile ? selectedPdfFile.name : 'Choose PDF File'}</span>
                          </button>
                          <input
                            type="file"
                            ref={pdfFileInputRef}
                            onChange={handlePdfFileChange}
                            accept="application/pdf"
                            className="hidden"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Auto-Generated QR Code Box for Field Engineers */}
                    <div className="md:col-span-4 bg-white border border-indigo-200 rounded-xl p-3 flex flex-col items-center justify-center text-center space-y-1.5 shadow-xs">
                      <span className="text-[10px] font-extrabold text-indigo-900 uppercase tracking-tight">
                        Field Report QR Code
                      </span>
                      <div className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-inner">
                        <QRCodeSVG
                          value={
                            offlinePdfReportUrl || 
                            `${window.location.origin}${window.location.pathname}?equipmentId=${encodeURIComponent(asset.equipmentId || '')}&tab=offline_pd`
                          }
                          size={84}
                          bgColor="#ffffff"
                          fgColor="#1e1b4b"
                          level="M"
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 leading-tight font-medium">
                        {offlinePdfReportUrl ? 'Scans directly to external PDF' : 'Auto-generated QR link for asset'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary / Advisory */}
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Diagnostic & Maintenance Summary / Engineering Recommendation
                  </label>
                  <textarea
                    rows={3}
                    value={diagnosticSummary}
                    onChange={(e) => setDiagnosticSummary(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    placeholder="Enter maintenance directive, inspection recommendations, or follow-up protocol..."
                  />
                </div>

              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              {saveStatus && (
                <span className="font-semibold text-purple-700 animate-pulse">
                  {saveStatus}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 sm:flex-none px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-none px-5 py-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to Google Sheets...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Diagnostic Data</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
