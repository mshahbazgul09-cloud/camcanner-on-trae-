import React, { useState, useEffect } from 'react';
import { ScannedPage } from '../types';
import { applyImageProcessing } from '../services/imageUtils';
import { ArrowLeft, Check, RotateCw, Type, Loader2, Undo2, Crop, Wand2, X as XIcon, Signal, Download } from 'lucide-react';
import { extractText } from '../services/ocrService';

interface EditViewProps {
  page: ScannedPage;
  onSave: (updatedPage: ScannedPage) => void;
  onCancel: () => void;
}

const EditView: React.FC<EditViewProps> = ({ page, onSave, onCancel }) => {
  const [currentFilter, setCurrentFilter] = useState(page.filter);
  const [rotation, setRotation] = useState(page.rotation);
  const [previewUrl, setPreviewUrl] = useState(page.processedUrl);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [ocrResult, setOcrResult] = useState<string | null>(page.ocrText || null);
  const [ocrConfidence, setOcrConfidence] = useState<number | undefined>(page.ocrConfidence);
  const [isOcring, setIsOcring] = useState(false);

  useEffect(() => {
    updatePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilter, rotation]);

  const updatePreview = async () => {
    setIsProcessing(true);
    try {
      const url = await applyImageProcessing(page.originalUrl, currentFilter, rotation);
      setPreviewUrl(url);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    onSave({
      ...page,
      filter: currentFilter,
      rotation: rotation,
      processedUrl: previewUrl,
      ocrText: ocrResult || undefined,
      ocrConfidence: ocrConfidence
    });
  };

  const saveToDevice = () => {
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `scan_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const runOcr = async () => {
    if (ocrResult) {
      setShowOcr(true);
      return;
    }
    setIsOcring(true);
    try {
      const { text, confidence } = await extractText(previewUrl);
      setOcrResult(text);
      setOcrConfidence(confidence);
      setShowOcr(true);
    } catch (e) {
      console.error(e);
      alert("OCR Failed. Please try again.");
    } finally {
      setIsOcring(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-40 flex flex-col h-full animate-in fade-in duration-200">
      {/* Top Bar with better gradient */}
      <div className="flex justify-between items-center p-6 pt-8 text-white z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <button onClick={onCancel} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-colors">
          <ArrowLeft size={24} />
        </button>
        <span className="font-bold text-base tracking-wide shadow-black drop-shadow-md opacity-90">Edit Scan</span>
        <button onClick={handleSave} className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 rounded-full text-sm font-bold shadow-lg shadow-brand-500/30 active:scale-95 transition-all">
          Done
        </button>
      </div>

      {/* Main Image Area */}
      <div className="flex-1 relative flex items-center justify-center p-6 pb-40 overflow-hidden bg-gray-900">
        {isProcessing && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Loader2 className="animate-spin text-white" size={40} />
          </div>
        )}
        
        {showOcr && (
           <div className="absolute inset-4 z-30 bg-white text-gray-900 p-6 rounded-3xl shadow-2xl overflow-y-auto animate-in fade-in slide-in-from-bottom-10 duration-300 flex flex-col">
             <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2 border-b border-gray-100">
                <div className="flex flex-col">
                  <h3 className="font-bold text-xl text-gray-800">Extracted Text</h3>
                  {ocrConfidence !== undefined && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Signal size={14} className={ocrConfidence > 80 ? 'text-green-500' : ocrConfidence > 50 ? 'text-yellow-500' : 'text-red-500'} />
                      <span className="text-xs font-medium text-gray-500">Confidence: {Math.round(ocrConfidence)}%</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setShowOcr(false)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><XIcon size={20}/></button>
             </div>
             <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-600 flex-1 overflow-y-auto">{ocrResult}</pre>
             <button onClick={() => navigator.clipboard.writeText(ocrResult || "")} className="w-full mt-6 py-3.5 bg-gray-900 text-white rounded-xl font-bold active:scale-[0.98] transition-transform shadow-lg">
                Copy to Clipboard
             </button>
           </div>
        )}

        <div className="relative shadow-2xl shadow-black/50 transition-all duration-300 ease-in-out" style={{ transform: `scale(${isProcessing ? 0.98 : 1})` }}>
           <img 
            src={previewUrl} 
            alt="Preview" 
            className="max-w-full max-h-[65vh] object-contain rounded-lg border border-white/10"
          />
          <button 
             onClick={saveToDevice}
             className="absolute bottom-4 right-4 p-3 bg-black/60 text-white rounded-full hover:bg-black/80 backdrop-blur-md transition-all border border-white/10"
             title="Save to Gallery"
          >
             <Download size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Sheet Controls */}
      <div className="bg-white rounded-t-3xl p-6 pb-10 space-y-6 shadow-[0_-8px_40px_rgba(0,0,0,0.2)] z-20 absolute bottom-0 left-0 right-0">
        
        {/* Filters */}
        <div className="flex justify-center -mt-10 mb-4">
             <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Enhance</h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 px-1">
            {[
              { id: 'original', name: 'Original', color: 'bg-gradient-to-br from-gray-300 to-gray-400' },
              { id: 'magic', name: 'Auto', color: 'bg-gradient-to-br from-brand-400 to-blue-400', icon: Wand2 },
              { id: 'grayscale', name: 'Gray', color: 'bg-gray-400' },
              { id: 'bw', name: 'B&W', color: 'bg-gray-800' },
            ].map((f) => {
                const Icon = f.icon;
                return (
              <button
                key={f.id}
                onClick={() => setCurrentFilter(f.id as any)}
                className="flex flex-col items-center gap-2 min-w-[72px] group"
              >
                <div className={`w-18 h-18 aspect-square rounded-2xl border-2 ${currentFilter === f.id ? 'border-brand-500 ring-4 ring-brand-100' : 'border-transparent'} overflow-hidden relative shadow-sm transition-all group-active:scale-95`}>
                   <div className={`w-full h-full ${f.color} opacity-100 flex items-center justify-center text-white/90`}>
                      {Icon && <Icon size={24} />}
                   </div>
                   {currentFilter === f.id && !Icon && <div className="absolute inset-0 flex items-center justify-center text-white"><Check size={28} strokeWidth={3} className="drop-shadow-md" /></div>}
                </div>
                <span className={`text-[11px] font-bold ${currentFilter === f.id ? 'text-brand-600' : 'text-gray-400'}`}>{f.name}</span>
              </button>
            )})}
          </div>
        </div>

        <div className="h-px bg-gray-100"></div>

        {/* Tools */}
        <div className="flex justify-around items-center px-2">
          <button onClick={() => setRotation((r) => (r + 90) % 360)} className="flex flex-col items-center gap-2 text-gray-500 active:text-brand-600 active:scale-95 transition-all w-16">
            <div className="w-12 h-12 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center">
               <RotateCw size={22} strokeWidth={2} />
            </div>
            <span className="text-[10px] font-bold">Rotate</span>
          </button>

          <button onClick={runOcr} className="flex flex-col items-center gap-2 text-gray-500 active:text-brand-600 active:scale-95 transition-all w-16">
             <div className="w-12 h-12 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center relative">
                {isOcring ? <Loader2 size={22} className="animate-spin text-brand-600"/> : <Type size={22} strokeWidth={2} />}
                <div className="absolute top-0 right-0 w-3 h-3 bg-brand-500 rounded-full border-2 border-white"></div>
             </div>
             <span className="text-[10px] font-bold">Text</span>
          </button>
          
           <button className="flex flex-col items-center gap-2 text-gray-500 active:text-brand-600 active:scale-95 transition-all w-16 opacity-50 cursor-not-allowed">
             <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                <Crop size={22} strokeWidth={2} />
             </div>
             <span className="text-[10px] font-bold">Crop</span>
          </button>

          <button onClick={() => { setCurrentFilter('original'); setRotation(0); }} className="flex flex-col items-center gap-2 text-gray-500 active:text-brand-600 active:scale-95 transition-all w-16">
             <div className="w-12 h-12 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center">
                <Undo2 size={22} strokeWidth={2} />
             </div>
             <span className="text-[10px] font-bold">Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditView;