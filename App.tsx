import React, { useState, useEffect, useRef } from 'react';
import { User, Message, MessageRole, StudySession, AgentType, AgentStatus, UploadedFile } from './types';
import * as FirebaseService from './services/mockFirebase';
import * as GeminiService from './services/geminiService';
import MermaidDiagram from './components/MermaidDiagram';
import AgentNexus from './components/AgentNexus';
import { Send, Mic, Upload, LogOut, Book, Image as ImageIcon, Layout, FileText, Plus, X, Brain, Volume2, VolumeX, Pin, Edit2, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // --- STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [session, setSession] = useState<StudySession | null>(null);
  const [input, setInput] = useState('');
  
  // Toggles
  const [isVoiceActive, setIsVoiceActive] = useState(false); // Live Mic Input
  const [isNarrationOn, setIsNarrationOn] = useState(true); // TTS Output
  const [isAudioLoading, setIsAudioLoading] = useState(false); // TTS Loading State

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
  const [showPassword, setShowPassword] = useState(false); // Toggle visibility
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNextStartTimeRef = useRef<number>(0); 
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
    // 1. Historian: Check for files (using 3.0 Pro context)
    if (currentSession.files.length > 0) {
        updateAgent(AgentType.HISTORIAN, true, 'Retrieving Vault');
        await new Promise(r => setTimeout(r, 600)); 
        updateAgent(AgentType.HISTORIAN, false, 'Context Supplied');
    }

    // 2. Teacher: Generates Response (With RAG Context)
    updateAgent(AgentType.TEACHER, true, 'Reasoning...');
    
    const teacherText = await GeminiService.generateTeacherResponse(
        currentSession.messages.map(m => ({ role: m.role, content: m.content })), 
        userPrompt,
        currentSession.files // Pass Files for RAG
    );
    
    const teacherMsg: Message = { id: (Date.now() + 1).toString(), role: MessageRole.MODEL, content: teacherText, timestamp: Date.now() };
    const newSessionState = { ...currentSession, messages: [...currentSession.messages, teacherMsg] };
    setSession(newSessionState);
    await FirebaseService.saveMessageToSession(session!.id, teacherMsg);
    updateAgent(AgentType.TEACHER, false, 'Waiting');

    // 2.5 Voice Narration (TTS) - Native Audio
    if (isNarrationOn) {
        setIsAudioLoading(true);
        try {
            const audioBuffer = await GeminiService.generateSpeech(teacherText);
            setIsAudioLoading(false);
            
            if (audioBuffer && audioBuffer.byteLength > 0) {
                 if(!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 24000});
                 }
                 const ctx = audioContextRef.current;
                 // Ensure context is running (sometimes suspended by browser)
                 if (ctx.state === 'suspended') {
                    await ctx.resume();
                 }

                 const decoded = await ctx.decodeAudioData(audioBuffer);
                 const source = ctx.createBufferSource();
                 source.buffer = decoded;
                 source.connect(ctx.destination);
                 source.start(0); // Start immediately
            }
        } catch (e) {
            console.error("Narration Failed", e);
            setIsAudioLoading(false);
        }
    }

    // 3. Architect: Updates Map
    updateAgent(AgentType.ARCHITECT, true, 'Mapping Concepts');
    const newMermaid = await GeminiService.generateArchitectFlowchart(currentSession.topic, teacherText);
    setSession(prev => prev ? { ...prev, mermaidCode: newMermaid } : null);
    updateAgent(AgentType.ARCHITECT, false, 'Map Updated');

    // 4. Illustrator: Visualizes Concept (Nano Banana)
    updateAgent(AgentType.ILLUSTRATOR, true, 'Visualizing');
    const newImage = await GeminiService.generateIllustration(currentSession.topic, teacherText);
    setSession(prev => prev ? { ...prev, currentImageUrl: newImage } : null);
    updateAgent(AgentType.ILLUSTRATOR, false, 'Visualized');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    updateAgent(AgentType.HISTORIAN, true, `Absorbing ${file.name}...`);
    
    // Read file as Base64 for RAG
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const base64Data = evt.target?.result as string;
        
        const newFile: UploadedFile = {
            id: Date.now().toString(),
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.type,
            uploadedAt: Date.now(),
            data: base64Data // Stored for Context
        };

        const sysMsg: Message = {
            id: Date.now().toString(),
            role: MessageRole.MODEL,
            content: `[System] The Historian has added "${file.name}" to the context window (1M Tokens). I can now analyze it deeply.`,
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

        updateAgent(AgentType.HISTORIAN, false, 'Knowledge Updated');
    };
    reader.readAsDataURL(file);
  };

  const toggleVoiceInput = async () => {
    if (isVoiceActive) {
      setIsVoiceActive(false);
      window.location.reload(); 
    } else {
      setIsVoiceActive(true);
      if(!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 24000});
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      // Reset scheduling
      audioNextStartTimeRef.current = ctx.currentTime;
      
      await GeminiService.connectLiveSession(async (audioData) => {
          if(audioContextRef.current) {
            const buffer = await GeminiService.decodeAudioData(audioData, audioContextRef.current);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            
            const currentTime = audioContextRef.current.currentTime;
            if (audioNextStartTimeRef.current < currentTime) {
                audioNextStartTimeRef.current = currentTime;
            }
            
            source.start(audioNextStartTimeRef.current);
            audioNextStartTimeRef.current += buffer.duration;
          }
      }, () => setIsVoiceActive(false));
    }
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
                    <span className="text-xs text-center font-medium">Upload PDF/Image<br/>(RAG Context)</span>
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
                    <span className="hidden sm:inline">{isAudioLoading ? 'Generating...' : (isNarrationOn ? 'Narration On' : 'Narration Off')}</span>
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

      {/* RIGHT SIDEBAR (Architect & Illustrator) */}
      <aside className="w-96 bg-white/80 backdrop-blur border-l border-violet-100 hidden lg:flex flex-col z-10 shadow-sm">
        {/* Architect Section */}
        <div className="h-1/2 border-b border-violet-100 flex flex-col overflow-hidden">
            <div className="p-4 bg-violet-50/50 border-b border-violet-100 flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-3">
                    <Layout size={18} className="text-scholar-blue"/> The Architect
                </span>
                {agents.find(a => a.type === AgentType.ARCHITECT)?.isActive && <div className="w-3 h-3 bg-scholar-blue rounded-full animate-ping"/>}
            </div>
            <div className="flex-1 p-2 relative overflow-hidden">
                {session?.mermaidCode ? (
                    <MermaidDiagram code={session.mermaidCode} />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-base gap-3">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                            <Layout size={28} className="opacity-30"/>
                        </div>
                        <span className="opacity-60">Awaiting Structure</span>
                    </div>
                )}
            </div>
        </div>

        {/* Illustrator Section */}
        <div className="h-1/2 flex flex-col overflow-hidden">
            <div className="p-4 bg-violet-50/50 border-b border-violet-100 flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-3">
                    <ImageIcon size={18} className="text-scholar-mint"/> The Illustrator
                </span>
                {agents.find(a => a.type === AgentType.ILLUSTRATOR)?.isActive && <div className="w-3 h-3 bg-scholar-mint rounded-full animate-ping"/>}
            </div>
            <div className="flex-1 p-6 flex items-center justify-center overflow-auto">
                {session?.currentImageUrl ? (
                    <div className="relative group rounded-xl overflow-hidden shadow-md border border-slate-100 w-full">
                        <img src={session.currentImageUrl} alt="Concept Art" className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" />
                    </div>
                ) : (
                    <div className="text-slate-400 text-base text-center flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                             <ImageIcon size={28} className="opacity-30"/>
                        </div>
                        <span className="opacity-60">Visualizing Concept...</span>
                    </div>
                )}
            </div>
        </div>
      </aside>
    </div>
  );
};

export default App;