/**
 * Standardized PRPD (Phase Resolved Partial Discharge) Data Templates
 * for Online HFCT and UHF sensor acquisition.
 */

export function downloadPrpdCsvTemplate() {
  const headers = [
    'phase_deg',
    'amplitude_mv_or_pc',
    'pulse_count',
    'phase_label',
    'timestamp_ms',
    'sensor_channel',
    'noise_flag'
  ];

  const sampleRows = [
    ['42.5', '450.2', '3', 'A', '1692200000100', 'CH1_HFCT', '0'],
    ['43.1', '480.0', '5', 'A', '1692200000102', 'CH1_HFCT', '0'],
    ['45.0', '520.4', '12', 'A', '1692200000105', 'CH1_HFCT', '0'],
    ['90.2', '812.8', '24', 'A', '1692200000150', 'CH1_HFCT', '0'],
    ['135.0', '390.5', '8', 'A', '1692200000180', 'CH1_HFCT', '0'],
    ['180.0', '25.0', '1', 'A', '1692200000200', 'CH1_HFCT', '1'],
    ['222.4', '-440.0', '4', 'A', '1692200000210', 'CH1_HFCT', '0'],
    ['270.5', '-805.4', '22', 'A', '1692200000260', 'CH1_HFCT', '0'],
    ['315.0', '-380.0', '7', 'A', '1692200000290', 'CH1_HFCT', '0']
  ];

  const csvContent = '\uFEFF' + [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `PEA_PRPD_Sensor_Input_Template_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPrpdJsonTemplate() {
  const templateObj = {
    metadata: {
      equipmentId: "C1-TR-AYU-01",
      equipmentType: "Cable Termination",
      circuitName: "AYUTTHAYA-SWG01-F04",
      sensorType: "HFCT Online Sensor",
      voltageLevelKV: 22,
      acquisitionDate: new Date().toISOString(),
      testedPhases: ["A", "B", "C"],
      operator: "PEA Diagnostic Engineer"
    },
    summaryMetrics: {
      peakAmplitude_mV: 812.8,
      power_mW: 0.953,
      apparentCharge_pC: 505.4,
      pulseRate_pps: 263.73,
      harmonic_50Hz_pct: 36,
      harmonic_100Hz_pct: 64,
      inferredDefectType: "Internal Void / Cavity",
      confidenceScore_pct: 92
    },
    phaseData: {
      phaseA: {
        channel: "Channel 1",
        points: [
          { phaseDeg: 42.5, amplitude: 450.2, count: 3 },
          { phaseDeg: 90.0, amplitude: 812.8, count: 24 },
          { phaseDeg: 135.0, amplitude: 390.5, count: 8 },
          { phaseDeg: 270.0, amplitude: -805.4, count: 22 }
        ]
      },
      phaseB: {
        channel: "Channel 2",
        points: [
          { phaseDeg: 162.5, amplitude: 430.0, count: 2 },
          { phaseDeg: 210.0, amplitude: 780.0, count: 18 }
        ]
      },
      phaseC: {
        channel: "Channel 3",
        points: [
          { phaseDeg: 282.5, amplitude: 410.0, count: 2 },
          { phaseDeg: 330.0, amplitude: 760.0, count: 19 }
        ]
      }
    }
  };

  const jsonContent = JSON.stringify(templateObj, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `PEA_PRPD_Sensor_Input_Template_${new Date().toISOString().substring(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
