import React, { useState, useEffect, useRef } from 'react';
import { User, Message, MessageRole, StudySession, AgentType, AgentStatus, UploadedFile } from './types';
import * as FirebaseService from './services/mockFirebase';
import * as GeminiService from './services/geminiService';
import MermaidDiagram from './components/MermaidDiagram';
import AgentNexus from './components/AgentNexus';
import { Send, Mic, Upload, LogOut, Book, Image as ImageIcon, Layout, FileText, Plus, X, Brain, Volume2, VolumeX, Pin, Edit2, Trash2, Eye, EyeOff, Loader2, Maximize2 } from 'lucide-react';

// Extend UploadedFile to hold processed text
interface ProcessedFile extends UploadedFile {
    processedText?: string;
}

const App: React.FC = () => {
  // --- STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [session, setSession] = useState<StudySession | null>(null);
  const [input, setInput] = useState('');
  
  // Toggles
  const [isVoiceActive, setIsVoiceActive] = useState(false); 
  const [isNarrationOn, setIsNarrationOn] = useState(true); 
  const [isAudioLoading, setIsAudioLoading] = useState(false); 
  
  // New UI State
  const [isMapOpen, setIsMapOpen] = useState(false);

  const [agents, setAgents] = useState<AgentStatus[]>([
    { type: AgentType.HISTORIAN, isActive: false, activityDescription: 'Idle' },
    { type: AgentType.TEACHER, isActive: false, activityDescription: 'Waiting' },
    { type: AgentType.ARCHITECT, isActive: false, activityDescription: 'Idle' },
    { type: AgentType.ILLUSTRATOR, isActive: false, activityDescription: 'Idle' }
  ]);
  const [view, setView] = useState<'study' | 'nexus'>('study');
  
  // Auth State
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); 
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = FirebaseService.subscribeToAuthChanges(async (u) => {
      setUser(u);
      if (u) {
        refreshSessions(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  const refreshSessions = async (uid: string) => {
      const fetched = await FirebaseService.getSessions(uid);
      setSessions(fetched);
      if (fetched.length > 0 && !session) {
          setSession(fetched[0]);
      } else if (fetched.length === 0) {
          const newSess = await FirebaseService.createSession(uid, "Welcome to ScholarFlow");
          setSessions([newSess]);
          setSession(newSess);
      }
  };

  // --- ACTIONS ---

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);
    try {
        if (authMode === 'login') {
            await FirebaseService.login(email, password);
        } else {
            await FirebaseService.signup(email, password, displayName);
        }
    } catch (err: any) {
        setAuthError(err.message.replace('Firebase: ', ''));
    } finally {
        setIsLoading(false);
    }
  };

  const updateAgent = (type: AgentType, isActive: boolean, desc: string) => {
    setAgents(prev => prev.map(a => a.type === type ? { ...a, isActive, activityDescription: desc } : a));
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !session) return;
    const userMsg: Message = { id: Date.now().toString(), role: MessageRole.USER, content: input, timestamp: Date.now() };
    
    // Optimistic Update
    const updatedSession = { ...session, messages: [...session.messages, userMsg] };
    setSession(updatedSession);
    setInput('');
    await FirebaseService.saveMessageToSession(session.id, userMsg);

    // Handshake Loop
    processAgentResponse(updatedSession, input);
  };

  const processAgentResponse = async (currentSession: StudySession, userPrompt: string) => {
    
    // 1. Gather Context (Pre-processed by Historian)
    // We concatenate all processed text from files
    const contextNotes = (currentSession.files as ProcessedFile[])
        .map(f => f.processedText || "")
        .join("\n\n");

    if (contextNotes) {
        updateAgent(AgentType.HISTORIAN, true, 'Supplying Notes');
        await new Promise(r => setTimeout(r, 400)); // Visual feedback only
        updateAgent(AgentType.HISTORIAN, false, 'Idle');
    }

    // 2. Teacher: Generates Response (Fast, using Text Context)
    updateAgent(AgentType.TEACHER, true, 'Reasoning...');
    
    const teacherText = await GeminiService.generateTeacherResponse(
        currentSession.messages.map(m => ({ role: m.role, content: m.content })), 
        userPrompt,
        contextNotes // Passing text instead of files for speed
    );
    
    const teacherMsg: Message = { id: (Date.now() + 1).toString(), role: MessageRole.MODEL, content: teacherText, timestamp: Date.now() };
    const newSessionState = { ...currentSession, messages: [...currentSession.messages, teacherMsg] };
    setSession(newSessionState);
    await FirebaseService.saveMessageToSession(session!.id, teacherMsg);
    updateAgent(AgentType.TEACHER, false, 'Waiting');

    // 2.5 Voice Narration (Web Speech API)
    if (isNarrationOn) {
        setIsAudioLoading(true);
        // Instant non-blocking call
        GeminiService.generateSpeech(teacherText).then(() => {
            setIsAudioLoading(false);
        });
    }

    // 3. Architect: Updates Map (Async, doesn't block UI)
    updateAgent(AgentType.ARCHITECT, true, 'Mapping');
    GeminiService.generateArchitectFlowchart(currentSession.topic, teacherText).then(newMermaid => {
        setSession(prev => prev ? { ...prev, mermaidCode: newMermaid } : null);
        updateAgent(AgentType.ARCHITECT, false, 'Idle');
    });

    // 4. Illustrator: Visualizes Concept (Async)
    updateAgent(AgentType.ILLUSTRATOR, true, 'Visualizing');
    GeminiService.generateIllustration(currentSession.topic, teacherText).then(newImage => {
        setSession(prev => prev ? { ...prev, currentImageUrl: newImage } : null);
        updateAgent(AgentType.ILLUSTRATOR, false, 'Idle');
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    // --- HISTORIAN ACTION ---
    updateAgent(AgentType.HISTORIAN, true, `Reading ${file.name}...`);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const base64Data = evt.target?.result as string;
        
        // 1. Create File Object
        const newFile: ProcessedFile = {
            id: Date.now().toString(),
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.type,
            uploadedAt: Date.now(),
            data: base64Data 
        };

        // 2. Process Immediately (The Historian's Job)
        const extractedText = await GeminiService.processDocumentWithHistorian(newFile);
        newFile.processedText = extractedText;

        const sysMsg: Message = {
            id: Date.now().toString(),
            role: MessageRole.MODEL,
            content: `[System] The Historian has read "${file.name}". Summary added to context memory.`,
            timestamp: Date.now()
        };

        const updatedSession = { 
            ...session, 
            files: [...(session.files || []), newFile],
            messages: [...session.messages, sysMsg]
        };
        
        setSession(updatedSession);
        await FirebaseService.saveFileToSession(session.id, newFile);
        await FirebaseService.saveMessageToSession(session.id, sysMsg);

        updateAgent(AgentType.HISTORIAN, false, 'Knowledge Indexed');
    };
    reader.readAsDataURL(file);
  };

  const toggleVoiceInput = async () => {
    alert("Live Voice Input is currently disabled while upgrading models.");
  };

  // Session Management
  const createNewSession = async () => {
      if(!user) return;
      const topic = prompt("Enter a topic for the new study session:");
      if(topic) {
          const newSess = await FirebaseService.createSession(user.uid, topic);
          setSessions(prev => [newSess, ...prev]);
          setSession(newSess);
      }
  }

  const togglePin = async (sessId: string, currentPin: boolean) => {
      await FirebaseService.updateSessionMeta(sessId, { isPinned: !currentPin });
      if(user) refreshSessions(user.uid);
  }

  const renameSession = async (sessId: string) => {
      const newName = prompt("Rename Session:");
      if(newName) {
          await FirebaseService.updateSessionMeta(sessId, { topic: newName });
          if(user) refreshSessions(user.uid);
      }
  }

  // --- RENDER ---

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-purple-50 to-white">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-scholar-violet/20">
            {/* Branding */}
            <div className="md:w-1/2 bg-gradient-to-br from-scholar-violet to-scholar-darkViolet p-12 text-white flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10">
                    <h1 className="text-5xl font-bold mb-4">ScholarFlow</h1>
                    <p className="text-violet-100 text-xl tracking-wide">Wisdom in Motion.</p>
                </div>
            </div>
            {/* Form */}
            <div className="md:w-1/2 p-12 flex flex-col justify-center">
                 <div className="flex gap-6 mb-8 border-b border-slate-100 pb-2">
                    <button onClick={() => setAuthMode('login')} className={`text-xl font-semibold pb-2 transition-all ${authMode === 'login' ? 'text-scholar-darkViolet border-b-2 border-scholar-darkViolet' : 'text-slate-400'}`}>Login</button>
                    <button onClick={() => setAuthMode('signup')} className={`text-xl font-semibold pb-2 transition-all ${authMode === 'signup' ? 'text-scholar-darkViolet border-b-2 border-scholar-darkViolet' : 'text-slate-400'}`}>Sign Up</button>
                </div>
                <form onSubmit={handleAuth} className="space-y-6">
                    {authError && <div className="p-4 bg-red-50 text-red-600 text-base rounded-lg">{authError}</div>}
                    {authMode === 'signup' && <input type="text" required className="w-full px-5 py-4 rounded-lg bg-slate-50 border text-lg" placeholder="Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
                    <input type="email" required className="w-full px-5 py-4 rounded-lg bg-slate-50 border text-lg" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"} 
                            required 
                            className="w-full px-5 py-4 rounded-lg bg-slate-50 border text-lg pr-12" 
                            placeholder="Password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    <button type="submit" disabled={isLoading} className="w-full bg-scholar-violet hover:bg-scholar-darkViolet text-white font-bold py-5 rounded-xl text-lg">{isLoading ? 'Processing...' : (authMode === 'login' ? 'Enter' : 'Join')}</button>
                </form>
            </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP UI ---
  return (
    <div className="flex h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 text-slate-800 overflow-hidden font-sans">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-72 bg-white/80 backdrop-blur-md border-r border-violet-100 flex flex-col hidden md:flex z-10 shadow-sm">
        <div className="p-6 border-b border-violet-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-scholar-violet to-scholar-blue flex items-center justify-center text-white font-bold shadow-md text-xl">S</div>
            <span className="font-bold text-xl text-slate-700 tracking-tight">ScholarFlow</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-violet-200">
            {/* Sessions List */}
            <div>
                <div className="flex items-center justify-between mb-4 px-2">
                     <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Sessions</h3>
                     <button onClick={createNewSession} className="text-scholar-violet hover:bg-violet-50 rounded-full p-1"><Plus size={18}/></button>
                </div>
                <div className="space-y-2">
                    {sessions.map(s => (
                        <div key={s.id} className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all border ${session?.id === s.id ? 'bg-violet-50 border-violet-200 shadow-sm' : 'hover:bg-white border-transparent'}`} onClick={() => setSession(s)}>
                             <div className="text-scholar-violet">
                                 {s.isPinned ? <Pin size={16} fill="currentColor" /> : <Brain size={18} />}
                             </div>
                             <span className={`flex-1 truncate text-sm font-medium ${session?.id === s.id ? 'text-scholar-darkViolet' : 'text-slate-600'}`}>{s.topic}</span>
                             
                             {/* Hover Actions */}
                             <div className="hidden group-hover:flex items-center gap-1">
                                 <button onClick={(e) => { e.stopPropagation(); togglePin(s.id, !!s.isPinned); }} className="p-1 hover:text-scholar-blue text-slate-400"><Pin size={12}/></button>
                                 <button onClick={(e) => { e.stopPropagation(); renameSession(s.id); }} className="p-1 hover:text-scholar-violet text-slate-400"><Edit2 size={12}/></button>
                             </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Vault */}
            <div className="pt-4 border-t border-violet-100">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Librarian Vault</h3>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.ppt,.pptx,.txt,.png,.jpg,.jpeg" />
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-violet-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-scholar-violet hover:text-scholar-violet hover:bg-violet-50/50 transition-all cursor-pointer group"
                >
                    <Upload size={28} className="mb-2 group-hover:scale-110 transition-transform text-scholar-violet"/>
                    <span className="text-xs text-center font-medium">Upload PDF/Image<br/>(Historian Reads)</span>
                </div>
                <div className="mt-4 space-y-2">
                    {session?.files?.map(file => (
                        <div key={file.id} className="flex items-center gap-3 p-2 rounded bg-white/50 border border-violet-100 text-slate-600 text-sm">
                            <FileText size={16} className="text-scholar-blue"/>
                            <div className="flex-1 overflow-hidden">
                                <p className="truncate font-medium text-sm">{file.name}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* User Footer */}
        <div className="p-6 border-t border-violet-100 bg-violet-50/30">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-scholar-blue to-scholar-mint text-white flex items-center justify-center text-base font-bold shadow-sm">{user.displayName.charAt(0)}</div>
                <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold text-slate-700 truncate">{user.displayName}</p>
                    <button onClick={() => FirebaseService.logout()} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 mt-0.5"><LogOut size={12}/> Sign Out</button>
                </div>
            </div>
        </div>
      </aside>

      {/* CENTER - CHAT OR NEXUS */}
      <main className="flex-1 flex flex-col relative z-0">
        {/* Header */}
        <header className="h-20 bg-white/60 backdrop-blur-md border-b border-violet-100 flex items-center justify-between px-8 shadow-sm">
            <h2 className="font-bold text-slate-700 flex items-center gap-3 text-xl truncate max-w-lg">
                {view === 'nexus' ? <Layout size={24} className="text-scholar-violet"/> : <Book size={24} className="text-scholar-violet"/>}
                {view === 'nexus' ? 'Agent Nexus' : session?.topic}
            </h2>
            <div className="flex items-center gap-4">
                 <button 
                    onClick={() => setIsNarrationOn(!isNarrationOn)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${isNarrationOn ? 'bg-scholar-violet/10 text-scholar-violet' : 'text-slate-400 hover:bg-slate-100'}`}
                    title="Toggle Auto-Narration"
                 >
                    {isAudioLoading ? <Loader2 size={20} className="animate-spin text-scholar-violet"/> : (isNarrationOn ? <Volume2 size={20}/> : <VolumeX size={20}/>)}
                    <span className="hidden sm:inline">{isAudioLoading ? 'Speaking...' : (isNarrationOn ? 'Narration On' : 'Narration Off')}</span>
                 </button>

                <div className="flex bg-slate-100/80 p-1.5 rounded-lg">
                    <button onClick={() => setView('study')} className={`px-6 py-2 text-base font-medium rounded-md transition-all ${view === 'study' ? 'bg-white shadow-sm text-scholar-darkViolet' : 'text-slate-500 hover:text-slate-700'}`}>Study</button>
                    <button onClick={() => setView('nexus')} className={`px-6 py-2 text-base font-medium rounded-md transition-all ${view === 'nexus' ? 'bg-white shadow-sm text-scholar-darkViolet' : 'text-slate-500 hover:text-slate-700'}`}>Nexus</button>
                </div>
            </div>
        </header>

        {view === 'nexus' ? (
            <div className="flex-1 p-10">
                <AgentNexus agents={agents} />
            </div>
        ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-violet-200">
                    {session?.messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-2xl p-6 shadow-sm transition-all ${
                                msg.role === MessageRole.USER 
                                ? 'bg-gradient-to-br from-scholar-violet to-scholar-darkViolet text-white rounded-br-none' 
                                : 'bg-white border border-violet-100 rounded-bl-none text-slate-700'
                            }`}>
                                <p className="text-base md:text-lg leading-8 whitespace-pre-wrap font-medium">{msg.content}</p>
                                <span className={`text-xs mt-3 block opacity-80 ${msg.role === MessageRole.USER ? 'text-violet-200' : 'text-slate-400'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-6 bg-white/80 backdrop-blur border-t border-violet-100">
                    <div className="max-w-4xl mx-auto relative flex items-center gap-4">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ask the Teacher..."
                            className="flex-1 bg-white border border-slate-200 rounded-full px-8 py-5 focus:outline-none focus:ring-2 focus:ring-scholar-violet/50 transition-all shadow-sm text-lg"
                        />
                        <button 
                            onClick={toggleVoiceInput}
                            className={`p-5 rounded-full transition-all shadow-sm ${
                                isVoiceActive ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                            }`}
                        >
                            <Mic size={24} />
                        </button>
                        <button 
                            onClick={handleSendMessage}
                            disabled={!input.trim()}
                            className="p-5 bg-scholar-violet text-white rounded-full hover:bg-scholar-darkViolet disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md transform hover:scale-105"
                        >
                            <Send size={24} />
                        </button>
                    </div>
                    {/* Active Agent Indicator */}
                    <div className="absolute top-[-15px] left-1/2 -translate-x-1/2 flex gap-3 pointer-events-none">
                         {agents.map(a => a.isActive && (
                             <span key={a.type} className="text-xs font-bold bg-scholar-mint/90 text-white px-4 py-1.5 rounded-full shadow-md animate-bounce border border-white">
                                 {a.type}: {a.activityDescription}
                             </span>
                         ))}
                    </div>
                </div>
            </div>
        )}
      </main>

      {/* RIGHT SIDEBAR (Redesigned) */}
      <aside className="w-96 bg-white/80 backdrop-blur border-l border-violet-100 hidden lg:flex flex-col z-10 shadow-sm relative">
        
        {/* Architect Trigger Button */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-[90%]">
             <button 
                onClick={() => setIsMapOpen(true)}
                className="w-full bg-white/90 backdrop-blur shadow-lg border-2 border-scholar-blue/20 hover:border-scholar-blue text-scholar-blue font-bold py-3 px-4 rounded-xl flex items-center justify-between transition-all hover:scale-[1.02] group"
             >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-scholar-blue/10 rounded-lg group-hover:bg-scholar-blue group-hover:text-white transition-colors">
                        <Layout size={20} />
                    </div>
                    <span>View Knowledge Map</span>
                </div>
                {agents.find(a => a.type === AgentType.ARCHITECT)?.isActive && <div className="w-3 h-3 bg-scholar-blue rounded-full animate-ping"/>}
             </button>
        </div>

        {/* Illustrator Section (Fills Sidebar) */}
        <div className="flex-1 flex flex-col pt-24 pb-6 px-6 overflow-hidden bg-gradient-to-b from-white to-slate-50">
            <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon size={14} className="text-scholar-mint"/> The Illustrator
                </span>
                {agents.find(a => a.type === AgentType.ILLUSTRATOR)?.isActive && <div className="w-2 h-2 bg-scholar-mint rounded-full animate-ping"/>}
            </div>
            
            <div className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm relative">
                {session?.currentImageUrl ? (
                    <img src={session.currentImageUrl} alt="Concept Art" className="w-full h-full object-cover" />
                ) : (
                    <div className="text-slate-300 flex flex-col items-center gap-3 p-8 text-center">
                        <ImageIcon size={48} strokeWidth={1}/>
                        <span className="text-sm">Concepts visualized here</span>
                    </div>
                )}
            </div>
        </div>
      </aside>

      {/* ARCHITECT MAP MODAL */}
      {isMapOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-8 animate-fade-in">
              <div className="bg-white w-full max-w-6xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-scale-up">
                  {/* Modal Header */}
                  <div className="h-16 border-b border-slate-100 flex items-center justify-between px-8 bg-slate-50/50">
                      <div className="flex items-center gap-3">
                          <Layout size={24} className="text-scholar-blue" />
                          <h3 className="text-xl font-bold text-slate-700">Knowledge Architecture</h3>
                      </div>
                      <button 
                        onClick={() => setIsMapOpen(false)}
                        className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full text-slate-400 transition-colors"
                      >
                          <X size={28} />
                      </button>
                  </div>
                  
                  {/* Map Content */}
                  <div className="flex-1 p-8 bg-slate-50/30">
                        {session?.mermaidCode ? (
                            <MermaidDiagram code={session.mermaidCode} />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                                <Layout size={64} className="opacity-20"/>
                                <span className="text-lg">Waiting for structure...</span>
                            </div>
                        )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;