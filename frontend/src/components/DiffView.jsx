import React from 'react';
import * as Diff from 'diff';

const DiffView = ({ oldCode = '', newCode = '' }) => {
  if (oldCode === undefined || newCode === undefined) return null;

  // 1. Line-level diff
  const lineDiff = Diff.diffLines(oldCode, newCode);

  let oldLineNum = 1;
  let newLineNum = 1;

  const rows = [];
  
  for (let i = 0; i < lineDiff.length; i++) {
    const part = lineDiff[i];
    const nextPart = lineDiff[i + 1];

    // If we have a deletion followed immediately by an addition, it's a "replacement"
    if (part.removed && nextPart && nextPart.added) {
      const removedLines = part.value.split('\n');
      if (removedLines[removedLines.length - 1] === '') removedLines.pop();
      
      const addedLines = nextPart.value.split('\n');
      if (addedLines[addedLines.length - 1] === '') addedLines.pop();
      
      const maxLines = Math.max(removedLines.length, addedLines.length);
      
      for (let j = 0; j < maxLines; j++) {
        const oldL = removedLines[j];
        const newL = addedLines[j];
        
        // Show line-level diff (word level) if both exist for better visualization of inline changes
        const wordDiff = (oldL !== undefined && newL !== undefined) ? Diff.diffWordsWithSpace(oldL, newL) : null;

        rows.push({
          type: 'change',
          oldLine: oldL,
          newLine: newL,
          oldNum: oldL !== undefined ? oldLineNum++ : null,
          newNum: newL !== undefined ? newLineNum++ : null,
          wordDiff
        });
      }
      i++; // Skip the next part (the addition)
    } else if (part.removed) {
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      lines.forEach(line => {
        rows.push({
          type: 'removed',
          oldLine: line,
          oldNum: oldLineNum++,
          newNum: null
        });
      });
    } else if (part.added) {
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      lines.forEach(line => {
        rows.push({
          type: 'added',
          newLine: line,
          oldNum: null,
          newNum: newLineNum++
        });
      });
    } else {
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      lines.forEach(line => {
        rows.push({
          type: 'unchanged',
          oldLine: line,
          newLine: line,
          oldNum: oldLineNum++,
          newNum: newLineNum++
        });
      });
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-800 font-mono text-[10px] sm:text-[12px] leading-relaxed shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-800 select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500/30" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/30" />
            <div className="w-2 h-2 rounded-full bg-green-500/30" />
          </div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-2">Diff View</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded bg-red-500/40" />
            <span className="text-[9px] text-slate-500 uppercase tracking-tight">Removed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded bg-green-500/40" />
            <span className="text-[9px] text-slate-500 uppercase tracking-tight">Added</span>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, i) => (
              <React.Fragment key={i}>
                {row.type === 'change' ? (
                  <>
                    {row.oldLine !== undefined && (
                      <tr className="bg-red-500/10 hover:bg-red-500/20 transition-colors group">
                        <td className="w-8 sm:w-10 select-none text-right pr-2 text-red-500/40 border-r border-red-500/20 bg-red-500/5 font-mono group-hover:text-red-500/60 transition-colors">
                          {row.oldNum}
                        </td>
                        <td className="w-8 sm:w-10 select-none text-right pr-2 border-r border-slate-800/50 bg-slate-900/40" />
                        <td className="px-3 whitespace-pre group-hover:text-red-100 transition-colors">
                          <span className="mr-2 select-none text-red-500/50 font-bold">-</span>
                          {row.wordDiff ? (
                            row.wordDiff.map((word, idx) => (
                              <span 
                                key={idx} 
                                className={word.removed ? "bg-red-500/40 text-red-50 px-0.5 rounded shadow-sm border border-red-500/20" : "text-red-200/70"}
                              >
                                {word.removed || (!word.added && !word.removed) ? word.value : ""}
                              </span>
                            ))
                          ) : <span className="text-red-200/70">{row.oldLine}</span>}
                        </td>
                      </tr>
                    )}
                    {row.newLine !== undefined && (
                      <tr className="bg-green-500/10 hover:bg-green-500/20 transition-colors group">
                        <td className="w-8 sm:w-10 select-none text-right pr-2 border-r border-slate-800/50 bg-slate-900/40" />
                        <td className="w-8 sm:w-10 select-none text-right pr-2 text-green-500/40 border-r border-green-500/20 bg-green-500/5 font-mono group-hover:text-green-500/60 transition-colors">
                          {row.newNum}
                        </td>
                        <td className="px-3 whitespace-pre group-hover:text-green-100 transition-colors">
                          <span className="mr-2 select-none text-green-500/50 font-bold">+</span>
                          {row.wordDiff ? (
                            row.wordDiff.map((word, idx) => (
                              <span 
                                key={idx} 
                                className={word.added ? "bg-green-500/40 text-green-50 px-0.5 rounded shadow-sm border border-green-500/20" : "text-green-200/70"}
                              >
                                {word.added || (!word.added && !word.removed) ? word.value : ""}
                              </span>
                            ))
                          ) : <span className="text-green-200/70">{row.newLine}</span>}
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  <tr className={`
                    ${row.type === 'removed' ? 'bg-red-500/5 hover:bg-red-500/10 text-red-300/60' : 
                      row.type === 'added' ? 'bg-green-500/5 hover:bg-green-500/10 text-green-300/60' : 
                      'hover:bg-slate-800/30 text-slate-500 opacity-80'} 
                    transition-colors group
                  `}>
                    <td className={`w-8 sm:w-10 select-none text-right pr-2 font-mono border-r transition-colors ${
                      row.type === 'removed' ? 'text-red-500/30 border-red-500/20 bg-red-500/5 group-hover:text-red-500/50' : 
                      'text-slate-700 border-slate-800/50 bg-slate-900/40 group-hover:text-slate-500'
                    }`}>
                      {row.oldNum}
                    </td>
                    <td className={`w-8 sm:w-10 select-none text-right pr-2 font-mono border-r transition-colors ${
                      row.type === 'added' ? 'text-green-500/30 border-green-500/20 bg-green-500/5 group-hover:text-green-500/50' : 
                      'text-slate-700 border-slate-800/50 bg-slate-900/40 group-hover:text-slate-500'
                    }`}>
                      {row.newNum}
                    </td>
                    <td className="px-3 whitespace-pre group-hover:text-slate-200 transition-colors">
                      <span className={`mr-2 select-none font-bold ${
                        row.type === 'removed' ? 'text-red-500/40' : 
                        row.type === 'added' ? 'text-green-500/40' : 
                        'text-slate-800 opacity-20'
                      }`}>
                        {row.type === 'removed' ? '-' : row.type === 'added' ? '+' : ' '}
                      </span>
                      {row.oldLine || row.newLine}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DiffView;
