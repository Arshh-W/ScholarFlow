import React, { useEffect, useRef } from 'react';

interface MermaidDiagramProps {
  code: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.mermaid && ref.current) {
      // Configuration for better fitting
      window.mermaid.initialize({ 
          startOnLoad: true, 
          theme: 'neutral',
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
      });
      
      try {
        window.mermaid.render(`mermaid-${Date.now()}`, code).then((result: any) => {
            if(ref.current) {
                ref.current.innerHTML = result.svg;
                // Force SVG to scale nicely
                const svg = ref.current.querySelector('svg');
                if (svg) {
                    svg.style.width = '100%';
                    svg.style.height = '100%';
                    svg.style.maxWidth = '100%';
                }
            }
        });
      } catch (error) {
        console.error("Mermaid Render Error", error);
        if(ref.current) ref.current.innerHTML = "<div class='text-red-400 text-sm'>Map construction failed. Retrying...</div>";
      }
    }
  }, [code]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm rounded-lg p-2 border border-scholar-violet/20 overflow-hidden">
      <div ref={ref} className="w-full h-full flex items-center justify-center p-2" />
    </div>
  );
};

export default MermaidDiagram;