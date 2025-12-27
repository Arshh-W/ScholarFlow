import { User, StudySession, Message, UploadedFile } from '../types';

// --- CONFIGURATION ---
// Mock Storage Keys
const STORAGE_KEYS = {
  USERS: 'scholarflow_mock_users',
  SESSIONS: 'scholarflow_mock_sessions',
  CURRENT_USER: 'scholarflow_mock_auth'
};

// Helper to simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- AUTH SERVICES ---

export const login = async (email: string, pass: string): Promise<User> => {
  await delay(800);
  
  // For demo purposes, if the user exists in local storage, log them in.
  // We don't really hash passwords in this mock.
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  const foundUser = users.find((u: any) => u.email === email);

  if (foundUser) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(foundUser));
    notifyAuthListeners(foundUser);
    return foundUser;
  }
  
  // If not found, throw error to simulate auth failure
  throw new Error("User not found. Please Sign Up.");
};

export const signup = async (email: string, pass: string, name: string): Promise<User> => {
  await delay(800);
  
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  
  if (users.find((u: any) => u.email === email)) {
    throw new Error("Email already in use.");
  }

  const newUser: User = {
    uid: 'user_' + Date.now().toString(36),
    displayName: name,
    email: email
  };
  
  users.push(newUser);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  
  // Auto login after signup
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(newUser));
  notifyAuthListeners(newUser);
  
  return newUser;
};

export const logout = async (): Promise<void> => {
  await delay(400);
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  notifyAuthListeners(null);
};

// Observer for Auth State
let authObservers: ((user: User | null) => void)[] = [];

const notifyAuthListeners = (user: User | null) => {
  authObservers.forEach(cb => cb(user));
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  authObservers.push(callback);
  
  // Check initial state
  const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (savedUser) {
    try {
      callback(JSON.parse(savedUser));
    } catch (e) {
      callback(null);
    }
  } else {
    callback(null);
  }

  // Unsubscribe function
  return () => {
    authObservers = authObservers.filter(cb => cb !== callback);
  };
};

// --- DATA SERVICES (MOCK) ---

export const getSessions = async (userId: string): Promise<StudySession[]> => {
  await delay(600);
  const allSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
  const userSessions = allSessions.filter((s: any) => s.userId === userId);
  
  return userSessions.sort((a: StudySession, b: StudySession) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.id.localeCompare(a.id);
  });
};

export const createSession = async (userId: string, topic: string): Promise<StudySession> => {
  await delay(500);
  
  const newSession: StudySession & { userId: string, createdAt: number } = {
    id: 'sess_' + Date.now().toString(36),
    topic,
    messages: [],
    mermaidCode: `graph TB\nA[${topic}] --> B[Waiting for Context...]`,
    files: [],
    isPinned: false,
    userId,
    createdAt: Date.now()
  };

  const allSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
  allSessions.push(newSession);
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(allSessions));

  return newSession;
};

export const updateSessionMeta = async (sessionId: string, updates: Partial<StudySession>): Promise<void> => {
  await delay(300);
  const allSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
  const index = allSessions.findIndex((s: any) => s.id === sessionId);
  
  if (index !== -1) {
    allSessions[index] = { ...allSessions[index], ...updates };
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(allSessions));
  }
};

export const saveMessageToSession = async (sessionId: string, message: Message): Promise<void> => {
  // Fire and forget, fast
  const allSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
  const index = allSessions.findIndex((s: any) => s.id === sessionId);
  
  if (index !== -1) {
    if (!allSessions[index].messages) allSessions[index].messages = [];
    
    // Ensure message is serializable and valid
    allSessions[index].messages.push(message);
    
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(allSessions));
  }
};

export const saveFileToSession = async (sessionId: string, fileData: UploadedFile): Promise<void> => {
  await delay(400);
  const allSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
  const index = allSessions.findIndex((s: any) => s.id === sessionId);
  
  if (index !== -1) {
    if (!allSessions[index].files) allSessions[index].files = [];
    
    // Create a safe copy
    const fileToStore = { ...fileData };
    
    // Mock Limitation: Avoid storing massive base64 strings in localStorage to prevent crashing the demo
    if (fileToStore.data && fileToStore.data.length > 200000) {
        console.warn("[MockService] File data too large for localStorage, stripping data content for persistence.");
        fileToStore.data = undefined; 
        // Note: In a real app with Firebase Storage or S3, this wouldn't be an issue.
        // The app state still holds the data for the current session, so RAG works until reload.
    }
    
    allSessions[index].files.push(fileToStore);
    
    try {
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(allSessions));
    } catch (e) {
        console.error("LocalStorage Quota Exceeded", e);
    }
  }
};

// Compatibility exports
export const mockSignIn = async () => { console.warn("Use login() instead"); return null; };
export const mockSignOut = logout;