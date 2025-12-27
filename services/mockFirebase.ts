import { User, StudySession, Message, MessageRole, UploadedFile } from '../types';

// Mock storage keys
const USERS_KEY = 'scholarflow_users';
const SESSIONS_KEY = 'scholarflow_sessions';
const CURRENT_USER_KEY = 'scholarflow_current_user';

// Helpers for localStorage interaction
const getStorage = (key: string) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : [];
  } catch {
    return [];
  }
};

const setStorage = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Auth State simulation
let currentUser: User | null = null;
const authListeners: ((user: User | null) => void)[] = [];

// Initialize from local storage if 'remembered'
try {
    const saved = localStorage.getItem(CURRENT_USER_KEY);
    if (saved) {
        currentUser = JSON.parse(saved);
    }
} catch {}

const notifyAuthListeners = () => {
  authListeners.forEach(l => l(currentUser));
};

// AUTH SERVICES

export const login = async (email: string, pass: string): Promise<User> => {
  const users = getStorage(USERS_KEY);
  const user = users.find((u: any) => u.email === email && u.password === pass);
  
  if (!user) {
    throw new Error("Invalid credentials. Please sign up if you don't have an account.");
  }
  
  const appUser: User = {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email
  };
  
  currentUser = appUser;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  notifyAuthListeners();
  return appUser;
};

export const signup = async (email: string, pass: string, name: string): Promise<User> => {
  const users = getStorage(USERS_KEY);
  if (users.find((u: any) => u.email === email)) {
    throw new Error("User already exists");
  }
  
  const newUser = {
    uid: 'user-' + Date.now(),
    email,
    password: pass,
    displayName: name
  };
  
  users.push(newUser);
  setStorage(USERS_KEY, users);
  
  const appUser: User = {
    uid: newUser.uid,
    displayName: newUser.displayName,
    email: newUser.email
  };
  
  currentUser = appUser;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  notifyAuthListeners();
  return appUser;
};

export const logout = async (): Promise<void> => {
  currentUser = null;
  localStorage.removeItem(CURRENT_USER_KEY);
  notifyAuthListeners();
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  authListeners.push(callback);
  callback(currentUser);
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx > -1) authListeners.splice(idx, 1);
  };
};

// DATA SERVICES

export const getSessions = async (userId: string): Promise<StudySession[]> => {
  const allSessions = getStorage(SESSIONS_KEY);
  const userSessions = allSessions.filter((s: any) => s.userId === userId);
  
  if (userSessions.length === 0) {
      return [{
        id: 'demo-1',
        topic: 'Introduction to ScholarFlow',
        messages: [{
           id: '1', 
           role: MessageRole.MODEL, 
           content: 'Welcome! I am your AI Faculty. Upload a PDF to the Librarian Vault or ask me a question to begin.', 
           timestamp: Date.now() 
        }],
        mermaidCode: `graph TD\nA[Start] --> B[Upload Content]\nA --> C[Ask Question]\nstyle A fill:#a78bfa`,
        files: [],
        isPinned: false
      }];
  }
  
  return userSessions.sort((a: StudySession, b: StudySession) => {
      // Sort: Pinned first, then by recency (simulated by ID for now or could add lastActive)
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
  });
};

export const createSession = async (userId: string, topic: string): Promise<StudySession> => {
  const newSession = {
    id: 'sess-' + Date.now(),
    userId,
    topic,
    messages: [],
    mermaidCode: `graph TD\nA[${topic}] --> B[Waiting for Context...]`,
    files: [],
    isPinned: false
  };
  
  const allSessions = getStorage(SESSIONS_KEY);
  allSessions.push(newSession);
  setStorage(SESSIONS_KEY, allSessions);
  
  const { userId: _, ...sessionData } = newSession;
  return sessionData as unknown as StudySession;
};

export const updateSessionMeta = async (sessionId: string, updates: Partial<StudySession>): Promise<void> => {
    const allSessions = getStorage(SESSIONS_KEY);
    const index = allSessions.findIndex((s: any) => s.id === sessionId);
    if(index > -1) {
        allSessions[index] = { ...allSessions[index], ...updates };
        setStorage(SESSIONS_KEY, allSessions);
    }
}

export const saveMessageToSession = async (sessionId: string, message: Message): Promise<void> => {
  const allSessions = getStorage(SESSIONS_KEY);
  const sessionIndex = allSessions.findIndex((s: any) => s.id === sessionId);
  
  if (sessionIndex > -1) {
    if (!allSessions[sessionIndex].messages) allSessions[sessionIndex].messages = [];
    allSessions[sessionIndex].messages.push(message);
    setStorage(SESSIONS_KEY, allSessions);
  }
};

export const saveFileToSession = async (sessionId: string, fileData: UploadedFile): Promise<void> => {
  const allSessions = getStorage(SESSIONS_KEY);
  const sessionIndex = allSessions.findIndex((s: any) => s.id === sessionId);
  
  if (sessionIndex > -1) {
     if (!allSessions[sessionIndex].files) allSessions[sessionIndex].files = [];
    allSessions[sessionIndex].files.push(fileData);
    setStorage(SESSIONS_KEY, allSessions);
  }
};

// Compatibility exports
export const mockSignIn = async () => { console.warn("Use login() instead"); return null; };
export const mockSignOut = logout;