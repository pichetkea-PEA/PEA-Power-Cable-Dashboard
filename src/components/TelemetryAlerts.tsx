import React, { useState, useMemo } from 'react';
import { CableAsset } from '../types';
import { 
  BellRing, 
  ShieldAlert, 
  CheckCircle, 
  Download, 
  Thermometer, 
  Zap, 
  ShieldCheck, 
  Search,
  XCircle,
  FileSpreadsheet
} from 'lucide-react';

interface TelemetryAlertsProps {
  assets: CableAsset[];
  onSelectAsset: (asset: CableAsset) => void;
}

interface AlertItem {
  id: string;
  assetId: string;
  assetName: string;
  area: string;
  city: string;
  metricName: string;
  metricValue: string;
  threshold: string;
  severity: 'Danger' | 'Warning';
  timestamp: string;
  originalAsset: CableAsset;
}

export default function TelemetryAlerts({ assets, onSelectAsset }: TelemetryAlertsProps) {
  // Local state for acknowledged alerts
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, boolean>>({});
  const [filterSeverity, setFilterSeverity] = useState<'All' | 'Danger' | 'Warning'>('All');

  // Parse total assets and extract telemetry breaches in real-time
  const alerts: AlertItem[] = useMemo(() => {
    const list: AlertItem[] = [];

    assets.forEach(asset => {
      const area = asset.equipmentId.split('-')[0];
      const name = asset.equipmentType;

      // 1. Surface Temperature Breach
      if (asset.surfaceTemperature && asset.surfaceTemperature > 60) {
        list.push({
          id: `${asset.equipmentId}-temp`,
          assetId: asset.equipmentId,
          assetName: name,
          area,
          city: asset.city,
          metricName: 'Surface Temp',
          metricValue: `${asset.surfaceTemperature} °C`,
          threshold: '> 60 °C',
          severity: asset.surfaceTemperature > 75 ? 'Danger' : 'Warning',
          timestamp: asset.timestamp || 'Just Now',
          originalAsset: asset
        });
      }

      // 2. Partial Discharge Breach
      if (asset.externalDischarge && asset.externalDischarge > 12) {
        list.push({
          id: `${asset.equipmentId}-pd`,
          assetId: asset.equipmentId,
          assetName: name,
          area,
          city: asset.city,
          metricName: 'Partial Discharge',
          metricValue: `${asset.externalDischarge} pC`,
          threshold: '> 12 pC',
          severity: asset.externalDischarge > 25 ? 'Danger' : 'Warning',
          timestamp: asset.timestamp || 'Just Now',
          originalAsset: asset
        });
      }

      // 3. Low Insulation Resistance
      if (asset.insulationResistance && asset.insulationResistance < 8) {
        list.push({
          id: `${asset.equipmentId}-insulation`,
          assetId: asset.equipmentId,
          assetName: name,
          area,
          city: asset.city,
          metricName: 'Insulation Resistance',
          metricValue: `${asset.insulationResistance} GΩ`,
          threshold: '< 8 GΩ',
          severity: asset.insulationResistance < 4 ? 'Danger' : 'Warning',
          timestamp: asset.timestamp || 'Just Now',
          originalAsset: asset
        });
      }

      // 4. Sheath Current Ground Loop Anomaly
      if (asset.sheathCurrent && asset.sheathCurrent > 45) {
        list.push({
          id: `${asset.equipmentId}-sheath`,
          assetId: asset.equipmentId,
          assetName: name,
          area,
          city: asset.city,
          metricName: 'Sheath Current',
          metricValue: `${asset.sheathCurrent} A`,
          threshold: '> 45 A',
          severity: asset.sheathCurrent > 65 ? 'Danger' : 'Warning',
          timestamp: asset.timestamp || 'Just Now',
          originalAsset: asset
        });
      }
    });

    // Sort danger first, then warning
    return list.sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === 'Danger' ? -1 : 1;
    });
  }, [assets]);

  // Filter alerts by acknowledged status and selected severity
  const activeAlerts = useMemo(() => {
    return alerts.filter(alert => {
      if (acknowledgedAlerts[alert.id]) return false;
      if (filterSeverity !== 'All' && alert.severity !== filterSeverity) return false;
      return true;
    });
  }, [alerts, acknowledgedAlerts, filterSeverity]);

  // Acknowledge single alert
  const handleAcknowledge = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAcknowledgedAlerts(prev => ({ ...prev, [id]: true }));
  };

  // Export Alerts to CSV format
  const handleExportCSV = () => {
    if (alerts.length === 0) return;
    
    const headers = 'Alert ID,Asset ID,Asset Name,Area,City,Metric,Value,Threshold,Severity,Timestamp\n';
    const rows = alerts.map(a => 
      `"${a.id}","${a.assetId}","${a.assetName}","${a.area}","${a.city}","${a.metricName}","${a.metricValue}","${a.threshold}","${a.severity}","${a.timestamp}"`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PSMD_Grid_Telemetry_Alerts_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col h-full" id="telemetry-alerts-widget">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-3 mb-4 gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
            Suggestion 2
          </span>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mt-1 flex items-center gap-2">
            <BellRing className="w-4 h-4 text-rose-600 animate-pulse" />
            Live Telemetry Alert Feed
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Real-time threshold checking on sensor values across regional segments.
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Severity selector */}
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value as any)}
            className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 text-xs font-semibold text-gray-700 focus:outline-hidden"
          >
            <option value="All">All Alarms</option>
            <option value="Danger">Danger Only</option>
            <option value="Warning">Warning Only</option>
          </select>

          {/* Export to CSV Button */}
          <button
            onClick={handleExportCSV}
            disabled={alerts.length === 0}
            className="p-1.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 rounded-lg transition-colors cursor-pointer"
            title="Export Alerts Log CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Alerts List */}
      <div className="flex-1 overflow-y-auto max-h-[220px] space-y-2 pr-1 min-h-[220px]">
        {activeAlerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-6 text-gray-400">
            <ShieldCheck className="w-10 h-10 text-emerald-500 mb-2" />
            <span className="text-xs font-bold text-gray-800 uppercase">Telemetry All Secure</span>
            <p className="text-[10px] text-gray-400 max-w-[200px] mt-1">
              No parameter exceedances detected across {assets.length} registered equipment nodes.
            </p>
          </div>
        ) : (
          activeAlerts.map(alert => (
            <div
              key={alert.id}
              onClick={() => onSelectAsset(alert.originalAsset)}
              className={`p-3 rounded-xl border transition-all duration-150 cursor-pointer flex justify-between items-center ${
                alert.severity === 'Danger'
                  ? 'bg-rose-50/70 hover:bg-rose-50 border-rose-100 hover:border-rose-200'
                  : 'bg-amber-50/70 hover:bg-amber-50 border-amber-100 hover:border-amber-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Visual Icon Alert */}
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  alert.severity === 'Danger' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <ShieldAlert className="w-4 h-4 animate-bounce" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-gray-900 truncate max-w-[130px]">{alert.assetId}</span>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded-sm ${
                      alert.severity === 'Danger' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium truncate mt-0.5">
                    {alert.assetName} • <strong className="text-gray-700">{alert.metricName}</strong> was <strong className={alert.severity === 'Danger' ? 'text-rose-700' : 'text-amber-700'}>{alert.metricValue}</strong> (Limit: {alert.threshold})
                  </p>
                </div>
              </div>

              {/* Action buttons on the right */}
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <button
                  onClick={(e) => handleAcknowledge(alert.id, e)}
                  className="bg-white hover:bg-gray-100 border border-gray-200 hover:border-gray-300 px-2 py-1 text-[10px] font-bold rounded-lg text-gray-600 cursor-pointer shadow-2xs transition-colors"
                >
                  Ack
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase">
        <span>Active Alerts: {activeAlerts.length}</span>
        {acknowledgedAlerts && Object.keys(acknowledgedAlerts).length > 0 && (
          <span className="text-purple-700">Acknowledged: {Object.keys(acknowledgedAlerts).length}</span>
        )}
      </div>
    </div>
  );
}
