import React, { useState, useRef, useMemo, useEffect } from "react";
import * as THREE from 'three';
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import { calculateCardinalDensity, getIntervalVector } from "../../utils/costere";
import { useTuning } from "../../context/TuningContext";
import GrandStaffVisualizer from "../visualizers/GrandStaffVisualizer";
import StaffToolbar from "../visualizers/StaffToolbar";
import { parseScalaFile, generateEdoScale, parseCustomTuning } from "../../utils/scalaParser";
import { useMidi } from "../../context/MidiContext";
import { generateNotationData } from "../../utils/notationEngine";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];



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

// Exportador MIDI Xenharmônico (MPE / Multicanal com Pitch Bend)
function exportMIDI(hzArray, isSequence = true) {
    if (!hzArray || hzArray.length === 0) return;
    const header = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0];
    let trackEvents = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]; // Tempo 120 BPM

    if (isSequence) {
        // Para melodias, usamos o Canal 1 e atualizamos o Pitch Bend antes de cada nota
        hzArray.forEach(hz => {
            let mFloat = 69 + 12 * Math.log2(hz / 440);
            let stdNote = Math.max(0, Math.min(127, Math.round(mFloat)));
            let stdHz = 440 * Math.pow(2, (stdNote - 69) / 12);
            let cents = 1200 * Math.log2(hz / stdHz);
            let pb = Math.max(0, Math.min(16383, Math.round(8192 + (cents * 40.96))));

            trackEvents.push(0x00, 0xE0, pb & 0x7F, (pb >> 7) & 0x7F); // Pitch Bend
            trackEvents.push(0x00, 0x90, stdNote, 0x60);               // Note On
            trackEvents.push(0x83, 0x60, 0x80, stdNote, 0x00);         // Note Off (Delta 480 ticks)
        });
    } else {
        // Para acordes, espalhamos as notas por 15 Canais MIDI para os Pitch Bends não chocarem (MPE fake)
        hzArray.forEach((hz, i) => {
            let ch = i % 16;
            if (ch === 9) ch = 10; // Pula o Canal 10 (Reservado para Bateria no General MIDI)

            let mFloat = 69 + 12 * Math.log2(hz / 440);
            let stdNote = Math.max(0, Math.min(127, Math.round(mFloat)));
            let stdHz = 440 * Math.pow(2, (stdNote - 69) / 12);
            let cents = 1200 * Math.log2(hz / stdHz);
            let pb = Math.max(0, Math.min(16383, Math.round(8192 + (cents * 40.96))));

            trackEvents.push(0x00, 0xE0 + ch, pb & 0x7F, (pb >> 7) & 0x7F); // Pitch Bend no canal específico
            trackEvents.push(0x00, 0x90 + ch, stdNote, 0x60);               // Note On no mesmo canal
        });

        hzArray.forEach((hz, i) => {
            let ch = i % 16;
            if (ch === 9) ch = 10;
            let mFloat = 69 + 12 * Math.log2(hz / 440);
            let stdNote = Math.max(0, Math.min(127, Math.round(mFloat)));

            if (i === 0) trackEvents.push(0x83, 0x60); // A 1ª nota a desligar espera 480 ticks (1 batida)
            else trackEvents.push(0x00);               // As restantes desligam no mesmo instante (Delta 0)

            trackEvents.push(0x80 + ch, stdNote, 0x00);
        });
    }

    trackEvents.push(0x00, 0xff, 0x2f, 0x00); // Fim da Track
    const trackLen = trackEvents.length;
    const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (trackLen >> 24) & 0xff, (trackLen >> 16) & 0xff, (trackLen >> 8) & 0xff, trackLen & 0xff];

    const blob = new Blob([new Uint8Array([...header, ...trackHeader, ...trackEvents])], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Export_${isSequence ? 'Melodia' : 'Acorde'}_Xen.mid`;
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

// ==========================================
// PONTEIROS GLOBAIS (Resolve o erro de referência)
// ==========================================
let globalHzToMidi = (hz) => 0;
let globalFormatAllOutput = (arr) => ({ midi: "-", midiCents: "-", hz: "-", notes: "-", quarters: "-" });

const UniversalOutput = ({ hzArray, title = "Resultado", showAudio = true, showMelody = false, converter, formatter }) => {
    // Se não receber via props, tenta usar o ponteiro global (fallback)
    const fmt = formatter ? formatter(hzArray) : globalFormatAllOutput(hzArray);

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
                        <button onClick={() => playAudio(hzArray, true)} className="w-1/2 bg-green-800 hover:bg-green-700 text-[9px] py-1.5 rounded transition shadow">🎵 Play Acorde</button>
                        <button onClick={() => exportMIDI(hzArray, false)} className="w-1/2 bg-blue-900 hover:bg-blue-800 text-[9px] py-1.5 rounded transition shadow">⬇ Exportar Acorde</button>
                    </div>
                    {showMelody && (
                        <div className="flex gap-1">
                            <button onClick={() => playAudio(hzArray, false)} className="w-1/2 bg-green-700 hover:bg-green-600 text-[9px] py-1.5 rounded transition shadow">🎵 Play Melodia</button>
                            <button onClick={() => exportMIDI(hzArray, true)} className="w-1/2 bg-blue-800 hover:bg-blue-700 text-[9px] py-1.5 rounded transition shadow">⬇ Exportar Melodia</button>
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


function BachRollVisualizer({ notes, isSequence = false, isMicrotonal = false, onKeyClick = null, onNoteDrag = null, onNoteDelete = null, originalEntityLength = 0, getIsBlackKey }) {
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
                        let m = maxMidi - i, y = i * rowHeight, isBlack = typeof getIsBlackKey === 'function' ? getIsBlackKey(m) : [1, 3, 6, 8, 10].includes(m % 12), isC = (m % 12 === 0);
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
            <div className="flex-1 min-w-0 overflow-auto custom-scrollbar relative" onScroll={handleScroll} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                <svg width={svgWidth} height={totalHeight} style={{ minWidth: `${svgWidth}px`, display: 'block' }}>
                    {Array.from({ length: maxMidi - minMidi + 1 }).map((_, i) => {
                        let m = maxMidi - i, y = i * rowHeight, isBlack = typeof getIsBlackKey === 'function' ? getIsBlackKey(m) : [1, 3, 6, 8, 10].includes(m % 12);
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
    // Trazendo o Contexto Microtonal Global, Afinações e Variáveis do Scale Workshop
    const {
        isMicrotonalMode, toggleMicrotonalMode, activeTuning, setActiveTuning,
        baseMidi, setBaseMidi, baseHz, setBaseHz,
        keyColorMode, setKeyColorMode, customKeyPattern, setCustomKeyPattern,
        accidentalModifier, setAccidentalModifier, // Traz de volta os acidentes
        globalSnap, setGlobalSnap                  // Traz de volta o Snap Global
    } = useTuning();
    // ==========================================
    // MOTORES GLOBAIS COM ÂNCORAS DINÂMICAS E SNAP-TO-FREQ
    // ==========================================
    function midiToHz(m) {
        if (!isMicrotonalMode) return 440 * Math.pow(2, (m - 69) / 12);

        if (activeTuning.type === 'edo') {
            return baseHz * Math.pow(2, (m - baseMidi) / activeTuning.divisions);
        }

        if (activeTuning.type === 'scala' && activeTuning.data) {
            const scale = activeTuning.data.scale;
            const scaleLen = scale.length;
            if (scaleLen === 0) return baseHz;
            const periodRatio = scale[scaleLen - 1].ratio;

            const diff = m - baseMidi;
            const periods = Math.floor(diff / scaleLen);
            const degree = ((Math.round(diff) % scaleLen) + scaleLen) % scaleLen;

            let ratioWithinPeriod = 1;
            if (degree > 0) ratioWithinPeriod = scale[degree - 1].ratio;

            return baseHz * Math.pow(periodRatio, periods) * ratioWithinPeriod;
        }
        return 440 * Math.pow(2, (m - 69) / 12);
    }

    function hzToMidi(hz) {
        if (hz <= 0) return 0;
        if (!isMicrotonalMode) return 69 + 12 * Math.log2(hz / 440);

        if (activeTuning.type === 'edo') {
            return baseMidi + activeTuning.divisions * Math.log2(hz / baseHz);
        }

        if (activeTuning.type === 'scala' && activeTuning.data) {
            const scale = activeTuning.data.scale;
            const scaleLen = scale.length;
            if (scaleLen === 0) return baseMidi;
            const periodRatio = scale[scaleLen - 1].ratio;

            const periodsFractional = Math.log(hz / baseHz) / Math.log(periodRatio);
            const periods = Math.floor(periodsFractional);
            const hzWithinPeriod = hz / (baseHz * Math.pow(periodRatio, periods));

            let closestDegree = 0;
            let minDiff = Math.abs(hzWithinPeriod - 1);

            for (let i = 0; i < scaleLen; i++) {
                const diff = Math.abs(hzWithinPeriod - scale[i].ratio);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestDegree = i + 1;
                }
            }
            return baseMidi + (periods * scaleLen) + closestDegree;
        }
        return 69 + 12 * Math.log2(hz / 440);
    }
    // APLICA A QUANTIZAÇÃO GLOBAL (Declarada como function para evitar ReferenceError)
    function applySnap(hzArray) {
        if (!globalSnap) return hzArray;
        return hzArray.map(hz => midiToHz(Math.round(hzToMidi(hz))));
    }

    // === TRADUTORES UNIVERSAIS DE EIXOS (Mantém a acústica na mudança de afinação) ===
    function getCentsForStep(step, tuning, isMicro) {
        if (!isMicro) return step * 100;
        if (tuning.type === 'edo') return step * (1200 / tuning.divisions);
        if (tuning.type === 'scala' && tuning.data && tuning.data.scale.length > 0) {
            const scale = tuning.data.scale;
            const scaleLen = scale.length;
            const period = scale[scaleLen - 1].cents || 1200;
            const octaves = Math.floor(step / scaleLen);
            const remainder = ((step % scaleLen) + scaleLen) % scaleLen;
            const centsWithin = remainder === 0 ? 0 : scale[remainder - 1].cents;
            return (octaves * period) + centsWithin;
        }
        return step * 100;
    }

    function getClosestStepForCents(cents, tuning, isMicro) {
        if (!isMicro) return Math.round(cents / 100);
        if (tuning.type === 'edo') return Math.round(cents / (1200 / tuning.divisions));
        if (tuning.type === 'scala' && tuning.data && tuning.data.scale.length > 0) {
            const scale = tuning.data.scale;
            const period = scale[scale.length - 1].cents || 1200;
            const octaves = Math.floor(cents / period);
            const remainder = cents - (octaves * period);

            let closestIdx = 0, minDiff = Math.abs(remainder);
            scale.forEach((s, i) => {
                const diff = Math.abs(remainder - s.cents);
                if (diff < minDiff) { minDiff = diff; closestIdx = i + 1; }
            });
            return octaves * scale.length + closestIdx;
        }
        return Math.round(cents / 100);
    }

    // Retorna a nota mais próxima com o desvio em Cents visível para TODOS os modos (Ex: E4 -50c)
    function midiToNote(m) {
        if (m === undefined || m === null) return "";

        let stdMidi = m;
        // Se estivermos no modo alienígena, calcula onde essa frequência cai no piano normal
        if (isMicrotonalMode) {
            const hz = midiToHz(m);
            stdMidi = 69 + 12 * Math.log2(hz / 440);
        }

        const intM = Math.round(stdMidi);
        const cents = Math.round((stdMidi - intM) * 100);
        const name = noteNames[((intM % 12) + 12) % 12];
        const oct = Math.floor(intM / 12) - 1;
        const sign = cents > 0 ? '+' : '';
        return `${name}${oct}${cents !== 0 ? ' ' + sign + cents + 'c' : ''}`;
    }

    const hzToStandardMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

    // O "Snap-to-Freq" Inteligente: Separa o comportamento da Partitura (Hz) e Piano Roll (Steps)
    const handleStaffClick = (clickedVal, setInputState) => {
        if (viewMode === 'roll') {
            // PIANO ROLL: Simula um controlador MIDI estrutural (insere o número do degrau cru)
            setInputState(prev => prev ? prev + ", " + clickedVal : String(clickedVal));
        } else {
            // PARTITURA: Visualiza frequências. Insere em Hz para a nota "colar" ao mudar de afinação!
            const targetHz = 440 * Math.pow(2, (clickedVal - 69) / 12);
            let realHz = targetHz;

            if (isMicrotonalMode) {
                const nearestStep = Math.round(hzToMidi(targetHz));
                realHz = midiToHz(nearestStep);
            }

            const formattedHz = realHz.toFixed(2) + "Hz";
            setInputState(prev => prev ? prev + ", " + formattedHz : formattedHz);
        }
    };
    function parseAdvancedToHz(str) {
        if (!str) return [];
        const parts = str.split(/[,;\s]+/).filter(Boolean);
        return parts.map(p => {
            const num = parseFloat(p);
            if (isNaN(num)) return null;
            if (p.toLowerCase().includes('hz')) return num;
            if (p.toLowerCase().includes('c')) return midiToHz(num / 100);
            return midiToHz(num);
        }).filter(n => n !== null);
    }

    function formatAllOutput(hzArray) {
        if (!hzArray || hzArray.length === 0) return { midi: "-", midiCents: "-", hz: "-", notes: "-", quarters: "-" };
        const midis = hzArray.map(hzToMidi);
        return {
            midi: midis.map(m => Math.round(m)).join(', '),
            midiCents: midis.map(m => {
                const intM = Math.round(m);
                const centsDev = Math.round((m - intM) * 100);
                return `${intM}${centsDev >= 0 ? '+' : ''}${centsDev}c`;
            }).join(', '),
            hz: hzArray.map(hz => `${hz.toFixed(2)}Hz`).join(', '),
            // Correção: midiToNote já faz o cálculo de cents internamente, então só chamamos a função!
            notes: midis.map(m => midiToNote(m)).join(', '),
            quarters: midis.map(m => {
                if (isMicrotonalMode) return `${m.toFixed(1)} graus`;
                const mQ = Math.round(m * 2) / 2;
                return mQ % 1 !== 0 ? `${noteNames[((Math.floor(mQ) % 12) + 12) % 12]}+${Math.floor(Math.floor(mQ) / 12) - 1}` : midiToNote(mQ);
            }).join(', ')
        };
    }
    globalHzToMidi = hzToMidi;
    globalFormatAllOutput = formatAllOutput;
    // baseNote removido, agora usa baseMidi do TuningContext
    const [intX, setIntX] = useState(7), [intY, setIntY] = useState(12), [intZ, setIntZ] = useState(4);
    const [selectedSet, setSelectedSet] = useState(new Set()), [showOnlyHighlight, setShowOnlyHighlight] = useState(false), [filterText, setFilterText] = useState("");
    const [nodeLabelMode, setNodeLabelMode] = useState("note"); // NOVO: "note", "degree", ou "hz"

    // CÉREBRO TRADUTOR: Protege as proporções acústicas ao mudar de afinação
    const prevTuningParams = useRef({ isMicro: isMicrotonalMode, tuning: activeTuning });
    const isFirstTuningMount = useRef(true);
    useEffect(() => {
        if (isFirstTuningMount.current) { isFirstTuningMount.current = false; return; }

        const prev = prevTuningParams.current;
        if (prev.isMicro !== isMicrotonalMode || prev.tuning !== activeTuning) {
            const oldTuning = prev.isMicro ? prev.tuning : { type: 'edo', divisions: 12 };
            const newTuning = isMicrotonalMode ? activeTuning : { type: 'edo', divisions: 12 };

            const translateAxis = (step) => {
                const centsOriginal = getCentsForStep(step, oldTuning, prev.isMicro);
                return getClosestStepForCents(centsOriginal, newTuning, isMicrotonalMode);
            };

            setIntX(x => translateAxis(x));
            setIntY(y => translateAxis(y));
            setIntZ(z => translateAxis(z));
        }
        prevTuningParams.current = { isMicro: isMicrotonalMode, tuning: activeTuning };
    }, [isMicrotonalMode, activeTuning]);

    const [tab2InputA, setTab2InputA] = useState(""), [tab2InputB, setTab2InputB] = useState("0, 4, 7"), [tab2NonTemp, setTab2NonTemp] = useState(false);
    const [tab3Input, setTab3Input] = useState("");
    const [tab4Input, setTab4Input] = useState(""), [targetMinHz, setTargetMinHz] = useState(440), [targetMaxHz, setTargetMaxHz] = useState(880);
    const [tab5Input, setTab5Input] = useState("60, 62, 64, 65, 67"), [tab5Type, setTab5Type] = useState("serial"), [tab5View, setTab5View] = useState("notes");
    const [tab6Input, setTab6Input] = useState(""), [tab6Limit, setTab6Limit] = useState(20), [tab6Order, setTab6Order] = useState(1);
    const [tab7Carrier, setTab7Carrier] = useState("440Hz"), [tab7Modulator, setTab7Modulator] = useState("100Hz"), [tab7K, setTab7K] = useState(5);
    const [tab8Input, setTab8Input] = useState(""), [tab8Harmonics, setTab8Harmonics] = useState(4), [tab8Sub, setTab8Sub] = useState(1);

    // ABA 9 - CALCULADORA
    const [tab9Input, setTab9Input] = useState("60, 64, 67");

    // ABA 10 - INTERPOLAÇÕES
    const [tab10InputA, setTab10InputA] = useState("60, 64, 67");
    const [tab10InputB, setTab10InputB] = useState("65, 69, 72");
    const [tab10Mode, setTab10Mode] = useState("chord"); // "chord" ou "melody"
    const [tab10Algo, setTab10Algo] = useState("log"); // "log" ou "costere"
    const [tab10Step, setTab10Step] = useState(0);
    const [tab10StepsCount, setTab10StepsCount] = useState(20);

    // ABA 11 - AFINAÇÕES E TEMPERAMENTOS
    const [tab11Mode, setTab11Mode] = useState("edo"); // "edo" ou "scala"
    const [tab11Edo, setTab11Edo] = useState(19);
    const [tab11ScalaData, setTab11ScalaData] = useState(null);

    const [viewMode, setViewMode] = useState('staff');

    const ignoreNextRef = useRef(false), panControlsRef = useRef();

    // ABA 14 - NOTAÇÃO MICROTONAL
    const [tab14Input, setTab14Input] = useState("");
    const [notationSystem, setNotationSystem] = useState("cents");
    const [sagittalLevel, setSagittalLevel] = useState("spartan");
    const [showPitchBends, setShowPitchBends] = useState(false); // NOVO: Toggle Pitch Bends

    // MOTORES (MEMOIZED)
    const points = useMemo(() => {
        const arr = [];

        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) {
                    // Magia Pura: Eixos baseados sempre em steps (degraus) e ancorados ao baseMidi global
                    const midiVal = baseMidi + (x * intX) + (y * intY) + (z * intZ);
                    // Formata a label baseada na escolha do Dropdown
                    let noteLabel = "";
                    if (nodeLabelMode === "degree") {
                        noteLabel = isMicrotonalMode ? midiVal.toFixed(2) : Math.round(midiVal).toString();
                    } else if (nodeLabelMode === "hz") {
                        noteLabel = `${midiToHz(midiVal).toFixed(1)} Hz`;
                    } else {
                        noteLabel = midiToNote(midiVal); // Nota + Cents
                    }

                    arr.push({
                        coord: [x, y, z],
                        position: [x * 1.5, y * 2, z * 2.5],
                        note: noteLabel,
                        midi: midiVal
                    });
                }
            }
        }
        return arr;
    }, [baseMidi, intX, intY, intZ, isMicrotonalMode, activeTuning, baseHz, nodeLabelMode]);

    const tab1Hz = useMemo(() => points.filter(pt => selectedSet.has(pt.coord.join(','))).map(pt => midiToHz(pt.midi)).sort((a, b) => a - b), [points, selectedSet]);

    // Motor da Aba 2 (Sempre calcula e transpõe na grade da afinação global atual)
    const tab2ResultHz = useMemo(() => {
        let hzA = parseAdvancedToHz(tab2InputA), hzB = parseAdvancedToHz(tab2InputB), res = new Set();
        if (!hzA.length || !hzB.length) return [];

        hzB.forEach(b => {
            let diff = hzToMidi(b) - hzToMidi(hzB[0]);
            hzA.forEach(a => res.add(midiToHz(hzToMidi(a) + diff)));
        });

        return Array.from(res).sort((a, b) => a - b);
    }, [tab2InputA, tab2InputB, isMicrotonalMode, activeTuning]);

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const tab3ParsedInput = parseAdvancedToHz(tab3Input).map(hzToMidi);
    const tab3ResultHz = useMemo(() => {
        let arr = [...tab3ParsedInput]; // Note: arr contém valores MIDI/Steps
        if (arr.length < 2) return arr.map(midiToHz);

        // Converte o intervalo total para Cents puros (para garantir que a acústica fecha o ciclo)
        const hzStart = midiToHz(arr[0]);
        const hzEnd = midiToHz(arr[arr.length - 1]);
        const intervalCents = Math.round(Math.abs(1200 * Math.log2(hzEnd / hzStart)));

        // Se o intervalo fechar em múltiplos de 1200c (uma oitava inteira), não repete.
        // Caso contrário, calcula o Mínimo Múltiplo Comum para fechar a oitava.
        let R = intervalCents % 1200 === 0 ? 1 : 1200 / gcd(1200, intervalCents % 1200);
        if (!Number.isFinite(R) || R > 40 || R <= 0) R = 12; // Limite de segurança

        let total = [...arr], cur = [...arr];
        for (let i = 1; i < R; i++) {
            let dist = total[total.length - 1] - cur[0];
            total = total.concat(cur.map(n => n + dist).slice(1));
        }
        return total.map(midiToHz);
    }, [tab3ParsedInput, isMicrotonalMode, activeTuning]);

    const tab4ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab4Input);
        if (hzArr.length < 2) return [];
        let minHz = Math.min(...hzArr), maxHz = Math.max(...hzArr);
        if (minHz === maxHz) return applySnap(hzArr);
        return applySnap(hzArr.map(f => targetMinHz * Math.pow((targetMaxHz / targetMinHz), (Math.log(f) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz)))));
    }, [tab4Input, targetMinHz, targetMaxHz, globalSnap, isMicrotonalMode, activeTuning]);

    const tab4MidiEquivalents = useMemo(() => tab4ResultHz.map(hzToMidi), [tab4ResultHz]);

    // MOTOR DE MATRIZES UNIVERSAL (Opera em Hz e Ratios Puros para ser 100% Xenharmônico)
    const tab5Matrix = useMemo(() => {
        let hzRow = parseAdvancedToHz(tab5Input);
        if (hzRow.length < 1) return { m: [], row: [], inv: [], type: tab5Type };

        let p0 = hzRow[0];
        let matrix = [];
        let inv = [];

        if (tab5Type === 'serial') {
            // Matriz Serial (Boulez/Schoenberg) -> Inversão Logarítmica em Hertz
            inv = hzRow.map(f => p0 * (p0 / f));
            for (let r = 0; r < hzRow.length; r++) {
                let mRow = [];
                for (let c = 0; c < hzRow.length; c++) {
                    mRow.push(hzRow[c] * (inv[r] / p0)); // Transposição multiplicativa
                }
                matrix.push(mRow);
            }
            return { m: matrix, row: hzRow, inv: inv, type: 'serial' };
        } else {
            // Matriz de Intervalos (Scale Workshop Style) -> Mostra a distância exata entre as notas
            for (let r = 0; r < hzRow.length; r++) {
                let mRow = [];
                for (let c = 0; c < hzRow.length; c++) {
                    mRow.push(hzRow[c] / hzRow[r]); // O valor guardado é a Razão (Ratio) absoluta
                }
                matrix.push(mRow);
            }
            return { m: matrix, row: hzRow, inv: hzRow, type: 'interval' };
        }
    }, [tab5Input, tab5Type]);

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
        return applySnap(Array.from(res).sort((a, b) => a - b).slice(0, tab6Limit));
    }, [tab6Input, tab6Limit, tab6Order, globalSnap, isMicrotonalMode, activeTuning]);

    const tab7ResultHz = useMemo(() => {
        let C_arr = parseAdvancedToHz(tab7Carrier); if (!C_arr.length) C_arr = [440];
        let M = parseAdvancedToHz(tab7Modulator)[0] || 100, res = new Set();
        C_arr.forEach(C => { res.add(C); for (let i = 1; i <= tab7K; i++) { res.add(C + i * M); res.add(Math.abs(C - i * M)); } });
        return applySnap(Array.from(res).sort((a, b) => a - b));
    }, [tab7Carrier, tab7Modulator, tab7K, globalSnap, isMicrotonalMode, activeTuning]);

    const tab8ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab8Input), res = new Set();
        hzArr.forEach(f => { for (let i = 1; i <= tab8Harmonics; i++) res.add(f * i); for (let i = 1; i <= tab8Sub; i++) res.add(f / i); });
        return applySnap(Array.from(res).sort((a, b) => a - b));
    }, [tab8Input, tab8Harmonics, tab8Sub, globalSnap, isMicrotonalMode, activeTuning]);

    // ABA 9: Calculadora Costère Dinâmica
    const tab9Arr = useMemo(() => parseAdvancedToHz(tab9Input).map(hzToMidi), [tab9Input]);
    const tab9Analysis = useMemo(() => {
        if (tab9Arr.length === 0) return null;
        // Descobre o tamanho do "universo" atual (EDO ou tamanho da escala JI Scala)
        const edo = isMicrotonalMode
            ? (activeTuning.type === 'edo' ? activeTuning.divisions : (activeTuning.data?.numNotes || 12))
            : 12;
        return {
            densities: calculateCardinalDensity(tab9Arr, edo),
            vector: getIntervalVector(tab9Arr, edo)
        };
    }, [tab9Arr, isMicrotonalMode, activeTuning]);
    const tab9ResultHz = useMemo(() => tab9Arr.map(midiToHz), [tab9Arr]);

    // ABA 10: Interpolações (Motor Robusto com Glissandos Microtonais)
    const tab10Frames = useMemo(() => {
        let hzA = parseAdvancedToHz(tab10InputA);
        let hzB = parseAdvancedToHz(tab10InputB);
        if (!hzA.length) hzA = [261.625];
        if (!hzB.length) hzB = [261.625];

        const steps = tab10StepsCount;
        const frames = [];
        const isMelody = tab10Mode === 'melody';

        const edo = isMicrotonalMode ? (activeTuning.type === 'edo' ? activeTuning.divisions : (activeTuning.data?.numNotes || 12)) : 12;

        const maxLen = Math.max(hzA.length, hzB.length);
        const aHz = [...hzA, ...Array(maxLen - hzA.length).fill(hzA[hzA.length - 1])];
        const bHz = [...hzB, ...Array(maxLen - hzB.length).fill(hzB[hzB.length - 1])];

        if (tab10Algo === 'log') {
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                let frameHz = aHz.map((fA, i) => {
                    const fB = bHz[i];
                    return fA * Math.pow(fB / fA, t);
                });
                frames.push(isMelody ? applySnap(frameHz) : applySnap([...new Set(frameHz)]));
            }
        } else {
            const aSteps = aHz.map(hzToMidi).map(Math.round);
            const bSteps = bHz.map(hzToMidi).map(Math.round);

            const pcsB = bSteps.map(n => ((n % edo) + edo) % edo);
            const densities = new Array(edo).fill(0);
            const fifthStep = Math.round((702 / 1200) * edo);

            for (let i = 0; i < edo; i++) {
                let score = 0;
                [i, (i + fifthStep) % edo, (i - fifthStep + edo) % edo, (i + 1) % edo, (i - 1 + edo) % edo].forEach(att => {
                    if (pcsB.includes(att)) score++;
                });
                densities[i] = score;
            }

            let currSteps = [...aSteps];
            const pushFrame = (stps) => {
                const hzArr = stps.map(midiToHz);
                frames.push(isMelody ? applySnap(hzArr) : applySnap([...new Set(hzArr)]));
            };

            pushFrame(currSteps);

            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                let nextSteps = currSteps.map((note, i) => {
                    if (note === bSteps[i]) return note;
                    const geomTarget = Math.round(aSteps[i] + (bSteps[i] - aSteps[i]) * t);
                    const pc = ((note % edo) + edo) % edo;

                    if (pcsB.includes(pc) && Math.abs(note - bSteps[i]) < edo) return note + Math.sign(bSteps[i] - note);

                    const upPC = (pc + 1) % edo, downPC = (pc - 1 + edo) % edo;
                    const dUp = densities[upPC], dDown = densities[downPC];
                    const bias = Math.sign(geomTarget - note);

                    if (bias > 0 && dUp >= dDown) return note + 1;
                    if (bias < 0 && dDown >= dUp) return note - 1;
                    if (dUp > dDown) return note + 1;
                    if (dDown > dUp) return note - 1;
                    return note + bias;
                });
                currSteps = nextSteps;
                if (s === steps) currSteps = [...bSteps];
                pushFrame(currSteps);
            }
        }
        return frames;
    }, [tab10InputA, tab10InputB, tab10Mode, tab10Algo, tab10StepsCount, isMicrotonalMode, activeTuning, globalSnap]);

    const tab10ResultHz = useMemo(() => {
        const step = Math.min(tab10Step, tab10Frames.length - 1);
        return tab10Frames[step] || []; // Já retorna Hertz puros!
    }, [tab10Step, tab10Frames]);

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

    // ==========================================
    // GERADOR DINÂMICO DE CORES DE TECLAS (HALBERSTADT) E TRADUTOR GLOBAL
    // ==========================================

    // Função que decide se uma tecla é branca ou preta baseado na afinação
    const getIsBlackKey = (m) => {
        if (!isMicrotonalMode || keyColorMode === '12-tet') {
            return [1, 3, 6, 8, 10].includes(((Math.round(m) % 12) + 12) % 12);
        }

        if (keyColorMode === 'custom') {
            const patternLen = customKeyPattern.length;
            if (patternLen === 0) return false;
            const idx = ((Math.round(m) % patternLen) + patternLen) % patternLen;
            return customKeyPattern[idx] === 'B';
        }

        // Modo 'auto' (Gera o padrão Halberstadt para qualquer EDO)
        if (activeTuning.type === 'edo') {
            const edo = activeTuning.divisions;
            // Aproximação do salto de Quinta Justa no EDO atual
            const fifth = Math.round((702 / 1200) * edo);
            const degree = ((Math.round(m) % edo) + edo) % edo;
            // Lógica geradora diatônica (F, C, G, D, A, E, B)
            let isDiatonic = false;
            for (let i = -1; i <= 5; i++) {
                if ((((i * fifth) % edo) + edo) % edo === degree) isDiatonic = true;
            }
            return !isDiatonic; // Se não é diatônica (branca), é preta
        }

        // Se for Scala/JI e estiver em auto, cai no padrão do 12-TET por segurança
        return [1, 3, 6, 8, 10].includes(((Math.round(m) % 12) + 12) % 12);
    };

    // Ref genérica para sabermos qual era a afinação anterior
    const prevTuningRef = useRef(activeTuning);
    const prevHzRef = useRef(baseHz);

    // O Tradutor Silencioso (Snap-to-Freq ao trocar de afinação)
    useEffect(() => {
        const prevTuning = prevTuningRef.current;
        const prevBaseHz = prevHzRef.current;

        // Se a afinação realmente mudou
        if (prevTuning.type !== activeTuning.type || prevTuning.divisions !== activeTuning.divisions || prevTuning.data !== activeTuning.data || prevBaseHz !== baseHz) {

            // Função interna que converte os números antigos em Hertz (usando a regra antiga) e converte de volta (usando a nova)
            const translateString = (str) => {
                if (!str) return str;
                const parts = str.split(/[,;\s]+/).filter(Boolean);
                return parts.map(p => {
                    const num = parseFloat(p);
                    if (isNaN(num)) return p;
                    if (p.toLowerCase().includes('hz')) return p; // Se já é Hz, ignora

                    // Cálculo manual do Hertz usando a configuração antiga
                    let oldHz = 440 * Math.pow(2, (num - 69) / 12); // Padrão 12-tet
                    if (isMicrotonalMode && prevTuning.type === 'edo') {
                        oldHz = prevBaseHz * Math.pow(2, (num - baseMidi) / prevTuning.divisions);
                    }

                    // Converte esse Hertz para o step da NOVA configuração
                    return Math.round(hzToMidi(oldHz));
                }).join(', ');
            };

            if (isMicrotonalMode) {
                // Atualiza silenciosamente todas as caixas de texto com os steps equivalentes na nova afinação
                setTab2InputA(prev => translateString(prev));
                setTab2InputB(prev => translateString(prev));
                setTab3Input(prev => translateString(prev));
                setTab4Input(prev => translateString(prev));
                setTab5Input(prev => translateString(prev));
                setTab6Input(prev => translateString(prev));
                setTab9Input(prev => translateString(prev));
                setTab10InputA(prev => translateString(prev));
                setTab10InputB(prev => translateString(prev));
            }

            prevTuningRef.current = activeTuning;
            prevHzRef.current = baseHz;
        }
    }, [activeTuning, baseHz, isMicrotonalMode]);
    // SINCRONIZA AS FERRAMENTAS 9 E 10 COM A REDE 3D
    useEffect(() => {
        if (activeTool === 9) {
            const currentMidis = tab9ResultHz.map(hzToMidi).map(Math.round);
            const newSet = new Set();
            points.forEach(pt => { if (currentMidis.includes(Math.round(pt.midi))) newSet.add(pt.coord.join(',')); });
            setSelectedSet(newSet);
        } else if (activeTool === 10) {
            const currentMidis = tab10ResultHz.map(hzToMidi).map(Math.round);
            const newSet = new Set();
            points.forEach(pt => { if (currentMidis.includes(Math.round(pt.midi))) newSet.add(pt.coord.join(',')); });
            setSelectedSet(newSet);
        }
    }, [tab9ResultHz, tab10ResultHz, activeTool, points]);

    // ATALHO DE TECLADO: Alt + Setas para mover a última nota inserida
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();

                // Mapeia qual input de texto estamos editando baseado na aba ativa
                const tabInputMap = {
                    2: { val: tab2InputA, set: setTab2InputA },
                    3: { val: tab3Input, set: setTab3Input },
                    4: { val: tab4Input, set: setTab4Input },
                    5: { val: tab5Input, set: setTab5Input },
                    6: { val: tab6Input, set: setTab6Input },
                    7: { val: tab7Carrier, set: setTab7Carrier },
                    8: { val: tab8Input, set: setTab8Input },
                    9: { val: tab9Input, set: setTab9Input },
                    10: { val: tab10InputA, set: setTab10InputA },
                };

                const current = tabInputMap[activeTool];
                if (!current || !current.val) return;

                // Pega a última nota da string (ex: "60, 64Hz" -> "64Hz")
                let parts = current.val.split(',').map(s => s.trim());
                if (parts.length === 0 || parts[0] === "") return;

                let lastPart = parts[parts.length - 1];

                // Extrai apenas os números (permite decimais e negativos)
                let match = lastPart.match(/-?\d+(\.\d+)?/);
                if (!match) return;

                let numVal = parseFloat(match[0]);
                let suffix = lastPart.replace(match[0], ''); // Guarda "Hz", "c", etc.

                const stepDir = e.key === 'ArrowUp' ? 1 : -1;
                let newValStr = "";

                if (isMicrotonalMode) {
                    // 1. Converte o que está escrito em Hz puros
                    let currentHz = numVal;
                    if (suffix.toLowerCase().trim() === 'hz') currentHz = numVal;
                    else if (suffix.toLowerCase().trim() === 'c') currentHz = midiToHz(numVal / 100);
                    else currentHz = midiToHz(numVal); // Assume que é o número do Step

                    // 2. Acha o degrau atual da escala
                    let currentStep = Math.round(hzToMidi(currentHz));
                    // 3. Anda um degrau inteiro na escala (19-EDO, JI, Bohlen-Pierce...)
                    let nextStep = currentStep + stepDir;

                    // 4. Formata de volta para a linguagem que o utilizador estava a usar
                    if (suffix.toLowerCase().trim() === 'hz') {
                        newValStr = midiToHz(nextStep).toFixed(2);
                    } else if (suffix.toLowerCase().trim() === 'c') {
                        newValStr = (nextStep * 100).toString();
                    } else {
                        newValStr = nextStep.toString();
                    }
                } else {
                    // Modo 12-TET clássico: apenas sobe/desce 1 semitom
                    let newVal = numVal + stepDir;
                    newValStr = Number.isInteger(newVal) ? newVal.toString() : newVal.toFixed(2);
                }

                parts[parts.length - 1] = newValStr + suffix;
                current.set(parts.join(', '));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTool, tab2InputA, tab3Input, tab4Input, tab5Input, tab6Input, tab7Carrier, tab8Input, tab9Input, tab10InputA]);

    const { lastEvent } = useMidi();
    const [activeMidiNotes, setActiveMidiNotes] = useState(new Set());

    useEffect(() => {
        if (!lastEvent) return;
        const { note, type, velocity } = lastEvent;

        if (type === 'on' && velocity > 0) {
            // LÓGICA PARA ABAS DE INSERÇÃO (2 a 10)
            const tabInputMap = {
                2: { val: tab2InputA, set: setTab2InputA },
                3: { val: tab3Input, set: setTab3Input },
                4: { val: tab4Input, set: setTab4Input },
                6: { val: tab6Input, set: setTab6Input },
                7: { val: tab7Carrier, set: setTab7Carrier },
                8: { val: tab8Input, set: setTab8Input },
                9: { val: tab9Input, set: setTab9Input },
                10: { val: tab10InputA, set: setTab10InputA },
            };

            const current = tabInputMap[activeTool];
            if (current) {
                current.set(prev => prev ? `${prev}, ${note}` : `${note}`);
            }

            // LÓGICA PARA ABA 13 (TECLADO VIVO)
            if (activeTool === 13) {
                setActiveMidiNotes(prev => new Set(prev).add(note));
                playAudio([midiToHz(note)], true); // Toca a nota na afinação atual!
            }
        } else {
            if (activeTool === 13) {
                setActiveMidiNotes(prev => {
                    const copy = new Set(prev);
                    copy.delete(note);
                    return copy;
                });
                stopAudio(); // Opcional: manter ou parar o som
            }
        }

    }, [lastEvent]);
    // RESTAURANDO OS BOTÕES DE PUXAR:
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

            {/* BARRA GLOBAL SUPERIOR: Fica fora do caminho de tudo */}
            <div className="w-full bg-gray-900 border-b border-gray-700 p-2 flex justify-end items-center z-50 shadow-md gap-6">

                {/* TOGGLE SNAP TO GRID (QUANTIZAR) */}
                <div className="flex items-center">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mr-2">
                        Quantizar (Snap)
                    </span>
                    <button
                        onClick={() => setGlobalSnap(!globalSnap)}
                        className={`w-10 h-5 rounded-full p-1 transition-colors ${globalSnap ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                        <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${globalSnap ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                {/* TOGGLE XENHARMÔNICO */}
                <div className="flex items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-2">
                        {isMicrotonalMode ? 'Modo Xenharmônico' : 'Modo 12-TET'}
                    </span>
                    <button
                        onClick={toggleMicrotonalMode}
                        className={`w-10 h-5 rounded-full p-1 transition-colors ${isMicrotonalMode ? 'bg-[#00ffcc]' : 'bg-gray-600'}`}
                    >
                        <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${isMicrotonalMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 relative flex overflow-hidden">

                {/* ABA 1: REDES */}
                {activeTool === 1 && (
                    <>
                        {/* NOVO CONTAINER: Preso ao topo e ao fundo (bottom-4) para garantir que a barra de rolagem funcione! */}
                        <div className="absolute top-4 bottom-4 left-4 bg-gray-900 bg-opacity-95 p-3 rounded-lg z-10 w-[280px] shadow-xl border border-gray-700 flex flex-col pointer-events-auto">

                            {/* ÁREA COM SCROLL (Apenas os controlos rolam) */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                <div className="space-y-3">
                                    <label className="flex justify-between items-center text-xs">Âncora Global (0,0,0):
                                        <input
                                            type="number"
                                            className="bg-gray-800 p-1 rounded border border-gray-600 text-center w-16 text-[#00ffcc] font-bold"
                                            value={baseMidi}
                                            onChange={e => {
                                                const novoMidi = Number(e.target.value);
                                                setBaseMidi(novoMidi);
                                                setBaseHz(Number((440 * Math.pow(2, (novoMidi - 69) / 12)).toFixed(6)));
                                            }}
                                        />
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <label className="flex flex-col text-[10px] text-gray-400">
                                            Eixo X (Graus):
                                            <input className="mt-1 bg-gray-800 p-1 text-center rounded text-white" type="number" step="1" value={intX} onChange={e => setIntX(parseInt(e.target.value) || 0)} />
                                        </label>
                                        <label className="flex flex-col text-[10px] text-gray-400">
                                            Eixo Y (Graus):
                                            <input className="mt-1 bg-gray-800 p-1 text-center rounded text-white" type="number" step="1" value={intY} onChange={e => setIntY(parseInt(e.target.value) || 0)} />
                                        </label>
                                        <label className="flex flex-col text-[10px] text-gray-400">
                                            Eixo Z (Graus):
                                            <input className="mt-1 bg-gray-800 p-1 text-center rounded text-white" type="number" step="1" value={intZ} onChange={e => setIntZ(parseInt(e.target.value) || 0)} />
                                        </label>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-gray-600">
                                    {/* MENU DE VISUALIZAÇÃO DOS NÓS 3D */}
                                    <span className="text-xs text-gray-400 block mb-1">Rótulos das Esferas:</span>
                                    <select
                                        className="w-full bg-gray-800 text-[10px] p-1.5 rounded border border-gray-600 mb-3 text-white"
                                        value={nodeLabelMode}
                                        onChange={e => setNodeLabelMode(e.target.value)}
                                    >
                                        <option value="note">Nota + Cents</option>
                                        <option value="degree">Grau / Steps</option>
                                        <option value="hz">Frequência Exata (Hz)</option>
                                    </select>

                                    <span className="text-xs text-gray-400 block mb-2">Filtrar (ex: 0,1,-1 a 3,1,-1):</span>
                                    <div className="flex space-x-2 mb-3">
                                        <input type="text" className="flex-1 bg-gray-800 text-xs p-1.5 rounded border border-gray-600" value={filterText} onChange={e => setFilterText(e.target.value)} />
                                        <button onClick={applyFilter} className="bg-green-600 hover:bg-green-500 px-3 rounded text-xs">Ok</button>
                                    </div>
                                    <label className="flex items-center text-xs cursor-pointer mb-3"><input type="checkbox" className="mr-2" checked={showOnlyHighlight} onChange={e => setShowOnlyHighlight(e.target.checked)} /> Esconder inativas</label>
                                    <div className="flex space-x-2">
                                        <button onClick={() => panControlsRef.current?.resetCamera()} className="flex-1 bg-blue-900 text-[10px] py-1.5 rounded">Cent. Câm</button>
                                        <button onClick={() => { setBaseMidi(60); setIntX(7); setIntY(12); setIntZ(4); setSelectedSet(new Set()); }} className="flex-1 bg-red-900 text-[10px] py-1.5 rounded">Limpar</button>
                                    </div>
                                </div>
                            </div>

                            {/* RESULTADO FIXO NO FUNDO (Não rola, fica sempre visível) */}
                            <div className="flex-none pt-3 mt-2 border-t border-gray-700">
                                <UniversalOutput
                                    hzArray={tab1Hz}
                                    title="Entidade Gerada"
                                    isSimultaneous={true}
                                    showMelody={true}
                                    formatter={formatAllOutput}
                                />
                            </div>
                        </div>

                        {/* O CANVAS 3D CONTINUA AQUI INTACTO... */}
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

                {/* ABA 2: MULTIPLICAÇÃO */}
                {activeTool === 2 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab2InputA} />
                            <label className="text-xs text-gray-400">A (Multiplicando):</label>
                            <textarea value={tab2InputA} onChange={e => setTab2InputA(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[60px]" placeholder="Ex: 60, 64, 67" />

                            <label className="text-xs text-gray-400 mt-2">B (Multiplicador):</label>
                            <textarea value={tab2InputB} onChange={e => setTab2InputB(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[60px]" placeholder="Ex: 0, 4, 7" />

                            <button onClick={() => { setTab2InputA(""); setTab2InputB(""); }} className="bg-red-900 text-[10px] w-full py-1.5 rounded mt-2">Limpar Tudo</button>

                            <UniversalOutput hzArray={tab2ResultHz} title="Bloco Resultante" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <div className="flex items-center gap-2">
                                    {viewMode === 'staff' && <StaffToolbar />}
                                    <button onClick={() => setTab2InputA("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado (A)</button>
                                </div>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab2ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab2InputA)} /> : <GrandStaffVisualizer notes={tab2ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab2InputA)} />}
                        </div>
                    </div>
                )}

                {/* ABA 3: MÓDULOS CÍCLICOS */}
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
                                <div className="flex items-center gap-2">
                                    {viewMode === 'staff' && <StaffToolbar />}
                                    <button onClick={() => setTab3Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                                </div>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab3ResultHz.map(hzToStandardMidi)} isSequence={true} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab3Input)} onNoteDrag={(idx, m) => { let a = [...tab3ParsedInput]; if (idx < a.length) { a[idx] = m; setTab3Input(a.join(', ')); } }} originalEntityLength={tab3ParsedInput.length} onNoteDelete={(idx) => { let a = [...tab3ParsedInput]; if (idx < a.length) { a.splice(idx, 1); setTab3Input(a.join(', ')); } }} /> : <GrandStaffVisualizer notes={tab3ResultHz.map(hzToStandardMidi)} isSequence={true} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab3Input)} />}
                        </div>
                    </div>
                )}

                {/* ABA 4: PROJEÇÕES PROPORCIONAIS */}
                {activeTool === 4 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab4Input} />
                            <textarea value={tab4Input} onChange={e => setTab4Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" placeholder="Entidade base..." />
                            <button onClick={() => setTab4Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Entrada</button>
                            <div className="border-t border-gray-700 pt-3 space-y-3 mb-3">
                                <button onClick={() => { let arr = parseAdvancedToHz(tab4Input); if (arr.length > 0) { setTargetMinHz(Math.min(...arr).toFixed(2)); setTargetMaxHz(Math.max(...arr).toFixed(2)); } }} className="w-full bg-purple-800 text-[10px] py-1 rounded">Normalizar Espaço</button>
                                <div><label className="text-[10px] text-gray-300">Min: {targetMinHz} Hz</label><input type="range" min="20" max="2000" value={targetMinHz} onChange={e => setTargetMinHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                                <div><label className="text-[10px] text-gray-300">Max: {targetMaxHz} Hz</label><input type="range" min="20" max="10000" value={targetMaxHz} onChange={e => setTargetMaxHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                            </div>

                            <UniversalOutput hzArray={tab4ResultHz} title="Projeção" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <div className="flex items-center gap-2">
                                    {viewMode === 'staff' && <StaffToolbar />}
                                    <button onClick={() => setTab4Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                                </div>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab4ResultHz.map(hzToStandardMidi)} isSequence={true} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab4Input)} /> : <GrandStaffVisualizer notes={tab4ResultHz.map(hzToStandardMidi)} isSequence={true} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab4Input)} />}
                        </div>
                    </div>
                )}

                {/* ABA 5: MATRIZES E ANÁLISE */}
                {activeTool === 5 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab5Input} />
                            <textarea value={tab5Input} onChange={e => setTab5Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Coleção de notas..." />
                            <button onClick={() => setTab5Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-full py-1.5 rounded transition">Limpar Entradas</button>

                            <div className="border-t border-gray-700 pt-3">
                                <h4 className="text-[10px] font-bold text-[#00ffcc] mb-1 uppercase tracking-wider">Tipo de Matriz:</h4>
                                <select className="w-full bg-gray-800 p-1.5 text-[11px] rounded border border-gray-600 text-white mb-2" value={tab5Type} onChange={e => setTab5Type(e.target.value)}>
                                    <option value="serial">Matriz Serial (Original/Inversão)</option>
                                    <option value="interval">Matriz de Intervalos (Scale Workshop)</option>
                                </select>

                                <h4 className="text-[10px] font-bold text-gray-300 mb-1 mt-2">Formato das Células:</h4>
                                <select className="w-full bg-gray-800 p-1.5 text-[11px] rounded border border-gray-600 text-white" value={tab5View} onChange={e => setTab5View(e.target.value)}>
                                    <option value="notes">Notas Musicais</option>
                                    <option value="cents">Desvio em Cents</option>
                                    <option value="ratio">Ratio / Decimal</option>
                                    <option value="hz">Frequência (Hz)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 p-5 bg-gray-950 overflow-auto custom-scrollbar flex items-start justify-start relative">
                            {tab5Matrix.m.length > 0 && (() => {
                                // NOVO MOTOR DE REPRODUÇÃO DA MATRIZ
                                const playMatrixSequence = (type, index) => {
                                    let hzArray = [];
                                    if (tab5Matrix.type === 'serial') {
                                        if (type === 'P') hzArray = [...tab5Matrix.m[index]]; // Prime (Linha normal)
                                        else if (type === 'R') hzArray = [...tab5Matrix.m[index]].reverse(); // Retrograde (Linha invertida)
                                        else if (type === 'I') hzArray = tab5Matrix.m.map(row => row[index]); // Inversion (Coluna normal)
                                        else if (type === 'RI') hzArray = tab5Matrix.m.map(row => row[index]).reverse(); // Ret. Inv. (Coluna de baixo para cima)
                                    } else {
                                        // Na matriz de intervalos, tocamos a escala base
                                        if (type === 'P') hzArray = [...tab5Matrix.row];
                                        else if (type === 'R') hzArray = [...tab5Matrix.row].reverse();
                                    }
                                    playAudio(hzArray, false); // false = toca como melodia (um a um)
                                };

                                return (
                                    <table className="border-collapse bg-gray-900 border border-gray-500 shadow-2xl text-center min-w-max m-auto relative z-10">
                                        <thead>
                                            <tr>
                                                <th className="p-1 bg-gray-950"></th>
                                                {tab5Matrix.inv.map((val, i) => (
                                                    <th key={i}
                                                        className="text-[10px] text-blue-300 border border-gray-700 p-2 bg-gray-800 cursor-pointer hover:bg-blue-900 hover:text-white transition-colors"
                                                        onClick={() => playMatrixSequence('I', i)}
                                                        title="Ouvir Inversão"
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <span>▶</span>
                                                            <span>{tab5Type === 'serial' ? `I${i} ↓` : formatAllOutput([val]).notes}</span>
                                                        </div>
                                                    </th>
                                                ))}
                                                {tab5Type === 'serial' && <th className="p-1 bg-gray-950"></th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tab5Matrix.m.map((row, rIdx) => (
                                                <tr key={rIdx}>
                                                    <th className="text-[10px] text-green-300 border border-gray-700 p-2 bg-gray-800 cursor-pointer hover:bg-green-900 hover:text-white transition-colors"
                                                        onClick={() => playMatrixSequence('P', rIdx)}
                                                        title="Ouvir Original (Prime)"
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <span>{tab5Type === 'serial' ? `P${rIdx} →` : formatAllOutput([tab5Matrix.row[rIdx]]).notes}</span>
                                                            <span>▶</span>
                                                        </div>
                                                    </th>

                                                    {row.map((val, cIdx) => {
                                                        let display = "-";
                                                        if (tab5Type === 'serial') {
                                                            if (tab5View === 'notes') display = formatAllOutput([val]).notes;
                                                            else if (tab5View === 'cents') {
                                                                const centsFromRoot = 1200 * Math.log2(val / tab5Matrix.m[0][0]);
                                                                display = `${centsFromRoot >= 0 ? '+' : ''}${centsFromRoot.toFixed(1)}c`;
                                                            }
                                                            else if (tab5View === 'hz') display = `${val.toFixed(2)}Hz`;
                                                            else if (tab5View === 'ratio') display = (val / tab5Matrix.m[0][0]).toFixed(4);
                                                        } else {
                                                            const cents = 1200 * Math.log2(val);
                                                            if (tab5View === 'cents') display = `${cents > 0 ? '+' : ''}${cents.toFixed(1)}c`;
                                                            else if (tab5View === 'ratio') display = val.toFixed(4);
                                                            else if (tab5View === 'hz') display = "-";
                                                            else if (tab5View === 'notes') display = `${cents > 0 ? '+' : ''}${Math.round(cents)}c`;
                                                        }

                                                        const isDiagonal = tab5Type === 'interval' && rIdx === cIdx;
                                                        const isRoot = tab5Type === 'serial' && val === tab5Matrix.m[0][0];

                                                        return (
                                                            <td key={cIdx} className={`border border-gray-700 p-2 font-mono text-[10px] ${isDiagonal || isRoot ? 'bg-gray-800 text-red-300 font-bold' : 'text-gray-300 hover:bg-gray-700 transition-colors cursor-crosshair'}`}>
                                                                {display}
                                                            </td>
                                                        );
                                                    })}

                                                    {tab5Type === 'serial' && (
                                                        <th className="text-[10px] text-yellow-300 border border-gray-700 p-2 bg-gray-800 cursor-pointer hover:bg-yellow-900 hover:text-white transition-colors"
                                                            onClick={() => playMatrixSequence('R', rIdx)}
                                                            title="Ouvir Retrógrado"
                                                        >
                                                            <div className="flex items-center justify-center gap-1">
                                                                <span>◀</span>
                                                                <span>← R{rIdx}</span>
                                                            </div>
                                                        </th>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                        {tab5Type === 'serial' && (
                                            <tfoot>
                                                <tr>
                                                    <th className="p-1 bg-gray-950"></th>
                                                    {tab5Matrix.inv.map((val, i) => (
                                                        <th key={i}
                                                            className="text-[10px] text-purple-300 border border-gray-700 p-2 bg-gray-800 cursor-pointer hover:bg-purple-900 hover:text-white transition-colors"
                                                            onClick={() => playMatrixSequence('RI', i)}
                                                            title="Ouvir Retrógrado da Inversão"
                                                        >
                                                            <div className="flex items-center justify-center gap-1">
                                                                <span>↑ RI{i}</span>
                                                                <span>◀</span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                    <th className="p-1 bg-gray-950"></th>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* ABA 6: RING MODULATION */}
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
                                <div className="flex items-center gap-2">
                                    {viewMode === 'staff' && <StaffToolbar />}
                                    <button onClick={() => setTab6Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                                </div>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab6ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab6Input)} /> : <GrandStaffVisualizer notes={tab6ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab6Input)} />}
                        </div>
                    </div>
                )}

                {/* ABA 7: FM SYNTHESIS */}
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
                                <div className="flex items-center gap-2">
                                    {viewMode === 'staff' && <StaffToolbar />}
                                    <button onClick={() => setTab7Carrier("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado (C)</button>
                                </div>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab7ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab7Carrier)} /> : <GrandStaffVisualizer notes={tab7ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab7Carrier)} />}
                        </div>
                    </div>
                )}

                {/* ABA 8: ADDITIVE SYNTHESIS */}
                {activeTool === 8 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab8Input} />
                            <textarea value={tab8Input} onChange={e => setTab8Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[80px]" placeholder="Fundamentais..." />
                            <button onClick={() => setTab8Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar Pauta</button>
                            <div className="flex justify-around py-2 border-y border-gray-700 mt-2 mb-3">
                                <Knob value={tab8Harmonics} min={1} max={100} step={1} onChange={setTab8Harmonics} label="Harmônicos" />
                                <Knob value={tab8Sub} min={1} max={32} step={1} onChange={setTab8Sub} label="Sub-Harm" />
                            </div>

                            <UniversalOutput hzArray={tab8ResultHz} title="Espectro Aditivo" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                <div className="flex items-center gap-2">
                                    {viewMode === 'staff' && <StaffToolbar />}
                                    <button onClick={() => setTab8Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                                </div>
                            </div>
                            {viewMode === 'roll' ? <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab8ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab8Input)} /> : <GrandStaffVisualizer notes={tab8ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => handleStaffClick(m, setTab8Input)} />}
                        </div>
                    </div>
                )}

                {/* ABA 9: CALCULADORA COSTÈRE */}
                {activeTool === 9 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab9Input} />
                            <label className="text-xs text-gray-400">Coleção para Análise:</label>
                            <textarea value={tab9Input} onChange={e => setTab9Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[60px]" placeholder="Ex: 60, 64, 67" />
                            <button onClick={() => setTab9Input("")} className="bg-red-900 text-[10px] w-full py-1.5 rounded">Limpar</button>

                            {tab9Analysis && (
                                <div className="bg-gray-950 p-2 rounded border border-gray-700 flex flex-col space-y-2 mt-2 shadow-inner">
                                    <span className="text-[10px] text-[#00ffcc] font-bold border-b border-gray-800 pb-1 uppercase">Set-Theory / Costère</span>
                                    <div className="text-[9px]">
                                        <span className="text-gray-500 block mb-1">Vetor Intervalar (1 a 6 semitons):</span>
                                        <span className="text-gray-300 font-mono bg-gray-800 p-1 rounded block text-center border border-gray-700">[{tab9Analysis.vector.join(', ')}]</span>
                                    </div>
                                    <div className="text-[9px] mt-1">
                                        <span className="text-gray-500 block mb-1">Densidades Cardinais (Gravidade):</span>
                                        <div className="grid grid-cols-6 gap-1 mt-1 text-center font-mono">
                                            {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((note, i) => (
                                                <div key={i} className="bg-gray-800 rounded border border-gray-700 pt-0.5 pb-1">
                                                    <div className="text-gray-500 text-[7px]">{note}</div>
                                                    <div className={`text-[10px] ${tab9Analysis.densities[i] > 2 ? 'text-green-400 font-bold' : 'text-gray-300'}`}>{tab9Analysis.densities[i]}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <UniversalOutput hzArray={tab9ResultHz} title="Entidade Atual" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col relative">
                            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
                                <Canvas camera={{ position: [0, 0, 2.2], fov: 60 }}>
                                    <ambientLight />{PanControlsSingleton}<GridLines showOnlyHighlight={true} selectedSet={selectedSet} />
                                    {points.map((pt, idx) => {
                                        const isSel = selectedSet.has(pt.coord.join(','));
                                        return <NotePoint key={idx} pt={pt} selectedSet={selectedSet} toggleSelect={() => { }} blendedHue={(pt.coord[0] + 7) / 14 * 360 * 0.75 + (pt.coord[2] + 2) / 4 * 120 * 0.25} isSel={isSel} ignoreNextRef={ignoreNextRef} customOpacity={isSel ? 0.9 : 0.03} textOpacity={isSel ? 1 : 0.05} />;
                                    })}
                                </Canvas>
                            </div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex justify-between items-center mb-2">
                                    <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                    <div className="flex items-center gap-2">
                                        {viewMode === 'staff' && <StaffToolbar />}
                                        <button onClick={() => setTab9Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2">Limpar Teclado</button>
                                    </div>
                                </div>
                                <div className="flex-1 shadow-2xl rounded overflow-hidden border border-gray-700 bg-gray-900 bg-opacity-90 backdrop-blur-sm">
                                    {viewMode === 'roll' ?
                                        <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab9ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab9Input)} /> :
                                        <GrandStaffVisualizer notes={tab9ResultHz.map(hzToStandardMidi)} isSequence={false} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab9Input)} />}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ABA 10: INTERPOLAÇÕES */}
                {activeTool === 10 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[280px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab10InputA} />

                            <div className="flex flex-col space-y-2">
                                <div className="flex bg-gray-800 rounded border border-gray-600 overflow-hidden">
                                    <button onClick={() => setTab10Mode('chord')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab10Mode === 'chord' ? 'bg-purple-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Acorde</button>
                                    <button onClick={() => setTab10Mode('melody')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab10Mode === 'melody' ? 'bg-purple-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Melodia</button>
                                </div>
                                <div className="flex bg-gray-800 rounded border border-gray-600 overflow-hidden">
                                    <button onClick={() => setTab10Algo('log')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab10Algo === 'log' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Logarítmica</button>
                                    <button onClick={() => setTab10Algo('costere')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab10Algo === 'costere' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Costère</button>
                                </div>
                            </div>

                            <div className="space-y-2 mt-2">
                                <label className="text-[10px] text-gray-400">Entidade A (Início):</label>
                                <textarea value={tab10InputA} onChange={e => setTab10InputA(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[50px]" placeholder="Ex: 60, 64, 67" />
                                <label className="text-[10px] text-gray-400">Entidade B (Destino):</label>
                                <textarea value={tab10InputB} onChange={e => setTab10InputB(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[50px]" placeholder="Ex: 65, 69, 72" />
                            </div>

                            <div className="border-t border-gray-700 pt-3 pb-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">Morphing</span>
                                    <span className="text-xs text-[#00ffcc] font-mono font-bold">{Math.round((tab10Step / tab10StepsCount) * 100)}%</span>
                                </div>
                                <input type="range" min="0" max={tab10StepsCount} value={tab10Step} onChange={(e) => setTab10Step(Number(e.target.value))} className="w-full accent-blue-500 cursor-pointer" />
                                <div className="flex justify-between text-[8px] text-gray-500 mt-1"><span>A</span><span>B</span></div>
                            </div>

                            <UniversalOutput hzArray={tab10ResultHz} title="Frame Atual" isSimultaneous={tab10Mode === 'chord'} showMelody={tab10Mode === 'melody'} />
                        </div>

                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col relative">
                            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
                                <Canvas camera={{ position: [0, 0, 2.2], fov: 60 }}>
                                    <ambientLight />{PanControlsSingleton}<GridLines showOnlyHighlight={true} selectedSet={selectedSet} />
                                    {points.map((pt, idx) => {
                                        const isSel = selectedSet.has(pt.coord.join(','));
                                        return <NotePoint key={idx} pt={pt} selectedSet={selectedSet} toggleSelect={() => { }} blendedHue={(pt.coord[0] + 7) / 14 * 360 * 0.75 + (pt.coord[2] + 2) / 4 * 120 * 0.25} isSel={isSel} ignoreNextRef={ignoreNextRef} customOpacity={isSel ? 0.9 : 0.03} textOpacity={isSel ? 1 : 0.05} />;
                                    })}
                                </Canvas>
                            </div>

                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex justify-between items-center mb-2">
                                    <VisualizerToggle viewMode={viewMode} setViewMode={setViewMode} themeColor={themeColor} />
                                    <div className="flex items-center gap-2">
                                        {viewMode === 'staff' && <StaffToolbar />}
                                        <button onClick={() => { setTab10InputA(""); setTab10InputB(""); setTab10Step(0); }} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 h-8 rounded transition ml-2 shadow">Limpar Tudo</button>
                                    </div>
                                </div>

                                <div className="flex-1 shadow-2xl rounded overflow-hidden border border-gray-700 bg-gray-900 bg-opacity-90 backdrop-blur-sm">
                                    {viewMode === 'roll' ?
                                        <BachRollVisualizer getIsBlackKey={getIsBlackKey} notes={tab10ResultHz.map(hzToStandardMidi)} isSequence={tab10Mode === 'melody'} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab10InputA)} /> :
                                        <GrandStaffVisualizer notes={tab10ResultHz.map(hzToStandardMidi)} isSequence={tab10Mode === 'melody'} isMicrotonal={isMicrotonalMode} onKeyClick={m => handleStaffClick(m, setTab10InputA)} />
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ABA 11: AFINAÇÕES E TEMPERAMENTOS (O NOVO SCALE WORKSHOP) */}
                {activeTool === 11 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[320px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">

                            {/* BLOCO 1: GERADOR DE ESCALAS */}
                            <div>
                                <h3 className="text-[#00ffcc] font-bold text-[10px] uppercase mb-2 tracking-wider">Gerador de Escalas</h3>
                                <div className="flex bg-gray-800 rounded border border-gray-600 overflow-hidden mb-3">
                                    <button onClick={() => setTab11Mode('edo')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab11Mode === 'edo' ? 'bg-[#00ffcc] text-black' : 'text-gray-400 hover:bg-gray-700'}`}>EDO</button>
                                    <button onClick={() => setTab11Mode('custom')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab11Mode === 'custom' ? 'bg-[#00ffcc] text-black' : 'text-gray-400 hover:bg-gray-700'}`}>JI / Texto</button>
                                    <button onClick={() => setTab11Mode('scala')} className={`flex-1 text-[9px] font-bold py-1.5 ${tab11Mode === 'scala' ? 'bg-[#00ffcc] text-black' : 'text-gray-400 hover:bg-gray-700'}`}>.SCL</button>
                                </div>

                                {tab11Mode === 'edo' && (
                                    <div className="space-y-2 bg-gray-950 p-3 rounded border border-gray-700">
                                        <label className="text-[10px] text-gray-400">Divisões Iguais da Oitava (EDO):</label>
                                        <input type="number" min="1" max="120" value={tab11Edo} onChange={e => setTab11Edo(Number(e.target.value))} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono text-white" />
                                        <button onClick={() => { setActiveTuning({ type: 'edo', divisions: tab11Edo }); if (!isMicrotonalMode) toggleMicrotonalMode(); }} className="w-full bg-blue-700 hover:bg-blue-600 text-white text-[10px] py-2 rounded transition font-bold shadow-lg">Aplicar {tab11Edo}-EDO</button>
                                    </div>
                                )}

                                {tab11Mode === 'custom' && (
                                    <div className="space-y-2 bg-gray-950 p-3 rounded border border-gray-700">
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            <button onClick={() => { const text = "9/8\n5/4\n4/3\n3/2\n5/3\n15/8\n2/1"; const parsed = parseCustomTuning(text); setActiveTuning({ type: 'scala', data: parsed }); if (!isMicrotonalMode) toggleMicrotonalMode(); }} className="text-[8px] bg-purple-900 hover:bg-purple-800 px-1.5 py-1 rounded">5-Limit JI</button>
                                            <button onClick={() => { const text = "9/8\n6/5\n4/3\n3/2\n8/5\n7/4\n2/1"; const parsed = parseCustomTuning(text); setActiveTuning({ type: 'scala', data: parsed }); if (!isMicrotonalMode) toggleMicrotonalMode(); }} className="text-[8px] bg-purple-900 hover:bg-purple-800 px-1.5 py-1 rounded">7-Limit Min</button>
                                            <button onClick={() => { const text = "9/8\n10/8\n11/8\n12/8\n13/8\n14/8\n15/8\n16/8"; const parsed = parseCustomTuning(text); setActiveTuning({ type: 'scala', data: parsed }); if (!isMicrotonalMode) toggleMicrotonalMode(); }} className="text-[8px] bg-purple-900 hover:bg-purple-800 px-1.5 py-1 rounded">Harm 8-16</button>
                                            <button onClick={() => { const text = "27/25\n25/21\n9/7\n7/5\n75/49\n5/3\n9/5\n49/25\n15/7\n7/3\n63/25\n25/9\n3/1"; const parsed = parseCustomTuning(text); setActiveTuning({ type: 'scala', data: { ...parsed, description: "Bohlen-Pierce" } }); if (!isMicrotonalMode) toggleMicrotonalMode(); }} className="text-[8px] bg-purple-900 hover:bg-purple-800 px-1.5 py-1 rounded">Bohlen-Pierce</button>
                                        </div>
                                        <label className="text-[10px] text-gray-400 block">Escreva Frações, Cents ou N\M:</label>
                                        <textarea placeholder="Ex:\n9/8\n701.955\n7\19\n2/1" className="w-full h-24 bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono text-white custom-scrollbar" id="customTuningInput" />
                                        <button onClick={() => { const text = document.getElementById('customTuningInput').value; if (text) { const parsed = parseCustomTuning(text); setActiveTuning({ type: 'scala', data: parsed }); if (!isMicrotonalMode) toggleMicrotonalMode(); } }} className="w-full bg-blue-700 hover:bg-blue-600 text-white text-[10px] py-2 rounded transition font-bold shadow-lg">Interpretar e Aplicar</button>
                                    </div>
                                )}

                                {tab11Mode === 'scala' && (
                                    <div className="space-y-2 bg-gray-950 p-3 rounded border border-gray-700">
                                        <label className="text-[10px] text-gray-400">Importar arquivo Scala (.scl):</label>
                                        <input type="file" accept=".scl" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (evt) => setTab11ScalaData(parseScalaFile(evt.target.result)); reader.readAsText(file); } }} className="w-full text-[9px] text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[9px] file:bg-gray-700 file:text-white hover:file:bg-gray-600 cursor-pointer" />
                                        {tab11ScalaData && <button onClick={() => { setActiveTuning({ type: 'scala', data: tab11ScalaData }); if (!isMicrotonalMode) toggleMicrotonalMode(); }} className="w-full bg-blue-700 hover:bg-blue-600 text-white text-[10px] py-2 rounded transition font-bold mt-2 shadow-lg">Aplicar Afinação Scala</button>}
                                    </div>
                                )}
                            </div>

                            {/* BLOCO 2: TUNING (ÂNCORAS) */}
                            <div className="pt-2 border-t border-gray-700">
                                <h3 className="text-orange-400 font-bold text-[10px] uppercase mb-2 tracking-wider">Tuning (Âncoras)</h3>
                                <div className="grid grid-cols-2 gap-2 bg-gray-950 p-3 rounded border border-gray-700">
                                    <div>
                                        <label className="text-[9px] text-gray-500">MIDI Âncora:</label>
                                        <input
                                            type="number"
                                            value={baseMidi}
                                            onChange={(e) => {
                                                const novoMidi = Number(e.target.value);
                                                setBaseMidi(novoMidi);
                                                // O Hz acompanha o MIDI usando a matemática 12-TET universal
                                                setBaseHz(Number((440 * Math.pow(2, (novoMidi - 69) / 12)).toFixed(6)));
                                            }}
                                            className="w-full bg-gray-800 text-xs p-1 rounded border border-gray-600 text-white text-center mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-gray-500">Hertz (Hz):</label>
                                        <input type="number" step="any" value={baseHz} onChange={(e) => setBaseHz(Number(e.target.value))} className="w-full bg-gray-800 text-xs p-1 rounded border border-gray-600 text-white text-center mt-1" />
                                    </div>
                                    <div className="col-span-2 mt-1">
                                        <button onClick={() => { setBaseMidi(60); setBaseHz(261.625565); }} className="text-[8px] w-full bg-gray-700 hover:bg-gray-600 py-1 rounded">Resetar para C4 (60) = 261.62 Hz</button>
                                    </div>
                                </div>
                            </div>

                            {/* BLOCO 3: CORES DO TECLADO */}
                            <div className="pt-2 border-t border-gray-700">
                                <h3 className="text-pink-400 font-bold text-[10px] uppercase mb-2 tracking-wider">Key Colors (Teclas)</h3>
                                <div className="space-y-2 bg-gray-950 p-3 rounded border border-gray-700">
                                    <select value={keyColorMode} onChange={(e) => setKeyColorMode(e.target.value)} className="w-full bg-gray-800 text-[10px] p-1.5 rounded border border-gray-600 text-white">
                                        <option value="auto">Automático (Calculado pelo EDO)</option>
                                        <option value="12-tet">Piano Clássico (12-TET)</option>
                                        <option value="custom">Personalizado (W/B)</option>
                                    </select>
                                    {keyColorMode === 'custom' && (
                                        <div>
                                            <label className="text-[8px] text-gray-500">Use 'W' (Branca) e 'B' (Preta) separadas por vírgula:</label>
                                            <input type="text" value={customKeyPattern.join(',')} onChange={(e) => setCustomKeyPattern(e.target.value.toUpperCase().split(',').map(s => s.trim()))} className="w-full bg-gray-800 text-xs p-1.5 rounded border border-gray-600 text-white font-mono mt-1" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-700">
                                <div className="text-[10px] text-gray-400 mb-1">Afinação Global Ativa:</div>
                                <div className="bg-gray-950 p-2 rounded border border-gray-700 text-[#00ffcc] font-mono text-[10px] font-bold shadow-inner">
                                    {activeTuning.type === 'edo' ? `${activeTuning.divisions}-EDO (TET)` : `Custom/Scala: ${activeTuning.data?.description || 'Carregada'}`}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 p-4 bg-gray-950 overflow-auto custom-scrollbar">
                            <h3 className="text-[#00ffcc] font-bold mb-4 uppercase tracking-widest border-b border-gray-800 pb-2 flex justify-between items-center">
                                <span>Painel de Análise da Afinação</span>
                                <span className="text-[10px] text-gray-500 bg-gray-900 px-2 py-1 rounded border border-gray-700">Âncora: {baseMidi} = {baseHz} Hz</span>
                            </h3>

                            {activeTuning.type === 'edo' ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                                    {generateEdoScale(activeTuning.divisions).map((step, i) => (
                                        <div key={i} className="bg-gray-900 p-3 rounded border border-gray-800 text-center shadow">
                                            <div className="text-gray-500 text-[10px] uppercase">Grau {i + 1}</div>
                                            <div className="text-white font-mono text-sm">{step.cents.toFixed(2)}c</div>
                                            <div className="text-blue-400 font-mono text-[10px]">Ratio: {(step.ratio).toFixed(3)}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                activeTuning.data && (
                                    <div className="space-y-4">
                                        <div className="bg-gray-900 p-4 rounded border border-gray-800 shadow">
                                            <div className="text-gray-400 text-xs mb-1 uppercase font-bold tracking-wider">Descrição Interna:</div>
                                            <div className="text-white font-serif italic mb-2">"{activeTuning.data.description}"</div>
                                            <div className="text-gray-400 text-[10px]">Total de Notas na Estrutura: <span className="text-[#00ffcc] font-bold">{activeTuning.data.numNotes}</span></div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                                            <div className="bg-gray-900 p-3 rounded border border-gray-800 text-center shadow border-t-2 border-t-orange-400">
                                                <div className="text-gray-500 text-[10px] uppercase">Grau 0 (Tônica)</div>
                                                <div className="text-white font-mono text-sm">0.00c</div>
                                                <div className="text-orange-400 font-mono text-[10px]">1 / 1</div>
                                            </div>
                                            {activeTuning.data.scale.map((step, i) => (
                                                <div key={i} className="bg-gray-900 p-3 rounded border border-gray-800 text-center shadow">
                                                    <div className="text-gray-500 text-[10px] uppercase">Grau {i + 1}</div>
                                                    <div className="text-white font-mono text-sm">{step.cents.toFixed(2)}c</div>
                                                    <div className="text-blue-400 font-mono text-[10px]">{step.original || step.ratioStr || (step.ratio).toFixed(3)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}

                {/* ABA 12: MANUAL DO USUÁRIO */}
                {activeTool === 12 && (
                    <div className="flex w-full h-full bg-gray-900 overflow-y-auto custom-scrollbar p-8 justify-center">
                        <div className="max-w-4xl w-full text-gray-300 space-y-8 pb-12">

                            <div className="border-b border-gray-700 pb-4 mb-6">
                                <h2 className="text-3xl font-bold text-white mb-2 tracking-wide">Manual do Sistema Harmônico</h2>
                                <p className="text-gray-400">Guia de referência para todas as funcionalidades, sínteses e cálculos da plataforma.</p>
                            </div>

                            <section className="space-y-4">
                                <h3 className="text-xl font-bold text-[#00ffcc] uppercase tracking-widest border-l-4 border-[#00ffcc] pl-3">Controles Globais</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white mb-1">Modo Xenharmônico (Toggle)</h4>
                                        <p className="text-sm">Abandona os 12 semitons. Quando ativo, o aplicativo calcula áudio e matemática com base na afinação escolhida na Aba 11 (ex: 19-TET, Scala). A nota Dó Central (60) é a âncora fixa em 261.625 Hz.</p>
                                    </div>
                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white mb-1">Atalho Alt + Setas</h4>
                                        <p className="text-sm">Ao clicar em qualquer caixa de texto, pressione <code className="bg-gray-950 px-1 rounded text-orange-300">Alt + ↑</code> ou <code className="bg-gray-950 px-1 rounded text-orange-300">Alt + ↓</code> para transpor instantaneamente a última nota digitada em um degrau.</p>
                                    </div>
                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white mb-1">Botões "Puxar de:"</h4>
                                        <p className="text-sm">Servem para transferir resultados entre abas. Gere um acorde na Rede 3D e clique em "Puxar de: Rede" na Aba de Síntese FM para enviar as notas para lá.</p>
                                    </div>
                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white mb-1">Barra de Acidentes (Partitura)</h4>
                                        <p className="text-sm">Arme os botões de Bemol, Sustenido ou Quartos-de-tom e faça <code className="bg-gray-950 px-1 rounded text-orange-300">Ctrl + Clique</code> na pauta para inserir a nota alterada.</p>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-xl font-bold text-blue-400 uppercase tracking-widest border-l-4 border-blue-400 pl-3">Módulos de Ferramentas</h3>

                                <div className="space-y-3">
                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white">1. Redes Harmônicas 3D</h4>
                                        <p className="text-sm mt-1">Navegue por um labirinto geométrico. <strong>X, Y, Z</strong> definem a distância dos eixos. Segure <strong>Ctrl + Clique</strong> nas esferas 3D para gerar os acordes baseados em distâncias simétricas.</p>
                                    </div>

                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white">2. Multiplicação de Acordes</h4>
                                        <p className="text-sm mt-1">Transpõe o acorde A sobre cada nota do acorde B. O modo <strong>Valores Não Temperados</strong> faz a multiplicação pura em Hertz (Just Intonation), criando clusters microtonais absolutos.</p>
                                    </div>

                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white">3. Módulos Cíclicos & 4. Projeções Proporcionais</h4>
                                        <p className="text-sm mt-1"><strong>Módulos:</strong> Repete uma célula até fechar oitava. <strong>Projeções:</strong> Estica ou comprime o intervalo total do acorde para caber entre um novo Min (Hz) e Max (Hz).</p>
                                    </div>

                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white">6. Ring Modulation & 7. Síntese FM</h4>
                                        <p className="text-sm mt-1"><strong>RM:</strong> Multiplica as portadoras, gerando frequências de soma e diferença. <strong>FM:</strong> Uma moduladora cria bandas laterais (Sidebands) em torno da portadora baseada no Índice K.</p>
                                    </div>

                                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                        <h4 className="font-bold text-white">9. Calc. Costère & 10. Interpolações</h4>
                                        <p className="text-sm mt-1"><strong>Costère:</strong> Mostra o mapa de gravidade do acorde (para onde ele "quer" resolver). <strong>Interpolação:</strong> O slider faz o "morphing" gradual no tempo entre um acorde A e um acorde B.</p>
                                    </div>
                                </div>
                            </section>

                        </div>
                    </div>
                )}

                {/* ABA 13: TECLADO MICROTONAL INTERATIVO */}
                {activeTool === 13 && (
                    <div className="flex flex-col w-full h-full bg-gray-900 p-6">
                        <div className="mb-6 border-b border-gray-700 pb-4">
                            <h2 className="text-2xl font-bold text-[#00ffcc]">Teclado Xenharmônico Vivo</h2>
                            <p className="text-gray-400 text-sm">Toque no seu piano digital para ouvir a afinação: {activeTuning.type === 'edo' ? `${activeTuning.divisions}-EDO` : 'Arquivo Scala'}.</p>
                        </div>

                        <div className="flex-1 flex items-center justify-center overflow-x-auto custom-scrollbar">
                            <div className="flex gap-1 h-64 items-end pb-10">
                                {Array.from({ length: 49 }, (_, i) => i + 36).map(m => {
                                    const isActive = activeMidiNotes.has(m);
                                    const hz = midiToHz(m);
                                    const isBlack = getIsBlackKey(m);

                                    return (
                                        <div
                                            key={m}
                                            className={`relative transition-all duration-75 flex flex-col justify-end items-center rounded-b-md
                                                ${isBlack ? 'w-8 h-40 z-10 -mx-4 border-gray-800' : 'w-12 h-56 border-gray-400'}
                                                ${isActive ? 'bg-[#00ffcc] translate-y-2 shadow-[0_0_20px_#00ffcc]' : isBlack ? 'bg-gray-800' : 'bg-white'}
                                                border-2 cursor-pointer shadow-lg`}
                                            onMouseDown={() => playAudio([midiToHz(m)], true)}
                                        >
                                            <span className={`text-[8px] font-bold mb-2 ${isBlack ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {m}
                                            </span>
                                            <div className="absolute -bottom-8 text-[10px] font-mono text-blue-400">
                                                {isActive && `${hz.toFixed(1)}Hz`}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-gray-950 p-4 rounded border border-gray-700 mt-4">
                            <h4 className="text-[10px] text-gray-500 uppercase font-bold mb-2">Monitor de Snap (Grade Atual)</h4>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {Array.from(activeMidiNotes).map(n => (
                                    <div key={n} className="bg-blue-900 px-3 py-1 rounded text-[10px] border border-blue-400 animate-pulse">
                                        Entrada MIDI: {n} → <span className="text-white font-bold">{midiToHz(n).toFixed(2)} Hz</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {/* ABA 14: EDITOR DE NOTAÇÃO MICROTONAL */}
                {activeTool === 14 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[320px] flex-shrink-0 bg-gray-900 p-4 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <PullButtons onPull={setTab14Input} />

                            <div>
                                <h3 className="text-yellow-400 font-bold text-[10px] uppercase mb-2 tracking-wider">Configuração da Partitura</h3>
                                <label className="text-xs text-gray-400 mb-1 block">Sistema de Acidentes:</label>
                                <select
                                    value={notationSystem}
                                    onChange={e => setNotationSystem(e.target.value)}
                                    className="w-full bg-gray-800 text-[11px] p-2 rounded border border-gray-600 text-white mb-3"
                                >
                                    <option value="auto">Automático (Sugerido pela Escala)</option>
                                    <option value="cents">Nota + Cents (Exato/Universal)</option>
                                    <option value="ji">Just Intonation Puro (HEJI + Dados)</option>
                                    <option value="he">Helmholtz-Ellis (Comas 5/7/11)</option>
                                    <option value="sagittal">Sagittal (Spartan Universal)</option>
                                    <option value="quarter">Quartos de Tom (24-EDO)</option>
                                    <option value="sixth">Sextos de Tom (36-EDO)</option>
                                </select>

                                {notationSystem === 'sagittal' && (
                                    <div className="mb-3">
                                        <label className="text-xs text-gray-400 mb-1 block">Nível Sagittal:</label>
                                        <select
                                            value={sagittalLevel}
                                            onChange={e => setSagittalLevel(e.target.value)}
                                            className="w-full bg-gray-800 text-[11px] p-2 rounded border border-gray-600 text-white"
                                        >
                                            <option value="spartan">Spartan (Básico - EDOs até 72)</option>
                                            <option value="athenian">Athenian (Avançado)</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 block mb-1 mt-2">Entidade para Notação:</label>
                                <textarea
                                    value={tab14Input}
                                    onChange={e => setTab14Input(e.target.value)}
                                    className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[60px]"
                                    placeholder="Ex: 60, 64.5, 67 (Puxe das abas)"
                                />
                                <button onClick={() => setTab14Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-full py-1.5 rounded mt-2 transition">Limpar Notas</button>
                            </div>

                            <div className="mt-3 bg-gray-950 p-2 rounded border border-gray-700">
                                <label className="flex items-center text-[10px] text-[#00ffcc] font-bold cursor-pointer">
                                    <input type="checkbox" checked={showPitchBends} onChange={e => setShowPitchBends(e.target.checked)} className="mr-2 accent-[#00ffcc]" />
                                    Mostrar Software Pitch Bends
                                </label>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-700">
                                <div className="text-[10px] text-gray-400 mb-1">Dica de Notação:</div>
                                <div className="bg-gray-950 p-2 rounded border border-gray-700 text-gray-300 font-mono text-[9px] shadow-inner leading-relaxed">
                                    {notationSystem === 'cents' && "Mantém o acidente 12-TET normal e adiciona o desvio em cents. Universal."}
                                    {notationSystem === 'ji' && "Modo Analítico. Mostra o símbolo HEJI e foca nos desvios exatos em Cents e Hz sobre a nota."}
                                    {notationSystem === 'quarter' && "Aproximação 24-EDO. Utiliza meios-bemóis espelhados e sustenidos compostos (Gould)."}
                                    {notationSystem === 'sixth' && "Aproximação 36-EDO. Setas nos acidentes clássicos para desvios de +/- 33.3c."}
                                    {notationSystem === 'he' && "Helmholtz-Ellis. Setas para o limite-5 (Coma Sintónica)."}
                                    {notationSystem === 'sagittal' && "Sagittal (Spartan). Flechas puras que mapeiam as vírgulas principais."}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 bg-gray-950 flex flex-col items-center justify-start relative">

                            {/* CABEÇALHO ANALÍTICO E ESCALA */}
                            <div className="absolute top-4 left-6 z-20 text-[10px] font-mono bg-gray-900 border border-gray-600 text-white px-3 py-1.5 rounded shadow-lg opacity-90">
                                {activeTuning.type === 'edo'
                                    ? <span className="text-[#00ffcc] font-bold">{activeTuning.divisions}-EDO | 1 step = {(1200 / activeTuning.divisions).toFixed(2)}¢</span>
                                    : <span className="text-yellow-400 font-bold">Just Intonation (JI) / Afinação Customizada</span>
                                }
                            </div>

                            {(() => {
                                const hzArr = parseAdvancedToHz(tab14Input);
                                if (hzArr.length === 0) return <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-bold tracking-widest uppercase">Aguardando Notas...</div>;

                                const notesData = generateNotationData(hzArr, baseHz, baseMidi, notationSystem);

                                const TABLE_Y = 100;
                                const minY = Math.min(-80, ...notesData.map(n => n.y - 60));
                                const maxY = Math.max(TABLE_Y + 120, ...notesData.map(n => n.y + 60));
                                const viewBoxHeight = maxY - minY;
                                const svgWidth = Math.max(800, notesData.length * 85 + 150);

                                return (
                                    <div className="w-full h-full overflow-auto custom-scrollbar p-6 bg-[#fdfdfd]">
                                        <svg width={svgWidth} height={viewBoxHeight * 1.3} viewBox={`0 ${minY} ${svgWidth} ${viewBoxHeight}`} style={{ display: 'block', margin: 'auto' }}>

                                            {/* LINHAS DA CLAVE DE SOL E FÁ (100% OPACAS E NÍTIDAS) */}
                                            {[-10, -20, -30, -40, -50].map(yLine => (
                                                <line key={`t${yLine}`} x1="30" y1={yLine} x2="98%" y2={yLine} stroke="#000" strokeWidth="1" opacity="1.0" />
                                            ))}
                                            {[20, 30, 40, 50, 60].map(yLine => (
                                                <line key={`b${yLine}`} x1="30" y1={yLine} x2="98%" y2={yLine} stroke="#000" strokeWidth="1" opacity="1.0" />
                                            ))}

                                            {/* CLAVES TIPOGRÁFICAS (Bravura Oficial) */}
                                            {/* Clave de Sol (\uE050) posicionada no Y exato da linha G4 (-20) */}
                                            <text x="35" y="-20" fontSize="42" fontFamily="HEJI2Bravura, serif" fill="#000">{'\uE050'}</text>

                                            {/* Clave de Fá (\uE062) posicionada no Y exato da linha F3 (30) */}
                                            <text x="35" y="30" fontSize="42" fontFamily="HEJI2Bravura, serif" fill="#000">{'\uE062'}</text>

                                            {/* CHAVE DE UNIÃO (Bracket) */}
                                            <line x1="30" y1="-50" x2="30" y2="60" stroke="#000" strokeWidth="3" />
                                            <path d="M20,-50 L30,-50 C15,-50 15,-20 15,5 C15,30 15,60 30,60 L20,60" fill="none" stroke="#000" strokeWidth="2.5" />

                                            <line x1="30" y1={TABLE_Y} x2="98%" y2={TABLE_Y} stroke="#ccc" strokeWidth="1" strokeDasharray="5 5" />

                                            {/* DESENHO DAS NOTAS */}
                                            {notesData.map(note => {
                                                const isTreble = note.step >= 0;
                                                const stemDown = note.step >= (isTreble ? 6 : -6);

                                                // Cálculos de Software Pitch Bends
                                                let pbVal = Math.round(8192 + (note.centsDev * 40.96));
                                                pbVal = Math.max(0, Math.min(16383, pbVal));
                                                const sibLSB = pbVal & 0x7F;
                                                const sibMSB = (pbVal >> 7) & 0x7F;
                                                const doricoDelta = (note.centsDev * 10).toFixed(0);

                                                return (
                                                    <g key={note.id}>

                                                        {/* NOTA FÍSICA E LINHAS SUPLEMENTARES */}
                                                        <g transform={`translate(${note.x}, ${note.y})`}>
                                                            {note.ledgers.map(lY => (
                                                                <line key={lY} x1="-14" y1={lY - note.y} x2="14" y2={lY - note.y} stroke="#000" strokeWidth="2" />
                                                            ))}

                                                            {/* Cabeça e Haste */}
                                                            <ellipse cx="0" cy="0" rx="5.5" ry="4" fill="#000" transform="rotate(-20)" />
                                                            <line x1={stemDown ? -5 : 5} y1="0" x2={stemDown ? -5 : 5} y2={stemDown ? 30 : -30} stroke="#000" strokeWidth="1.5" />

                                                            {/* SÍMBOLO MICROTONAL (USANDO A FONTE BRAVURA OU HEJI2) */}
                                                            <text
                                                                x={note.xOffset}
                                                                y={note.yOffset}
                                                                fontSize={note.fontSize}
                                                                fontFamily={note.font}
                                                                fill="#000"
                                                                textAnchor="start"
                                                            >
                                                                {note.char}
                                                            </text>

                                                            {/* LABELS DE CENTS */}
                                                            {(notationSystem === 'cents' || notationSystem === 'ji') && (
                                                                <text x="0" y={stemDown ? -20 : 35} fontSize="10" fontFamily="monospace" fill="#e04e8a" textAnchor="middle" fontWeight="bold">
                                                                    {note.centsLabel}
                                                                </text>
                                                            )}
                                                            {notationSystem === 'ji' && (
                                                                <text x="0" y={stemDown ? -32 : 47} fontSize="9" fontFamily="sans-serif" fill="#1e90ff" textAnchor="middle" fontWeight="bold">
                                                                    {note.hz.toFixed(2)}Hz
                                                                </text>
                                                            )}
                                                        </g>

                                                        {/* TABELA DE SOFTWARE PITCH BENDS (Inalterada, continua perfeita) */}
                                                        {showPitchBends ? (
                                                            <g transform={`translate(${note.x}, ${TABLE_Y + 15})`}>
                                                                <text x="0" y="0" fontSize="8" fill="#777" textAnchor="middle" fontFamily="sans-serif">nearest diatonic</text>
                                                                <text x="0" y="10" fontSize="9" fill="#000" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">MIDI {note.nearestMidi}</text>

                                                                <rect x="-38" y="18" width="76" height="55" rx="4" fill="#f4f4f4" stroke="#ccc" />

                                                                <text x="-33" y="32" fontSize="7.5" fill="#333" textAnchor="start" fontFamily="monospace">Sibelius: <tspan fill="#1e90ff" fontWeight="bold">~B {sibLSB},{sibMSB}</tspan></text>
                                                                <text x="-33" y="44" fontSize="7.5" fill="#333" textAnchor="start" fontFamily="monospace">Dorico pb: <tspan fill="#1e90ff" fontWeight="bold">{doricoDelta}</tspan></text>
                                                                <text x="-33" y="56" fontSize="7.5" fill="#333" textAnchor="start" fontFamily="monospace">MuseScore: <tspan fill="#1e90ff" fontWeight="bold">{note.centsDev.toFixed(2)}c</tspan></text>

                                                                <text x="0" y="86" fontSize="10" fill="#e04e8a" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{note.hz.toFixed(2)} Hz</text>
                                                            </g>
                                                        ) : (
                                                            notationSystem !== 'ji' && (
                                                                <text x={note.x} y={TABLE_Y + 15} fontSize="9" fill="#888" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                                                                    {note.hz.toFixed(1)}Hz
                                                                </text>
                                                            )
                                                        )}
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}