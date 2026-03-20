import React, { useState, useRef, useMemo, useEffect } from "react";
import * as THREE from 'three';
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ==========================================
// FUNÇÕES MATEMÁTICAS E DE FORMATAÇÃO
// ==========================================
function midiToNote(midi) {
    if (midi === undefined || midi === null) return "";
    const name = noteNames[((Math.round(midi) % 12) + 12) % 12];
    const oct = Math.floor(Math.round(midi) / 12) - 1;
    return name + oct;
}

function hzToMidi(hz) { return hz > 0 ? 69 + 12 * Math.log2(hz / 440) : 0; }
function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function parseAdvancedToHz(str) {
    if (!str) return [];
    const parts = str.split(/[,;\s]+/).filter(Boolean);
    return parts.map(p => {
        if (p.toLowerCase().endsWith('hz')) return parseFloat(p);
        let centsOffset = 0, mainPart = p;
        const cMatch = p.match(/([+-]\d+)c$/i);
        if (cMatch) { centsOffset = parseInt(cMatch[1]); mainPart = p.replace(cMatch[0], ''); }
        const noteMatch = mainPart.match(/^([A-G][#b]?)([\+])?(-?\d+)$/i);
        if (noteMatch) {
            const nameMap = { "C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "F": 5, "F#": 6, "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11 };
            let m = nameMap[noteMatch[1].toUpperCase()];
            if (m === undefined) return null;
            m += (parseInt(noteMatch[3]) + 1) * 12 + (noteMatch[2] === '+' ? 0.5 : 0) + (centsOffset / 100);
            return midiToHz(m);
        }
        const num = parseFloat(mainPart);
        return isNaN(num) ? null : midiToHz(num);
    }).filter(n => n !== null);
}

function formatAllOutput(hzArray) {
    if (!hzArray || hzArray.length === 0) return { midi: "-", midiCents: "-", hz: "-", notes: "-", quarters: "-" };
    const midis = hzArray.map(hzToMidi);
    return {
        midi: midis.map(m => Math.round(m)).join(', '),
        midiCents: midis.map(m => `${Math.floor(m)}${Math.round((m % 1) * 100).toString().padStart(2, '0')}`).join(', '),
        hz: hzArray.map(hz => hz.toFixed(2)).join(', '),
        notes: midis.map(m => {
            let intM = Math.round(m), c = Math.round((m - intM) * 100);
            return c === 0 ? midiToNote(intM) : `${midiToNote(intM)} ${c > 0 ? '+' : ''}${c}c`;
        }).join(', '),
        quarters: midis.map(m => {
            const mQ = Math.round(m * 2) / 2;
            return mQ % 1 !== 0 ? `${noteNames[((Math.floor(mQ) % 12) + 12) % 12]}+${Math.floor(Math.floor(mQ) / 12) - 1}` : midiToNote(mQ);
        }).join(', ')
    };
}

const messiaenModes = {
    1: { name: "Modo 1", pcs: [0, 2, 4, 6, 8, 10] },
    2: { name: "Modo 2", pcs: [0, 1, 3, 4, 6, 7, 9, 10] },
    3: { name: "Modo 3", pcs: [0, 2, 3, 4, 6, 7, 8, 10, 11] },
    4: { name: "Modo 4", pcs: [0, 1, 2, 5, 6, 7, 8, 11] },
    5: { name: "Modo 5", pcs: [0, 1, 5, 6, 7, 11] },
    6: { name: "Modo 6", pcs: [0, 2, 4, 5, 6, 8, 10, 11] },
    7: { name: "Modo 7", pcs: [0, 1, 2, 3, 5, 6, 7, 8, 9, 11] }
};

function snapToMode(midiArr, modeKey) {
    const mode = messiaenModes[modeKey].pcs;
    return midiArr.map(midi => {
        let pc = ((Math.round(midi) % 12) + 12) % 12, closest = mode[0], minDiff = 12;
        for (let m of mode) { let diff = Math.min(Math.abs(pc - m), 12 - Math.abs(pc - m)); if (diff < minDiff) { minDiff = diff; closest = m; } }
        let res = Math.floor(midi / 12) * 12 + closest;
        if (pc > 9 && closest < 3) res += 12; if (pc < 3 && closest > 9) res -= 12;
        return res;
    });
}

// ==========================================
// CONTROLE DE ÁUDIO GLOBAL E MIDI EXPORT
// ==========================================
let currentAudioCtx = null;
let activeOscillators = [];

const stopAudio = () => {
    activeOscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch (e) { } });
    activeOscillators = [];
    if (currentAudioCtx && currentAudioCtx.state !== 'closed') {
        currentAudioCtx.close();
        currentAudioCtx = null;
    }
};

const playAudio = (hzArray, isSimultaneous = false) => {
    stopAudio();
    if (!hzArray || hzArray.length === 0) return;
    currentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t = currentAudioCtx.currentTime;
    hzArray.forEach((hz, i) => {
        const clampedHz = Math.max(22, Math.min(17000, hz));
        if (isNaN(clampedHz)) return;
        const osc = currentAudioCtx.createOscillator();
        const gain = currentAudioCtx.createGain();
        osc.frequency.value = clampedHz;
        osc.connect(gain); gain.connect(currentAudioCtx.destination);
        const start = t + (isSimultaneous ? 0 : i * 0.7), dur = isSimultaneous ? 2.9 : 0.8;
        osc.start(start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.stop(start + dur);
        activeOscillators.push(osc);
    });
};

function exportMIDI(notes, isSequence = true) {
    if (!notes || notes.length === 0) return;
    const header = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0];
    let trackEvents = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20];
    notes.forEach((note, i) => {
        let m = Math.max(0, Math.min(127, Math.round(note)));
        if (isSequence) {
            trackEvents.push(0x00, 0x90, m, 0x60);
            trackEvents.push(0x83, 0x60, 0x80, m, 0x00);
        } else {
            trackEvents.push(0x00, 0x90, m, 0x60);
        }
    });
    if (!isSequence) {
        notes.forEach((note, i) => {
            let m = Math.max(0, Math.min(127, Math.round(note)));
            trackEvents.push(...(i === 0 ? [0x83, 0x60] : [0x00]), 0x80, m, 0x00);
        });
    }
    trackEvents.push(0x00, 0xff, 0x2f, 0x00);
    const trackLen = trackEvents.length;
    const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (trackLen >> 24) & 0xff, (trackLen >> 16) & 0xff, (trackLen >> 8) & 0xff, trackLen & 0xff];
    const blob = new Blob([new Uint8Array([...header, ...trackHeader, ...trackEvents])], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Export_${isSequence ? 'Melodia' : 'Acorde'}.mid`;
    a.click();
}

// ==========================================
// COMPONENTES DE UI
// ==========================================
const Knob = ({ value, min, max, onChange, label, step = 1 }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0), startVal = useRef(value);

    const handleDown = (e) => { setIsDragging(true); startY.current = e.clientY; startVal.current = value; e.target.setPointerCapture(e.pointerId); };
    const handleMove = (e) => {
        if (!isDragging) return;
        let newVal = Math.max(min, Math.min(max, startVal.current + (startY.current - e.clientY) * step * 0.5));
        onChange(step % 1 === 0 ? Math.round(newVal) : newVal);
    };
    const handleUp = (e) => { setIsDragging(false); e.target.releasePointerCapture(e.pointerId); };

    const angle = -135 + ((value - min) / (max - min)) * 270;
    return (
        <div className="flex flex-col items-center justify-center">
            <div className="relative w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-600 shadow-lg cursor-ns-resize flex items-center justify-center" onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerLeave={handleUp}>
                <div className="absolute w-1 h-3 bg-[#00ffcc] rounded-full" style={{ transform: `rotate(${angle}deg) translateY(-14px)` }} />
            </div>
            <span className="text-[10px] text-gray-400 mt-2 font-bold uppercase">{label}</span>
            <span className="text-xs text-white font-mono bg-gray-900 px-2 py-0.5 rounded mt-1">{value}</span>
        </div>
    );
};

const UniversalOutput = ({ hzArray, title = "Resultado", showAudio = true, showMelody = false }) => {
    const fmt = formatAllOutput(hzArray);
    return (
        <div className="bg-gray-950 p-2 rounded border border-gray-700 flex flex-col mt-auto shadow-inner w-full flex-shrink-0">
            <span className="text-[11px] text-green-400 font-bold mb-1 border-b border-gray-800 pb-1 flex justify-between">
                {title}: <button onClick={stopAudio} className="text-[9px] bg-red-900 text-white px-1.5 py-0.5 rounded hover:bg-red-800 transition">⏹ Parar</button>
            </span>
            <div className="overflow-y-auto custom-scrollbar space-y-1 mb-2 max-h-32">
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">MIDI:</span> <span className="text-gray-300 font-mono">[{fmt.midi}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">MIDI+c:</span> <span className="text-gray-300 font-mono">[{fmt.midiCents}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">Hertz:</span> <span className="text-gray-300 font-mono">[{fmt.hz}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">Notas:</span> <span className="text-gray-300 font-mono">[{fmt.notes}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">1/4 Tom:</span> <span className="text-gray-300 font-mono">[{fmt.quarters}]</span></div>
            </div>
            {showAudio && (
                <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                        <button onClick={() => playAudio(hzArray, true)} className="w-1/2 bg-green-800 hover:bg-green-700 text-[9px] py-1.5 rounded transition">🎵 Play Acorde</button>
                        <button onClick={() => exportMIDI(hzArray.map(hzToMidi), false)} className="w-1/2 bg-blue-900 hover:bg-blue-800 text-[9px] py-1.5 rounded transition">Exportar MIDI do Acorde</button>
                    </div>
                    {showMelody && (
                        <div className="flex gap-1">
                            <button onClick={() => playAudio(hzArray, false)} className="w-1/2 bg-green-700 hover:bg-green-600 text-[9px] py-1.5 rounded transition">🎵 Play Melodia</button>
                            <button onClick={() => exportMIDI(hzArray.map(hzToMidi), true)} className="w-1/2 bg-blue-800 hover:bg-blue-700 text-[9px] py-1.5 rounded transition">Exportar MIDI da Melodia</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const VisualizerToggle = ({ viewMode, setViewMode, themeColor }) => (
    <div className="flex bg-gray-800 rounded border border-gray-600 overflow-hidden mb-2 flex-shrink-0 h-8">
        <button onClick={() => setViewMode('staff')} className={`w-1/2 text-[10px] font-bold transition ${viewMode === 'staff' ? 'text-white' : 'text-gray-400 hover:bg-gray-700'}`} style={{ backgroundColor: viewMode === 'staff' ? themeColor : 'transparent' }}>Partitura SVG</button>
        <button onClick={() => setViewMode('roll')} className={`w-1/2 text-[10px] font-bold transition ${viewMode === 'roll' ? 'text-white' : 'text-gray-400 hover:bg-gray-700'}`} style={{ backgroundColor: viewMode === 'roll' ? themeColor : 'transparent' }}>Piano Roll</button>
    </div>
);

// ==========================================
// 3D NETWORK & PARTITURAS
// ==========================================
function GridLines({ showOnlyHighlight, selectedSet }) {
    const { normal, high } = useMemo(() => {
        const normalPts = [], highPts = [];
        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) {
                    const isCurSel = selectedSet.has(`${x},${y},${z}`);
                    const addLine = (nx, ny, nz) => {
                        const isNeighSel = selectedSet.has(`${nx},${ny},${nz}`);
                        if (isCurSel && isNeighSel) highPts.push(x * 1.5, y * 2, z * 2.5, nx * 1.5, ny * 2, nz * 2.5);
                        else normalPts.push(x * 1.5, y * 2, z * 2.5, nx * 1.5, ny * 2, nz * 2.5);
                    };
                    if (x < 7) addLine(x + 1, y, z);
                    if (y < 2) addLine(x, y + 1, z);
                    if (z < 2) addLine(x, y, z + 1);
                }
            }
        }
        return { normal: new Float32Array(normalPts), high: new Float32Array(highPts) };
    }, [selectedSet]);

    return (
        <group>
            <lineSegments key={`norm-${normal.length}`}><bufferGeometry><bufferAttribute attach="attributes-position" count={normal.length / 3} array={normal} itemSize={3} /></bufferGeometry><lineBasicMaterial color="#ffffff" transparent opacity={showOnlyHighlight ? 0.01 : 0.15} /></lineSegments>
            {high.length > 0 && <lineSegments key={`high-${high.length}`}><bufferGeometry><bufferAttribute attach="attributes-position" count={high.length / 3} array={high} itemSize={3} /></bufferGeometry><lineBasicMaterial color="#00ffcc" transparent opacity={0.9} linewidth={2} /></lineSegments>}
        </group>
    );
}

function NotePoint({ pt, selectedSet, toggleSelect, blendedHue, isSel, ignoreNextRef, customOpacity, textOpacity }) {
    const color = new THREE.Color(`hsl(${blendedHue},${isSel ? 90 : 65}%,${isSel ? 90 : 55}%)`);
    return (
        <mesh position={pt.position} onClick={e => { if (e.ctrlKey || e.metaKey) { e.stopPropagation(); ignoreNextRef.current = true; toggleSelect(pt.coord); } }}>
            <sphereGeometry args={[0.2, 32, 32]} />
            <meshStandardMaterial color={color} transparent opacity={customOpacity} roughness={0.12} metalness={0.25} emissive={isSel ? '#fff' : color} emissiveIntensity={isSel ? 0.35 : 0.05} />
            <Billboard><Text position={[0, 0, 0]} fontSize={0.23} color="#ffffff" outlineWidth={0.05} outlineColor="#000000" anchorX="center" anchorY="middle" fontWeight="bold" depthOffset={-1} fillOpacity={textOpacity} outlineOpacity={textOpacity}>{pt.note}</Text></Billboard>
        </mesh>
    );
}

function GrandStaffVisualizer({ notes, isSequence = false, isMicrotonal = false, onKeyClick = null }) {
    const xMultiplier = isSequence ? 40 : 14;
    const svgWidth = Math.max(800, 60 + notes.length * xMultiplier + 100);
    const svgHeight = 300, lineSpacing = 10, baseY = 150;

    const handleSvgClick = (e) => {
        if (!onKeyClick || !(e.ctrlKey || e.metaKey)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const step = Math.round((baseY - (e.clientY - rect.top)) / (lineSpacing / 2));
        const oct = Math.floor(step / 7) + 4;
        const pcStep = ((step % 7) + 7) % 7;
        const diatonicToMidi = [0, 2, 4, 5, 7, 9, 11];
        onKeyClick((oct + 1) * 12 + diatonicToMidi[pcStep]);
    };

    const getDiatonicInfo = (midi) => {
        const pc = Math.round(midi) % 12, oct = Math.floor(midi / 12) - 1;
        const diatonicMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
        const accidentalMap = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];
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
            {/* CORREÇÃO DO SCROLL: min-w-0 resolve o bug do flexbox onde o filho não encolhe */}
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
                                {isMicrotonal && <text x={x - 5} y={y - 12} fontSize="9" fill="#c0392b" fontWeight="bold">{midi.toFixed(1)}</text>}
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

function BachRollVisualizer({ notes, isSequence = false, isMicrotonal = false, onKeyClick = null, onNoteDrag = null, onNoteDelete = null, originalEntityLength = 0 }) {
    const minMidi = 36, maxMidi = 96, rowHeight = 14, totalHeight = (maxMidi - minMidi + 1) * rowHeight;
    const svgWidth = Math.max(800, 40 + notes.length * 30 + 50);
    const [draggingIdx, setDraggingIdx] = useState(null);
    const leftRef = useRef(null);

    const handleScroll = (e) => { if (leftRef.current) leftRef.current.scrollTop = e.target.scrollTop; };

    const handlePointerDown = (e, idx) => {
        if (e.ctrlKey || e.metaKey) { e.stopPropagation(); if (onNoteDelete) onNoteDelete(idx); return; }
        if (onNoteDrag && (!originalEntityLength || idx < originalEntityLength) && !isMicrotonal) { e.stopPropagation(); e.target.setPointerCapture(e.pointerId); setDraggingIdx(idx); }
    };
    const handlePointerMove = (e) => {
        if (draggingIdx === null || !onNoteDrag) return;
        let newMidi = maxMidi - Math.round((e.clientY - e.currentTarget.getBoundingClientRect().top) / rowHeight);
        newMidi = Math.max(minMidi, Math.min(maxMidi, newMidi));
        if (notes[draggingIdx] !== newMidi) onNoteDrag(draggingIdx, newMidi);
    };
    const handlePointerUp = (e) => { if (draggingIdx !== null) { e.target.releasePointerCapture(e.pointerId); setDraggingIdx(null); } };

    return (
        <div className="flex w-full h-full bg-gray-900 border border-gray-700 rounded overflow-hidden relative select-none">
            <div ref={leftRef} className="w-[60px] flex-shrink-0 bg-gray-800 border-r border-gray-600 z-10 overflow-hidden">
                <svg width="60" height={totalHeight} className="w-full">
                    {Array.from({ length: maxMidi - minMidi + 1 }).map((_, i) => {
                        let m = maxMidi - i, y = i * rowHeight, isBlack = [1, 3, 6, 8, 10].includes(m % 12), isC = (m % 12 === 0);
                        return (
                            <g key={`key-${m}`} onClick={() => onKeyClick && onKeyClick(m)} style={{ cursor: onKeyClick ? 'pointer' : 'default' }}>
                                <rect x={0} y={y} width="60" height={rowHeight} fill={isBlack ? "#222" : "#eee"} stroke="#999" strokeWidth="1" />
                                {isC && <text x={5} y={y + 10} fontSize="9" fill={isBlack ? "#fff" : "#000"} fontWeight="bold">C{(m / 12) - 1}</text>}
                                {onKeyClick && <rect x={0} y={y} width="60" height={rowHeight} fill="white" opacity="0" className="hover:opacity-20" />}
                            </g>
                        );
                    })}
                </svg>
            </div>
            {/* CORREÇÃO DO SCROLL: min-w-0 resolve o bug do flexbox */}
            <div className="flex-1 min-w-0 overflow-auto custom-scrollbar relative" onScroll={handleScroll} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                <svg width={svgWidth} height={totalHeight} style={{ minWidth: `${svgWidth}px`, display: 'block' }}>
                    {Array.from({ length: maxMidi - minMidi + 1 }).map((_, i) => {
                        let m = maxMidi - i, y = i * rowHeight, isBlack = [1, 3, 6, 8, 10].includes(m % 12);
                        return <line key={`grid-${m}`} x1="0" y1={y} x2="100%" y2={y} stroke={isBlack ? "#333" : "#444"} strokeWidth="1" opacity="0.5" />;
                    })}
                    {notes.map((midi, idx) => {
                        const y = (maxMidi - midi) * rowHeight, x = isSequence ? 20 + (idx * 30) : 40;
                        let color = isMicrotonal ? "#ff4757" : (originalEntityLength > 0 && idx >= originalEntityLength) ? "#9b59b6" : "#1e90ff";
                        return <rect key={`note-${idx}`} x={x} y={y} width={isSequence ? 25 : 80} height={rowHeight - 2} fill={color} rx="3" opacity="0.9" style={{ cursor: (onNoteDrag && !isMicrotonal) ? 'ns-resize' : 'default' }} onPointerDown={(e) => handlePointerDown(e, idx)} />;
                    })}
                </svg>
            </div>
        </div>
    );
}

// ==========================================
// COMPONENTE EXPORTADO PRINCIPAL
// ==========================================
export default function HarmonicNetwork({ activeTool = 1, themeColor = "#e04e8a" }) {
    const [baseNote, setBaseNote] = useState(48);
    const [intX, setIntX] = useState(7), [intY, setIntY] = useState(12), [intZ, setIntZ] = useState(4);
    const [selectedSet, setSelectedSet] = useState(new Set()), [showOnlyHighlight, setShowOnlyHighlight] = useState(false), [filterText, setFilterText] = useState("");

    const [tab2InputA, setTab2InputA] = useState(""), [tab2InputB, setTab2InputB] = useState("0, 4, 7"), [tab2NonTemp, setTab2NonTemp] = useState(false);
    const [tab3Input, setTab3Input] = useState("");
    const [tab4Input, setTab4Input] = useState(""), [targetMinHz, setTargetMinHz] = useState(440), [targetMaxHz, setTargetMaxHz] = useState(880);
    const [tab5Input, setTab5Input] = useState("0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11"), [tab5Gt12, setTab5Gt12] = useState(false), [tab5View, setTab5View] = useState("notes");
    const [tab6Input, setTab6Input] = useState(""), [tab6Limit, setTab6Limit] = useState(20), [tab6Order, setTab6Order] = useState(1);
    const [tab7Carrier, setTab7Carrier] = useState("440Hz"), [tab7Modulator, setTab7Modulator] = useState("100Hz"), [tab7K, setTab7K] = useState(5);
    const [tab8Input, setTab8Input] = useState(""), [tab8Harmonics, setTab8Harmonics] = useState(4), [tab8Sub, setTab8Sub] = useState(1);

    const [viewMode, setViewMode] = useState('staff');
    const ignoreNextRef = useRef(false), panControlsRef = useRef();

    // MOTORES (MEMOIZED)
    const points = useMemo(() => {
        const arr = [];
        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) arr.push({ coord: [x, y, z], position: [x * 1.5, y * 2, z * 2.5], note: midiToNote(baseNote + x * intX + y * intY + z * intZ), midi: baseNote + x * intX + y * intY + z * intZ });
            }
        }
        return arr;
    }, [baseNote, intX, intY, intZ]);

    const tab1Hz = useMemo(() => points.filter(pt => selectedSet.has(pt.coord.join(','))).map(pt => midiToHz(pt.midi)).sort((a, b) => a - b), [points, selectedSet]);

    const tab2ResultHz = useMemo(() => {
        let hzA = parseAdvancedToHz(tab2InputA), hzB = parseAdvancedToHz(tab2InputB), res = new Set();
        if (!hzA.length || !hzB.length) return [];
        if (tab2NonTemp) { hzB.forEach(b => { let ratio = b / hzB[0]; hzA.forEach(a => res.add(a * ratio)); }); }
        else { hzB.forEach(b => { let diff = hzToMidi(b) - hzToMidi(hzB[0]); hzA.forEach(a => res.add(midiToHz(hzToMidi(a) + diff))); }); }
        return Array.from(res).sort((a, b) => a - b);
    }, [tab2InputA, tab2InputB, tab2NonTemp]);

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const tab3ParsedInput = parseAdvancedToHz(tab3Input).map(hzToMidi);
    const tab3ResultHz = useMemo(() => {
        let arr = [...tab3ParsedInput];
        if (arr.length < 2) return arr.map(midiToHz);
        let intervalInt = Math.round(Math.abs(arr[arr.length - 1] - arr[0]));
        let R = intervalInt % 12 === 0 ? 1 : 12 / gcd(12, intervalInt % 12);
        if (!Number.isFinite(R) || R > 24 || R <= 0) R = 12;
        let total = [...arr], cur = [...arr];
        for (let i = 1; i < R; i++) {
            let dist = total[total.length - 1] - cur[0];
            total = total.concat(cur.map(n => n + dist).slice(1));
        }
        return total.map(midiToHz);
    }, [tab3ParsedInput]);

    const tab4ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab4Input);
        if (hzArr.length < 2) return [];
        let minHz = Math.min(...hzArr), maxHz = Math.max(...hzArr);
        if (minHz === maxHz) return hzArr;
        return hzArr.map(f => targetMinHz * Math.pow((targetMaxHz / targetMinHz), (Math.log(f) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz))));
    }, [tab4Input, targetMinHz, targetMaxHz]);

    const tab4MidiEquivalents = useMemo(() => tab4ResultHz.map(hzToMidi), [tab4ResultHz]);

    const tab5Matrix = useMemo(() => {
        let row = parseAdvancedToHz(tab5Input).map(hzToMidi);
        if (!tab5Gt12) { const seen = new Set(); row = row.filter(m => { const pc = ((Math.round(m) % 12) + 12) % 12; if (seen.has(pc)) return false; seen.add(pc); return true; }); }
        if (row.length < 1) return { m: [], row: [], inv: [] };
        let p0 = row[0], inv = row.map(val => p0 - (val - p0)), matrix = [];
        for (let r = 0; r < row.length; r++) { let mRow = []; for (let c = 0; c < row.length; c++) mRow.push(row[c] + inv[r] - p0); matrix.push(mRow); }
        return { m: matrix, row, inv };
    }, [tab5Input, tab5Gt12]);

    const tab6ResultHz = useMemo(() => {
        let baseArr = parseAdvancedToHz(tab6Input);
        if (baseArr.length < 2) return [];
        let res = new Set(), currentGen = [...baseArr];
        for (let order = 0; order < tab6Order; order++) {
            let nextGen = new Set();
            for (let i = 0; i < currentGen.length; i++) {
                for (let j = i + 1; j < currentGen.length; j++) {
                    if (currentGen[i] + currentGen[j] > 0) nextGen.add(currentGen[i] + currentGen[j]);
                    if (Math.abs(currentGen[i] - currentGen[j]) > 0) nextGen.add(Math.abs(currentGen[i] - currentGen[j]));
                }
            }
            currentGen = Array.from(nextGen); currentGen.forEach(f => res.add(f));
            if (res.size > tab6Limit * 3) break;
        }
        return Array.from(res).sort((a, b) => a - b).slice(0, tab6Limit);
    }, [tab6Input, tab6Limit, tab6Order]);

    const tab7ResultHz = useMemo(() => {
        let C_arr = parseAdvancedToHz(tab7Carrier); if (!C_arr.length) C_arr = [440];
        let M = parseAdvancedToHz(tab7Modulator)[0] || 100, res = new Set();
        C_arr.forEach(C => { res.add(C); for (let i = 1; i <= tab7K; i++) { res.add(C + i * M); res.add(Math.abs(C - i * M)); } });
        return Array.from(res).sort((a, b) => a - b);
    }, [tab7Carrier, tab7Modulator, tab7K]);

    const tab8ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab8Input), res = new Set();
        hzArr.forEach(f => { for (let i = 1; i <= tab8Harmonics; i++) res.add(f * i); for (let i = 1; i <= tab8Sub; i++) res.add(f / i); });
        return Array.from(res).sort((a, b) => a - b);
    }, [tab8Input, tab8Harmonics, tab8Sub]);

    const arrToStr = arr => arr.map(hzToMidi).map(n => n.toFixed(2).replace('.00', '')).join(', ');

    // ==========================================
    // FUNÇÕES DE AÇÃO DA UI E FILTROS 
    // ==========================================
    const toggleSelect = (coord) => {
        const key = coord.join(',');
        setSelectedSet(prev => { const copy = new Set(prev); if (copy.has(key)) copy.delete(key); else copy.add(key); return copy; });
    };

    const applyFilter = () => {
        if (!filterText.trim()) return;
        const input = filterText.toLowerCase().replace(/[()[\]{}]/g, '');
        const parts = input.split(/\s+a\s+|\s+à\s+|:/);
        try {
            if (parts.length === 1) {
                const coords = parts[0].split(',').map(s => parseInt(s.trim(), 10));
                if (coords.length === 3 && !coords.some(isNaN)) setSelectedSet(prev => new Set(prev).add(coords.join(',')));
            } else if (parts.length === 2) {
                const start = parts[0].split(',').map(s => parseInt(s.trim(), 10));
                const end = parts[1].split(',').map(s => parseInt(s.trim(), 10));
                if (start.length === 3 && end.length === 3 && !start.some(isNaN) && !end.some(isNaN)) {
                    const newSet = new Set(selectedSet);
                    const minX = Math.min(start[0], end[0]), maxX = Math.max(start[0], end[0]);
                    const minY = Math.min(start[1], end[1]), maxY = Math.max(start[1], end[1]);
                    const minZ = Math.min(start[2], end[2]), maxZ = Math.max(start[2], end[2]);
                    for (let x = minX; x <= maxX; x++) {
                        for (let y = minY; y <= maxY; y++) {
                            for (let z = minZ; z <= maxZ; z++) {
                                if (x >= -7 && x <= 7 && y >= -2 && y <= 2 && z >= -2 && z <= 2) newSet.add(`${x},${y},${z}`);
                            }
                        }
                    }
                    setSelectedSet(newSet);
                }
            }
        } catch (e) { }
    };

    const handleNormalizeFreqs = () => {
        let arr = parseAdvancedToHz(tab4Input);
        if (arr.length > 0) {
            setTargetMinHz(Math.min(...arr).toFixed(2));
            setTargetMaxHz(Math.max(...arr).toFixed(2));
        }
    };

    const resetDefaults = () => {
        setBaseNote(48); setIntX(7); setIntY(12); setIntZ(4);
        setSelectedSet(new Set()); setFilterText(""); setShowOnlyHighlight(false);
        panControlsRef.current?.resetCamera();
    };

    const PanControls = React.forwardRef(({ ignoreNextRef }, ref) => {
        const { camera } = useThree(); const controlsRef = useRef(); const [isPanning, setIsPanning] = useState(false); const [panStart, setPanStart] = useState([0, 0]);
        React.useImperativeHandle(ref, () => ({ resetCamera: () => { camera.position.set(0, 0, 2.2); if (controlsRef.current) { controlsRef.current.target.set(0, 0, 0); controlsRef.current.update(); } } }));
        const handleMouseDown = (e) => {
            if (ignoreNextRef.current) { ignoreNextRef.current = false; return; }
            if (e.button === 2) { e.preventDefault(); setIsPanning(true); setPanStart([e.clientX, e.clientY]); }
        };
        const handleMouseMove = (e) => {
            if (!isPanning) return;
            const dx = e.clientX - panStart[0], dy = e.clientY - panStart[1], target = controlsRef.current?.target || new THREE.Vector3();
            target.x -= dx * 0.01; target.y += dy * 0.01;
            if (controlsRef.current) controlsRef.current.target = target; setPanStart([e.clientX, e.clientY]);
        };
        useEffect(() => { const up = () => setIsPanning(false); window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', up); }; }, [isPanning, panStart]);
        return <OrbitControls ref={controlsRef} maxDistance={50} minDistance={0.5} enableDamping={false} onPointerDown={handleMouseDown} mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null }} />;
    });
    const PanControlsSingleton = useMemo(() => <PanControls ignoreNextRef={ignoreNextRef} ref={panControlsRef} />, []);

    const PullButtons = ({ onPull }) => (
        <div className="flex flex-wrap gap-1 mb-3 border-b border-gray-700 pb-2">
            <span className="text-[10px] text-gray-500 mr-1 mt-1">Puxar de:</span>
            <button onClick={() => onPull(arrToStr(tab1Hz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Rede</button>
            <button onClick={() => onPull(arrToStr(tab2ResultHz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Mult</button>
            <button onClick={() => onPull(arrToStr(tab3ResultHz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Módulo</button>
            <button onClick={() => onPull(arrToStr(tab4ResultHz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Proj</button>
        </div>
    );

    return (
        <div className="w-full h-full relative flex flex-col bg-gray-950 font-sans text-white">
            <div className="flex-1 relative flex overflow-hidden">

                {/* ABA 1: REDES */}
                {activeTool === 1 && (
                    <>
                        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-95 p-4 rounded-lg z-10 w-[260px] shadow-xl border border-gray-700 flex flex-col pointer-events-auto" style={{ maxHeight: '85vh' }}>
                            <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 flex flex-col space-y-4">
                                <div className="space-y-3">
                                    <label className="flex justify-between items-center text-xs">Central (0,0,0):
                                        <select className="bg-gray-800 p-1 rounded border border-gray-600" value={baseNote} onChange={e => setBaseNote(Number(e.target.value))}>
                                            {noteNames.map((n, i) => <option key={i} value={48 + i}>{n}3</option>)}
                                        </select>
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <label className="flex flex-col text-[10px] text-gray-400">X (5as): <input className="mt-1 bg-gray-800 p-1 text-center rounded" type="number" value={intX} onChange={e => setIntX(Number(e.target.value))} /></label>
                                        <label className="flex flex-col text-[10px] text-gray-400">Y (8as): <input className="mt-1 bg-gray-800 p-1 text-center rounded" type="number" value={intY} onChange={e => setIntY(Number(e.target.value))} /></label>
                                        <label className="flex flex-col text-[10px] text-gray-400">Z (3as): <input className="mt-1 bg-gray-800 p-1 text-center rounded" type="number" value={intZ} onChange={e => setIntZ(Number(e.target.value))} /></label>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-gray-600">
                                    <span className="text-xs text-gray-400 block mb-2">Filtrar (ex: 0,1,-1 a 3,1,-1):</span>
                                    <div className="flex space-x-2 mb-3">
                                        <input type="text" className="flex-1 bg-gray-800 text-xs p-1.5 rounded border border-gray-600" value={filterText} onChange={e => setFilterText(e.target.value)} />
                                        <button onClick={() => {
                                            const parts = filterText.split(/\s+a\s+|\s+à\s+|:/);
                                            try {
                                                if (parts.length === 1) setSelectedSet(prev => new Set(prev).add(parts[0].trim()));
                                                else if (parts.length === 2) {
                                                    const s = parts[0].split(',').map(Number), e = parts[1].split(',').map(Number);
                                                    const nSet = new Set(selectedSet);
                                                    for (let x = Math.min(s[0], e[0]); x <= Math.max(s[0], e[0]); x++)
                                                        for (let y = Math.min(s[1], e[1]); y <= Math.max(s[1], e[1]); y++)
                                                            for (let z = Math.min(s[2], e[2]); z <= Math.max(s[2], e[2]); z++) nSet.add(`${x},${y},${z}`);
                                                    setSelectedSet(nSet);
                                                }
                                            } catch (err) { }
                                        }} className="bg-green-600 hover:bg-green-500 px-3 rounded text-xs">Ok</button>
                                    </div>
                                    <label className="flex items-center text-xs cursor-pointer mb-3"><input type="checkbox" className="mr-2" checked={showOnlyHighlight} onChange={e => setShowOnlyHighlight(e.target.checked)} /> Esconder inativas</label>
                                    <div className="flex space-x-2">
                                        <button onClick={() => panControlsRef.current?.resetCamera()} className="flex-1 bg-blue-900 text-[10px] py-1.5 rounded">Cent. Câm</button>
                                        <button onClick={() => { setBaseNote(48); setIntX(7); setIntY(12); setIntZ(4); setSelectedSet(new Set()); }} className="flex-1 bg-red-900 text-[10px] py-1.5 rounded">Limpar</button>
                                    </div>
                                </div>
                                <UniversalOutput hzArray={tab1Hz} title="Entidade Gerada" isSimultaneous={true} showMelody={true} />
                            </div>
                        </div>
                        <div className="w-full h-full absolute inset-0 z-0">
                            <Canvas camera={{ position: [0, 0, 2.2], fov: 60 }}>
                                <ambientLight />
                                {PanControlsSingleton}
                                <GridLines showOnlyHighlight={showOnlyHighlight} selectedSet={selectedSet} />
                                {points.map((pt, idx) => {
                                    const isSel = selectedSet.has(pt.coord.join(','));
                                    return <NotePoint key={idx} pt={pt} selectedSet={selectedSet} toggleSelect={toggleSelect} blendedHue={(pt.coord[0] + 7) / 14 * 360 * 0.75 + (pt.coord[2] + 2) / 4 * 120 * 0.25} isSel={isSel} ignoreNextRef={ignoreNextRef} customOpacity={showOnlyHighlight ? (isSel ? 0.9 : 0.03) : 0.6} textOpacity={showOnlyHighlight ? (isSel ? 1 : 0.05) : 1} />;
                                })}
                            </Canvas>
                        </div>
                    </>
                )}

                {activeTool === 2 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab2InputA} />
                            <label className="text-xs text-gray-400">A (Multiplicando):</label>
                            <textarea value={tab2InputA} onChange={e => setTab2InputA(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" placeholder="Ex: 60, C+4" />
                            <label className="text-xs text-gray-400">B (Multiplicador):</label>
                            <textarea value={tab2InputB} onChange={e => setTab2InputB(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" />
                            <label className="flex items-center text-[10px] text-orange-300"><input type="checkbox" className="mr-2" checked={tab2NonTemp} onChange={e => setTab2NonTemp(e.target.checked)} /> Valores Não Temperados</label>
                            <button onClick={() => { setTab2InputA(""); setTab2InputB(""); }} className="bg-red-900 text-[10px] w-full py-1.5 rounded mt-2">Limpar</button>
                            <UniversalOutput hzArray={tab2ResultHz} title="Bloco Resultante" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <button onClick={() => setTab2InputA("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado (A)</button>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer notes={tab2ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={tab2NonTemp} onKeyClick={m => setTab2InputA(prev => prev ? prev + ", " + m : String(m))} /> : <GrandStaffVisualizer notes={tab2ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={tab2NonTemp} onKeyClick={m => setTab2InputA(prev => prev ? prev + ", " + m : String(m))} />}
                        </div>
                    </div>
                )}

                {activeTool === 3 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab3Input} />
                            <label className="text-xs text-gray-400">Entidade Melódica Base:</label>
                            <textarea value={tab3Input} onChange={e => setTab3Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Clique na pauta ou digite..." />
                            <button onClick={() => setTab3Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Pauta</button>
                            <div className="pt-2 border-t border-gray-700">
                                <h4 className="text-[10px] font-bold text-gray-400 mb-1">Aproximar a Modo de Messiaen:</h4>
                                <div className="grid grid-cols-2 gap-1">
                                    {Object.entries(messiaenModes).map(([k, v]) => (
                                        <button key={k} onClick={() => setTab3Input(snapToMode(tab3ParsedInput, k).join(', '))} className="text-[9px] bg-gray-800 border border-gray-600 p-1 rounded hover:bg-gray-700">{v.name}</button>
                                    ))}
                                </div>
                            </div>
                            <UniversalOutput hzArray={tab3ResultHz} title="Módulo Cíclico" isSimultaneous={false} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <button onClick={() => setTab3Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer notes={tab3ResultHz.map(hzToMidi)} isSequence={true} onKeyClick={m => setTab3Input(prev => prev ? prev + ", " + m : String(m))} onNoteDrag={(idx, m) => { let a = [...tab3ParsedInput]; if (idx < a.length) { a[idx] = m; setTab3Input(a.join(', ')); } }} originalEntityLength={tab3ParsedInput.length} onNoteDelete={(idx) => { let a = [...tab3ParsedInput]; if (idx < a.length) { a.splice(idx, 1); setTab3Input(a.join(', ')); } }} /> : <GrandStaffVisualizer notes={tab3ResultHz.map(hzToMidi)} isSequence={true} onKeyClick={m => setTab3Input(prev => prev ? prev + ", " + m : String(m))} />}
                        </div>
                    </div>
                )}

                {activeTool === 4 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab4Input} />
                            <textarea value={tab4Input} onChange={e => setTab4Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" placeholder="Entidade base..." />
                            <button onClick={() => setTab4Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Entrada</button>
                            <div className="border-t border-gray-700 pt-3 space-y-3">
                                <button onClick={() => { let arr = parseAdvancedToHz(tab4Input); if (arr.length > 0) { setTargetMinHz(Math.min(...arr).toFixed(2)); setTargetMaxHz(Math.max(...arr).toFixed(2)); } }} className="w-full bg-purple-800 text-[10px] py-1 rounded">Normalizar Espaço</button>
                                <div><label className="text-[10px] text-gray-300">Min: {targetMinHz} Hz</label><input type="range" min="20" max="2000" value={targetMinHz} onChange={e => setTargetMinHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                                <div><label className="text-[10px] text-gray-300">Max: {targetMaxHz} Hz</label><input type="range" min="20" max="10000" value={targetMaxHz} onChange={e => setTargetMaxHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                            </div>
                            <UniversalOutput hzArray={tab4ResultHz} title="Projeção" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <button onClick={() => setTab4Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer notes={tab4MidiEquivalents} isSequence={true} isMicrotonal={true} onKeyClick={m => setTab4Input(prev => prev ? prev + ", " + m : String(m))} onNoteDelete={(idx) => { let a = parseAdvancedToHz(tab4Input).map(hzToMidi); if (idx < a.length) { a.splice(idx, 1); setTab4Input(a.join(', ')); } }} /> : <GrandStaffVisualizer notes={tab4MidiEquivalents} isSequence={true} isMicrotonal={true} onKeyClick={m => setTab4Input(prev => prev ? prev + ", " + m : String(m))} />}
                        </div>
                    </div>
                )}

                {activeTool === 5 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab5Input} />
                            <textarea value={tab5Input} onChange={e => setTab5Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Série base..." />
                            <button onClick={() => setTab5Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Série</button>
                            <label className="text-[10px] text-orange-300"><input type="checkbox" className="mr-2" checked={tab5Gt12} onChange={e => setTab5Gt12(e.target.checked)} /> Modo Livre (&gt12 notas)</label>
                            <div className="border-t border-gray-700 pt-3">
                                <h4 className="text-[10px] font-bold text-gray-300 mb-1">Visualização:</h4>
                                <select className="w-full bg-gray-800 p-1 text-xs rounded border border-gray-600" value={tab5View} onChange={e => setTab5View(e.target.value)}>
                                    <option value="set">Set Theory (0-11)</option>
                                    <option value="notes">Notas Musicais</option>
                                    <option value="hz">Frequências (Hz)</option>
                                    <option value="quarters">Quartos de Tom</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 p-5 bg-gray-950 overflow-auto custom-scrollbar flex items-start justify-start">
                            {tab5Matrix.m.length > 0 && (
                                <table className="border-collapse bg-gray-900 border border-gray-500 shadow-2xl text-center min-w-max m-auto">
                                    <thead><tr><th className="p-1"></th>{tab5Matrix.inv.map((v, i) => <th key={i} className="text-[10px] text-blue-300 border border-gray-700 p-2">I{tab5Gt12 ? i : v}↓</th>)}<th className="p-1"></th></tr></thead>
                                    <tbody>
                                        {tab5Matrix.m.map((row, rIdx) => (
                                            <tr key={rIdx}>
                                                <th className="text-[10px] text-green-300 border border-gray-700 p-2">P{tab5Gt12 ? rIdx : tab5Matrix.row[rIdx]}→</th>
                                                {row.map((val, cIdx) => {
                                                    let d = val;
                                                    if (tab5View === 'set') d = ((Math.round(val) % 12) + 12) % 12;
                                                    else if (tab5View === 'notes') d = formatAllOutput([midiToHz(val)]).notes;
                                                    else if (tab5View === 'hz') d = formatAllOutput([midiToHz(val)]).hz;
                                                    else if (tab5View === 'quarters') d = formatAllOutput([midiToHz(val)]).quarters;
                                                    return <td key={cIdx} className={`border border-gray-700 p-2 font-mono text-[10px] ${val === tab5Matrix.m[0][0] ? 'bg-gray-800 text-red-300' : 'text-gray-300'}`}>{d}</td>;
                                                })}
                                                <th className="text-[10px] text-yellow-300 border border-gray-700 p-2">←R{tab5Gt12 ? rIdx : tab5Matrix.row[rIdx]}</th>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTool === 6 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab6Input} />
                            <textarea value={tab6Input} onChange={e => setTab6Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" placeholder="Portadoras (Ex: 440Hz, 500Hz)" />
                            <button onClick={() => setTab6Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Pauta</button>
                            <div className="flex justify-around py-2 border-y border-gray-700 mt-2">
                                <Knob value={tab6Order} min={1} max={4} step={1} onChange={setTab6Order} label="Cascata" />
                                <Knob value={tab6Limit} min={1} max={100} step={1} onChange={setTab6Limit} label="Limite" />
                            </div>
                            <UniversalOutput hzArray={tab6ResultHz} title="Espectro RM" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <button onClick={() => setTab6Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer notes={tab6ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab6Input(prev => prev ? prev + ", " + m : String(m))} /> : <GrandStaffVisualizer notes={tab6ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab6Input(prev => prev ? prev + ", " + m : String(m))} />}
                        </div>
                    </div>
                )}

                {activeTool === 7 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab7Carrier} />
                            <label className="text-[10px] text-gray-400">Portadoras (C):</label>
                            <textarea value={tab7Carrier} onChange={e => setTab7Carrier(e.target.value)} className="w-full bg-gray-800 p-2 rounded border border-gray-600 font-mono min-h-[60px]" />
                            <button onClick={() => setTab7Carrier("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar (C)</button>
                            <label className="text-[10px] text-gray-400 mt-2">Moduladora (M):</label>
                            <input type="text" value={tab7Modulator} onChange={e => setTab7Modulator(e.target.value)} className="w-full bg-gray-800 p-2 rounded border border-gray-600 font-mono" />
                            <div className="flex justify-center py-2 border-y border-gray-700 mt-2">
                                <Knob value={tab7K} min={1} max={30} step={1} onChange={setTab7K} label="Índice (K)" />
                            </div>
                            <UniversalOutput hzArray={tab7ResultHz} title="Bandas Laterais" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <button onClick={() => setTab7Carrier("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado (C)</button>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer notes={tab7ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab7Carrier(prev => prev ? prev + ", " + m : String(m))} /> : <GrandStaffVisualizer notes={tab7ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab7Carrier(prev => prev ? prev + ", " + m : String(m))} />}
                        </div>
                    </div>
                )}

                {activeTool === 8 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab8Input} />
                            <textarea value={tab8Input} onChange={e => setTab8Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" placeholder="Fundamentais..." />
                            <button onClick={() => setTab8Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Pauta</button>
                            <div className="flex justify-around py-2 border-y border-gray-700 mt-2">
                                <Knob value={tab8Harmonics} min={1} max={16} step={1} onChange={setTab8Harmonics} label="Harmônicos" />
                                <Knob value={tab8Sub} min={1} max={8} step={1} onChange={setTab8Sub} label="Sub-Harm" />
                            </div>
                            <UniversalOutput hzArray={tab8ResultHz} title="Espectro Aditivo" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <button onClick={() => setTab8Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer notes={tab8ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab8Input(prev => prev ? prev + ", " + m : String(m))} /> : <GrandStaffVisualizer notes={tab8ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab8Input(prev => prev ? prev + ", " + m : String(m))} />}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}