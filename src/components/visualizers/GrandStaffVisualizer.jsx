import React from 'react';
import { useTuning } from '../../context/TuningContext';

export default function GrandStaffVisualizer({ notes = [], isSequence = false, isMicrotonal = false, onKeyClick = null }) {
    const { accidentalModifier } = useTuning();

    const spacing = 30;
    const xMultiplier = isSequence ? 40 : 14;
    const svgWidth = Math.max(800, 60 + notes.length * xMultiplier + 100);
    const svgHeight = 300;

    // Converte um número MIDI 12-TET em coordenada Y na partitura
    const midiToStaffPos = (midi) => {
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        const oct = Math.floor(Math.round(midi) / 12) - 1;
        const whiteKeys = [0, 2, 4, 5, 7, 9, 11];

        let basePc = pc;
        if (!whiteKeys.includes(pc)) basePc = pc - 1; // Tecla preta desenha na linha da branca abaixo

        const diatonicIndex = whiteKeys.indexOf(basePc) + (oct * 7);

        // No seu SVG, o Dó Central (C4) fica no Y = 150
        const yC4 = 150;
        const stepY = 5; // Cada nota sobe/desce 5px

        const y = yC4 - (diatonicIndex - 28) * stepY;

        const ledgerLines = [];
        // Linhas suplementares superiores (Y <= 90)
        if (y <= 90) { for (let ly = 90; ly >= y; ly -= 10) ledgerLines.push(ly); }
        // Linhas suplementares inferiores (Y >= 210)
        if (y >= 210) { for (let ly = 210; ly <= y; ly += 10) ledgerLines.push(ly); }
        // O Dó Central (Y=150) tem sua própria linha
        if (y === 150) ledgerLines.push(150);

        return { y, ledgerLines };
    };

    const handleSvgClick = (e) => {
        if (!onKeyClick) return;
        // Exige segurar Ctrl ou Cmd para desenhar, mantendo o seu padrão original
        if (!(e.ctrlKey || e.metaKey)) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;

        const yC4 = 150;
        const stepY = 5;
        const diatonicIndex = Math.round((yC4 - y) / stepY) + 28;

        const oct = Math.floor(diatonicIndex / 7);
        const degree = diatonicIndex % 7;
        const whiteKeys = [0, 2, 4, 5, 7, 9, 11];

        if (degree >= 0 && degree < 7) {
            const baseMidi = whiteKeys[degree] + (oct + 1) * 12;
            const finalMidi = baseMidi + (accidentalModifier || 0); // Soma Bemol/Sustenido se ativado
            onKeyClick(finalMidi);
        }
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
                        const roundedMidi = Math.round(midi);
                        const pos = midiToStaffPos(roundedMidi);
                        if (!pos) return null;

                        const isAccidental = [1, 3, 6, 8, 10].includes(((roundedMidi % 12) + 12) % 12);

                        // LÓGICA DE ESPAÇAMENTO PARA ACORDES (Evitar Sobreposição)
                        let xOffset = 0;
                        if (!isSequence && idx > 0) {
                            // Se a nota anterior está a menos de 3 semitons de distância, empurra um pouco pro lado
                            const prevMidi = Math.round(notes[idx - 1]);
                            if (Math.abs(roundedMidi - prevMidi) <= 2) {
                                xOffset = (idx % 2 === 1) ? 15 : 0; // Ziguezagueia as notas juntas
                            }
                        }

                        const x = (isSequence ? 60 + (idx * spacing) : 80) + xOffset;
                        const color = isMicrotonal ? "#ff4757" : "#000000";

                        const cents = Math.round((midi - roundedMidi) * 100);
                        const showCents = isMicrotonal && cents !== 0;

                        return (
                            <g key={idx}>
                                {pos.ledgerLines.map((ly, lIdx) => (
                                    <line key={`ledger-${idx}-${lIdx}`} x1={x - 12} y1={ly} x2={x + 12} y2={ly} stroke="#000" strokeWidth="1" />
                                ))}
                                {isAccidental && (
                                    <text x={x - 15} y={pos.y + 4} fontSize="16" fontFamily="serif" fill={color}>#</text>
                                )}
                                <ellipse
                                    cx={x}
                                    cy={pos.y}
                                    rx="6"
                                    ry="4.5"
                                    fill={color}
                                    transform={`rotate(-15 ${x} ${pos.y})`}
                                />

                                {/* CENTS FLUTUANTES */}
                                {showCents && (
                                    <text
                                        x={x}
                                        y={pos.y - 12}
                                        fontSize="10"
                                        fontWeight="bold"
                                        fill="#ff4757"
                                        textAnchor="middle"
                                    >
                                        {cents > 0 ? `+${cents}c` : `${cents}c`}
                                    </text>
                                )}
                            </g>
                        );
                    })}               </svg>
            </div>
        </div>
    );
}