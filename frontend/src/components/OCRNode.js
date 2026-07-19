import { Handle, Position } from "reactflow";
import { ScanText, Sparkles } from "lucide-react";

export default function OCRNode({ data, selected, id }) {
  return (
    <div
      data-testid={`canvas-node-${id}`}
      className={`bg-neutral-900 border ${selected ? "border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.4)]" : "border-neutral-700 shadow-md"} rounded-xl min-w-[200px] overflow-hidden transition-all relative`}
      style={{ direction: "rtl" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-teal-900/40 to-transparent pointer-events-none" />
      
      <Handle type="target" position={Position.Left} className="bg-teal-400 border-neutral-900" />
      <div className="h-1 bg-gradient-to-r from-teal-500 to-cyan-500" />
      <div className="px-3 py-2.5 relative z-10">
        <div className="flex items-center gap-2 text-[10px] text-teal-300 mono uppercase mb-1">
          <ScanText className="w-3 h-3 text-teal-400" />
          پردازش سند / OCR
        </div>
        <div className="text-sm font-medium text-white leading-5">{data.label}</div>
        <div className="text-[10px] text-neutral-400 mt-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-yellow-400" />
          استخراج خودکار
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="bg-teal-400 border-neutral-900" />
    </div>
  );
}
