import { CableAsset } from '../types';
import { getBangkokTimestamp } from './dateUtils';

export function exportAssetToPDF(asset: CableAsset) {
  // Create a hidden iframe to hold the print layout
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    alert('Failed to generate PDF document view.');
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>PEA Cable Asset Registry - ${asset.equipmentId}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
          @page {
            size: A4;
            margin: 12mm;
          }
          body {
            font-family: 'Inter', sans-serif;
            color: #1e1b4b;
            margin: 0;
            padding: 12px;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            border-bottom: 3px solid #581c87;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .logo-container {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo {
            width: 40px;
            height: 40px;
            background-color: #581c87;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fbbf24;
            font-weight: 800;
            font-size: 20px;
          }
          .title {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: -0.5px;
            margin: 0;
            color: #3b0764;
          }
          .subtitle {
            font-size: 10px;
            color: #64748b;
            margin-top: 2px;
            margin-bottom: 0;
            font-weight: 600;
          }
          .id-badge {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 5px 10px;
            border-radius: 8px;
            font-weight: 700;
            color: #334155;
          }
          .grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 16px;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 12px;
            background-color: #f8fafc;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .card-title {
            font-size: 8.5px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }
          .card-value {
            font-size: 16px;
            font-weight: 800;
            color: #581c87;
          }
          .status-badge {
            display: inline-block;
            font-size: 9px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
            margin-top: 4px;
            width: fit-content;
          }
          .status-Green { background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
          .status-Yellow { background-color: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
          .status-Orange { background-color: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
          .status-Red { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
          
          .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 16px;
          }
          .section-title {
            font-size: 10.5px;
            font-weight: 800;
            color: #581c87;
            text-transform: uppercase;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 4px;
            margin-top: 0;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .sub-section-header {
            font-size: 8.5px;
            font-weight: 800;
            color: #6b21a8;
            background-color: #f3e8ff;
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 8px;
            margin-bottom: 4px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            padding: 3.5px 0;
            border-bottom: 1px dashed #e2e8f0;
          }
          .row:last-child {
            border-bottom: none;
          }
          .label {
            color: #64748b;
            font-weight: 500;
          }
          .value {
            font-weight: 700;
            color: #1e293b;
            text-align: right;
          }
          .highlight-value {
            color: #047857;
            font-weight: 800;
          }
          .mono {
            font-family: 'JetBrains Mono', monospace;
          }
          .image-section {
            margin-top: 16px;
            margin-bottom: 20px;
          }
          .images-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .image-box {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px;
            text-align: center;
            background-color: #f8fafc;
          }
          .image-label {
            font-size: 9px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .img-preview {
            width: 100%;
            height: 220px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
          }
          .no-img {
            height: 220px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10.5px;
            color: #94a3b8;
            font-style: italic;
            border: 1px dashed #cbd5e1;
            border-radius: 6px;
            background-color: #ffffff;
          }
          .footer {
            margin-top: 20px;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            font-size: 8.5px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          @media print {
            body { margin: 0; padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <!-- PAGE 1: GENERAL, TECHNICAL CABLE SPECIFICATIONS & TELEMETRY -->
        <div class="header">
          <div class="logo-container">
            <div class="logo">⚡</div>
            <div>
              <h1 class="title">Provincial Electricity Authority</h1>
              <p class="subtitle">Cable Asset Integrity Management Registry — Asset Card</p>
            </div>
          </div>
          <div class="id-badge">${asset.equipmentId}</div>
        </div>

        <div class="grid-3">
          <div class="card">
            <span class="card-title">Asset Classification</span>
            <span class="card-value" style="font-size: 13px; margin-top: 2px; display: block;">${asset.equipmentType}</span>
          </div>
          <div class="card" style="align-items: center; text-align: center;">
            <span class="card-title">Operational Health</span>
            <span class="card-value">${asset.healthScore}%</span>
            <span class="status-badge status-${asset.healthStatus}">${asset.healthStatus} Status</span>
          </div>
          <div class="card">
            <span class="card-title">PEA Area Sector</span>
            <span class="card-value" style="font-size: 13px; margin-top: 2px; display: block;">${asset.equipmentId.split('-')[0]}</span>
          </div>
        </div>

        <div class="grid-2">
          <!-- COLUMN 1: GENERAL & CABLE TECHNICAL SPECIFICATIONS -->
          <div>
            <h2 class="section-title">General & Technical Cable Specifications</h2>
            
            <div class="sub-section-header">Basic Cable Identification</div>
            <div class="row"><span class="label">Equipment Number ADS</span><span class="value mono">${asset.assetNumber || 'N/A'}</span></div>
            <div class="row"><span class="label">PEA Grid Number</span><span class="value mono">${asset.peaNumber || 'N/A'}</span></div>
            <div class="row"><span class="label">Manufacturer</span><span class="value">${asset.manufacturer || 'N/A'}</span></div>
            <div class="row"><span class="label">Country of Origin</span><span class="value">${asset.country || 'N/A'}</span></div>
            <div class="row"><span class="label">Model</span><span class="value">${asset.model || 'N/A'}</span></div>
            <div class="row"><span class="label">Serial Number</span><span class="value mono">${asset.serialNumber || 'N/A'}</span></div>
            <div class="row"><span class="label">Size (Cross Section)</span><span class="value">${asset.size || 'N/A'}</span></div>

            <div class="sub-section-header">Manufacturing & Installation</div>
            <div class="row"><span class="label">Production Month</span><span class="value">${asset.productionMonth || 'N/A'}</span></div>
            <div class="row"><span class="label">Installation Date</span><span class="value">${asset.installationDate || 'N/A'}</span></div>
            <div class="row"><span class="label">Installation Year</span><span class="value">${asset.yearOfRegistration || '2026'} (Age: ${new Date().getFullYear() - (asset.yearOfRegistration || new Date().getFullYear())} Yrs)</span></div>
            <div class="row"><span class="label">Contract Number</span><span class="value mono">${asset.contractNumber || 'N/A'}</span></div>
            <div class="row"><span class="label">Work Order</span><span class="value mono">${asset.workOrder || 'N/A'}</span></div>
            <div class="row"><span class="label">Asset Value</span><span class="value highlight-value">${asset.assetValue || 'N/A'}</span></div>

            <div class="sub-section-header">Location & Substation</div>
            <div class="row"><span class="label">City / Province</span><span class="value">${asset.city || 'N/A'}</span></div>
            <div class="row"><span class="label">Location Type</span><span class="value">${asset.locationType}</span></div>
            <div class="row"><span class="label">Substation</span><span class="value">${asset.substationName}</span></div>
            <div class="row"><span class="label">Substation Landmark</span><span class="value">${asset.landmark || 'N/A'}</span></div>
            <div class="row"><span class="label">GPS Coordinates</span><span class="value mono">${asset.gps?.lat ?? 13.7563}, ${asset.gps?.lng ?? 100.5018}</span></div>
          </div>

          <!-- COLUMN 2: SYSTEM IDENTIFIERS & ENGINEERING TELEMETRY -->
          <div>
            <h2 class="section-title">System Identifiers & Telemetry</h2>

            <div class="sub-section-header">System & Accounting Identifiers</div>
            <div class="row"><span class="label">Voltage Level</span><span class="value">${asset.voltageLevel} kV</span></div>
            <div class="row"><span class="label">Class</span><span class="value">${asset.class || 'N/A'}</span></div>
            <div class="row"><span class="label">Business Type</span><span class="value">${asset.businessType || 'N/A'}</span></div>
            <div class="row"><span class="label">WBS Code</span><span class="value mono">${asset.wbs || 'N/A'}</span></div>
            <div class="row"><span class="label">Cost Center</span><span class="value mono">${asset.costCenter || 'N/A'}</span></div>
            <div class="row"><span class="label">GISTAG</span><span class="value mono">${asset.gistag || 'N/A'}</span></div>
            <div class="row"><span class="label">Feeder ID</span><span class="value mono">${asset.feeder || 'N/A'}</span></div>
            <div class="row"><span class="label">Substation ID</span><span class="value mono">${asset.substationId || 'N/A'}</span></div>
            <div class="row"><span class="label">Operate ID</span><span class="value mono">${asset.operateId || 'N/A'}</span></div>

            <div class="sub-section-header">Diagnostic Telemetry Measurements</div>
            <div class="row"><span class="label">Load Current</span><span class="value">${asset.loadCurrent ?? 'No Log'} A</span></div>
            <div class="row"><span class="label">Sheath Current</span><span class="value">${asset.sheathCurrent ?? 'No Log'} A</span></div>
            <div class="row"><span class="label">Surface Temperature</span><span class="value">${asset.surfaceTemperature ?? 'No Log'} °C</span></div>
            <div class="row"><span class="label">Partial Discharge</span><span class="value">${asset.externalDischarge ?? 'No Log'} pC</span></div>
            <div class="row"><span class="label">Online PD Result</span><span class="value">${asset.pdResult ?? 'No Log'}</span></div>
            <div class="row"><span class="label">Online PD Amplitude</span><span class="value">${asset.onlinePdAmplitude !== undefined ? asset.onlinePdAmplitude + ' pC' : 'No Log'}</span></div>
            <div class="row"><span class="label">Insulation Resistance</span><span class="value">${asset.insulationResistance ?? 'No Log'} GOhm</span></div>
            <div class="row"><span class="label">Tan Delta Analysis</span><span class="value">${asset.tanDelta ?? 'No Log'}</span></div>
            <div class="row"><span class="label">Tan Delta Amplitude</span><span class="value">${asset.tanDeltaAmplitude !== undefined ? asset.tanDeltaAmplitude : 'No Log'}</span></div>
          </div>
        </div>

        <div class="footer">
          <div>Original Creator: <strong>${asset.operatorName}</strong> on ${asset.timestamp}</div>
          ${asset.latestUpdatedBy ? `<div>Latest Integrity Edit: <strong>${asset.latestUpdatedBy}</strong> on ${asset.latestUpdatedAt}</div>` : ''}
          <div>Document generated on: ${getBangkokTimestamp()} (UTC+7) (Page 1 of 2)</div>
        </div>

        <!-- PAGE 2: FIELD INSPECTION PHOTOS & SATELLITE MAP -->
        <div class="page-break" style="padding-top: 12px;">
          <div class="header">
            <div class="logo-container">
              <div class="logo">⚡</div>
              <div>
                <h1 class="title">Provincial Electricity Authority</h1>
                <p class="subtitle">Cable Asset Integrity Management Registry — Inspection & Location Records</p>
              </div>
            </div>
            <div class="id-badge">${asset.equipmentId}</div>
          </div>

          <div class="image-section">
            <h2 class="section-title">Field Inspection Photos</h2>
            <div class="images-grid">
              <div class="image-box">
                <div class="image-label">Visual Inspection Photo</div>
                ${asset.visualPictureUrl ? `<img src="${asset.visualPictureUrl}" class="img-preview" referrerPolicy="no-referrer" />` : `<div class="no-img">No visual inspection image submitted</div>`}
              </div>
              <div class="image-box">
                <div class="image-label">Thermal Hotspot Thermogram</div>
                ${asset.thermalImageUrl ? `<img src="${asset.thermalImageUrl}" class="img-preview" referrerPolicy="no-referrer" />` : `<div class="no-img">No thermal scan submitted</div>`}
              </div>
            </div>
          </div>

          <h2 class="section-title" style="margin-top: 20px;">Equipment Geographical & Satellite Location Map</h2>
          
          <div style="position: relative; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; height: 260px; width: 100%; margin-bottom: 16px; background-color: #f8fafc; box-shadow: 0 2px 4px -1px rgba(0,0,0,0.05);">
            <a href="https://www.google.com/maps/search/?api=1&query=${asset.gps?.lat ?? 13.7563},${asset.gps?.lng ?? 100.5018}" target="_blank" style="display: block; width: 100%; height: 100%;">
              <img src="${window.location.origin}/api/map-image?lat=${asset.gps?.lat ?? 13.7563}&lng=${asset.gps?.lng ?? 100.5018}" style="width: 100%; height: 100%; object-fit: cover;" referrerPolicy="no-referrer" />
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); text-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 50; display: flex; flex-direction: column; align-items: center;">
                <span style="font-size: 36px; line-height: 1; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));">📍</span>
              </div>
            </a>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
            <h3 style="font-size: 10px; font-weight: 800; color: #581c87; text-transform: uppercase; margin-top: 0; margin-bottom: 8px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">GIS Location Summary</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <div class="row"><span class="label">Latitude</span><span class="value mono">${asset.gps?.lat ?? 13.7563}</span></div>
                <div class="row"><span class="label">Longitude</span><span class="value mono">${asset.gps?.lng ?? 100.5018}</span></div>
                <div class="row"><span class="label">Location Type</span><span class="value">${asset.locationType}</span></div>
              </div>
              <div>
                <div class="row"><span class="label">Substation</span><span class="value">${asset.substationName}</span></div>
                <div class="row"><span class="label">City / Province</span><span class="value">${asset.city}</span></div>
                <div class="row"><span class="label">Substation Landmark</span><span class="value">${asset.landmark || 'No landmarks'}</span></div>
              </div>
            </div>
          </div>

          <div class="footer">
            <div>Original Creator: <strong>${asset.operatorName}</strong> on ${asset.timestamp}</div>
            <div>Document generated on: ${getBangkokTimestamp()} (UTC+7) (Page 2 of 2)</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 1200);
          }
        </script>
      </body>
    </html>
  `;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Remove the iframe after a short delay to keep the DOM clean
  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch (e) {
      console.warn('Iframe cleanup failed: ', e);
    }
  }, 10000);
}

