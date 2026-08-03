import { CableAsset } from '../types';

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
          body {
            font-family: 'Inter', sans-serif;
            color: #1e1b4b;
            margin: 40px;
            padding: 0;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            border-bottom: 3px solid #581c87;
            padding-bottom: 16px;
            margin-bottom: 24px;
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
            width: 44px;
            height: 44px;
            background-color: #581c87;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fbbf24;
            font-weight: 800;
            font-size: 22px;
          }
          .title {
            font-size: 18px;
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
            font-size: 13px;
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 12px;
            border-radius: 8px;
            font-weight: 700;
            color: #334155;
          }
          .grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
            background-color: #f8fafc;
            display: flex;
            flex-col: column;
            justify-content: center;
          }
          .card-title {
            font-size: 9px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .card-value {
            font-size: 18px;
            font-weight: 800;
            color: #581c87;
          }
          .status-badge {
            display: inline-block;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            margin-top: 6px;
            width: fit-content;
          }
          .status-Green { background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
          .status-Yellow { background-color: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
          .status-Orange { background-color: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
          .status-Red { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
          
          .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 24px;
            margin-bottom: 24px;
          }
          .section-title {
            font-size: 11px;
            font-weight: 800;
            color: #581c87;
            text-transform: uppercase;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 4px;
            margin-top: 0;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            padding: 5px 0;
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
          }
          .mono {
            font-family: 'JetBrains Mono', monospace;
          }
          .image-section {
            margin-top: 20px;
          }
          .images-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .image-box {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
            text-align: center;
            background-color: #f8fafc;
          }
          .image-box-full {
            grid-column: span 2;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
            text-align: center;
            background-color: #f8fafc;
            margin-top: 4px;
          }
          .image-label {
            font-size: 9px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
          }
          .img-preview {
            width: 100%;
            height: 180px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
          }
          .no-img {
            height: 180px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #94a3b8;
            font-style: italic;
            border: 1px dashed #cbd5e1;
            border-radius: 8px;
            background-color: #ffffff;
          }
          .footer {
            margin-top: 36px;
            border-top: 1px solid #cbd5e1;
            padding-top: 12px;
            font-size: 9px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-container">
            <div class="logo">⚡</div>
            <div>
              <h1 class="title">Provincial Electricity Authority</h1>
              <p class="subtitle">Cable Asset Integrity Management Registry</p>
            </div>
          </div>
          <div class="id-badge">${asset.equipmentId}</div>
        </div>

        <div class="grid-3">
          <div class="card">
            <span class="card-title">Asset Classification</span>
            <span class="card-value" style="font-size: 14px; margin-top: 4px; display: block;">${asset.equipmentType}</span>
          </div>
          <div class="card" style="align-items: center; text-align: center;">
            <span class="card-title">Operational Health</span>
            <span class="card-value">${asset.healthScore}%</span>
            <span class="status-badge status-${asset.healthStatus}">${asset.healthStatus} Status</span>
          </div>
          <div class="card">
            <span class="card-title">PEA Area Sector</span>
            <span class="card-value" style="font-size: 14px; margin-top: 4px; display: block;">${asset.equipmentId.split('-')[0]}</span>
          </div>
        </div>

        <div class="grid-2">
          <div>
            <h2 class="section-title">General Specifications</h2>
            <div class="row"><span class="label">Equipment Number ADS</span><span class="value mono">${asset.assetNumber}</span></div>
            <div class="row"><span class="label">PEA Grid Number</span><span class="value mono">${asset.peaNumber}</span></div>
            <div class="row"><span class="label">Manufacturer</span><span class="value">${asset.manufacturer}</span></div>
            <div class="row"><span class="label">Country of Origin</span><span class="value">${asset.country}</span></div>
            <div class="row"><span class="label">Installation Year</span><span class="value">${asset.yearOfRegistration || '2026'} (Age: ${new Date().getFullYear() - (asset.yearOfRegistration || new Date().getFullYear())} Yrs)</span></div>
            <div class="row"><span class="label">GPS Coordinates</span><span class="value mono"><a href="https://www.google.com/maps/search/?api=1&query=${asset.gps?.lat ?? 13.7563},${asset.gps?.lng ?? 100.5018}" target="_blank">${asset.gps?.lat ?? 13.7563}, ${asset.gps?.lng ?? 100.5018}</a></span></div>
            <div class="row"><span class="label">City / Province</span><span class="value">${asset.city || 'N/A'}</span></div>
            <div class="row"><span class="label">Location Type</span><span class="value">${asset.locationType}</span></div>
            <div class="row"><span class="label">Substation</span><span class="value">${asset.substationName}</span></div>
          </div>

          <div>
            <h2 class="section-title">Engineering Parameters</h2>
            <div class="row"><span class="label">Load Current</span><span class="value">${asset.loadCurrent ?? 'No Log'} A</span></div>
            <div class="row"><span class="label">Sheath Current</span><span class="value">${asset.sheathCurrent ?? 'No Log'} A</span></div>
            <div class="row"><span class="label">Surface Temperature</span><span class="value">${asset.surfaceTemperature ?? 'No Log'} °C</span></div>
            <div class="row"><span class="label">Partial Discharge</span><span class="value">${asset.externalDischarge ?? 'No Log'} pC</span></div>
            <div class="row"><span class="label">Online PD Result</span><span class="value">${asset.pdResult ?? 'No Log'}</span></div>
            <div class="row"><span class="label">Insulation Resistance</span><span class="value">${asset.insulationResistance ?? 'No Log'} GOhm</span></div>
            <div class="row"><span class="label">Tan Delta Analysis</span><span class="value">${asset.tanDelta ?? 'No Log'}</span></div>
            <div class="row"><span class="label">Voltage Level</span><span class="value">${asset.voltageLevel} kV</span></div>
            <div class="row"><span class="label">Landmark</span><span class="value">${asset.landmark || 'No landmarks'}</span></div>
          </div>
        </div>

        <div class="image-section" style="margin-bottom: 24px;">
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

        <div class="footer">
          <div>Original Creator: <strong>${asset.operatorName}</strong> on ${asset.timestamp}</div>
          ${asset.latestUpdatedBy ? `<div>Latest Integrity Edit: <strong>${asset.latestUpdatedBy}</strong> on ${asset.latestUpdatedAt}</div>` : ''}
          <div>Document generated on: ${new Date().toLocaleString()} (Page 1 of 2)</div>
        </div>

        <!-- PAGE 2 BREAK: Geographical Satellite Location -->
        <div class="page-break" style="padding-top: 24px;">
          <div class="header">
            <div class="logo-container">
              <div class="logo">⚡</div>
              <div>
                <h1 class="title">Provincial Electricity Authority</h1>
                <p class="subtitle">Cable Asset Integrity Management Registry — GIS Geographical Map</p>
              </div>
            </div>
            <div class="id-badge">${asset.equipmentId}</div>
          </div>

          <h2 class="section-title" style="margin-top: 20px;">Equipment Geographical & Satellite Location Map</h2>
          
          <div style="position: relative; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; height: 380px; width: 100%; margin-bottom: 20px; background-color: #f8fafc; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
            <a href="https://www.google.com/maps/search/?api=1&query=${asset.gps?.lat ?? 13.7563},${asset.gps?.lng ?? 100.5018}" target="_blank" style="display: block; width: 100%; height: 100%;">
              <img src="${window.location.origin}/api/map-image?lat=${asset.gps?.lat ?? 13.7563}&lng=${asset.gps?.lng ?? 100.5018}" style="width: 100%; height: 100%; object-fit: cover;" referrerPolicy="no-referrer" />
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); text-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 50; display: flex; flex-direction: column; align-items: center;">
                <span style="font-size: 42px; line-height: 1; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));">📍</span>
              </div>
            </a>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #581c87; text-transform: uppercase; margin-top: 0; margin-bottom: 12px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">GIS Location Specification</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
              <div>
                <div class="row"><span class="label">Latitude</span><span class="value mono">${asset.gps?.lat ?? 13.7563}</span></div>
                <div class="row"><span class="label">Longitude</span><span class="value mono">${asset.gps?.lng ?? 100.5018}</span></div>
                <div class="row"><span class="label">Location</span>
                  <a href="https://www.google.com/maps/search/?api=1&query=${asset.gps?.lat ?? 13.7563},${asset.gps?.lng ?? 100.5018}" target="_blank" style="text-decoration: none; color: #7c3aed; font-weight: bold; margin-left: 8px;">
                    📍 Open in Maps
                  </a>
                </div>
                <div class="row"><span class="label">Location Type</span><span class="value">${asset.locationType}</span></div>
              </div>
              <div>
                <div class="row"><span class="label">Substation</span><span class="value">${asset.substationName}</span></div>
                <div class="row"><span class="label">City / Province</span><span class="value">${asset.city}</span></div>
                <div class="row"><span class="label">Substation Landmark</span><span class="value">${asset.landmark || 'No landmarks'}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div>Original Creator: <strong>${asset.operatorName}</strong> on ${asset.timestamp}</div>
          <div>Document generated on: ${new Date().toLocaleString()} (Page 2 of 2)</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 1500);
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
