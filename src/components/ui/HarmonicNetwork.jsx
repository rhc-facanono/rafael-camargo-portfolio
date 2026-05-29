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
    // SISTEMA DE AJUDA CONTEXTUAL (MODAL)
    // ==========================================
    const [activeHelpModal, setActiveHelpModal] = useState(null);

    const helpDictionary = {
        1: { title: "Escala Base & Referência", text: "Toda a música precisa de uma âncora. O padrão mundial é o Lá (A4) a 440Hz, mas orquestras barrocas usam 415Hz ou 432Hz. \n\nCOMO USAR:\nDefina a sua nota de referência e a frequência. Todas as outras abas vão usar este 'Ponto Zero' para calcular as escalas." },
        2: { title: "Temperamentos (EDO)", text: "EDO significa 'Equal Divisions of the Octave'. O piano normal divide a oitava em 12 fatias (12-EDO). \n\nCOMO USAR:\nSe escrever '19' ou '24' (quartos de tom árabes), o software fatia a oitava nessas partes iguais. Isso cria notas alienígenas e destrói a noção clássica de Sustenido e Bemol." },
        3: { title: "Série Harmónica (Overtone)", text: "Quando toca uma corda, ela vibra inteira, mas também vibra na metade (oitava), num terço (quinta), num quarto... \n\nCOMO USAR:\nInsira a quantidade de harmónicos. O software vai gerar as frequências naturais da física do som. Estes acordes soam divinamente puros." },
        4: { title: "Série Sub-Harmónica (Undertone)", text: "É o espelho sombrio da Série Harmónica. Em vez de multiplicar a frequência, nós dividimo-la. \n\nCOMO USAR:\nGera escalas espectrais 'invertidas' que soam densas e melancólicas. Muito usado em síntese sonora pesada." },
        5: { title: "Afinação Justa (Just Intonation)", text: "A Afinação Justa (JI) abandona os temperamentos e usa frações matemáticas puras (ex: 3/2 para uma Quinta Justa perfeita). \n\nCOMO USAR:\nIntroduza frações. A música vai soar cristalina, sem os 'batimentos' ou trepidações do piano moderno." },
        6: { title: "Rede Harmónica 2D (Tonnetz)", text: "A pauta clássica é confusa para microtons. O 'Tonnetz' é um mapa geométrico onde ir para a direita sobe uma Quinta, e ir para cima sobe uma Terça. \n\nCOMO USAR:\nVisualize modulações e observe que acordes estão fisicamente 'próximos' no mundo do som." },
        7: { title: "Calculadora de Cents", text: "O 'Cent' é uma unidade microscópica: 1 semitom tem 100 Cents. \n\nCOMO USAR:\nInsira duas frequências quaisquer para saber a distância exata entre elas. É a fita métrica do microtonalismo." },
        8: { title: "Mapeamento MIDI", text: "Como tocar microtons num teclado de 12 teclas? \n\nCOMO USAR:\nCrie o mapa de como as notas da sua escala (ex: 19 notas) se vão espalhar fisicamente pelas teclas brancas e pretas do seu controlador MIDI." },
        9: { title: "Morphing de Escalas", text: "A magia da transição. \n\nCOMO USAR:\nEscolha uma escala A (ex: piano normal) e uma escala B (ex: afinação indonésia). O software calcula os passos intermédios para que a música 'derreta' lentamente de uma afinação para a outra." },
        10: { title: "Batimentos Acústicos", text: "Quando duas notas estão quase na mesma frequência, elas 'pulsam' (waw-waw). \n\nCOMO USAR:\nO software diz-lhe a velocidade desse pulso em Hertz. Útil para criar texturas rítmicas com notas longas." },
        11: { title: "Escalas Não-Oitavantes", text: "A quebra do maior tabu da música. \n\nCOMO USAR:\nA oitava (2/1) é banida. A escala repete-se, por exemplo, a cada Quinta, ou a cada Oitava-e-meia (Escala de Bohlen-Pierce). Cria acordes alienígenas onde Maior e Menor deixam de existir." },
        12: { title: "Academia Xenharmónica", text: "Você está no Manual Completo. Leia as definições de todas as técnicas." },
        13: { title: "Visualizador 3D", text: "A evolução da Rede Harmónica 2D. \n\nCOMO USAR:\nNavegue pelo espaço tridimensional dos sons. Quintas, terças e sétimas expandem-se em eixos Z, permitindo analisar a 'densidade' de clusters modernos." },
        14: { title: "Editor de Notação Profissional", text: "Traduz toda a matemática em partituras reais. \n\nCOMO USAR:\nCole as frequências ou as puxe das abas. Escolha entre HEJI (para Acordes Puros), Sagittal (Notação Avançada) ou Cents para exportar para o seu DAW (Sibelius/Dorico)." }
    };

    const renderHelpModal = () => {
        if (!activeHelpModal) return null;
        const helpData = helpDictionary[activeHelpModal];
        return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm">
                <div className="bg-gray-900 border border-gray-600 rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative">
                    <button onClick={() => setActiveHelpModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-800 hover:bg-red-600 w-8 h-8 rounded-full flex items-center justify-center transition-all font-bold">✕</button>
                    <h2 className="text-xl font-bold text-yellow-500 mb-4 border-b border-gray-700 pb-2">{helpData.title}</h2>
                    <div className="text-gray-300 font-sans text-sm whitespace-pre-wrap leading-relaxed">{helpData.text}</div>
                    <button onClick={() => setActiveHelpModal(null)} className="mt-6 w-full py-2 bg-[#00ffcc] text-black font-bold rounded hover:bg-[#00ccaa] transition">Entendi</button>
                </div>
            </div>
        );
    };

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
    const [showPitchBends, setShowPitchBends] = useState(false);

    // ==========================================
    // ESTADOS: ABA 15 & 16 (SEQUENCIADOR E COMPARADOR)
    // ==========================================
    const [tab15Chords, setTab15Chords] = useState([
        { id: 1, notes: "60, 64, 67", tuning: "12-TET", anchorMidi: 60, anchorHz: 261.63, isExpanded: true, customTuningObj: null },
        { id: 2, notes: "60, 64, 67", tuning: "19-EDO", anchorMidi: 60, anchorHz: 261.63, isExpanded: true, customTuningObj: null },
        { id: 3, notes: "62, 65, 69", tuning: "JI (Limite-5)", anchorMidi: 60, anchorHz: 261.63, isExpanded: true, customTuningObj: null }
    ]);
    const [activeChordIndex, setActiveChordIndex] = useState(0);
    const [tab15AvailableTunings, setTab15AvailableTunings] = useState(["12-TET", "11-EDO", "19-EDO", "31-EDO", "53-EDO", "JI (Limite-5)", "GLOBAL"]);
    const [tab15NewTuningInput, setTab15NewTuningInput] = useState("");

    const [tab16Scales, setTab16Scales] = useState([
        { id: 1, name: "12-TET", type: "edo", value: 12 },
        { id: 2, name: "19-EDO", type: "edo", value: 19 },
        { id: 3, name: "31-EDO", type: "edo", value: 31 }
    ]);
    const [tab16NewScaleEdo, setTab16NewScaleEdo] = useState(22);
    const [tab16HoveredCents, setTab16HoveredCents] = useState(null);
    const [tab16SelectedNode, setTab16SelectedNode] = useState(null);
    const [tab16AnchorMidi, setTab16AnchorMidi] = useState(60);
    const [tab16AnchorHz, setTab16AnchorHz] = useState(261.63);

    // MOTOR MATEMÁTICO: PROXIMIDADE (Atualizado para suportar Custom Scales .scl)
    const jiOctaveMap = { 0: 0.0, 100: 111.73, 200: 203.91, 300: 315.64, 400: 386.31, 500: 498.04, 600: 582.51, 700: 701.96, 800: 813.69, 900: 884.36, 1000: 1017.60, 1100: 1088.27 };

    const getClosestMicrotonalHz = (targetHz, tuningType, anchorHz, customTuningObj = null) => {
        const targetCents = 1200 * Math.log2(targetHz / anchorHz);
        let closestCents = 0;

        if (customTuningObj) {
            if (customTuningObj.type === 'edo') {
                const stepCents = 1200 / customTuningObj.divisions;
                closestCents = Math.round(targetCents / stepCents) * stepCents;
            } else if (customTuningObj.type === 'scala' && customTuningObj.data) {
                const scale = customTuningObj.data.scale;
                const period = scale[scale.length - 1].cents || 1200;
                const octaves = Math.floor(targetCents / period);
                const remainder = targetCents - (octaves * period);
                let minDiff = Math.abs(remainder);
                let matchedCents = 0;
                scale.forEach(s => {
                    const diff = Math.abs(remainder - s.cents);
                    if (diff < minDiff) { minDiff = diff; matchedCents = s.cents; }
                });
                closestCents = (octaves * period) + matchedCents;
            }
        } else if (tuningType === '12-TET') {
            closestCents = Math.round(targetCents / 100) * 100;
        } else if (tuningType.includes('-EDO')) {
            const edo = parseInt(tuningType);
            const stepCents = 1200 / edo;
            closestCents = Math.round(targetCents / stepCents) * stepCents;
        } else if (tuningType === 'JI (Limite-5)') {
            let semi = Math.round(targetCents / 100) * 100;
            let octaves = Math.floor(semi / 1200);
            let rem = semi % 1200;
            if (rem < 0) rem += 1200;
            closestCents = (octaves * 1200) + (jiOctaveMap[rem] !== undefined ? jiOctaveMap[rem] : rem);
        } else if (tuningType === 'GLOBAL') {
            return midiToHz(hzToMidi(targetHz));
        } else {
            closestCents = Math.round(targetCents / 100) * 100;
        }
        return anchorHz * Math.pow(2, closestCents / 1200);
    };

    // FUNÇÃO UNIVERSAL DE LEITURA (Lê C4, 440Hz ou 60)
    const parseNoteToHz = (str) => {
        const s = str.trim();
        if (!s) return NaN;

        // 1. Tenta ler nome da nota (Ex: C4, F#5, Bb3)
        const regex = /^([CDEFGAB])(#|b)?(-?\d+)$/i;
        const match = s.match(regex);
        if (match) {
            const note = match[1].toUpperCase();
            const acc = match[2];
            const oct = parseInt(match[3], 10);
            const baseOffsets = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
            let midi = baseOffsets[note] + (oct + 1) * 12;
            if (acc === '#') midi += 1;
            if (acc === 'b') midi -= 1;
            return 440 * Math.pow(2, (midi - 69) / 12);
        }

        // 2. Tenta ler como Hertz ou MIDI
        if (s.toLowerCase().endsWith('hz')) return parseFloat(s);
        const num = parseFloat(s);
        if (!isNaN(num)) return 440 * Math.pow(2, (num - 69) / 12);
        return NaN;
    };

    const playMorphTransition = async (idx) => {
        if (idx >= tab15Chords.length - 1) return;
        stopAudio();
        currentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (currentAudioCtx.state === 'suspended') await currentAudioCtx.resume();

        const masterGain = currentAudioCtx.createGain();
        masterGain.gain.value = 0.15;
        masterGain.connect(currentAudioCtx.destination);

        const chord1 = tab15Chords[idx];
        const chord2 = tab15Chords[idx + 1];

        // Usa o novo tradutor para o Morphing funcionar com C4, E4, etc.
        const hz1 = chord1.notes.split(',').map(parseNoteToHz).filter(n => !isNaN(n)).map(h => getClosestMicrotonalHz(h, chord1.tuning, chord1.anchorHz, chord1.customTuningObj));
        const hz2 = chord2.notes.split(',').map(parseNoteToHz).filter(n => !isNaN(n)).map(h => getClosestMicrotonalHz(h, chord2.tuning, chord2.anchorHz, chord2.customTuningObj));

        const now = currentAudioCtx.currentTime;
        const DUR = 3.0;
        const maxV = Math.max(hz1.length, hz2.length);

        for (let v = 0; v < maxV; v++) {
            const osc = currentAudioCtx.createOscillator();
            const g = currentAudioCtx.createGain();
            osc.type = v === 0 ? 'triangle' : 'sine';

            const f1 = hz1[v] || hz1[hz1.length - 1] || 261.63;
            const f2 = hz2[v] || hz2[hz2.length - 1] || 261.63;
            const v1 = v < hz1.length ? 1 : 0;
            const v2 = v < hz2.length ? 1 : 0;

            osc.frequency.setValueAtTime(f1, now);
            osc.frequency.exponentialRampToValueAtTime(f2, now + DUR);

            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(v1, now + 0.1);
            g.gain.setValueAtTime(v1, now + 1.0);
            g.gain.linearRampToValueAtTime(v2, now + DUR);
            g.gain.linearRampToValueAtTime(0, now + DUR + 0.5);

            osc.connect(g); g.connect(masterGain);
            osc.start(now); osc.stop(now + DUR + 1);
            activeOscillators.push(osc);
        }
    };


    // MOTOR DE MORPHING WEB AUDIO (Do codacord.txt)
    const playMorphingSequence = () => {
        stopAudio();
        if (!tab15Chords.length) return;
        currentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const masterGain = currentAudioCtx.createGain();
        masterGain.gain.value = 0.15;
        masterGain.connect(currentAudioCtx.destination);
        const now = currentAudioCtx.currentTime;
        const DUR = 3.5; // Tempo por acorde

        const maxVoices = Math.max(...tab15Chords.map(c => c.notes.split(',').filter(Boolean).length));

        for (let v = 0; v < maxVoices; v++) {
            const osc = currentAudioCtx.createOscillator();
            const gain = currentAudioCtx.createGain();
            osc.type = v === 0 ? 'triangle' : 'sine';

            for (let i = 0; i < tab15Chords.length; i++) {
                const chord = tab15Chords[i];
                const rawMidi = chord.notes.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                const hzArr = rawMidi.map(m => getClosestMicrotonalHz(440 * Math.pow(2, (m - 69) / 12), chord.tuning, chord.anchorHz));

                const start = now + (i * DUR);
                const glide = start + 1.5; // Fica estável por 1.5s, desliza no resto

                const hasVoice = v < hzArr.length;
                const freq = hasVoice ? hzArr[v] : hzArr[hzArr.length - 1];
                const vol = hasVoice ? 1 : 0;

                if (i === 0) {
                    osc.frequency.setValueAtTime(freq, now);
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(vol, now + 0.1);
                } else {
                    const prevChord = tab15Chords[i - 1];
                    const prevMidi = prevChord.notes.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                    const prevHzArr = prevMidi.map(m => getClosestMicrotonalHz(440 * Math.pow(2, (m - 69) / 12), prevChord.tuning, prevChord.anchorHz));
                    const prevHasVoice = v < prevHzArr.length;
                    const prevFreq = prevHasVoice ? prevHzArr[v] : prevHzArr[prevHzArr.length - 1];
                    const prevVol = prevHasVoice ? 1 : 0;

                    osc.frequency.setValueAtTime(prevFreq, glide);
                    osc.frequency.exponentialRampToValueAtTime(freq, start + DUR);
                    gain.gain.setValueAtTime(prevVol, glide);
                    gain.gain.linearRampToValueAtTime(vol, start + DUR);
                }
            }

            const endTime = now + (tab15Chords.length * DUR);
            gain.gain.setValueAtTime(v < tab15Chords[tab15Chords.length - 1].notes.split(',').filter(Boolean).length ? 1 : 0, endTime - 0.5);
            gain.gain.linearRampToValueAtTime(0, endTime);

            osc.connect(gain); gain.connect(masterGain);
            osc.start(now); osc.stop(endTime + 0.5);
            activeOscillators.push(osc);
        }
    };

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

                // LÓGICA ESPECIAL PARA ABA 15 (Reconhece C4, 60 ou 440Hz)
                if (activeTool === 15) {
                    if (tab15Chords.length === 0) return;
                    const newChords = [...tab15Chords];
                    const chord = newChords[activeChordIndex];
                    let parts = chord.notes.split(',').map(s => s.trim()).filter(Boolean);
                    if (parts.length === 0) return;

                    let lastPart = parts[parts.length - 1];
                    const baseHz = parseNoteToHz(lastPart);
                    if (isNaN(baseHz)) return;

                    let newHz = baseHz * (e.key === 'ArrowUp' ? 1.059463 : 0.943874); // Sobe/Desce 1 semitom
                    let newMidi = 69 + 12 * Math.log2(newHz / 440);

                    let newValStr = "";
                    if (lastPart.toLowerCase().includes('hz')) {
                        newValStr = newHz.toFixed(2) + "Hz";
                    } else if (!isNaN(parseFloat(lastPart)) && !lastPart.match(/[a-zA-Z]/)) {
                        newValStr = Math.round(newMidi).toString(); // Mantém como MIDI se era número puro
                    } else {
                        // Era um nome de nota (ex: C4) -> Mantém como nome de nota!
                        const pc = ((Math.round(newMidi) % 12) + 12) % 12;
                        const oct = Math.floor(newMidi / 12) - 1;
                        newValStr = noteNames[pc] + oct;
                    }

                    parts[parts.length - 1] = newValStr;
                    newChords[activeChordIndex].notes = parts.join(', ');
                    setTab15Chords(newChords);

                    const microHz = getClosestMicrotonalHz(newHz, chord.tuning, chord.anchorHz, chord.customTuningObj);
                    playAudio([microHz], true);
                    return;
                }

                // LÓGICA PARA AS OUTRAS ABAS (2 a 10)
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

                let parts = current.val.split(',').map(s => s.trim());
                if (parts.length === 0 || parts[0] === "") return;

                let lastPart = parts[parts.length - 1];
                let match = lastPart.match(/-?\d+(\.\d+)?/);
                if (!match) return;

                let numVal = parseFloat(match[0]);
                let suffix = lastPart.replace(match[0], '');
                const stepDir = e.key === 'ArrowUp' ? 1 : -1;
                let newValStr = "";

                if (isMicrotonalMode) {
                    let currentHz = numVal;
                    if (suffix.toLowerCase().trim() === 'hz') currentHz = numVal;
                    else if (suffix.toLowerCase().trim() === 'c') currentHz = midiToHz(numVal / 100);
                    else currentHz = midiToHz(numVal);

                    let currentStep = Math.round(hzToMidi(currentHz));
                    let nextStep = currentStep + stepDir;

                    if (suffix.toLowerCase().trim() === 'hz') newValStr = midiToHz(nextStep).toFixed(2);
                    else if (suffix.toLowerCase().trim() === 'c') newValStr = (nextStep * 100).toString();
                    else newValStr = nextStep.toString();
                } else {
                    let newVal = numVal + stepDir;
                    newValStr = Number.isInteger(newVal) ? newVal.toString() : newVal.toFixed(2);
                }

                parts[parts.length - 1] = newValStr + suffix;
                current.set(parts.join(', '));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTool, activeChordIndex, tab15Chords, tab2InputA, tab3Input, tab4Input, tab5Input, tab6Input, tab7Carrier, tab8Input, tab9Input, tab10InputA, isMicrotonalMode, activeTuning]);

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
    // ==========================================
    // MOTOR DE ÁUDIO: MORPHING (ABA 15)
    // ==========================================
    const morphAudioCtxRef = useRef(null);
    const morphMasterGainRef = useRef(null);
    const morphActiveNodesRef = useRef([]);
    const morphTimeoutsRef = useRef([]);

    const initMorphAudio = () => {
        if (!morphAudioCtxRef.current) {
            morphAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            morphMasterGainRef.current = morphAudioCtxRef.current.createGain();
            morphMasterGainRef.current.gain.value = 0.1; // Volume mestre
            const comp = morphAudioCtxRef.current.createDynamicsCompressor();
            comp.threshold.value = -24;
            comp.ratio.value = 4;
            morphMasterGainRef.current.connect(comp);
            comp.connect(morphAudioCtxRef.current.destination);
        }
        if (morphAudioCtxRef.current.state === 'suspended') morphAudioCtxRef.current.resume();
    };

    const stopMorphAudio = () => {
        morphTimeoutsRef.current.forEach(clearTimeout);
        morphTimeoutsRef.current = [];
        morphActiveNodesRef.current.forEach(n => {
            try {
                n.g.gain.cancelScheduledValues(morphAudioCtxRef.current.currentTime);
                n.g.gain.setTargetAtTime(0, morphAudioCtxRef.current.currentTime, 0.1);
                setTimeout(() => { try { n.o.stop(); } catch (e) { } }, 500);
            } catch (e) { }
        });
        morphActiveNodesRef.current = [];
    };

    const playSingleChordMorph = (chord) => {
        stopMorphAudio();
        initMorphAudio();
        const ctx = morphAudioCtxRef.current;
        const now = ctx.currentTime;
        const DUR = 3;

        const hzArray = parseAdvancedToHz(chord.notes).map(h => getClosestInScale(h, chord.tuning, 0, chord.anchorHz, chord.anchorMidi));

        hzArray.forEach((hz, v) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = v === 0 ? 'triangle' : 'sine';
            o.frequency.value = hz;

            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(1, now + 0.1);
            g.gain.setValueAtTime(1, now + DUR - 0.5);
            g.gain.linearRampToValueAtTime(0, now + DUR);

            o.connect(g);
            g.connect(morphMasterGainRef.current);
            o.start(now);
            o.stop(now + DUR + 0.1);
            morphActiveNodesRef.current.push({ o, g });
        });
    };

    return (
        <div className="w-full h-full relative flex flex-col bg-gray-950 font-sans text-white">

            {/* RENDERIZA O POP-UP DE AJUDA SE ESTIVER ATIVO */}
            {renderHelpModal()}

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
                                            <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Entrada Manual (MIDI, Hz, Cents):</label>
                                            <input
                                                type="text"
                                                value={chord.notes}
                                                onChange={e => {
                                                    const n = [...tab15Chords];
                                                    n[index].notes = e.target.value;
                                                    setTab15Chords(n);
                                                }}
                                                placeholder="Ex: 60, 440Hz, +20c"
                                                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-[#00ffcc] font-mono text-xs focus:border-[#00ffcc] outline-none transition-colors shadow-inner"
                                            />
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

                {/* ABA 12: MANUAL DO USUÁRIO E ACADEMIA */}
                {activeTool === 12 && (
                    <div className="flex flex-col w-full h-full bg-[#0d1117] p-8 overflow-y-auto custom-scrollbar items-center">
                        <div className="max-w-5xl w-full bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 p-10 mb-12">

                            <div className="border-b border-gray-800 pb-6 mb-8">
                                <h1 className="text-3xl font-bold text-[#00ffcc] mb-2 font-serif">Manual de Operação do Sistema</h1>
                                <p className="text-gray-400 text-sm">Guia de referência rápida para todas as ferramentas e atalhos.</p>
                            </div>

                            <div className="space-y-10 text-gray-300 leading-relaxed text-sm">
                                <section>
                                    <h2 className="text-xl font-bold text-yellow-500 mb-4 border-l-4 border-yellow-500 pl-3 bg-gray-800 py-2">I. Controles Globais (Barra Superior)</h2>
                                    <ul className="space-y-3">
                                        <li><strong className="text-white">Toggle Xenharmônico / 12-TET:</strong> Alterna o motor matemático de todo o software. Em 12-TET, o sistema limita-se às afinações de piano padrão. Em modo Xenharmônico, os cálculos respondem à afinação ativa estipulada na Aba 11.</li>
                                        <li><strong className="text-white">Quantizar (Snap Global):</strong> Um interruptor essencial para módulos que geram frequências quebradas (como Ring Modulation ou FM). Quando ativado (azul), o algoritmo fará uma varredura sobre as frequências geradas e irá forçá-las (snap) a assumir o degrau mais próximo da sua afinação atual.</li>
                                    </ul>
                                </section>

                                <section>
                                    <h2 className="text-xl font-bold text-pink-400 mb-4 border-l-4 border-pink-400 pl-3 bg-gray-800 py-2">II. Interação e Atalhos</h2>
                                    <ul className="space-y-3">
                                        <li><strong className="text-white">Inserção no Pentagrama:</strong> Para inserir notas visualmente nas pautas (SVG), você deve posicionar o mouse, <code className="bg-gray-950 text-orange-300 px-1 rounded">segurar a tecla Ctrl e clicar</code>.</li>
                                        <li><strong className="text-white">Atalho de Transposição (Alt + Setas):</strong> Clique numa caixa de texto de entrada para dar foco. Pressione <code className="bg-gray-950 text-orange-300 px-1 rounded">Alt + Seta Cima</code> ou <code className="bg-gray-950 text-orange-300 px-1 rounded">Seta Baixo</code> para transpor a última nota da lista em 1 passo da escala atual.</li>
                                        <li><strong className="text-white">Botões "Puxar de":</strong> Presentes no topo das abas, inserem a resposta gerada noutra ferramenta diretamente na entrada da aba atual.</li>
                                    </ul>
                                </section>

                                <section>
                                    <h2 className="text-xl font-bold text-[#00ffcc] mb-4 border-l-4 border-[#00ffcc] pl-3 bg-gray-800 py-2">III. Lógica Operacional por Seção</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 1 (Redes 3D)</strong> O dropdown centraliza o mapa. Os eixos (X, Y, Z) aceitam passos ou Cents puros. O botão "Cent. Câm" reseta o visualizador.
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 2 (Multiplicação)</strong> Calcula a transposição de um acorde sobre cada nota de outro acorde, gerando fractais harmônicos.
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 3 & 4 (Módulos e Projeções)</strong> Repete ciclicamente uma entidade melódica, ou estica/comprime a afinação para caber num espaço fixo de Hertz.
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 5 (Matriz)</strong> Gera matrizes Seriais ou de Intervalo (Estilo Scale Workshop). Útil para dodecafonismo microtonal.
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 6 & 7 (Ring Mod & FM)</strong> Moduladores acústicos. Gere frequências em cascata baseadas na soma/diferença ou bandas laterais (K).
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 9 (Costère)</strong> Analisa a "Densidade Cardinal". Os números indicam "polos de atração" para onde as notas querem resolver.
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 10 (Interpolação)</strong> Faz o "morphing" gradual no tempo. Deslize o slider para derreter a afinação da Entidade A até à Entidade B.
                                        </div>
                                        <div className="bg-gray-950 p-4 rounded border border-gray-700">
                                            <strong className="text-white block mb-1 text-base">Aba 11 (Afinações)</strong> A Bússola. Define a âncora (ex: MIDI 60 = 261.62Hz) e carrega escalas .SCL ou EDOs para todo o sistema.
                                        </div>
                                    </div>
                                </section>
                            </div>
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
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-yellow-400 font-bold text-[10px] uppercase tracking-wider">Configuração da Partitura</h3>
                                    <button onClick={() => setActiveHelpModal(14)} className="w-5 h-5 rounded-full border border-gray-500 text-gray-400 flex items-center justify-center text-[10px] font-bold hover:bg-[#00ffcc] hover:text-black hover:border-[#00ffcc] transition-all shadow-sm" title="Ajuda desta Ferramenta">?</button>
                                </div>
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
                                    <option value="sagittal">Sagittal (Athenian Avançado)</option>
                                    <option value="quarter">Quartos de Tom (24-EDO)</option>
                                    <option value="sixth">Sextos de Tom (36-EDO)</option>
                                </select>
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

                            {/* ENCICLOPÉDIA DE SÍMBOLOS (HEJI & SAGITTAL COMPLETOS) */}
                            <div className="mt-auto pt-4 border-t border-gray-700">
                                <h4 className="text-[10px] text-yellow-500 font-bold uppercase mb-2">Enciclopédia de Símbolos (Subir / Descer):</h4>
                                <div className="bg-gray-950 p-3 rounded border border-gray-700 text-gray-300 font-mono text-[9px] shadow-inner leading-relaxed overflow-y-auto max-h-[400px] custom-scrollbar">

                                    {/* ========================================= */}
                                    {/* GLOSSÁRIO HEJI (SABAT/SCHWEINITZ)         */}
                                    {/* ========================================= */}
                                    {(notationSystem === 'he' || notationSystem === 'ji' || notationSystem === 'auto') && (
                                        <div className="space-y-4">
                                            <p className="text-white border-b border-gray-800 pb-1 font-bold uppercase tracking-widest text-[10px]">HEJI - Limites Harmônicos</p>

                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>f d</span>
                                                <p><b className="text-yellow-400">Limite-5 (±21.5¢):</b> Coma Sintónica. Usada para correção direta de terças e sextas.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>{'>'} {'<'}</span>
                                                <p><b className="text-yellow-400">Limite-7 (±27.3¢):</b> Coma Septimal. Usada para atingir a Sétima Harmônica pura.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>4 5</span>
                                                <p><b className="text-yellow-400">Limite-11 (±53.3¢):</b> Quarto de Tom Undecimal. Representa o 11º harmônico.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>9 0</span>
                                                <p><b className="text-yellow-400">Limite-13 (±65.3¢):</b> Coma Tridecimal. Representa o 13º harmônico (Sexta Neutra).</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>; :</span>
                                                <p><b className="text-yellow-400">Limite-17 (±10.1¢):</b> Ajuste fracional fino da 17ª harmônica.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>/ *</span>
                                                <p><b className="text-yellow-400">Limite-19 (±14.2¢):</b> Desvio baseado na 19ª harmônica.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>6 3</span>
                                                <p><b className="text-yellow-400">Limite-23 (±50.0¢):</b> Quarto de tom exato da série harmônica superior.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>7 2</span>
                                                <p><b className="text-yellow-400">Limite-29 (±48.0¢):</b> Ajuste harmônico extremo.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>1 8</span>
                                                <p><b className="text-yellow-400">Limite-31 (±45.0¢):</b> Correção matemática baseada no número primo 31.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>à á</span>
                                                <p><b className="text-yellow-400">Limite-37 (±33.0¢):</b> Terço de tom natural.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>- +</span>
                                                <p><b className="text-yellow-400">Limite-41 (±37.0¢):</b> Ajuste harmônico superior.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}>è é</span>
                                                <p><b className="text-yellow-400">Limite-43 (±39.0¢):</b> Ajuste harmônico superior.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'HEJI2, serif', fontSize: '1.6rem', color: '#ffdd57', textAlign: 'center' }}> </span>
                                                <p><b className="text-yellow-400">Limite-47 (±42.0¢):</b> O maior limite mapeado no sistema HEJI padrão.</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ========================================= */}
                                    {/* GLOSSÁRIO SAGITTAL (SMuFL)                */}
                                    {/* ========================================= */}
                                    {notationSystem === 'sagittal' && (
                                        <div className="space-y-4">
                                            <p className="text-white border-b border-gray-800 pb-1 font-bold uppercase tracking-widest text-[10px]">Sagittal - Comas Principais</p>

                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE3F8'} {'\uE3F9'}</span>
                                                <p><b className="text-[#00ffcc]">Arco (Scroll):</b> ±21.5¢ (Limite-5 / Coma Sintónica). Corrige diatónicos para terças justas.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE3F2'} {'\uE3F3'}</span>
                                                <p><b className="text-[#00ffcc]">Farpa (Barb):</b> ±27.3¢ (Limite-7 / Coma Septimal). Ajuste para a sétima harmônica.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE3F6'} {'\uE3F7'}</span>
                                                <p><b className="text-[#00ffcc]">Arco + Farpa:</b> ±35.0¢ (Limite-13). Combinação matemática tridecimal.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE3F4'} {'\uE3F5'}</span>
                                                <p><b className="text-[#00ffcc]">Farpa Dupla:</b> ±53.3¢ (Limite-11). Interpolação para o décimo-primeiro harmônico.</p>
                                            </div>

                                            <p className="text-white border-b border-gray-800 pb-1 mt-4 font-bold uppercase tracking-widest text-[10px]">Sagittal - Ajustes Finos (Minas e Tinas)</p>

                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE302'} {'\uE303'}</span>
                                                <p><b className="text-[#00ffcc]">1 Mina:</b> ±1.45¢. Micro-correção extrema.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE304'} {'\uE305'}</span>
                                                <p><b className="text-[#00ffcc]">2 Minas:</b> ±2.9¢.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE306'} {'\uE307'}</span>
                                                <p><b className="text-[#00ffcc]">1 Tina:</b> ±4.35¢.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE308'} {'\uE309'}</span>
                                                <p><b className="text-[#00ffcc]">2 Tinas:</b> ±5.8¢.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE30A'} {'\uE30B'}</span>
                                                <p><b className="text-[#00ffcc]">3 Tinas:</b> ±7.25¢.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE30C'} {'\uE30D'}</span>
                                                <p><b className="text-[#00ffcc]">4 Tinas:</b> ±8.7¢.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE30E'} {'\uE30F'}</span>
                                                <p><b className="text-[#00ffcc]">5 Tinas:</b> ±10.15¢.</p>
                                            </div>
                                            <div className="grid grid-cols-[45px_1fr] gap-2 items-center border-b border-gray-800 pb-2">
                                                <span style={{ fontFamily: 'Bravura, serif', fontSize: '1.8rem', color: '#00ffcc', textAlign: 'center' }}>{'\uE310'} {'\uE311'}</span>
                                                <p><b className="text-[#00ffcc]">Schisma (Curva Dupla):</b> ±11.6¢. Ajuste para a diferença entre limites de 17 e 19.</p>
                                            </div>
                                        </div>
                                    )}

                                    {notationSystem === 'cents' && (
                                        <p>Avaliação quantitativa bruta (Cents). Registra o afastamento algébrico da afinação temperada.</p>
                                    )}
                                    {notationSystem === 'quarter' && (
                                        <p>Notação paramétrica para 24-EDO (Divisões em ±50 cents).</p>
                                    )}
                                    {notationSystem === 'sixth' && (
                                        <p>Sistema Gould adaptado para resolução em 36-EDO.</p>
                                    )}
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
                                            <text x="35" y="-20" fontSize="42" fontFamily="HEJI2Bravura, serif" fill="#000" dominantBaseline="central">{'\uE050'}</text>

                                            {/* Clave de Fá (\uE062) posicionada no Y exato da linha F3 (30) */}
                                            <text x="35" y="30" fontSize="42" fontFamily="HEJI2Bravura, serif" fill="#000" dominantBaseline="central">{'\uE062'}</text>

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
                                                                dominantBaseline="central"
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

                                                        {/* TABELA DE SOFTWARE PITCH BENDS */}
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

                {/* ========================================= */}
                {/* ABA 15: SEQUENCIADOR POLIMICROTONAL       */}
                {/* ========================================= */}
                {activeTool === 15 && (
                    <div className="flex w-full h-full bg-[#0d1117] overflow-hidden">

                        {/* PAINEL ESQUERDO: Lista de Acordes e Inputs */}
                        <div className="w-[420px] flex-shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col h-full z-20 shadow-xl">
                            <div className="p-4 border-b border-slate-700 bg-slate-950 flex flex-col gap-3">
                                <h2 className="text-xl font-bold text-white">Voice Leading Dinâmico</h2>
                                <p className="text-[10px] text-slate-400">Você pode usar múltiplos ficheiros .scl diferentes na mesma cadência capturando a escala ativa da Aba 11 para cada acorde.</p>
                                <div className="flex gap-2">
                                    <button onClick={() => setTab15Chords([...tab15Chords, { id: Date.now(), notes: "C4, E4, G4", tuning: "12-TET", anchorMidi: 60, anchorHz: 261.63, isExpanded: true, showExport: false, customTuningObj: null }])} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-bold py-2 rounded transition">
                                        + Novo Acorde
                                    </button>
                                    <button onClick={playMorphingSequence} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold py-2 rounded shadow-lg shadow-violet-500/30 transition">
                                        ▶ Morph Todos
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
                                {tab15Chords.map((chord, index) => {
                                    // NOVO PARSEAMENTO: Agora suporta C4!
                                    const rawHzArr = chord.notes.split(',').map(parseNoteToHz).filter(n => !isNaN(n));
                                    const mappedHzArr = rawHzArr.map(h => getClosestMicrotonalHz(h, chord.tuning, chord.anchorHz, chord.customTuningObj));

                                    return (
                                        <div
                                            key={chord.id} onClick={() => setActiveChordIndex(index)}
                                            className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col gap-3
                                                ${activeChordIndex === index ? 'border-violet-500 bg-violet-900/10' : 'border-transparent bg-slate-800 hover:bg-slate-700'}`}
                                        >
                                            <button onClick={(e) => { e.stopPropagation(); setTab15Chords(tab15Chords.filter(c => c.id !== chord.id)); setActiveChordIndex(Math.max(0, index - 1)); }} className="absolute top-2 right-2 text-slate-500 hover:text-red-500 font-bold transition">✕</button>

                                            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); const n = [...tab15Chords]; n[index].isExpanded = !n[index].isExpanded; setTab15Chords(n); }} className="text-[#00ffcc] font-bold w-5 h-5 bg-slate-950 rounded border border-slate-700 hover:bg-slate-700 flex justify-center items-center">
                                                        {chord.isExpanded ? '▼' : '▶'}
                                                    </button>
                                                    <h3 className="text-white font-bold">Acorde #{index + 1}</h3>
                                                </div>
                                                <select
                                                    value={chord.customTuningObj ? "CUSTOM" : chord.tuning}
                                                    onChange={e => { const n = [...tab15Chords]; n[index].tuning = e.target.value; n[index].customTuningObj = null; setTab15Chords(n); }}
                                                    className="bg-slate-950 text-[#00ffcc] text-[10px] p-1.5 rounded border border-slate-600 font-bold max-w-[130px]"
                                                >
                                                    {chord.customTuningObj && <option value="CUSTOM">[{chord.customTuningObj.data?.description?.substring(0, 8) || "SCL"}]</option>}
                                                    {tab15AvailableTunings.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>

                                            {chord.isExpanded && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2 rounded border border-slate-700">
                                                        <div>
                                                            <label className="text-[9px] text-slate-500 uppercase block mb-1">Âncora (MIDI):</label>
                                                            <input type="number" value={chord.anchorMidi} onChange={e => { const n = [...tab15Chords]; const val = Number(e.target.value); n[index].anchorMidi = val; n[index].anchorHz = Number((440 * Math.pow(2, (val - 69) / 12)).toFixed(2)); setTab15Chords(n); }} className="w-full bg-slate-800 text-slate-300 text-xs p-1 rounded border border-slate-600 text-center" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-slate-500 uppercase block mb-1">Âncora (Hz):</label>
                                                            <input type="number" step="any" value={chord.anchorHz} onChange={e => { const n = [...tab15Chords]; n[index].anchorHz = Number(e.target.value); setTab15Chords(n); }} className="w-full bg-slate-800 text-slate-300 text-xs p-1 rounded border border-slate-600 text-center" />
                                                        </div>
                                                    </div>

                                                    <button onClick={(e) => { e.stopPropagation(); const n = [...tab15Chords]; n[index].customTuningObj = activeTuning; setTab15Chords(n); }} className="w-full bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 text-[10px] font-bold py-2 rounded border border-emerald-800 transition">
                                                        ↓ Capturar Escala da Aba 11 para este acorde
                                                    </button>

                                                    <div className="bg-slate-950 p-2 rounded border border-slate-700">
                                                        <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Editor de Notas (Ex: C4, 440Hz):</label>
                                                        <textarea
                                                            value={chord.notes}
                                                            onChange={e => { const n = [...tab15Chords]; n[index].notes = e.target.value; setTab15Chords(n); }}
                                                            className="w-full bg-transparent text-[#00ffcc] font-mono text-xs outline-none resize-none h-12"
                                                            placeholder="Ex: C4, E4, 440Hz"
                                                        />
                                                    </div>

                                                    <div className="flex flex-col gap-1 mt-1">
                                                        {chord.notes.split(',').map(s => s.trim()).filter(Boolean).map((n, vIdx) => {
                                                            const baseHzLocal = parseNoteToHz(n);
                                                            if (isNaN(baseHzLocal)) return null; // Ignora se o texto for inválido

                                                            const mLocal = getClosestMicrotonalHz(baseHzLocal, chord.tuning, chord.anchorHz, chord.customTuningObj);
                                                            const deviation = 1200 * Math.log2(mLocal / baseHzLocal);
                                                            const sign = deviation > 0.05 ? '+' : '';
                                                            let colorClass = Math.abs(deviation) <= 0.05 ? 'text-[#34d399]' : (deviation > 0.05 ? 'text-[#f87171]' : 'text-[#60a5fa]');
                                                            let devStr = Math.abs(deviation) <= 0.05 ? '0c' : `${sign}${deviation.toFixed(1)}c`;

                                                            return (
                                                                <div key={vIdx} className="font-mono text-[10px] p-1.5 rounded bg-slate-900 border border-slate-700/50 flex justify-between items-center">
                                                                    <span className="font-bold text-slate-300 w-8">{n}</span>
                                                                    <span className={`${colorClass} font-bold flex-1 text-center`}>{devStr}</span>
                                                                    <span className="text-slate-400 w-16 text-right">{mLocal.toFixed(1)}Hz</span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const newChords = [...tab15Chords];
                                                                            let arr = chord.notes.split(',').map(s => s.trim()).filter(Boolean);
                                                                            arr.splice(vIdx, 1);
                                                                            newChords[index].notes = arr.join(', ');
                                                                            setTab15Chords(newChords);
                                                                        }}
                                                                        className="text-red-500 hover:text-red-400 px-1 ml-2 font-bold"
                                                                    >✕</button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {chord.showExport && (
                                                        <div className="bg-slate-950 p-3 rounded border border-slate-700 mt-2 font-mono text-[9px] text-slate-400 select-all leading-relaxed shadow-inner">
                                                            <div className="text-blue-400 mb-1 font-bold border-b border-slate-800 pb-1 flex justify-between">
                                                                <span>DADOS EXPORTÁVEIS (Ctrl+C)</span>
                                                                <button onClick={(e) => { e.stopPropagation(); const n = [...tab15Chords]; n[index].showExport = false; setTab15Chords(n); }} className="text-slate-500 hover:text-white">✕</button>
                                                            </div>
                                                            <div><span className="text-slate-500">Notas:</span> [{rawHzArr.map(h => noteNames[((Math.round(69 + 12 * Math.log2(h / 440)) % 12) + 12) % 12] + (Math.floor((69 + 12 * Math.log2(h / 440)) / 12) - 1)).join(', ')}]</div>
                                                            <div><span className="text-slate-500">MIDI:</span> [{rawHzArr.map(h => (69 + 12 * Math.log2(h / 440)).toFixed(2)).join(', ')}]</div>
                                                            <div><span className="text-slate-500">Hertz:</span> [{mappedHzArr.map(h => h.toFixed(2) + 'Hz').join(', ')}]</div>
                                                            <div><span className="text-slate-500">Cents:</span> [{rawHzArr.map((bHz, i) => {
                                                                const dev = 1200 * Math.log2(mappedHzArr[i] / bHz);
                                                                return (dev >= 0 ? '+' : '') + dev.toFixed(1) + 'c';
                                                            }).join(', ')}]</div>
                                                        </div>
                                                    )}

                                                    <div className="flex gap-1 mt-2">
                                                        <button onClick={(e) => { e.stopPropagation(); playAudio(mappedHzArr, true); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold py-2 rounded transition">▶ Ouvir Acorde</button>
                                                        {index < tab15Chords.length - 1 && <button onClick={(e) => { e.stopPropagation(); playMorphTransition(index); }} className="flex-1 bg-violet-700 hover:bg-violet-600 text-white text-[10px] font-bold py-2 rounded">⤨ Morph p/ Próximo</button>}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); const n = [...tab15Chords]; n[index].showExport = !n[index].showExport; setTab15Chords(n); }}
                                                            className={`bg-slate-800 hover:bg-slate-700 text-[12px] py-1.5 px-3 rounded transition ${chord.showExport ? 'text-blue-400 border border-blue-500/50' : 'text-slate-300'}`}
                                                            title="Mostrar Dados Exportáveis"
                                                        >
                                                            📋
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* PAINEL DIREITO: Pauta SVG (Com suporte a C4) */}
                        <div className="flex-1 bg-[#fdfdfd] relative flex flex-col h-full overflow-hidden">
                            <div className="p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center shadow-md z-10 shrink-0">
                                <span className="text-[#00ffcc] text-xs font-mono font-bold bg-slate-950 px-3 py-1.5 rounded border border-[#00ffcc]/30">Editando: Acorde #{activeChordIndex + 1}</span>
                                <span className="text-slate-400 text-[10px]">A pauta tem scroll infinito. Atalho: Alt + Setas.</span>
                            </div>

                            <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#f8f9fa] block pt-16 pl-4">
                                {(() => {
                                    const activeChord = tab15Chords[activeChordIndex];
                                    if (!activeChord) return null;

                                    // MÁGICA AQUI: O SVG agora lê o "C4" da caixa usando o parseNoteToHz
                                    const rawHzArr = activeChord.notes.split(',').map(parseNoteToHz).filter(n => !isNaN(n));
                                    const microHz = rawHzArr.map(h => getClosestMicrotonalHz(h, activeChord.tuning, activeChord.anchorHz, activeChord.customTuningObj));

                                    let notesData = generateNotationData(microHz, baseHz, baseMidi, notationSystem);
                                    notesData = notesData.map((n, i) => ({ ...n, x: 80 + (i * 50), y: -n.step * 5 }));

                                    const svgWidth = Math.max(900, notesData.length * 50 + 200);
                                    const minY = Math.min(-100, ...notesData.map(n => n.y - 50));
                                    const maxY = Math.max(100, ...notesData.map(n => n.y + 50));
                                    const vHeight = maxY - minY;

                                    return (
                                        <svg width={svgWidth} height="350" viewBox={`0 ${minY} ${svgWidth} ${vHeight}`} style={{ display: 'block', minWidth: `${svgWidth}px` }}>

                                            {/* HITBOXES DE CLIQUE */}
                                            {Array.from({ length: 40 }).map((_, i) => {
                                                const step = 20 - i;
                                                const yLine = -step * 5;
                                                const oct = Math.floor(step / 7);
                                                const deg = ((step % 7) + 7) % 7;
                                                const baseMidiVal = 60 + (oct * 12) + [0, 2, 4, 5, 7, 9, 11][deg];

                                                return (
                                                    <rect
                                                        key={`hit-${i}`} x="0" y={yLine - 2.5} width={svgWidth} height="5" fill="transparent"
                                                        className="hover:fill-violet-500/10 cursor-pointer"
                                                        onClick={(e) => {
                                                            let modifier = 0;
                                                            if (e.shiftKey) modifier = 1;
                                                            if (e.altKey) modifier = -1;

                                                            const finalMidi = baseMidiVal + modifier;
                                                            const finalNoteName = noteNames[((finalMidi % 12) + 12) % 12] + (Math.floor(finalMidi / 12) - 1);

                                                            let arr = activeChord.notes.split(',').map(s => s.trim()).filter(Boolean);

                                                            const idx = arr.indexOf(finalNoteName);
                                                            if (idx > -1) arr.splice(idx, 1);
                                                            else arr.push(finalNoteName);

                                                            const n = [...tab15Chords];
                                                            n[activeChordIndex].notes = arr.join(', ');
                                                            setTab15Chords(n);

                                                            const targetHz = 440 * Math.pow(2, (finalMidi - 69) / 12);
                                                            playAudio([getClosestMicrotonalHz(targetHz, activeChord.tuning, activeChord.anchorHz, activeChord.customTuningObj)], true);
                                                        }}
                                                    />
                                                );
                                            })}

                                            {/* LINHAS FIXAS DA PAUTA */}
                                            {[-10, -20, -30, -40, -50].map(y => <line key={`t${y}`} x1="40" y1={y} x2={svgWidth - 40} y2={y} stroke="#ced4da" strokeWidth="1.5" className="pointer-events-none" />)}
                                            {[10, 20, 30, 40, 50].map(y => <line key={`b${y}`} x1="40" y1={y} x2={svgWidth - 40} y2={y} stroke="#ced4da" strokeWidth="1.5" className="pointer-events-none" />)}

                                            {/* Claves reposicionadas nas suas linhas nominais exatas (Sol=-20, Fá=20) */}
                                            <text x="45" y="-20" fontSize="45" fontFamily="Bravura, serif" fill="#adb5bd" dominantBaseline="central" className="pointer-events-none">{'\uE050'}</text>
                                            <text x="45" y="20" fontSize="45" fontFamily="Bravura, serif" fill="#adb5bd" dominantBaseline="central" className="pointer-events-none">{'\uE062'}</text>

                                            {notesData.map(note => {
                                                const isTreble = note.step >= 0;
                                                const stemDown = note.step >= (isTreble ? 6 : -6);
                                                return (
                                                    <g key={note.id} transform={`translate(${note.x}, ${note.y})`} className="pointer-events-none">
                                                        {note.ledgers.map(lY => <line key={lY} x1="-14" y1={lY - note.y} x2="14" y2={lY - note.y} stroke="#212529" strokeWidth="2" />)}
                                                        <ellipse cx="0" cy="0" rx="5.5" ry="4" fill="#212529" transform="rotate(-20)" />
                                                        <line x1={stemDown ? -5 : 5} y1="0" x2={stemDown ? -5 : 5} y2={stemDown ? 25 : -25} stroke="#212529" strokeWidth="1.5" />
                                                        <text x={note.xOffset} y={note.yOffset} fontSize="38" fontFamily={note.font} fill="#212529" textAnchor="start" dominantBaseline="central">{note.char}</text>
                                                        <text x="0" y={stemDown ? -18 : 32} fontSize="9" fontFamily="monospace" fill="#e04e8a" textAnchor="middle" fontWeight="bold">{note.centsLabel}</text>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
                {/* ========================================= */}
                {/* ABA 16: COMPARADOR ESPECTRAL (TXT STYLE)  */}
                {/* ========================================= */}
                {activeTool === 16 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-[300px] flex-shrink-0 bg-slate-900 p-4 border-r border-slate-700 flex flex-col space-y-4">
                            <h3 className="text-yellow-400 font-bold text-[10px] uppercase tracking-wider">Mesa de Luz Espectral</h3>

                            <div className="bg-slate-950 p-3 rounded border border-slate-700">
                                <label className="text-[10px] text-slate-500 uppercase block mb-1">Âncora Global da Régua:</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[8px] text-slate-600 block text-center">MIDI</span>
                                        <input
                                            type="number" value={tab16AnchorMidi}
                                            onChange={e => {
                                                const m = Number(e.target.value);
                                                setTab16AnchorMidi(m);
                                                setTab16AnchorHz(Number((440 * Math.pow(2, (m - 69) / 12)).toFixed(2)));
                                            }}
                                            className="w-full bg-slate-800 text-xs p-1.5 rounded border border-slate-600 text-white text-center font-bold"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-[8px] text-slate-600 block text-center">Hertz</span>
                                        <input type="number" step="any" value={tab16AnchorHz} onChange={e => setTab16AnchorHz(Number(e.target.value))} className="w-full bg-slate-800 text-xs p-1.5 rounded border border-slate-600 text-white text-center font-bold" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <input type="number" value={tab16NewScaleEdo} onChange={e => setTab16NewScaleEdo(Number(e.target.value))} className="w-full bg-slate-800 p-2 rounded border border-slate-600 text-white text-xs" placeholder="Valor EDO" />
                                <button onClick={() => setTab16Scales([...tab16Scales, { id: Date.now(), name: `${tab16NewScaleEdo}-EDO`, type: "edo", value: tab16NewScaleEdo }])} className="w-full bg-blue-700 hover:bg-blue-600 text-white text-[10px] py-2 rounded font-bold transition">
                                    + Adicionar EDO
                                </button>
                                <button onClick={() => setTab16Scales([...tab16Scales, { id: Date.now(), name: activeTuning.data?.description?.substring(0, 20) || (activeTuning.type === 'edo' ? activeTuning.divisions + "-EDO" : "Escala Global"), type: "custom", tuningObj: activeTuning }])} className="w-full bg-[#00ffcc] hover:bg-[#00ccaa] text-black text-[10px] py-2 rounded font-bold transition">
                                    + Puxar Aba 11 (Captura Atual)
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto border-t border-slate-700 pt-4 mt-2 custom-scrollbar">
                                <span className="text-[9px] text-slate-500 uppercase font-bold">Escalas Ativas:</span>
                                <div className="mt-2 flex flex-col gap-1">
                                    {tab16Scales.map(s => (
                                        <div key={s.id} className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800 text-xs text-slate-300">
                                            <span className="truncate pr-2">{s.name}</span>
                                            <button onClick={() => setTab16Scales(tab16Scales.filter(x => x.id !== s.id))} className="text-red-500 hover:text-red-400 font-bold">✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-6 bg-[#0f172a] flex flex-col relative overflow-hidden">
                            <div className="h-[90px] mb-2 shrink-0">
                                {tab16SelectedNode ? (
                                    <div className="bg-[#1e293b] border border-slate-600 p-3 rounded shadow-lg flex flex-col justify-center h-full w-full max-w-3xl">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Detalhes da Nota (Comparada com 12-TET)</span>
                                            <button onClick={() => setTab16SelectedNode(null)} className="text-slate-500 hover:text-red-400 text-xs font-bold">FECHAR ✕</button>
                                        </div>
                                        <div className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-700">
                                            <span className="font-bold text-slate-300 w-16 text-sm">{tab16SelectedNode.noteName}</span>
                                            <span className={`${Math.abs(tab16SelectedNode.centsDev) <= 0.05 ? 'text-[#34d399]' : (tab16SelectedNode.centsDev > 0.05 ? 'text-[#f87171]' : 'text-[#60a5fa]')} font-bold text-center flex-1 text-sm font-mono tracking-wider`}>
                                                {Math.abs(tab16SelectedNode.centsDev) <= 0.05 ? '0c' : `${tab16SelectedNode.centsDev > 0 ? '+' : ''}${tab16SelectedNode.centsDev.toFixed(2)}c`}
                                            </span>
                                            <span className="text-slate-400 w-24 text-right font-mono text-sm">{tab16SelectedNode.hz.toFixed(2)}Hz</span>
                                            <button onClick={() => playAudio([tab16SelectedNode.hz], true)} className="ml-6 bg-violet-600 hover:bg-violet-500 text-white px-3 py-1 rounded text-xs font-bold transition">🎵 Ouvir</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col justify-center">
                                        <h2 className="text-xl font-bold text-white mb-1">Análise de Colisão (0 a 1200 Cents)</h2>
                                        <p className="text-xs text-slate-400">Passe o rato no gráfico para iluminar colisões (&lt; 5c). Clique no nó para ver o painel de desvios e tocar a nota.</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar border border-slate-800 rounded-lg bg-slate-950 relative p-4" onMouseLeave={() => setTab16HoveredCents(null)}>
                                <svg width="100%" height={Math.max(400, tab16Scales.length * 80 + 40)} style={{ minWidth: '1500px' }}>
                                    {Array.from({ length: 13 }).map((_, i) => (
                                        <g key={`bg-${i}`}>
                                            <line x1={`${(i / 12) * 100}%`} y1="0" x2={`${(i / 12) * 100}%`} y2="100%" stroke="#1f2937" strokeWidth="1" strokeDasharray="4 4" />
                                            <text x={`${(i / 12) * 100}%`} y="15" fill="#4b5563" fontSize="10" textAnchor="middle">{i * 100}</text>
                                        </g>
                                    ))}

                                    {tab16Scales.map((scale, sIdx) => {
                                        const y = 60 + sIdx * 80;
                                        let scalePoints = [];

                                        // O Mapeamento Absoluto dos Pontos (Cálculo Fiel a SCL e EDO)
                                        if (scale.type === 'edo') {
                                            for (let i = 0; i <= scale.value; i++) scalePoints.push(i * (1200 / scale.value));
                                        } else if (scale.type === 'custom' && scale.tuningObj) {
                                            if (scale.tuningObj.type === 'edo') {
                                                for (let i = 0; i <= scale.tuningObj.divisions; i++) scalePoints.push(i * (1200 / scale.tuningObj.divisions));
                                            } else if (scale.tuningObj.type === 'scala' && scale.tuningObj.data) {
                                                // Escalas Scala: Adicionamos o 0 (A tónica pura) e mapeamos o resto pelo valor 'cents' que o seu scalaParser.js gerou!
                                                scalePoints = [0, ...scale.tuningObj.data.scale.map(s => s.cents)];
                                            }
                                        }

                                        return (
                                            <g key={scale.id}>
                                                <text x="5" y={y - 15} fill="#94a3b8" fontSize="11" fontWeight="bold">{scale.name}</text>
                                                <line x1="0" y1={y} x2="100%" y2={y} stroke="#334155" strokeWidth="2" />

                                                {scalePoints.map((cents, pIdx) => {
                                                    const isHovered = tab16HoveredCents !== null && Math.abs(cents - tab16HoveredCents) <= 5.5;
                                                    const isSelected = tab16SelectedNode && Math.abs(cents - tab16SelectedNode.cents) < 0.1 && tab16SelectedNode.scale === scale.name;

                                                    return (
                                                        <g
                                                            key={`mark-${pIdx}`}
                                                            onMouseEnter={() => setTab16HoveredCents(cents)}
                                                            onClick={() => {
                                                                const hz = tab16AnchorHz * Math.pow(2, cents / 1200);
                                                                const midiFloat = 69 + 12 * Math.log2(hz / 440);
                                                                const closest12TET = Math.round(cents / 100) * 100;
                                                                setTab16SelectedNode({
                                                                    scale: scale.name,
                                                                    cents: cents,
                                                                    hz: hz,
                                                                    centsDev: cents - closest12TET,
                                                                    noteName: noteNames[((Math.round(midiFloat) % 12) + 12) % 12] + (Math.floor(midiFloat / 12) - 1)
                                                                });
                                                            }}
                                                            className="cursor-crosshair"
                                                        >
                                                            {isHovered && <line x1={`${(cents / 1200) * 100}%`} y1="0" x2={`${(cents / 1200) * 100}%`} y2="100%" stroke="#00ffcc" strokeWidth="1.5" opacity="0.5" className="pointer-events-none" />}
                                                            <circle cx={`${(cents / 1200) * 100}%`} cy={y} r={isHovered || isSelected ? 8 : 5} fill={isSelected ? "#ffdd57" : (isHovered ? "#00ffcc" : "#64748b")} className="transition-all" />
                                                            {(isHovered || isSelected) && (
                                                                <g className="pointer-events-none">
                                                                    <rect x={`calc(${(cents / 1200) * 100}% - 25px)`} y={y + 12} width="50" height="18" fill="#000" rx="4" />
                                                                    <text x={`${(cents / 1200) * 100}%`} y={y + 24} fill={isSelected ? "#ffdd57" : "#00ffcc"} fontSize="9" fontWeight="bold" textAnchor="middle">{cents.toFixed(1)}¢</text>
                                                                </g>
                                                            )}
                                                        </g>
                                                    );
                                                })}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}