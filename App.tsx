import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Share2, Trash2, ChevronLeft, MoreVertical, FileText, Download, ScanLine, Image as ImageIcon, CreditCard, Calculator, FileCheck, Search, FolderOpen, User as UserIcon, Wand2, Shield, LogOut, Loader2, Upload, CheckCircle, Smartphone, PenTool, Merge, Split, Minimize2, FileOutput, X, AlertTriangle, Settings, Bell } from 'lucide-react';
import { AppView, ScannedDoc, ScannedPage, Point, User } from './types';
import { APP_NAME, NAV_ITEMS } from './constants';
import CameraView from './components/CameraView';
import EditView from './components/EditView';
import SignaturePad from './components/SignaturePad';
import { generateSmartTitle, analyzeDocumentType, solveMathProblem } from './services/geminiService';
import { createThumbnail, cropImage, warpPerspective } from './services/imageUtils';
import { generatePDF, generatePDFBlob, downloadText } from './services/pdfService';
import { login, register, logout, getCurrentUser } from './services/authService';
import { mergePdfs, splitPdf, compressPdf, downloadBlobUrl } from './services/pdfToolsService';

// Simple UUID generator fallback
const generateId = () => Math.random().toString(36).substring(2, 9);

type ToolType = 'solver' | 'signature' | 'pdf-merge' | 'pdf-split' | 'pdf-compress' | null;

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [docs, setDocs] = useState<ScannedDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'document' | 'idcard'>('document');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Tool States
  const [toolProcessing, setToolProcessing] = useState(false);
  const [mathSolution, setMathSolution] = useState<string | null>(null);
  
  // Cloud Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Floating Camera Button Visibility - show on Home and Files
  const showFab = currentView === AppView.HOME || currentView === AppView.FILES;

  // Load from LocalStorage on mount
  useEffect(() => {
    // Check for old data key and migrate if needed, or just start fresh with new key
    const savedDocs = localStorage.getItem('camscannerx_docs') || localStorage.getItem('scansnap_docs');
    if (savedDocs) {
      try {
        setDocs(JSON.parse(savedDocs));
      } catch (e) {
        console.error("Failed to load local docs", e);
      }
    }

    getCurrentUser().then(u => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Save to LocalStorage on change
  useEffect(() => {
    localStorage.setItem('camscannerx_docs', JSON.stringify(docs));
  }, [docs]);

  // Updated to accept Corner Points for Perspective Warp
  const handleCapture = async (blobUrl: string, corners?: Point[]) => {
    if (activeTool === 'solver') {
        // Handle Math Solver Flow
        setToolProcessing(true);
        setCurrentView(AppView.TOOLS); // Go back to tools view to show result
        try {
            const solution = await solveMathProblem(blobUrl);
            setMathSolution(solution);
        } catch (e) {
            setMathSolution("Could not solve the problem. Please try again.");
        } finally {
            setToolProcessing(false);
        }
        return;
    }

    let docId = activeDocId;
    let finalUrl = blobUrl;

    // Apply Perspective Warp if corners provided
    if (corners && corners.length === 4) {
        try {
            finalUrl = await warpPerspective(blobUrl, corners);
        } catch (e) {
            console.error("Auto-warp failed, using original", e);
        }
    }
    
    // If coming from Home/Files (no active doc), create new
    if (!docId) {
      const newDoc: ScannedDoc = {
        id: generateId(),
        title: 'Processing...',
        createdAt: Date.now(),
        pages: []
      };
      docId = newDoc.id;
      setDocs(prev => [newDoc, ...prev]);
      setActiveDocId(newDoc.id);

      analyzeDocumentType(finalUrl).then(type => {
         generateSmartTitle(finalUrl).then(title => {
             setDocs(prev => prev.map(d => d.id === docId ? { ...d, title: title } : d));
         });
      });
    }

    const thumb = await createThumbnail(finalUrl);
    const newPage: ScannedPage = {
      id: generateId(),
      originalUrl: finalUrl,
      processedUrl: finalUrl,
      filter: 'original',
      rotation: 0
    };

    setDocs(prev => prev.map(d => {
      if (d.id === docId) {
        return { 
          ...d, 
          pages: [...d.pages, newPage],
          thumbnailUrl: d.pages.length === 0 ? thumb : d.thumbnailUrl 
        };
      }
      return d;
    }));

    setActivePageId(newPage.id);
    setCurrentView(AppView.EDIT_DOC);
  };

  const updatePage = (updatedPage: ScannedPage) => {
    setDocs(prev => prev.map(d => {
      if (d.id === activeDocId) {
        return {
          ...d,
          pages: d.pages.map(p => p.id === updatedPage.id ? updatedPage : p),
          // Update doc thumbnail if we modified the first page
          thumbnailUrl: d.pages[0].id === updatedPage.id ? updatedPage.processedUrl : d.thumbnailUrl
        };
      }
      return d;
    }));
    setCurrentView(AppView.PAGE_DETAIL);
  };

  const deleteDoc = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      setDocs(prev => prev.filter(d => d.id !== id));
      if (activeDocId === id) {
        setActiveDocId(null);
        setCurrentView(AppView.FILES);
      }
    }
  };

  const deletePage = (docId: string, pageId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("Delete this page?")) return;

    setDocs(prev => prev.map(d => {
        if (d.id !== docId) return d;
        const newPages = d.pages.filter(p => p.id !== pageId);
        return {
            ...d,
            pages: newPages,
            thumbnailUrl: newPages.length > 0 ? newPages[0].processedUrl : undefined
        };
    }));
  };

  const deleteAllDocs = () => {
    if (confirm("Are you sure you want to delete ALL documents? This cannot be undone.")) {
        setDocs([]);
        alert("All documents cleared.");
    }
  };

  const shareDoc = async (doc: ScannedDoc, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isSharing) return;
    setIsSharing(true);
    
    try {
        const blob = await generatePDFBlob(doc.title, doc.pages);
        const safeTitle = doc.title.replace(/[^a-z0-9]/gi, '_');
        const file = new File([blob], `${safeTitle}.pdf`, { type: 'application/pdf' });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: doc.title,
                text: 'Scanned with CamScannerX'
            });
        } else {
            // Fallback for desktop or unsupported browsers
            alert("Sharing is not supported on this device/browser. Downloading instead.");
            generatePDF(doc.title, doc.pages);
        }
    } catch (error) {
        console.error("Error sharing:", error);
        // Don't alert if user cancelled the share sheet
        if ((error as any).name !== 'AbortError') {
             alert("Failed to share document.");
        }
    } finally {
        setIsSharing(false);
    }
  };

  const exportPDF = async () => {
    const doc = docs.find(d => d.id === activeDocId);
    if (!doc) return;
    await generatePDF(doc.title, doc.pages);
  };

  const uploadToCloud = async () => {
    const doc = docs.find(d => d.id === activeDocId);
    if (!doc) return;
    
    if (!user) {
        alert("Please log in to use Cloud Storage.");
        setCurrentView(AppView.SETTINGS);
        return;
    }

    setIsUploading(true);
    try {
        const pdfBlob = await generatePDFBlob(doc.title, doc.pages);
        const formData = new FormData();
        const filename = `${doc.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        formData.append('file', pdfBlob, filename);

        const token = localStorage.getItem('token');
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (res.ok) {
            alert("Document uploaded successfully to your cloud storage!");
        } else {
            alert("Upload failed. Please try again.");
        }
    } catch (e) {
        console.error(e);
        alert("Error generating or uploading PDF.");
    } finally {
        setIsUploading(false);
    }
  };

  const exportText = () => {
    const doc = docs.find(d => d.id === activeDocId);
    if (!doc) return;
    const fullText = doc.pages.map(p => p.ocrText || "").join("\n\n-- Page Break --\n\n");
    if (!fullText.trim()) {
        alert("No text extracted yet. Please use the 'Text' tool in edit mode first.");
        return;
    }
    downloadText(doc.title, fullText);
  };

  const startCamera = (mode: 'document' | 'idcard' = 'document') => {
    if (activeTool !== 'solver') {
        // Only reset doc ID if we are not in a specific tool mode like solver
        if (currentView !== AppView.PAGE_DETAIL) {
            setActiveDocId(null);
        }
    }
    setCameraMode(mode);
    setCurrentView(AppView.CAMERA);
  };

  const handleSignatureSave = async (blobUrl: string) => {
    // Save signature as a new document
    const newDoc: ScannedDoc = {
        id: generateId(),
        title: `Signature ${new Date().toLocaleDateString()}`,
        createdAt: Date.now(),
        pages: [{
            id: generateId(),
            originalUrl: blobUrl,
            processedUrl: blobUrl,
            filter: 'original',
            rotation: 0
        }],
        thumbnailUrl: blobUrl
    };
    setDocs(prev => [newDoc, ...prev]);
    setActiveTool(null);
    setCurrentView(AppView.FILES);
    
    // Also trigger download for convenience
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'signature.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeDoc = docs.find(d => d.id === activeDocId);
  const activePage = activeDoc?.pages.find(p => p.id === activePageId);

  // -- TOOL LOGIC HANDLERS --
  const handlePdfMerge = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (e.target.files.length < 2) {
        alert("Please select at least 2 PDF files to merge.");
        return;
    }
    setToolProcessing(true);
    try {
        const url = await mergePdfs(Array.from(e.target.files));
        downloadBlobUrl(url, 'merged_document.pdf');
        setActiveTool(null);
    } catch (err) {
        alert("Failed to merge PDFs. Please try again.");
    } finally {
        setToolProcessing(false);
    }
  };

  const handlePdfCompress = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setToolProcessing(true);
    try {
        const url = await compressPdf(e.target.files[0]);
        downloadBlobUrl(url, 'compressed_document.pdf');
        setActiveTool(null);
    } catch (err) {
        alert("Failed to compress PDF.");
    } finally {
        setToolProcessing(false);
    }
  };

  const [splitRange, setSplitRange] = useState('');
  const handlePdfSplit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    if (!splitRange) {
        alert("Please enter a page range (e.g., 1-3)");
        return;
    }
    setToolProcessing(true);
    try {
        const url = await splitPdf(e.target.files[0], splitRange);
        downloadBlobUrl(url, 'split_document.pdf');
        setActiveTool(null);
        setSplitRange('');
    } catch (err) {
        alert("Failed to split PDF. Check page range.");
    } finally {
        setToolProcessing(false);
    }
  };

  // Helper for greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };


  // -- SCREEN RENDERERS --

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto bg-gray-100 pb-32 no-scrollbar">
      {/* Enhanced Header */}
      <header className="px-6 pt-12 pb-4 glass sticky top-0 z-10 border-b border-gray-200/50">
        <div className="flex justify-between items-center">
            <div>
                <p className="text-sm font-semibold text-gray-500 mb-0.5">{getGreeting()},</p>
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{user ? user.email.split('@')[0] : 'Guest'}</h1>
            </div>
            <button onClick={() => setCurrentView(AppView.SETTINGS)} className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors">
                <Settings size={20} />
            </button>
        </div>
      </header>

      <div className="p-6 space-y-8 animate-slide-up">
        {/* Features Grid */}
        <section>
          <div className="flex justify-between items-center mb-4 px-1">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Primary Action */}
            <button onClick={() => startCamera('document')} className="group relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-600 p-5 rounded-3xl flex flex-col items-start justify-between min-h-[160px] shadow-glow text-white transition-all active:scale-[0.98]">
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/20 transition-colors"></div>
               <div className="absolute bottom-0 left-0 w-24 h-24 bg-brand-400/30 rounded-full -ml-8 -mb-8 blur-xl"></div>
              
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/10">
                <ScanLine size={24} />
              </div>
              <div className="relative z-10 text-left mt-4">
                <span className="block text-xl font-bold">Smart Scan</span>
                <span className="text-xs text-brand-100 font-medium mt-1">Auto-detect & Crop</span>
              </div>
            </button>
            
            <div className="flex flex-col gap-4">
                 <button className="flex-1 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all p-4 rounded-3xl flex items-center gap-3 shadow-soft border border-transparent relative overflow-hidden group">
                   <input type="file" accept="image/*" className="absolute inset-0 opacity-0 z-10 cursor-pointer" onChange={(e) => {
                     if (e.target.files?.[0]) handleCapture(URL.createObjectURL(e.target.files[0]));
                   }} />
                   <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                     <ImageIcon size={22} />
                   </div>
                   <div className="text-left">
                     <span className="block font-bold text-gray-900 text-sm">Import</span>
                     <span className="text-[10px] text-gray-400 font-medium">Gallery</span>
                   </div>
                </button>

                <button onClick={() => startCamera('idcard')} className="flex-1 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all p-4 rounded-3xl flex items-center gap-3 shadow-soft border border-transparent group">
                   <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                     <CreditCard size={22} />
                   </div>
                   <div className="text-left">
                     <span className="block font-bold text-gray-900 text-sm">ID Card</span>
                     <span className="text-[10px] text-gray-400 font-medium">Passport</span>
                   </div>
                </button>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
             {[
               { icon: FileText, label: 'OCR Text', color: 'text-orange-600', bg: 'bg-orange-50', action: () => startCamera('document') },
               { icon: Calculator, label: 'Solver AI', color: 'text-pink-600', bg: 'bg-pink-50', action: () => { setActiveTool('solver'); startCamera('document'); } },
               { icon: PenTool, label: 'Sign', color: 'text-teal-600', bg: 'bg-teal-50', action: () => { setActiveTool('signature'); setCurrentView(AppView.TOOLS); } }
             ].map((item, i) => (
                <button key={i} onClick={item.action} className="bg-white hover:bg-gray-50 active:scale-[0.98] transition-all p-3 py-4 rounded-3xl flex flex-col items-center gap-2 shadow-soft border border-transparent group">
                    <div className={`w-10 h-10 rounded-full ${item.bg} ${item.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                        <item.icon size={20} />
                    </div>
                    <span className="font-bold text-gray-700 text-xs">{item.label}</span>
                </button>
             ))}
          </div>
        </section>

        {/* Recent Scans */}
        <section>
          <div className="flex justify-between items-center mb-4 px-1">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent Scans</h2>
            {docs.length > 0 && (
              <button onClick={() => setCurrentView(AppView.FILES)} className="text-brand-600 text-xs font-bold hover:underline">View All</button>
            )}
          </div>
          
          {docs.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                  <ScanLine size={32} />
              </div>
              <p className="text-gray-400 text-sm font-medium">No scans yet</p>
              <p className="text-gray-300 text-xs mt-1">Tap the green button to start</p>
            </div>
          ) : (
             <div className="space-y-3">
               {docs.slice(0, 3).map(doc => (
                 <div key={doc.id} onClick={() => { setActiveDocId(doc.id); setCurrentView(AppView.PAGE_DETAIL); }}
                      className="group bg-white p-3 rounded-2xl shadow-soft flex items-center gap-4 active:scale-[0.99] transition-all cursor-pointer border border-transparent hover:border-brand-200">
                   <div className="w-14 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 relative">
                     {doc.thumbnailUrl ? <img src={doc.thumbnailUrl} className="w-full h-full object-cover" alt="" /> : null}
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors"></div>
                   </div>
                   <div className="flex-1 min-w-0 py-1">
                     <h3 className="font-bold text-gray-900 truncate text-sm">{doc.title}</h3>
                     <div className="flex items-center gap-2 mt-1.5">
                       <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase">PDF</span>
                       <span className="text-[11px] text-gray-400 font-medium">{new Date(doc.createdAt).toLocaleDateString()}</span>
                     </div>
                   </div>
                   <div className="flex items-center gap-1 pr-1">
                     <button onClick={(e) => shareDoc(doc, e)} className="p-2.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors">
                        <Share2 size={18} />
                     </button>
                     <button onClick={(e) => deleteDoc(doc.id, e)} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                        <Trash2 size={18} />
                     </button>
                   </div>
                 </div>
               ))}
             </div>
          )}
        </section>
      </div>
    </div>
  );

  const renderFiles = () => (
    <div className="flex-1 overflow-y-auto bg-gray-100 pb-32 no-scrollbar">
      <header className="px-6 pt-12 pb-4 glass sticky top-0 z-10 border-b border-gray-200/50">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-4">My Files</h1>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Search documents..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-100/50 border border-gray-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white focus:border-brand-500 transition-all"
          />
        </div>
      </header>

      <div className="p-6 space-y-3 animate-fade-in">
         {docs.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
            <div className="text-center py-20 opacity-60">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <FolderOpen size={32} />
              </div>
              <p className="text-gray-500 font-medium">No documents found</p>
            </div>
         ) : (
           docs.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase())).map(doc => (
             <div key={doc.id} onClick={() => { setActiveDocId(doc.id); setCurrentView(AppView.PAGE_DETAIL); }}
                  className="bg-white p-4 rounded-2xl shadow-soft flex items-center gap-4 active:scale-[0.99] transition-all cursor-pointer group border border-transparent hover:border-brand-200">
               <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 relative">
                 {doc.thumbnailUrl ? <img src={doc.thumbnailUrl} className="w-full h-full object-cover" alt="" /> : null}
                 <div className="absolute bottom-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-tl-lg">
                    {doc.pages.length}
                 </div>
               </div>
               <div className="flex-1 min-w-0">
                 <h3 className="font-bold text-gray-900 truncate text-sm">{doc.title}</h3>
                 <div className="flex items-center gap-2 mt-1.5">
                   <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">PDF</span>
                   <span className="text-[10px] text-gray-400 font-medium">{new Date(doc.createdAt).toLocaleDateString()}</span>
                 </div>
               </div>
               <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => shareDoc(doc, e)} className="p-2 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all">
                        <Share2 size={20} />
                    </button>
                    <button onClick={(e) => deleteDoc(doc.id, e)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
                        <Trash2 size={20} />
                    </button>
               </div>
             </div>
           ))
         )}
      </div>
    </div>
  );

  const renderTools = () => (
    <div className="flex-1 overflow-y-auto bg-gray-100 pb-24 no-scrollbar">
      <header className="px-6 pt-12 pb-6 glass sticky top-0 z-10 border-b border-gray-200/50">
        <h1 className="text-2xl font-extrabold text-gray-900">Tools</h1>
      </header>

      {/* MATH SOLUTION MODAL */}
      {mathSolution && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 flex flex-col max-h-[85vh] animate-slide-up">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900">
                        <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600"><Calculator size={18}/></div> 
                        Math Solution
                    </h2>
                    <button onClick={() => { setMathSolution(null); setActiveTool(null); }} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50 p-5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap font-medium text-gray-700">
                    {mathSolution}
                </div>
                <button onClick={() => { setMathSolution(null); setActiveTool(null); }} className="mt-4 w-full py-3.5 bg-brand-600 text-white rounded-xl font-bold shadow-lg shadow-brand-500/30">Close Result</button>
            </div>
          </div>
      )}

      {/* LOADER */}
      {toolProcessing && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
             <div className="bg-white p-8 rounded-3xl flex flex-col items-center gap-4 shadow-2xl animate-in zoom-in-95">
                 <Loader2 className="animate-spin text-brand-600" size={40} />
                 <span className="font-bold text-gray-800 text-lg">Processing...</span>
             </div>
         </div>
      )}

      {/* TOOLS GRID */}
      <div className="p-6 grid grid-cols-1 gap-4 animate-slide-up">
        {[
          { id: 'solver', icon: Calculator, label: 'Solver AI', color: 'bg-pink-500', text: 'text-pink-600', bg: 'bg-pink-50', sub: 'Solve Math Problems', action: () => { setActiveTool('solver'); startCamera('document'); } },
          { id: 'signature', icon: PenTool, label: 'Signature', color: 'bg-indigo-500', text: 'text-indigo-600', bg: 'bg-indigo-50', sub: 'Create & Save', action: () => setActiveTool('signature') },
          { id: 'pdf-merge', icon: Merge, label: 'Merge PDF', color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50', sub: 'Combine files', action: () => setActiveTool('pdf-merge') },
          { id: 'pdf-split', icon: Split, label: 'Split PDF', color: 'bg-orange-500', text: 'text-orange-600', bg: 'bg-orange-50', sub: 'Extract pages', action: () => setActiveTool('pdf-split') },
          { id: 'pdf-compress', icon: Minimize2, label: 'Compress PDF', color: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50', sub: 'Reduce size', action: () => setActiveTool('pdf-compress') },
          { id: 'id-scan', icon: CreditCard, label: 'ID Scanner', color: 'bg-purple-500', text: 'text-purple-600', bg: 'bg-purple-50', sub: 'Optimize for Cards', action: () => startCamera('idcard') },
        ].map((tool, i) => (
          <div key={i}>
            <div onClick={tool.action} className={`bg-white p-5 rounded-3xl shadow-soft border border-transparent flex items-center gap-5 active:scale-[0.98] transition-all cursor-pointer group hover:border-gray-200 ${activeTool === tool.id ? 'ring-2 ring-brand-500 bg-brand-50/50' : ''}`}>
                <div className={`w-14 h-14 rounded-2xl ${tool.bg} ${tool.text} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                    <tool.icon size={26} />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-base">{tool.label}</h3>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">{tool.sub}</p>
                </div>
                <div className="text-gray-300 group-hover:text-brand-500 transition-colors">
                    <ChevronLeft size={20} className="rotate-180" />
                </div>
            </div>

            {/* EXPANDED TOOL UI */}
            {activeTool === tool.id && tool.id.startsWith('pdf') && (
                <div className="mt-3 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm animate-in slide-in-from-top-4">
                    {tool.id === 'pdf-merge' && (
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-gray-600">Select multiple PDF files to combine.</p>
                            <label className="block w-full cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-600 py-3 rounded-xl text-center font-bold text-sm transition-colors border border-blue-200 border-dashed">
                                Choose Files
                                <input type="file" multiple accept="application/pdf" onChange={handlePdfMerge} className="hidden"/>
                            </label>
                        </div>
                    )}
                    {tool.id === 'pdf-compress' && (
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-gray-600">Select a PDF to reduce its file size.</p>
                            <label className="block w-full cursor-pointer bg-green-50 hover:bg-green-100 text-green-600 py-3 rounded-xl text-center font-bold text-sm transition-colors border border-green-200 border-dashed">
                                Choose File
                                <input type="file" accept="application/pdf" onChange={handlePdfCompress} className="hidden"/>
                            </label>
                        </div>
                    )}
                    {tool.id === 'pdf-split' && (
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-gray-600">Select a PDF and specify pages.</p>
                            <input 
                                type="text" 
                                placeholder="Range e.g., 1-3, 5" 
                                value={splitRange} 
                                onChange={(e) => setSplitRange(e.target.value)} 
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                            />
                            <label className="block w-full cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-600 py-3 rounded-xl text-center font-bold text-sm transition-colors border border-orange-200 border-dashed">
                                Choose File
                                <input type="file" accept="application/pdf" onChange={handlePdfSplit} className="hidden"/>
                            </label>
                        </div>
                    )}
                </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const SettingsPanel: React.FC = () => {
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const u = isLoginMode ? await login(email, password) : await register(email, password);
            setUser(u);
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        setUser(null);
    };

    if (user) {
        return (
            <div className="flex-1 overflow-y-auto bg-gray-100 pb-24 no-scrollbar flex flex-col">
                <header className="px-6 pt-12 pb-6 glass sticky top-0 z-10 border-b border-gray-200/50">
                    <h1 className="text-2xl font-extrabold text-gray-900">Profile</h1>
                </header>
                
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="bg-white p-8 rounded-3xl shadow-soft flex flex-col items-center text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-brand-100 to-brand-200 text-brand-600 rounded-full flex items-center justify-center mb-4 text-3xl font-bold border-4 border-white shadow-md">
                            {user.email[0].toUpperCase()}
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">{user.email}</h2>
                        <span className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-bold mt-2 border border-brand-100">Free Plan</span>
                        
                        <button onClick={handleLogout} className="mt-8 flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors font-medium px-4 py-2 hover:bg-red-50 rounded-xl">
                            <LogOut size={18} />
                            Sign Out
                        </button>
                    </div>
                    
                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Cloud Sync</h3>
                        <div className="space-y-3">
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-transparent flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Sync Status</span>
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-lg border border-green-100 flex items-center gap-1">
                                    <CheckCircle size={12}/> Active
                                </span>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-transparent flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Storage Used</span>
                                <span className="text-xs font-bold text-gray-500">12 MB / 5 GB</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Data & Privacy</h3>
                        <div className="space-y-3">
                             <button onClick={deleteAllDocs} className="w-full bg-white p-4 rounded-2xl shadow-sm border border-transparent flex justify-between items-center text-red-600 hover:bg-red-50 transition-colors">
                                <span className="text-sm font-medium">Clear All Scans</span>
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-100 pb-24 no-scrollbar flex flex-col">
            <div className="flex-1 flex flex-col justify-center px-8 py-12 animate-fade-in">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-brand-100 text-brand-500 rounded-3xl rotate-3 flex items-center justify-center mx-auto mb-6 shadow-glow">
                        <UserIcon size={36} />
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900">{isLoginMode ? 'Welcome Back' : 'Create Account'}</h2>
                    <p className="text-gray-500 text-sm mt-2 font-medium">{isLoginMode ? 'Sign in to sync your documents' : 'Get started with free cloud storage'}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <div className="p-4 bg-red-50 text-red-600 text-xs rounded-2xl font-medium text-center border border-red-100">{error}</div>}
                    
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide ml-1">Email</label>
                        <input 
                            type="email" 
                            required
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                            placeholder="you@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide ml-1">Password</label>
                        <input 
                            type="password" 
                            required
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    <button 
                        disabled={loading}
                        type="submit" 
                        className="w-full mt-6 py-4 bg-brand-600 text-white font-bold rounded-2xl shadow-lg shadow-brand-500/30 active:scale-[0.98] transition-all flex justify-center items-center hover:bg-brand-700"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (isLoginMode ? 'Sign In' : 'Sign Up')}
                    </button>

                    <p className="text-center text-xs text-gray-400 mt-8 font-medium">
                        {isLoginMode ? "Don't have an account? " : "Already have an account? "}
                        <button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }} className="text-brand-600 font-bold hover:underline">
                            {isLoginMode ? 'Sign Up' : 'Log In'}
                        </button>
                    </p>
                </form>

                <div className="mt-12 text-center">
                     <p className="text-[10px] text-gray-400 font-medium bg-gray-200/50 inline-block px-3 py-1 rounded-full">
                         <Shield size={10} className="inline mr-1 -mt-0.5"/> 
                         Your data is processed locally first.
                     </p>
                </div>
            </div>
            
            <div className="px-8 pb-8">
                 <button onClick={deleteAllDocs} className="w-full p-4 rounded-2xl border border-red-100 bg-red-50 flex justify-center items-center gap-2 text-red-600 hover:bg-red-100 transition-colors font-bold text-sm">
                       <Trash2 size={16} />
                       Clear Local Data
                 </button>
            </div>
        </div>
    );
  };

  const renderDocDetail = () => {
    if (!activeDoc) return null;
    return (
      <div className="flex flex-col h-full bg-gray-100">
        <header className="glass px-4 py-4 shadow-sm flex items-center gap-3 sticky top-0 z-20 border-b border-gray-200/50">
          <button onClick={() => setCurrentView(activeDocId && docs.length > 0 ? AppView.HOME : AppView.HOME)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
            <ChevronLeft size={26} strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 truncate text-lg">{activeDoc.title}</h2>
            <p className="text-xs text-gray-500 font-medium">{activeDoc.pages.length} Pages • {new Date(activeDoc.createdAt).toLocaleDateString()}</p>
          </div>
          <button onClick={() => deleteDoc(activeDoc.id)} className="p-2 text-red-500 rounded-full hover:bg-red-50 transition-colors">
            <Trash2 size={22} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          <div className="grid grid-cols-2 gap-4 pb-20 animate-fade-in">
            {activeDoc.pages.map((page, idx) => (
              <div key={page.id} className="relative group">
                <div 
                   onClick={() => { setActivePageId(page.id); setCurrentView(AppView.EDIT_DOC); }}
                   className="bg-white shadow-soft rounded-2xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-brand-400 transition-all hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="aspect-[3/4] relative bg-gray-100">
                     <img src={page.processedUrl} className="w-full h-full object-cover" alt={`Page ${idx+1}`} />
                  </div>
                  <div className="p-2.5 text-center text-[10px] text-gray-500 font-bold border-t border-gray-50 flex justify-between items-center bg-white">
                    <span>Page {idx + 1}</span>
                    <Wand2 size={12} className="text-brand-500" />
                  </div>
                </div>
                
                {/* DELETE PAGE BUTTON */}
                <button 
                    onClick={(e) => deletePage(activeDoc.id, page.id, e)}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 active:scale-95 transition-all z-10 border-2 border-white"
                    title="Delete Page"
                >
                    <X size={12} strokeWidth={3} />
                </button>
              </div>
            ))}
            <button 
              onClick={() => startCamera('document')}
              className="aspect-[3/4] bg-white rounded-2xl flex flex-col items-center justify-center text-brand-500 border-2 border-dashed border-brand-200 hover:bg-brand-50 hover:border-brand-300 transition-all gap-3 group shadow-sm"
            >
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={24} strokeWidth={3} />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Add Page</span>
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-white p-5 border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] pb-8 safe-area-bottom z-30">
           <div className="grid grid-cols-4 gap-3 mb-3">
             <button onClick={() => shareDoc(activeDoc)} disabled={isSharing} className="flex flex-col items-center justify-center gap-1.5 bg-white text-gray-700 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all border border-gray-200 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 shadow-sm">
               {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} strokeWidth={2.5} />}
               <span className="text-[10px]">Share</span>
             </button>
             <button onClick={exportPDF} className="flex flex-col items-center justify-center gap-1.5 bg-brand-600 text-white py-3 rounded-2xl font-bold active:scale-[0.98] transition-all shadow-lg shadow-brand-500/20 hover:bg-brand-700">
               <Download size={20} strokeWidth={2.5} />
               <span className="text-[10px]">Save PDF</span>
             </button>
             <button onClick={uploadToCloud} disabled={isUploading} className="flex flex-col items-center justify-center gap-1.5 bg-white text-blue-600 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all border border-gray-200 hover:border-blue-200 hover:bg-blue-50 shadow-sm">
               {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} strokeWidth={2.5} />}
               <span className="text-[10px]">Cloud</span>
             </button>
             <button onClick={exportText} className="flex flex-col items-center justify-center gap-1.5 bg-white text-gray-700 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all border border-gray-200 hover:bg-gray-50 shadow-sm">
               <FileText size={20} strokeWidth={2.5} />
               <span className="text-[10px]">OCR</span>
             </button>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto bg-white shadow-2xl overflow-hidden relative border-x border-gray-100">
      
      <main className="flex-1 flex flex-col overflow-hidden relative bg-gray-100">
        {currentView === AppView.HOME && renderHome()}
        {currentView === AppView.FILES && renderFiles()}
        {currentView === AppView.TOOLS && renderTools()}
        {currentView === AppView.SETTINGS && <SettingsPanel />}
        {currentView === AppView.PAGE_DETAIL && renderDocDetail()}
      </main>

      {/* FAB - Floating Action Button */}
      {showFab && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-30 animate-in slide-in-from-bottom-6">
            <button
            onClick={() => startCamera('document')}
            className="pointer-events-auto w-16 h-16 bg-gradient-to-tr from-brand-500 to-brand-400 rounded-full shadow-lg shadow-brand-500/40 flex items-center justify-center text-white active:scale-95 hover:scale-105 transition-all duration-300 ring-4 ring-white"
            aria-label="Scan"
            >
            <Camera size={30} strokeWidth={2.5} />
            </button>
        </div>
      )}

      {/* Modern Glass Bottom Nav */}
      {(currentView === AppView.HOME || currentView === AppView.FILES || currentView === AppView.TOOLS || currentView === AppView.SETTINGS) && (
        <nav className="h-[90px] glass border-t border-gray-200/50 flex justify-between items-start px-6 pt-3 pb-8 z-20 shadow-[0_-4px_30px_rgba(0,0,0,0.03)] backdrop-blur-xl">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = item.id === currentView || (item.id === 'HOME' && currentView === AppView.HOME);
            return (
              <button
                key={item.id}
                onClick={() => { setCurrentView(item.id as AppView); setActiveTool(null); }}
                className={`flex flex-col items-center gap-1 transition-all duration-300 w-16 group ${isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-500'}`}
              >
                <div className={`p-1.5 rounded-2xl transition-all duration-300 ${isActive ? 'bg-brand-50 -translate-y-1 shadow-sm' : 'bg-transparent'}`}>
                    <Icon size={24} className={isActive ? 'fill-brand-600 text-brand-600' : ''} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-bold tracking-wide transition-colors ${isActive ? 'text-brand-700' : ''}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Overlays */}
      {currentView === AppView.CAMERA && (
        <CameraView 
          onCapture={handleCapture} 
          mode={cameraMode}
          onClose={() => setCurrentView(activeDocId ? AppView.PAGE_DETAIL : AppView.HOME)} 
        />
      )}

      {currentView === AppView.EDIT_DOC && activePage && (
        <EditView 
          page={activePage} 
          onSave={updatePage} 
          onCancel={() => setCurrentView(AppView.PAGE_DETAIL)} 
        />
      )}

      {/* SIGNATURE PAD OVERLAY */}
      {activeTool === 'signature' && (
         <SignaturePad onSave={handleSignatureSave} onClose={() => setActiveTool(null)} />
      )}
    </div>
  );
};

export default App;