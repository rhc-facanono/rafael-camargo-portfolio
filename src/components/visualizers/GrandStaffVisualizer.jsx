import React from 'react';
import { useTuning } from '../../context/TuningContext';

export default function GrandStaffVisualizer({ notes = [], isSequence = false, isMicrotonal = false, onKeyClick = null }) {
    const { accidentalModifier } = useTuning();

    const xMultiplier = isSequence ? 40 : 14;
    const svgWidth = Math.max(800, 60 + notes.length * xMultiplier + 100);
    const svgHeight = 300, lineSpacing = 10, baseY = 150;

    const handleSvgClick = (e) => {
        if (!onKeyClick || !(e.ctrlKey || e.metaKey)) return;
        const rect = e.currentTarget.getBoundingClientRect();

        // Calcula a linha/espaço clicado
        const step = Math.round((baseY - (e.clientY - rect.top)) / (lineSpacing / 2));
        const oct = Math.floor(step / 7) + 4;
        const pcStep = ((step % 7) + 7) % 7;
        const diatonicToMidi = [0, 2, 4, 5, 7, 9, 11];

        // Calcula o MIDI base da linha e adiciona o modificador (Sustenido, Bemol, Quarto-de-tom)
        const finalMidi = (oct + 1) * 12 + diatonicToMidi[pcStep] + accidentalModifier;
        onKeyClick(finalMidi);
    };

    const getDiatonicInfo = (midi) => {
        const pc = Math.round(midi) % 12, oct = Math.floor(midi / 12) - 1;
        const diatonicMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
        const accidentalMap = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];
        // Se a nota tiver decimais (microtom), força a visualização do '+' 
        return { step: diatonicMap[pc] + (oct - 4) * 7, acc: (midi % 1 !== 0) ? '+' : accidentalMap[pc] };
    };

    return (
        <div className="flex w-full h-full bg-[#f8f9fa] border border-gray-700 rounded overflow-hidden relative shadow-inner">
            <div className="w-[60px] flex-shrink-0 bg-[#f8f9fa] border-r border-gray-300 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                <svg width="60" height={svgHeight} className="w-full h-full">
                    {[100, 110, 120, 130, 140, 160, 170, 180, 190, 200].map(y => <line key={`fix-${y}`} x1="0" y1={y} x2="100%" y2={y} stroke="#333" strokeWidth="1" />)}
                    <text x="15" y="135" fontSize="40" fontFamily="serif" fill="#222" fontWeight="bold">𝄞</text>
                    <text x="15" y="195" fontSize="40" fontFamily="serif" fill="#222" fontWeight="bold">𝄢</text>
                </svg>
            </div>
            <div className="flex-1 min-w-0 overflow-auto custom-scrollbar" style={{ cursor: onKeyClick ? 'crosshair' : 'default' }}>
                <svg width={svgWidth} height={svgHeight} style={{ minWidth: `${svgWidth}px`, display: 'block' }} onPointerDown={handleSvgClick}>
                    {[100, 110, 120, 130, 140, 160, 170, 180, 190, 200].map(y => <line key={`line-${y}`} x1="0" y1={y} x2="100%" y2={y} stroke="#333" strokeWidth="1" />)}
                    {notes.map((midi, idx) => {
                        const info = getDiatonicInfo(midi), y = baseY - (info.step * (lineSpacing / 2)), x = 20 + (idx * xMultiplier);
                        const ledgers = [];
                        if (y <= 90) { for (let l = 90; l >= y; l -= 10) ledgers.push(l); }
                        if (y === 150) ledgers.push(150);
                        if (y >= 210) { for (let l = 210; l <= y; l += 10) ledgers.push(l); }
                        return (
                            <g key={`note-${idx}`}>
                                {ledgers.map(ly => <line key={`l-${idx}-${ly}`} x1={x - 12} y1={ly} x2={x + 12} y2={ly} stroke="#333" strokeWidth="1.5" />)}
                                {info.acc && <text x={x - 16} y={y + 4} fontSize="14" fill="#222" fontWeight="bold">{info.acc}</text>}
                                <ellipse cx={x} cy={y} rx="7" ry="5" fill={isMicrotonal ? "#c0392b" : "#2980b9"} transform={`rotate(-15 ${x} ${y})`} />
                                {/* Renderiza o valor em formato decimal para microtons */}
                                {isMicrotonal && <text x={x - 5} y={y - 12} fontSize="9" fill="#c0392b" fontWeight="bold">{midi.toFixed(2)}</text>}
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}