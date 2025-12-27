import React from 'react';
import { AgentStatus, AgentType } from '../types';
import { Brain, BookOpen, PenTool, Mic } from 'lucide-react';

interface AgentNexusProps {
  agents: AgentStatus[];
}

const AgentNode: React.FC<{ status: AgentStatus; icon: React.ReactNode; color: string; position: string }> = ({ status, icon, color, position }) => {
    return (
        <div className={`absolute ${position} flex flex-col items-center transition-all duration-500`}>
            <div className={`
                w-20 h-20 rounded-full flex items-center justify-center shadow-lg
                ${status.isActive ? `ring-4 ring-offset-2 ring-${color} animate-pulse` : 'opacity-70 grayscale'}
                bg-white border-2 border-${color}
            `}>
                <div className={`text-${color}`}>
                    {icon}
                </div>
            </div>
            <span className="mt-3 text-sm font-bold text-slate-600 uppercase tracking-wider">{status.type}</span>
            {status.isActive && (
                <span className="text-xs text-slate-500 bg-white px-3 py-1 rounded-full shadow-sm mt-2 animate-bounce">
                    {status.activityDescription}
                </span>
            )}
        </div>
    );
};

const AgentNexus: React.FC<AgentNexusProps> = ({ agents }) => {
  const getStatus = (type: AgentType) => agents.find(a => a.type === type) || { type, isActive: false, activityDescription: '' };

  return (
    <div className="relative w-full h-full min-h-[400px] bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-inner border border-indigo-100 overflow-hidden">
        {/* Connecting Lines (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
            <line x1="50%" y1="20%" x2="50%" y2="50%" stroke="#a78bfa" strokeWidth="6" /> {/* Historian to Teacher */}
            <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="#3b82f6" strokeWidth="6" /> {/* Teacher to Architect */}
            <line x1="50%" y1="50%" x2="80%" y2="80%" stroke="#34d399" strokeWidth="6" /> {/* Teacher to Illustrator */}
            <circle cx="50%" cy="50%" r="50" fill="#f8fafc" stroke="#a78bfa" strokeWidth="3" />
        </svg>

        {/* Historian (Top) */}
        <AgentNode 
            status={getStatus(AgentType.HISTORIAN)} 
            icon={<BookOpen size={28} />} 
            color="scholar-violet" 
            position="top-12 left-1/2 -translate-x-1/2" 
        />

        {/* Teacher (Center) */}
        <AgentNode 
            status={getStatus(AgentType.TEACHER)} 
            icon={<Brain size={40} />} 
            color="scholar-violet" 
            position="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
        />

        {/* Architect (Bottom Left) */}
        <AgentNode 
            status={getStatus(AgentType.ARCHITECT)} 
            icon={<PenTool size={28} />} 
            color="scholar-blue" 
            position="bottom-12 left-[20%]" 
        />

        {/* Illustrator (Bottom Right) */}
        <AgentNode 
            status={getStatus(AgentType.ILLUSTRATOR)} 
            icon={<Mic size={28} />} 
            color="scholar-mint" 
            position="bottom-12 right-[20%]" 
        />
    </div>
  );
};

export default AgentNexus;