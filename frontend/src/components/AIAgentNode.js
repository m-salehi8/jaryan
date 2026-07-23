import { Handle, Position } from "reactflow";
import { Bot, Sparkles } from "lucide-react";

export default function AIAgentNode({ data, selected, id }) {
  return (
    <div
      data-testid={`canvas-node-${id}`}
      className={`bg-primary border ${selected ? "border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]" : "border-neutral-700 shadow-md"} rounded-xl min-w-[200px] overflow-hidden transition-all relative`}
      style={{ direction: "rtl" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-transparent pointer-events-none" />
      
      <Handle type="target" position={Position.Left} className="bg-purple-400 border-neutral-900" />
      <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
      <div className="px-3 py-2.5 relative z-10">
        <div className="flex items-center gap-2 text-[10px] text-purple-300 mono uppercase mb-1">
          <Bot className="w-3 h-3 text-purple-400" />
          نماینده هوش مصنوعی
        </div>
        <div className="text-sm font-medium text-white leading-5">{data.label}</div>
        <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-yellow-400" />
          اجرای خودکار
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="bg-purple-400 border-neutral-900" />
    </div>
  );
}
