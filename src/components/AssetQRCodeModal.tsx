import React, { useState, useRef, useEffect } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  Printer, 
  QrCode, 
  ExternalLink, 
  Camera, 
  Upload, 
  AlertCircle,
  Zap,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  FileText
} from 'lucide-react';
import { CableAsset } from '../types';
import { getAssetArea } from '../utils/peaData';
import jsQR from 'jsqr';

interface AssetQRCodeModalProps {
  asset: CableAsset;
  onClose: () => void;
  onNavigateToRecord?: (equipmentId: string) => void;
}

export function AssetQRCodeModal({ asset, onClose, onNavigateToRecord }: AssetQRCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const [qrMode, setQrMode] = useState<'asset' | 'document'>('asset');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Construct the deep-link URL pointing to this specific asset record in the web app
  const currentOrigin = window.location.origin;
  const currentPath = window.location.pathname;
  const assetDeepLink = `${currentOrigin}${currentPath}?equipmentId=${encodeURIComponent(asset.equipmentId)}`;
  const documentLink = asset.qrDocument || '';
  const activeLink = qrMode === 'asset' ? assetDeepLink : (documentLink || assetDeepLink);

  // Copy link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Download QR Code as PNG image file
  const handleDownloadPNG = () => {
    if (!canvasRef.current) return;
    
    // Create a composite canvas with logo & label metadata for a professional tag
    const qrCanvas = canvasRef.current;
    const padding = 30;
    const headerHeight = 70;
    const footerHeight = 80;
    const totalWidth = qrCanvas.width + padding * 2;
    const totalHeight = qrCanvas.height + headerHeight + footerHeight + padding;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = totalWidth;
    exportCanvas.height = totalHeight;
    const ctx = exportCanvas.getContext('2d');

    if (!ctx) return;

    // Fill white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Purple header bar
    ctx.fillStyle = '#4C1D95'; // PEA Purple
    ctx.fillRect(0, 0, totalWidth, 50);

    // Header Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PEA CABLE ASSET MANAGEMENT SYSTEM', totalWidth / 2, 30);

    // Subheader Equipment ID
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`ID: ${asset.equipmentId}`, totalWidth / 2, headerHeight + 10);

    // Draw QR Code
    ctx.drawImage(qrCanvas, padding, headerHeight + 20);

    // Footer info
    const footerY = headerHeight + qrCanvas.height + 35;
    ctx.fillStyle = '#4B5563';
    ctx.font = '12px sans-serif';
    ctx.fillText(`PEA No: ${asset.peaNumber || 'N/A'} | Area: ${getAssetArea(asset) || 'N/A'}`, totalWidth / 2, footerY);
    ctx.fillText(`Voltage: ${asset.voltageLevel || '115'} kV | ${asset.city || 'PEA Grid'}`, totalWidth / 2, footerY + 18);

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Scan to view asset diagnostic history`, totalWidth / 2, footerY + 38);

    // Trigger download
    const link = document.createElement('a');
    link.download = `PEA_Asset_QR_${asset.equipmentId}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  // Print physical equipment weatherproof sticker tag
  const handlePrintTag = () => {
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) return;

    const qrDataUrl = canvasRef.current ? canvasRef.current.toDataURL() : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>PEA Asset Sticker Tag - ${asset.equipmentId}</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; background: #fff; }
              @page { size: auto; margin: 5mm; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              padding: 20px;
              display: flex;
              justify-content: center;
              align-items: center;
              background-color: #f3f4f6;
            }
            .sticker {
              width: 320px;
              background: #fff;
              border: 3px solid #4c1d95;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            .header {
              background: #4c1d95;
              color: white;
              text-align: center;
              padding: 10px 8px;
            }
            .header h1 {
              margin: 0;
              font-size: 13px;
              font-weight: 900;
              letter-spacing: 0.5px;
            }
            .header p {
              margin: 2px 0 0 0;
              font-size: 9px;
              opacity: 0.85;
            }
            .body {
              padding: 16px;
              text-align: center;
            }
            .eq-id {
              font-family: monospace;
              font-size: 18px;
              font-weight: 800;
              color: #1e1b4b;
              background: #f3e8ff;
              padding: 6px 12px;
              border-radius: 6px;
              display: inline-block;
              margin-bottom: 12px;
              border: 1px dashed #7e22ce;
            }
            .qr-container {
              margin: 0 auto 12px auto;
              padding: 8px;
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              display: inline-block;
            }
            .qr-container img {
              width: 160px;
              height: 160px;
              display: block;
            }
            .details {
              font-size: 11px;
              color: #374151;
              text-align: left;
              border-top: 1px border-dashed #e5e7eb;
              padding-top: 10px;
            }
            .details table {
              width: 100%;
              border-collapse: collapse;
            }
            .details td {
              padding: 3px 0;
            }
            .details td.label {
              color: #6b7280;
              font-weight: 600;
              width: 40%;
            }
            .details td.value {
              font-weight: 700;
              color: #111827;
            }
            .footer {
              background: #f9fafb;
              border-top: 1px solid #e5e7eb;
              padding: 8px;
              text-align: center;
              font-size: 9px;
              color: #6b7280;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="sticker">
            <div class="header">
              <h1>PROVINCIAL ELECTRICITY AUTHORITY</h1>
              <p>HIGH VOLTAGE CABLE ASSET IDENTIFIER TAG</p>
            </div>
            <div class="body">
              <div class="eq-id">${asset.equipmentId}</div>
              <div class="qr-container">
                <img src="${qrDataUrl}" alt="QR Code" />
              </div>
              <div class="details">
                <table>
                  <tr><td class="label">PEA Number:</td><td class="value">${asset.peaNumber || 'N/A'}</td></tr>
                  <tr><td class="label">Voltage Level:</td><td class="value">${asset.voltageLevel || '115'} kV</td></tr>
                  <tr><td class="label">Equipment Type:</td><td class="value">${asset.equipmentType || 'Underground Cable'}</td></tr>
                  <tr><td class="label">Location / City:</td><td class="value">${asset.city || 'PEA Region'}</td></tr>
                  <tr><td class="label">Health Score:</td><td class="value">${asset.healthScore || '100'}/100 (${asset.healthStatus || 'Green'})</td></tr>
                </table>
              </div>
            </div>
            <div class="footer">
              PROPRIETARY PEA GRID TELEMETRY TAG • DO NOT REMOVE
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-amber-300 border border-white/20">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-purple-100">Asset QR Code Tag</h3>
              <p className="text-[11px] text-purple-200 font-mono font-medium">{asset.equipmentId}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setQrMode('asset')}
              className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                qrMode === 'asset' 
                  ? 'bg-white text-purple-900 shadow-xs' 
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Asset Tag QR</span>
            </button>
            <button
              type="button"
              onClick={() => setQrMode('document')}
              className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                qrMode === 'document' 
                  ? 'bg-amber-500 text-white shadow-xs' 
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>QR Document</span>
            </button>
          </div>

          {/* Main QR Display Canvas */}
          <div className={`flex flex-col items-center justify-center rounded-2xl p-6 text-center relative group transition-colors ${
            qrMode === 'document' ? 'bg-amber-50/60 border-2 border-dashed border-amber-300' : 'bg-purple-50/50 border-2 border-dashed border-purple-200'
          }`}>
            <div className="bg-white p-4 rounded-2xl shadow-lg border border-gray-100">
              <QRCodeCanvas 
                ref={canvasRef}
                value={activeLink} 
                size={200} 
                level="H" 
                includeMargin={true} 
              />
            </div>

            <div className="mt-4 space-y-1">
              <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full inline-block ${
                qrMode === 'document' ? 'bg-amber-100 text-amber-900' : 'bg-purple-100 text-purple-900'
              }`}>
                {qrMode === 'document' ? 'Engineering Cloud Storage' : (asset.equipmentType || 'Underground Cable')}
              </span>
              <p className="text-xs font-mono font-bold text-gray-800 pt-1">
                {qrMode === 'document' 
                  ? (documentLink ? 'As-Built Drawings & Catalog' : 'No Document Link Registered') 
                  : `PEA No: ${asset.peaNumber || 'Unassigned'}`}
              </p>
            </div>
          </div>

          {/* Asset Metadata Summary */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="font-medium text-gray-500">PEA Area Zone:</span>
              <span className="font-bold text-gray-800">{getAssetArea(asset)} Area</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="font-medium text-gray-500">Voltage Level:</span>
              <span className="font-bold text-purple-900 font-mono">{asset.voltageLevel || '115'} kV</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="font-medium text-gray-500">City / Province:</span>
              <span className="font-bold text-gray-800">{asset.city || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-500">Health Index:</span>
              <span className={`font-black px-2 py-0.5 rounded-md text-[10px] ${
                asset.healthStatus === 'Green' ? 'bg-emerald-100 text-emerald-800' :
                asset.healthStatus === 'Yellow' ? 'bg-amber-100 text-amber-800' :
                asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-800' :
                'bg-red-100 text-red-800'
              }`}>
                {asset.healthStatus} ({asset.healthScore || '100'}%)
              </span>
            </div>
          </div>

          {/* Deep Link / Document URL Input & Copy */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center justify-between">
              <span>{qrMode === 'document' ? 'Engineering Document Link' : 'Asset Direct Link URL'}</span>
              {qrMode === 'document' && documentLink && (
                <a 
                  href={documentLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-0.5 lowercase text-[10px]"
                >
                  <span>open</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </label>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={activeLink} 
                placeholder={qrMode === 'document' ? 'No engineering document link provided' : ''}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[11px] font-mono text-gray-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="bg-purple-100 hover:bg-purple-200 text-purple-900 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={handleDownloadPNG}
            className="flex-1 bg-white border border-gray-200 hover:border-purple-300 text-gray-800 hover:text-purple-900 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <Download className="w-4 h-4 text-purple-700" />
            <span>Save PNG</span>
          </button>
          
          <button
            type="button"
            onClick={handlePrintTag}
            className="flex-1 bg-purple-900 hover:bg-purple-950 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Print Tag Sticker</span>
          </button>

          {onNavigateToRecord && (
            <button
              type="button"
              onClick={() => {
                onNavigateToRecord(asset.equipmentId);
                onClose();
              }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="View Detail Record"
            >
              <ExternalLink className="w-4 h-4" />
              <span>View</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface QRScannerModalProps {
  onClose: () => void;
  onScanSuccess: (equipmentId: string) => void;
}

export function QRScannerModal({ onClose, onScanSuccess }: QRScannerModalProps) {
  const [scanMode, setScanMode] = useState<'file' | 'camera'>('file');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState<string>('');
  const [scanning, setScanning] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        requestAnimationFrame(tickVideo);
      }
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError('Camera access denied or unavailable on this device. Please upload an image file containing the QR code or enter the Equipment ID.');
      setScanning(false);
    }
  };

  const tickVideo = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          processQRResult(code.data);
          stopCamera();
          return;
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(tickVideo);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && code.data) {
        processQRResult(code.data);
      } else {
        alert('No valid QR code detected in the uploaded image. Please try another image or enter the Equipment ID manually.');
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const processQRResult = (qrText: string) => {
    // Extract equipmentId if qrText is a URL
    let extractedId = qrText.trim();
    if (extractedId.includes('equipmentId=')) {
      try {
        const urlObj = new URL(extractedId);
        const param = urlObj.searchParams.get('equipmentId');
        if (param) extractedId = param;
      } catch (e) {
        const match = extractedId.match(/equipmentId=([^&]+)/);
        if (match) extractedId = decodeURIComponent(match[1]);
      }
    }
    
    if (extractedId) {
      onScanSuccess(extractedId);
      onClose();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      processQRResult(manualInput.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-amber-300 border border-white/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-purple-100">Scan Asset QR Code</h3>
              <p className="text-[11px] text-purple-200">Point camera or upload image</p>
            </div>
          </div>
          <button 
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex border-b border-gray-100 bg-gray-50 p-1.5">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setScanMode('file');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              scanMode === 'file' ? 'bg-white text-purple-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Image</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScanMode('camera');
              startCamera();
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              scanMode === 'camera' ? 'bg-white text-purple-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Use Camera</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {scanMode === 'camera' && (
            <div className="flex flex-col items-center justify-center">
              <div className="w-full aspect-square bg-slate-900 rounded-2xl overflow-hidden relative border-2 border-purple-500 shadow-inner flex items-center justify-center">
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover" 
                />
                
                {/* Scanner Target Box Overlay */}
                {scanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-amber-400 rounded-xl relative animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-400 -mt-1 -ml-1"></div>
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-400 -mt-1 -mr-1"></div>
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-400 -mb-1 -ml-1"></div>
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-400 -mb-1 -mr-1"></div>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-400" />
                    <p className="text-xs text-slate-200">{cameraError}</p>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-3 text-center">
                Position the PEA Asset QR Code within the viewfinder frame.
              </p>
            </div>
          )}

          {scanMode === 'file' && (
            <div className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-purple-300 hover:border-purple-600 bg-purple-50/50 hover:bg-purple-50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center text-purple-700 mb-3 transition-all">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-purple-900">Click to upload QR code photo</p>
                <p className="text-[10px] text-gray-500 mt-1">Supports PNG, JPG, WEBP formats</p>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </div>
            </div>
          )}

          {/* Manual Entry Fallback */}
          <form onSubmit={handleManualSubmit} className="pt-2 border-t border-gray-100 space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
              Or Enter Equipment ID Manually
            </label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={manualInput} 
                onChange={(e) => setManualInput(e.target.value)} 
                placeholder="e.g. N1-115-UGC-00001" 
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 uppercase"
              />
              <button
                type="submit"
                className="bg-purple-900 hover:bg-purple-950 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                Open Record
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
