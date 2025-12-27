export enum AgentType {
  TEACHER = 'Teacher',
  HISTORIAN = 'Historian',
  ARCHITECT = 'Architect',
  ILLUSTRATOR = 'Illustrator'
}

export enum MessageRole {
  USER = 'user',
  MODEL = 'model'
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: number;
  data?: string; // Base64 string for RAG context
}

export interface StudySession {
  id: string;
  topic: string;
  messages: Message[];
  mermaidCode: string;
  currentImageUrl?: string;
  files: UploadedFile[];
  isPinned?: boolean;
}

export interface AgentStatus {
  type: AgentType;
  isActive: boolean;
  activityDescription: string;
}

// For Mermaid integration and AudioContext
declare global {
  interface Window {
    mermaid: any;
    webkitAudioContext: typeof AudioContext;
  }
}