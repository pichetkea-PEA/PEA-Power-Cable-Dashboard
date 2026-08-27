import React from 'react';
import { 
  AlertTriangle, 
  X, 
  Download, 
  ShieldAlert, 
  FileSpreadsheet, 
  Layers, 
  Copy, 
  Check, 
  ArrowRight,
  Info
} from 'lucide-react';

export interface CsvDuplicateConflict {
  rowNum: number;
  conflictType: 'PEA Number' | 'Equipment Number (ADS)' | 'Account Asset Number (AA)';
  conflictValue: string;
  source: 'Existing System Asset' | 'Internal CSV Duplicate';
  existingAssetInfo?: {
    equipmentId?: string;
    peaNumber?: string;
    adsNumber?: string;
    assetNumber?: string;
    substationName?: string;
    area?: string;
    voltageLevel?: string;
    equipmentType?: string;
  };
  conflictingRowIndex?: number;
  rowDetails?: {
    equipmentType?: string;
    voltageLevel?: string;
    substationName?: string;
    area?: string;
    landmark?: string;
  };
}

interface CsvDuplicateConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: CsvDuplicateConflict[];
  fileName?: string;
}

export const CsvDuplicateConflictModal: React.FC<CsvDuplicateConflictModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  fileName
}) => {
  const [copiedValue, setCopiedValue] = React.useState<string | null>(null);

  if (!isOpen || conflicts.length === 0) return null;

  const existingAssetConflicts = conflicts.filter(c => c.source === 'Existing System Asset');
  const internalConflicts = conflicts.filter(c => c.source === 'Internal CSV Duplicate');

  const peaCount = conflicts.filter(c => c.conflictType === 'PEA Number').length;
  const adsCount = conflicts.filter(c => c.conflictType === 'Equipment Number (ADS)').length;
  const aaCount = conflicts.filter(c => c.conflictType === 'Account Asset Number (AA)').length;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedValue(text);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const handleDownloadReport = () => {
    let report = `================================================================================\n`;
    report += `CSV UPLOAD DUPLICATE CONFLICT REPORT - PEA CABLE ASSET MANAGEMENT\n`;
    report += `================================================================================\n`;
    report += `Generated: ${new Date().toLocaleString('en-GB')}\n`;
    report += `Target File: ${fileName || 'Uploaded CSV'}\n`;
    report += `Total Conflicts Found: ${conflicts.length}\n`;
    report += `- PEA Number Conflicts: ${peaCount}\n`;
    report += `- Equipment Number (ADS) Conflicts: ${adsCount}\n`;
    report += `- Account Asset Number (AA) Conflicts: ${aaCount}\n`;
    report += `\nUPLOAD PROCESS STATUS: STOPPED (Upload aborted to protect database integrity)\n`;
    report += `ACTION REQUIRED: Please review and correct the duplicate entries listed below.\n`;
    report += `================================================================================\n\n`;

    conflicts.forEach((c, idx) => {
      report += `[CONFLICT #${idx + 1}]\n`;
      report += `  - CSV Row: Row #${c.rowNum}\n`;
      report += `  - Conflict Field: ${c.conflictType}\n`;
      report += `  - Duplicate Value: ${c.conflictValue}\n`;
      report += `  - Source: ${c.source}\n`;
      if (c.source === 'Existing System Asset' && c.existingAssetInfo) {
        report += `  - Existing Database Record:\n`;
        report += `      * Substation: ${c.existingAssetInfo.substationName || 'N/A'}\n`;
        report += `      * Regional Area: ${c.existingAssetInfo.area || 'N/A'}\n`;
        report += `      * Voltage: ${c.existingAssetInfo.voltageLevel || 'N/A'} kV\n`;
        report += `      * Equipment Type: ${c.existingAssetInfo.equipmentType || 'N/A'}\n`;
        report += `      * Equipment ID: ${c.existingAssetInfo.equipmentId || 'N/A'}\n`;
        report += `      * PEA Number: ${c.existingAssetInfo.peaNumber || 'N/A'}\n`;
        report += `      * ADS Number: ${c.existingAssetInfo.adsNumber || 'N/A'}\n`;
        report += `      * AA Number: ${c.existingAssetInfo.assetNumber || 'N/A'}\n`;
      } else if (c.source === 'Internal CSV Duplicate' && c.conflictingRowIndex) {
        report += `  - Duplicate with: CSV Row #${c.conflictingRowIndex}\n`;
      }
      if (c.rowDetails) {
        report += `  - Uploaded Row Info: ${c.rowDetails.equipmentType || 'N/A'} | ${c.rowDetails.voltageLevel || 'N/A'} kV | ${c.rowDetails.substationName || 'N/A'} | Area ${c.rowDetails.area || 'N/A'}\n`;
      }
      report += `\n`;
    });

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CSV_Duplicate_Conflict_Report_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-red-200 flex flex-col max-h-[90vh] overflow-hidden"
        id="duplicate-conflict-modal"
      >
        {/* Modal Header */}
        <div className="bg-red-900 text-white p-5 flex items-start justify-between relative overflow-hidden shrink-0">
          <div className="flex items-center gap-3.5 relative z-10">
            <div className="p-2.5 bg-red-800 text-yellow-300 rounded-2xl shadow-inner border border-red-700/50">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest bg-red-950 text-red-300 px-2 py-0.5 rounded">
                  Integrity Validation Failed
                </span>
                <span className="text-[10px] bg-yellow-400 text-red-950 font-black px-2 py-0.5 rounded">
                  Upload Stopped
                </span>
              </div>
              <h3 className="text-base font-extrabold text-white mt-1">
                Duplicate Conflict Detected in Uploaded CSV
              </h3>
              <p className="text-xs text-red-200 mt-0.5">
                Duplicate assets found in file <span className="font-mono font-bold text-white">"{fileName || 'Uploaded CSV'}"</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-red-300 hover:text-white p-2 rounded-xl hover:bg-red-800/60 transition-colors cursor-pointer relative z-10"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Alert Banner */}
        <div className="bg-red-50 border-b border-red-100 p-4 shrink-0 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-900 leading-relaxed">
            <p className="font-bold">
              The upload process has been stopped to prevent database conflicts.
            </p>
            <p className="text-red-700 mt-0.5">
              The cross-check found conflicts against existing assets or duplicate rows in your CSV across{' '}
              <strong>PEA Number</strong>, <strong>Equipment Number (ADS)</strong>, or <strong>Account Asset Number (AA)</strong>.
              Please inspect the conflicts below, correct your CSV file, and upload again.
            </p>
          </div>
        </div>

        {/* Conflict Summary Metrics */}
        <div className="p-4 bg-gray-50/80 border-b border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0 text-xs">
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Conflicts</span>
            <span className="text-lg font-black text-red-600 mt-0.5 block">{conflicts.length}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[10px] font-bold text-purple-700 uppercase block">PEA Number</span>
            <span className="text-lg font-black text-purple-900 mt-0.5 block">{peaCount}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[10px] font-bold text-amber-700 uppercase block">ADS Equip No</span>
            <span className="text-lg font-black text-amber-800 mt-0.5 block">{adsCount}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[10px] font-bold text-blue-700 uppercase block">AA Asset No</span>
            <span className="text-lg font-black text-blue-900 mt-0.5 block">{aaCount}</span>
          </div>
        </div>

        {/* Conflict Details List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-gray-800 uppercase flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-red-600" />
              Conflict Breakdown List ({conflicts.length} items)
            </span>
            <span className="text-[10px] text-gray-500">
              {existingAssetConflicts.length} vs Existing Database | {internalConflicts.length} Internal CSV Duplicates
            </span>
          </div>

          <div className="space-y-2.5">
            {conflicts.map((conflict, index) => {
              const isExisting = conflict.source === 'Existing System Asset';
              const typeColor = 
                conflict.conflictType === 'PEA Number' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                conflict.conflictType === 'Equipment Number (ADS)' ? 'bg-amber-100 text-amber-900 border-amber-200' :
                'bg-blue-100 text-blue-900 border-blue-200';

              return (
                <div 
                  key={index}
                  className="bg-white border border-red-200 rounded-2xl p-3.5 shadow-2xs hover:border-red-300 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black bg-red-50 text-red-700 px-2 py-0.5 rounded-md border border-red-200">
                        CSV Row #{conflict.rowNum}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${typeColor}`}>
                        {conflict.conflictType}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        isExisting ? 'bg-rose-50 text-rose-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {isExisting ? 'Matches Existing Asset' : 'Internal CSV Duplicate'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-black text-red-900 bg-red-100 px-2.5 py-0.5 rounded-lg border border-red-300">
                        {conflict.conflictValue}
                      </span>
                      <button
                        onClick={() => handleCopy(conflict.conflictValue)}
                        className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
                        title="Copy duplicate value"
                      >
                        {copiedValue === conflict.conflictValue ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Conflict Context */}
                  <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    {/* Left: Uploaded Row Info */}
                    <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Uploaded CSV Record</span>
                      <div className="space-y-0.5 text-gray-700">
                        <div><strong className="text-gray-900">Equipment:</strong> {conflict.rowDetails?.equipmentType || 'N/A'} ({conflict.rowDetails?.voltageLevel || 'N/A'} kV)</div>
                        <div><strong className="text-gray-900">Location:</strong> {conflict.rowDetails?.substationName || 'N/A'} (Area: {conflict.rowDetails?.area || 'N/A'})</div>
                        {conflict.rowDetails?.landmark && <div><strong className="text-gray-900">Landmark:</strong> {conflict.rowDetails.landmark}</div>}
                      </div>
                    </div>

                    {/* Right: Conflicting Target Info */}
                    <div className="bg-red-50/50 p-2.5 rounded-xl border border-red-100">
                      <span className="text-[9px] font-bold text-red-800 uppercase block mb-1">
                        {isExisting ? 'Conflicting Database Asset' : 'Duplicate Row in CSV'}
                      </span>
                      {isExisting && conflict.existingAssetInfo ? (
                        <div className="space-y-0.5 text-gray-700">
                          <div><strong className="text-gray-900">Substation:</strong> {conflict.existingAssetInfo.substationName || 'N/A'} (Area: {conflict.existingAssetInfo.area || 'N/A'})</div>
                          <div><strong className="text-gray-900">Eq ID:</strong> <span className="font-mono text-purple-900">{conflict.existingAssetInfo.equipmentId || 'N/A'}</span></div>
                          <div className="flex gap-2 text-[10px] text-gray-600 mt-1">
                            <span>PEA: <strong className="font-mono">{conflict.existingAssetInfo.peaNumber || '-'}</strong></span>
                            <span>ADS: <strong className="font-mono">{conflict.existingAssetInfo.adsNumber || '-'}</strong></span>
                            <span>AA: <strong className="font-mono">{conflict.existingAssetInfo.assetNumber || '-'}</strong></span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-amber-900 space-y-0.5">
                          <p>
                            Shares identical <strong>{conflict.conflictType}</strong> with CSV <strong className="underline">Row #{conflict.conflictingRowIndex}</strong>.
                          </p>
                          <p className="text-[10px] text-amber-700">Each asset row in the CSV must have a unique identifier.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-purple-700 shrink-0" />
            <span>Upload has been halted. Edit CSV values and re-upload.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleDownloadReport}
              className="flex-1 sm:flex-initial bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-purple-700" />
              Download Conflict Report (.txt)
            </button>

            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <X className="w-4 h-4" />
              Acknowledge & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
