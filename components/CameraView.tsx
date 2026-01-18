import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Image as ImageIcon, Zap, ZapOff, Camera, AlertCircle, Scan, Maximize } from 'lucide-react';
import { Point } from '../types';
import { findDocumentCorners, isOpenCvReady } from '../services/cvService';

interface CameraViewProps {
  onCapture: (blobUrl: string, corners?: Point[]) => void;
  onClose: () => void;
  mode: 'document' | 'idcard';
}

const CameraView: React.FC<CameraViewProps> = ({ onCapture, onClose, mode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isCvReady, setIsCvReady] = useState(false);
  const detectionIntervalRef = useRef<number | null>(null);
  
  // 4-Corner State (Percentage 0-100 relative to container)
  const [corners, setCorners] = useState<Point[]>([
    { x: 20, y: 20 }, // TL
    { x: 80, y: 20 }, // TR
    { x: 80, y: 80 }, // BR
    { x: 20, y: 80 }  // BL
  ]);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);

  useEffect(() => {
    startCamera();
    
    // Check for OpenCV availability
    const checkCv = setInterval(() => {
        if (isOpenCvReady()) {
            setIsCvReady(true);
            clearInterval(checkCv);
        }
    }, 500);

    return () => {
        stopCamera();
        clearInterval(checkCv);
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    };
  }, []);

  // Initialize crop box based on mode
  useEffect(() => {
    if (mode === 'idcard') {
      setIsAutoMode(false); // Disable auto for ID card fixed frame
      setCorners([
        { x: 15, y: 35 },
        { x: 85, y: 35 },
        { x: 85, y: 65 },
        { x: 15, y: 65 }
      ]);
    } else {
        // Reset to default if not auto
        if (!isAutoMode) {
            setCorners([
                { x: 20, y: 20 },
                { x: 80, y: 20 },
                { x: 80, y: 80 },
                { x: 20, y: 80 }
            ]);
        }
    }
  }, [mode, isAutoMode]);

  // Auto-detection Loop
  useEffect(() => {
    if (isAutoMode && isCvReady && videoRef.current && stream && mode === 'document') {
        detectionIntervalRef.current = window.setInterval(() => {
            if (videoRef.current && videoRef.current.readyState === 4) {
                const detected = findDocumentCorners(videoRef.current);
                if (detected) {
                    // Smooth transition? For now, direct update.
                    // We could lerp for smoothness, but let's stick to direct for responsiveness
                    setCorners(detected);
                }
            }
        }, 200); // 5fps detection
    } else {
        if (detectionIntervalRef.current) window.clearInterval(detectionIntervalRef.current);
    }

    return () => {
        if (detectionIntervalRef.current) window.clearInterval(detectionIntervalRef.current);
    };
  }, [isAutoMode, isCvReady, stream, mode]);

  const startCamera = async () => {
    setError(null);
    try {
      const constraints = {
        video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: false
      };
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        // Wait for metadata to load to ensure dimensions are correct for CV
        videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
        };
      }
    } catch (err: any) {
      console.warn("Primary camera failed, retrying fallback...", err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(fallbackStream);
        if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play();
        }
      } catch (fallbackErr: any) {
        setError("Camera access denied or unavailable.");
      }
    }
  };

  const stopCamera = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
  };

  const takePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            // Convert percentage corners to actual pixel coordinates
            const pixelCorners = corners.map(c => ({
                x: (c.x / 100) * canvas.width,
                y: (c.y / 100) * canvas.height
            }));
            onCapture(URL.createObjectURL(blob), pixelCorners);
          }
        }, 'image/jpeg', 1.0);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onCapture(URL.createObjectURL(e.target.files[0])); 
    }
  };

  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities() as any;
    if (caps?.torch) {
        try {
            await track.applyConstraints({ advanced: [{ torch: !flashOn }] as any });
            setFlashOn(!flashOn);
        } catch(e) {}
    }
  };

  // Touch/Mouse Handling for Corners
  const handleStart = (index: number) => {
      setActiveCorner(index);
      setIsAutoMode(false); // Disable auto if user manually adjusts
  };
  
  const handleMove = (clientX: number, clientY: number) => {
    if (activeCorner === null || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

    setCorners(prev => {
        const newCorners = [...prev];
        newCorners[activeCorner] = { x: xPct, y: yPct };
        return newCorners;
    });
  };

  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);
  const onEnd = () => setActiveCorner(null);

  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center p-6 text-center">
         <button onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white"><X size={32} /></button>
         <AlertCircle size={48} className="text-red-500 mb-4" />
         <p className="text-white mb-6">{error}</p>
         <label className="bg-brand-500 text-white px-6 py-3 rounded-full cursor-pointer font-bold">
            Upload Image
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
         </label>
      </div>
    );
  }

  // Generate SVG Polygon points string
  const pointsStr = corners.map(c => `${c.x},${c.y}`).join(' ');

  return (
    <div 
      className="fixed inset-0 bg-black z-50 flex flex-col select-none touch-none"
      onMouseMove={onMouseMove}
      onMouseUp={onEnd}
      onTouchMove={onTouchMove}
      onTouchEnd={onEnd}
    >
      {/* Top Bar */}
      <div className="absolute top-0 w-full p-4 pt-8 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onClose} className="p-2 bg-black/20 rounded-full text-white"><X size={24} /></button>
        
        <div className="flex gap-4">
             {mode === 'document' && isCvReady && (
                 <button 
                    onClick={() => setIsAutoMode(!isAutoMode)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${isAutoMode ? 'bg-brand-500 border-brand-500 text-white' : 'bg-black/30 border-white/30 text-white'}`}
                 >
                    {isAutoMode ? 'Auto' : 'Manual'}
                 </button>
             )}
             <span className="text-white font-bold text-sm tracking-widest uppercase opacity-80 self-center bg-black/20 px-2 rounded">{mode === 'idcard' ? 'ID Mode' : 'Doc'}</span>
        </div>

        <button onClick={toggleFlash} className="p-2 bg-black/20 rounded-full text-white">
          {flashOn ? <Zap size={24} className="text-yellow-400 fill-yellow-400" /> : <ZapOff size={24} />}
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden bg-gray-900" ref={containerRef}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        
        {/* SVG Overlay for Quad */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            <defs>
                <mask id="crop-mask">
                    <rect x="0" y="0" width="100%" height="100%" fill="white" />
                    <polygon points={pointsStr} fill="black" />
                </mask>
            </defs>
            {/* Darkened Background */}
            <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#crop-mask)" />
            {/* Border Lines */}
            <polygon 
                points={pointsStr} 
                fill="none" 
                stroke={isAutoMode ? "#22c55e" : "#ffffff"} 
                strokeWidth="2" 
                strokeDasharray={isAutoMode ? "5,5" : "none"}
                vectorEffect="non-scaling-stroke" 
                className="transition-all duration-300 ease-linear"
            />
        </svg>

        {/* Draggable Corners */}
        {corners.map((corner, i) => (
            <div
                key={i}
                className={`absolute w-12 h-12 -ml-6 -mt-6 z-20 flex items-center justify-center cursor-move transition-transform duration-100 ease-linear ${isAutoMode ? 'pointer-events-none opacity-50' : 'opacity-100'}`}
                style={{ left: `${corner.x}%`, top: `${corner.y}%` }}
                onMouseDown={() => handleStart(i)}
                onTouchStart={() => handleStart(i)}
            >
                <div className={`w-5 h-5 rounded-full border-2 shadow-md transform transition-transform ${isAutoMode ? 'bg-brand-500 border-white' : 'bg-white border-brand-500 hover:scale-125'}`}></div>
            </div>
        ))}
        
        <div className="absolute bottom-6 w-full text-center z-10 pointer-events-none">
             <span className="bg-black/50 text-white/90 text-xs px-3 py-1 rounded-full backdrop-blur-md">
               {isAutoMode ? 'Detecting document...' : 'Drag corners to align'}
             </span>
        </div>
      </div>

      {/* Controls */}
      <div className="h-32 bg-black flex items-center justify-around px-8 pb-6 pt-4 z-20">
        <label className="flex flex-col items-center gap-1 text-white/70 cursor-pointer active:scale-95 transition-transform">
            <ImageIcon size={24} />
            <span className="text-[10px]">Import</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>

        <button 
          onClick={takePhoto}
          className={`w-18 h-18 rounded-full border-4 p-1 active:scale-95 transition-all ${isAutoMode && corners ? 'border-brand-500' : 'border-white/20'}`}
        >
          <div className="w-full h-full bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.4)] hover:bg-brand-50 transition-colors"></div>
        </button>

        <div className="w-8"></div> {/* Spacer */}
      </div>
    </div>
  );
};

export default CameraView;