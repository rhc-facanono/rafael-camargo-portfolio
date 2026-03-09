import React, { useState, useRef, useMemo, useEffect } from "react";
import * as THREE from 'three';
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ==========================================
// FUNÇÕES MATEMÁTICAS E DE FORMATAÇÃO
// ==========================================

function midiToNote(midi) {
    const name = noteNames[((Math.round(midi) % 12) + 12) % 12];
    const oct = Math.floor(Math.round(midi) / 12) - 1;
    return name + oct;
}

function midiArrayToNames(arr) {
    return arr.map(midiToNote).join(', ');
}

function midiToQuarterTone(midi) {
    const m = Math.round(midi * 2) / 2;
    const isQuarter = m % 1 !== 0;
    const baseMidi = Math.floor(m);
    const name = noteNames[((baseMidi % 12) + 12) % 12];
    const oct = Math.floor(baseMidi / 12) - 1;
    return isQuarter ? `${name}+${oct}` : `${name}${oct}`;
}

function hzToMidi(hz) { return 69 + 12 * Math.log2(hz / 440); }
function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function parseAdvancedToHz(str) {
    const parts = str.split(/[,;\s]+/).filter(Boolean);
    return parts.map(p => {
        if (p.toLowerCase().endsWith('hz')) return parseFloat(p);
        let centsOffset = 0;
        let mainPart = p;
        const cMatch = p.match(/([+-]\d+)c$/i);
        if (cMatch) {
            centsOffset = parseInt(cMatch[1]);
            mainPart = p.replace(cMatch[0], '');
        }
        const noteMatch = mainPart.match(/^([A-G][#b]?)([\+])?(-?\d+)$/i);
        if (noteMatch) {
            const name = noteMatch[1].toUpperCase();
            const isQuarter = noteMatch[2] === '+';
            const oct = parseInt(noteMatch[3]);
            const nameMap = { "C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "F": 5, "F#": 6, "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11 };
            let midi = nameMap[name] + (oct + 1) * 12;
            if (isQuarter) midi += 0.5;
            midi += centsOffset / 100;
            return midiToHz(midi);
        }
        const m = parseFloat(mainPart);
        if (!isNaN(m)) return midiToHz(m);
        return null;
    }).filter(n => n !== null);
}

function formatAllOutput(hzArray) {
    if (!hzArray || hzArray.length === 0) return { midi: "-", midiCents: "-", hz: "-", notes: "-", quarters: "-" };
    const midis = hzArray.map(hzToMidi);

    const strMidi = midis.map(m => Math.round(m)).join(', ');
    const strMidiCents = midis.map(m => {
        let intP = Math.floor(m);
        let cents = Math.round((m - intP) * 100);
        if (cents === 100) { intP += 1; cents = 0; }
        return `${intP}${cents.toString().padStart(2, '0')}`;
    }).join(', ');

    const strHz = hzArray.map(hz => hz.toFixed(2)).join(', ');
    const strNotes = midis.map(m => {
        const intMidi = Math.round(m);
        let c = Math.round((m - intMidi) * 100);
        const nName = noteNames[((intMidi % 12) + 12) % 12];
        const nOct = Math.floor(intMidi / 12) - 1;
        const sign = c > 0 ? '+' : '';
        return c === 0 ? `${nName}${nOct}` : `${nName}${nOct} ${sign}${c}c`;
    }).join(', ');

    const strQuarters = midis.map(m => {
        const mQ = Math.round(m * 2) / 2;
        const isQ = mQ % 1 !== 0;
        const n = noteNames[((Math.floor(mQ) % 12) + 12) % 12];
        const o = Math.floor(Math.floor(mQ) / 12) - 1;
        return isQ ? `${n}+${o}` : `${n}${o}`;
    }).join(', ');

    return { midi: strMidi, midiCents: strMidiCents, hz: strHz, notes: strNotes, quarters: strQuarters };
}

const messiaenModes = {
    1: { name: "Modo 1 (2-2-2-2-2-2)", pcs: [0, 2, 4, 6, 8, 10] },
    2: { name: "Modo 2 (1-2-1-2-1-2-1-2)", pcs: [0, 1, 3, 4, 6, 7, 9, 10] },
    3: { name: "Modo 3 (2-1-1-2-1-1-2-1-1)", pcs: [0, 2, 3, 4, 6, 7, 8, 10, 11] },
    4: { name: "Modo 4 (1-1-3-1-1-1-3-1)", pcs: [0, 1, 2, 5, 6, 7, 8, 11] },
    5: { name: "Modo 5 (1-4-1-1-4-1)", pcs: [0, 1, 5, 6, 7, 11] },
    6: { name: "Modo 6 (2-2-1-1-2-2-1-1)", pcs: [0, 2, 4, 5, 6, 8, 10, 11] },
    7: { name: "Modo 7 (1-1-1-2-1-1-1-1-2-1-1-1)", pcs: [0, 1, 2, 3, 5, 6, 7, 8, 9, 11] },
};

function snapToMode(midiArr, modeKey) {
    const mode = messiaenModes[modeKey].pcs;
    return midiArr.map(midi => {
        let pc = ((Math.round(midi) % 12) + 12) % 12;
        let closest = mode[0], minDiff = 12;
        for (let m of mode) {
            let diff = Math.min(Math.abs(pc - m), 12 - Math.abs(pc - m));
            if (diff < minDiff) { minDiff = diff; closest = m; }
        }
        let oct = Math.floor(midi / 12) * 12;
        let res = oct + closest;
        if (pc > 9 && closest < 3) res += 12;
        if (pc < 3 && closest > 9) res -= 12;
        return res;
    });
}

// PROTEÇÃO E DURAÇÃO DE ÁUDIO CORRIGIDAS
const playAudio = (hzArray, isSimultaneous = false) => {
    if (!hzArray || hzArray.length === 0) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    hzArray.forEach((hz, i) => {
        const clampedHz = Math.max(22, Math.min(17000, hz)); // Limitado entre 22 e 17k
        if (isNaN(clampedHz)) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = clampedHz;
        osc.connect(gain);
        gain.connect(ctx.destination);

        // Tempos aumentados
        const start = t + (isSimultaneous ? 0 : i * 0.7);
        const dur = isSimultaneous ? 2.9 : 0.8;

        osc.start(start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.stop(start + dur);
    });
};

// ==========================================
// COMPONENTES DE UI
// ==========================================

const HelpBox = ({ title, children }) => (
    <div className="bg-gray-800 p-2 text-[10px] text-gray-300 border border-gray-700 mb-2 flex-shrink-0 rounded shadow-inner">
        <strong className="text-blue-300 block mb-1 border-b border-gray-700 pb-1">{title}</strong>
        <div className="leading-tight space-y-1">{children}</div>
    </div>
);

const UniversalOutput = ({ hzArray, title = "Resultado", showAudio = true, showMelody = false }) => {
    const fmt = formatAllOutput(hzArray);
    return (
        <div className="bg-gray-950 p-2 rounded border border-gray-700 flex flex-col flex-shrink-0 mt-auto shadow-inner">
            <span className="text-[11px] text-green-400 font-bold mb-1 border-b border-gray-800 pb-1">{title}:</span>
            <div className="overflow-y-auto custom-scrollbar space-y-1 mb-2 max-h-32">
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">MIDI:</span> <span className="text-gray-300 font-mono">[{fmt.midi}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">MIDI+c:</span> <span className="text-gray-300 font-mono">[{fmt.midiCents}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">Hertz:</span> <span className="text-gray-300 font-mono">[{fmt.hz}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">Notas:</span> <span className="text-gray-300 font-mono">[{fmt.notes}]</span></div>
                <div className="text-[9px] break-all"><span className="text-gray-500 w-12 inline-block">1/4 Tom:</span> <span className="text-gray-300 font-mono">[{fmt.quarters}]</span></div>
            </div>
            {showAudio && (
                <div className="flex gap-2">
                    <button onClick={() => playAudio(hzArray, true)} className="flex-1 bg-green-800 hover:bg-green-700 transition text-[10px] py-1.5 rounded font-bold">🎵 Acorde</button>
                    {showMelody && <button onClick={() => playAudio(hzArray, false)} className="flex-1 bg-green-700 hover:bg-green-600 transition text-[10px] py-1.5 rounded font-bold">🎵 Melodia</button>}
                </div>
            )}
        </div>
    );
};

// ==========================================
// 3D & PIANO ROLL
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
        <mesh position={pt.position} onClick={e => { if (e.ctrlKey) { e.stopPropagation(); ignoreNextRef.current = true; toggleSelect(pt.coord); } }}>
            <sphereGeometry args={[0.2, 32, 32]} />
            <meshStandardMaterial color={color} transparent opacity={customOpacity} roughness={0.12} metalness={0.25} emissive={isSel ? '#fff' : color} emissiveIntensity={isSel ? 0.35 : 0.05} />
            <Billboard><Text position={[0, 0, 0]} fontSize={0.23} color="#ffffff" outlineWidth={0.05} outlineColor="#000000" anchorX="center" anchorY="middle" fontWeight="bold" depthOffset={-1} fillOpacity={textOpacity} outlineOpacity={textOpacity}>{pt.note}</Text></Billboard>
        </mesh>
    );
}

function BachRollVisualizer({ notes, isSequence = false, isMicrotonal = false, onKeyClick = null, onNoteDrag = null, onNoteDelete = null, originalEntityLength = 0 }) {
    const minMidi = 36, maxMidi = 96, rowHeight = 14, keyWidth = 60, totalHeight = (maxMidi - minMidi + 1) * rowHeight;
    const [draggingIdx, setDraggingIdx] = useState(null);

    const handlePointerDown = (e, idx) => {
        if (e.ctrlKey) { e.stopPropagation(); if (onNoteDelete) onNoteDelete(idx); return; }
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
        <div className="w-full h-full bg-gray-900 border border-gray-700 rounded overflow-auto relative custom-scrollbar select-none">
            <svg width={isSequence ? Math.max(800, keyWidth + notes.length * 30 + 50) : "100%"} height={totalHeight} className="min-w-full" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                {Array.from({ length: maxMidi - minMidi + 1 }).map((_, i) => {
                    let m = maxMidi - i, y = i * rowHeight, isBlack = [1, 3, 6, 8, 10].includes(m % 12);
                    return <line key={`grid-${m}`} x1={keyWidth} y1={y} x2="100%" y2={y} stroke={isBlack ? "#333" : "#444"} strokeWidth="1" opacity="0.5" />;
                })}
                {notes.map((midi, idx) => {
                    const y = (maxMidi - midi) * rowHeight, x = isSequence ? keyWidth + 10 + (idx * 30) : keyWidth + 20;
                    let color = isMicrotonal ? "#ff4757" : (originalEntityLength > 0 && idx >= originalEntityLength) ? "#9b59b6" : "#1e90ff";
                    return (
                        <g key={`note-${idx}`}>
                            <rect x={x} y={y} width={isSequence ? 25 : 80} height={rowHeight - 2} fill={color} rx="3" opacity="0.9" style={{ cursor: (onNoteDrag && !isMicrotonal) ? 'ns-resize' : 'default' }} onPointerDown={(e) => handlePointerDown(e, idx)} />
                        </g>
                    );
                })}
                <g className="sticky left-0 drop-shadow-lg">
                    {Array.from({ length: maxMidi - minMidi + 1 }).map((_, i) => {
                        let m = maxMidi - i, y = i * rowHeight, isBlack = [1, 3, 6, 8, 10].includes(m % 12), isC = (m % 12 === 0);
                        return (
                            <g key={`key-${m}`} onClick={() => onKeyClick && onKeyClick(m)} style={{ cursor: onKeyClick ? 'pointer' : 'default' }}>
                                <rect x={0} y={y} width={keyWidth} height={rowHeight} fill={isBlack ? "#222" : "#eee"} stroke="#999" strokeWidth="1" />
                                {isC && <text x={5} y={y + 10} fontSize="9" fill={isBlack ? "#fff" : "#000"} fontWeight="bold">C{(m / 12) - 1}</text>}
                                {onKeyClick && <rect x={0} y={y} width={keyWidth} height={rowHeight} fill="white" opacity="0" className="hover:opacity-20" />}
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

function HarmonicNetwork() {
    const [activeTab, setActiveTab] = useState(1);

    // ABA 1
    const [baseNote, setBaseNote] = useState(48);
    const [intX, setIntX] = useState(7), [intY, setIntY] = useState(12), [intZ, setIntZ] = useState(4);
    const [selectedSet, setSelectedSet] = useState(new Set());
    const [showOnlyHighlight, setShowOnlyHighlight] = useState(false);
    const [filterText, setFilterText] = useState("");
    const [showHelp, setShowHelp] = useState(false);

    // ABA 2
    const [tab2InputA, setTab2InputA] = useState(""), [tab2InputB, setTab2InputB] = useState("0, 4, 7"), [tab2NonTemp, setTab2NonTemp] = useState(false);

    // ABA 3
    const [tab3Input, setTab3Input] = useState("");

    // ABA 4
    const [tab4Input, setTab4Input] = useState(""), [targetMinHz, setTargetMinHz] = useState(440), [targetMaxHz, setTargetMaxHz] = useState(880);

    // ABA 5 (Matriz)
    const [tab5Input, setTab5Input] = useState("0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11");
    const [tab5Gt12, setTab5Gt12] = useState(false);
    const [tab5View, setTab5View] = useState("notes");

    // ABA 6 (Ring Mod)
    const [tab6Input, setTab6Input] = useState(""), [tab6Limit, setTab6Limit] = useState(20), [tab6Order, setTab6Order] = useState(1);

    // ABA 7 (FM)
    const [tab7Carrier, setTab7Carrier] = useState("440Hz"), [tab7Modulator, setTab7Modulator] = useState("100Hz"), [tab7K, setTab7K] = useState(5);

    // ABA 8 (Additive)
    const [tab8Input, setTab8Input] = useState(""), [tab8Harmonics, setTab8Harmonics] = useState(4), [tab8Sub, setTab8Sub] = useState(1);

    const ignoreNextRef = useRef(false);
    const panControlsRef = useRef();

    // MOTORES (MEMOIZED)
    const points = useMemo(() => {
        const arr = [];
        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) {
                    arr.push({ coord: [x, y, z], position: [x * 1.5, y * 2, z * 2.5], note: midiToNote(baseNote + x * intX + y * intY + z * intZ), midi: baseNote + x * intX + y * intY + z * intZ });
                }
            }
        }
        return arr;
    }, [baseNote, intX, intY, intZ]);

    const tab1Hz = useMemo(() => points.filter(pt => selectedSet.has(pt.coord.join(','))).map(pt => midiToHz(pt.midi)).sort((a, b) => a - b), [points, selectedSet]);

    const tab2ResultHz = useMemo(() => {
        let hzA = parseAdvancedToHz(tab2InputA), hzB = parseAdvancedToHz(tab2InputB);
        if (!hzA.length || !hzB.length) return [];
        let result = new Set();
        if (tab2NonTemp) {
            let baseB = hzB[0];
            hzB.forEach(b => { let ratio = b / baseB; hzA.forEach(a => result.add(a * ratio)); });
        } else {
            let baseB = hzToMidi(hzB[0]);
            hzB.forEach(b => { let diff = hzToMidi(b) - baseB; hzA.forEach(a => result.add(midiToHz(hzToMidi(a) + diff))); });
        }
        return Array.from(result).sort((a, b) => a - b);
    }, [tab2InputA, tab2InputB, tab2NonTemp]);

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const tab3ParsedInput = parseAdvancedToHz(tab3Input).map(hzToMidi);
    const tab3ResultHz = useMemo(() => {
        let arr = [...tab3ParsedInput];
        if (arr.length < 2) return arr.map(midiToHz);

        let interval = Math.abs(arr[arr.length - 1] - arr[0]);
        let intervalInt = Math.round(interval); // Proteção contra crash microtonal
        let mod12 = intervalInt % 12;
        let R = mod12 === 0 ? 1 : 12 / gcd(12, mod12);

        if (!Number.isFinite(R) || R > 24 || R <= 0) R = 12; // Limite de segurança anti-crash

        let total = [...arr], currentSublist = [...arr];
        for (let i = 1; i < R; i++) {
            let dist = total[total.length - 1] - currentSublist[0];
            let transposed = currentSublist.map(n => n + dist);
            total = total.concat(transposed.slice(1));
            currentSublist = [...arr];
        }
        return total.map(midiToHz);
    }, [tab3ParsedInput]);

    const tab4ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab4Input);
        if (hzArr.length < 2) return [];
        let minHz = Math.min(...hzArr), maxHz = Math.max(...hzArr);
        if (minHz === maxHz) return hzArr;
        return hzArr.map(f => {
            let logNorm = (Math.log(f) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
            return targetMinHz * Math.pow((targetMaxHz / targetMinHz), logNorm);
        });
    }, [tab4Input, targetMinHz, targetMaxHz]);

    const tab4MidiEquivalents = useMemo(() => tab4ResultHz.map(hzToMidi), [tab4ResultHz]);

    const tab5Matrix = useMemo(() => {
        let row = parseAdvancedToHz(tab5Input).map(hzToMidi);
        if (!tab5Gt12) {
            const seen = new Set();
            row = row.filter(m => {
                const pc = ((Math.round(m) % 12) + 12) % 12;
                if (seen.has(pc)) return false;
                seen.add(pc); return true;
            });
        }
        if (row.length < 1) return { m: [], row: [], inv: [] };

        let p0 = row[0];
        let inv = row.map(val => p0 - (val - p0));
        let matrix = [];
        for (let r = 0; r < row.length; r++) {
            let mRow = [];
            for (let c = 0; c < row.length; c++) mRow.push(row[c] + inv[r] - p0);
            matrix.push(mRow);
        }
        return { m: matrix, row, inv };
    }, [tab5Input, tab5Gt12]);

    const tab6ResultHz = useMemo(() => {
        let baseArr = parseAdvancedToHz(tab6Input);
        if (baseArr.length < 2) return [];
        let res = new Set();
        let currentGen = [...baseArr];

        for (let order = 0; order < tab6Order; order++) {
            let nextGen = new Set();
            for (let i = 0; i < currentGen.length; i++) {
                for (let j = i + 1; j < currentGen.length; j++) {
                    let sum = currentGen[i] + currentGen[j];
                    let diff = Math.abs(currentGen[i] - currentGen[j]);
                    if (sum > 0) nextGen.add(sum);
                    if (diff > 0) nextGen.add(diff);
                }
            }
            currentGen = Array.from(nextGen);
            currentGen.forEach(f => res.add(f));
            if (res.size > tab6Limit * 3) break; // Segurança
        }
        return Array.from(res).sort((a, b) => a - b).slice(0, tab6Limit);
    }, [tab6Input, tab6Limit, tab6Order]);

    const tab7ResultHz = useMemo(() => {
        let C_arr = parseAdvancedToHz(tab7Carrier);
        if (!C_arr.length) C_arr = [440];
        let M = parseAdvancedToHz(tab7Modulator)[0] || 100;
        let res = new Set();
        C_arr.forEach(C => {
            res.add(C);
            for (let i = 1; i <= tab7K; i++) {
                res.add(C + i * M);
                res.add(Math.abs(C - i * M));
            }
        });
        return Array.from(res).sort((a, b) => a - b);
    }, [tab7Carrier, tab7Modulator, tab7K]);

    const tab8ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab8Input);
        let res = new Set();
        hzArr.forEach(f => {
            for (let i = 1; i <= tab8Harmonics; i++) res.add(f * i);
            for (let i = 1; i <= tab8Sub; i++) res.add(f / i);
        });
        return Array.from(res).sort((a, b) => a - b);
    }, [tab8Input, tab8Harmonics, tab8Sub]);

    // ==========================================
    // UI HANDLERS & CAMERAS
    // ==========================================
    const arrToStr = arr => arr.map(hzToMidi).map(n => n.toFixed(2).replace('.00', '')).join(', ');

    const handleTab3Drag = (idx, newMidi) => {
        let arr = [...tab3ParsedInput];
        if (idx < arr.length) { arr[idx] = newMidi; setTab3Input(arr.join(', ')); }
    };
    const handleTab3Delete = (idx) => {
        let arr = [...tab3ParsedInput];
        if (idx < arr.length) { arr.splice(idx, 1); setTab3Input(arr.join(', ')); }
    };
    const handleTab4Delete = (idx) => {
        let arr = parseAdvancedToHz(tab4Input).map(hzToMidi);
        if (idx < arr.length) { arr.splice(idx, 1); setTab4Input(arr.join(', ')); }
    };

    const toggleSelect = (coord) => {
        const key = coord.join(',');
        setSelectedSet(prev => { const copy = new Set(prev); if (copy.has(key)) copy.delete(key); else copy.add(key); return copy; });
    };

    const resetDefaults = () => {
        setBaseNote(48); setIntX(7); setIntY(12); setIntZ(4);
        setSelectedSet(new Set()); setFilterText(""); setShowOnlyHighlight(false);
        panControlsRef.current?.resetCamera();
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

    const PanControls = React.forwardRef(({ ignoreNextRef }, ref) => {
        const { camera } = useThree(); const controlsRef = useRef(); const [isPanning, setIsPanning] = useState(false); const [panStart, setPanStart] = useState([0, 0]);
        React.useImperativeHandle(ref, () => ({ resetCamera: () => { camera.position.set(0, 0, 2.2); if (controlsRef.current) { controlsRef.current.target.set(0, 0, 0); controlsRef.current.update(); } } }));
        const handleMouseDown = (e) => { if (ignoreNextRef.current) { ignoreNextRef.current = false; return; } if (e.altKey && e.button === 0) { e.preventDefault(); setIsPanning(true); setPanStart([e.clientX, e.clientY]); } };
        const handleMouseMove = (e) => { if (!isPanning) return; const dx = e.clientX - panStart[0], dy = e.clientY - panStart[1], target = controlsRef.current?.target || new THREE.Vector3(); target.x -= dx * 0.01; target.y += dy * 0.01; if (controlsRef.current) controlsRef.current.target = target; setPanStart([e.clientX, e.clientY]); };
        useEffect(() => { const up = () => setIsPanning(false); window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', up); }; }, [isPanning, panStart]);
        return <OrbitControls ref={controlsRef} maxDistance={50} minDistance={0.5} enableDamping={false} onPointerDown={handleMouseDown} />;
    });
    const PanControlsSingleton = useMemo(() => <PanControls ignoreNextRef={ignoreNextRef} ref={panControlsRef} />, []);

    // COMPONENTE DE BOTÕES PARA PUXAR DADOS
    const PullButtons = ({ onPull }) => (
        <div className="flex flex-wrap gap-1 mb-2 border-b border-gray-700 pb-2">
            <span className="text-[10px] text-gray-500 mr-1 mt-1">Puxar:</span>
            <button onClick={() => onPull(arrToStr(tab1Hz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Rede(1)</button>
            <button onClick={() => onPull(arrToStr(tab2ResultHz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Mult(2)</button>
            <button onClick={() => onPull(arrToStr(tab3ResultHz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Mód(3)</button>
            <button onClick={() => onPull(arrToStr(tab4ResultHz))} className="text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">Proj(4)</button>
        </div>
    );

    return (
        <div className="w-full h-full relative flex flex-col bg-gray-950 font-sans text-white">
            <div className="flex flex-wrap bg-gray-900 border-b border-gray-700 p-2 gap-2 z-50 shadow-md flex-shrink-0">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-2 py-1 text-[11px] rounded transition ${activeTab === t ? 'bg-blue-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>
                        {["1. Redes", "2. Mult.", "3. Módulos", "4. Proj.", "5. Matriz", "6. Ring Mod", "7. FM", "8. Aditiva"][t - 1]}
                    </button>
                ))}
            </div>

            <div className="flex-1 relative flex overflow-hidden">
                {/* ABA 1: REDES */}
                {activeTab === 1 && (
                    <>
                        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-95 p-4 rounded-lg z-10 w-80 shadow-xl border border-gray-700 flex flex-col pointer-events-auto" style={{ maxHeight: '85vh' }}>
                            <div className="overflow-y-auto custom-scrollbar pr-2 flex flex-col h-full space-y-4">
                                <h3 className="text-sm font-bold text-blue-300 border-b border-gray-600 pb-2">Controles da Rede</h3>
                                <HelpBox title="Como Usar">
                                    Crie entidades tridimensionais (Ctrl+Clique) baseadas na Teoria de Pousseur. Alt+Arraste para mover a câmera.
                                </HelpBox>
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
                                        <button onClick={applyFilter} className="bg-green-600 hover:bg-green-500 px-3 rounded text-xs">Ok</button>
                                    </div>
                                    <label className="flex items-center text-xs cursor-pointer mb-3"><input type="checkbox" className="mr-2" checked={showOnlyHighlight} onChange={e => setShowOnlyHighlight(e.target.checked)} /> Esconder inativas</label>
                                    <div className="flex space-x-2">
                                        <button onClick={() => panControlsRef.current?.resetCamera()} className="flex-1 bg-blue-900 text-[10px] py-1.5 rounded">Cent. Câm</button>
                                        <button onClick={resetDefaults} className="flex-1 bg-red-900 text-[10px] py-1.5 rounded">Limpar Tudo</button>
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

                {/* ABA 2: MULTIPLICAÇÃO */}
                {activeTab === 2 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-blue-300">Multiplicação de Acordes</h3>
                            <HelpBox title="Como Usar">
                                O acorde B multiplicará o A (Boulez).<br />
                                <strong>Dica Microtonal:</strong> Marque a caixa abaixo para inserir: <code>C+4</code> (quarto de tom), <code>60.5</code> (MIDI decimal), <code>440Hz</code>, ou <code>60+50c</code> (cents).
                            </HelpBox>
                            <PullButtons onPull={setTab2InputA} />
                            <label className="text-xs text-gray-400">Entidade A (Multiplicando):</label>
                            <textarea value={tab2InputA} onChange={e => setTab2InputA(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Ex: 60, C+4, 440Hz" />
                            <label className="text-xs text-gray-400">Entidade B (Multiplicador):</label>
                            <textarea value={tab2InputB} onChange={e => setTab2InputB(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" />
                            <label className="flex items-center text-xs text-orange-300"><input type="checkbox" className="mr-2" checked={tab2NonTemp} onChange={e => setTab2NonTemp(e.target.checked)} /> Valores Não Temperados</label>

                            <div className="mt-2">
                                <button onClick={() => { setTab2InputA(""); setTab2InputB(""); }} className="bg-red-900 hover:bg-red-800 text-[10px] px-3 py-1.5 rounded transition">Limpar Tudo</button>
                            </div>
                            <UniversalOutput hzArray={tab2ResultHz} title="Bloco Resultante" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab2ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={tab2NonTemp} />
                        </div>
                    </div>
                )}

                {/* ABA 3: MÓDULOS */}
                {activeTab === 3 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-blue-300">Módulos Cíclicos</h3>
                            <HelpBox title="Como Usar">O material sofre expansão cíclica temporal até retornar à oitava base. Insira microtons com segurança.</HelpBox>
                            <PullButtons onPull={setTab3Input} />
                            <textarea value={tab3Input} onChange={e => setTab3Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Clique no teclado ao lado ou puxe de abas..." />

                            <button onClick={() => setTab3Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-24 px-2 py-1.5 rounded transition">Limpar Teclado</button>

                            <div className="pt-2 border-t border-gray-700">
                                <h4 className="text-[10px] font-bold text-gray-400 mb-1">Aproximar Matriz aos Modos de Messiaen:</h4>
                                <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                                    {Object.entries(messiaenModes).map(([k, v]) => (
                                        <button key={k} onClick={() => setTab3Input(snapToMode(tab3ParsedInput, k).join(', '))} className="text-[9px] bg-gray-800 border border-gray-600 p-1 rounded text-left hover:bg-gray-700">{v.name}</button>
                                    ))}
                                </div>
                            </div>
                            <UniversalOutput hzArray={tab3ResultHz} title="Módulo Gerado" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold text-gray-400 uppercase">Sequência Melódica</h2>
                            </div>
                            <BachRollVisualizer notes={tab3ResultHz.map(hzToMidi)} isSequence={true} onKeyClick={m => setTab3Input(prev => prev ? prev + ", " + m : String(m))} onNoteDrag={(idx, m) => { let a = [...tab3ParsedInput]; if (idx < a.length) { a[idx] = m; setTab3Input(a.join(', ')); } }} originalEntityLength={tab3ParsedInput.length} onNoteDelete={(idx) => { let a = [...tab3ParsedInput]; if (idx < a.length) { a.splice(idx, 1); setTab3Input(a.join(', ')); } }} />
                        </div>
                    </div>
                )}

                {/* ABA 4: PROJEÇÕES */}
                {activeTab === 4 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-blue-300">Projeções Proporcionais</h3>
                            <HelpBox title="Como Usar">Interpola as distâncias do acorde base logaritmicamente no domínio da frequência (Hertz).</HelpBox>
                            <PullButtons onPull={setTab4Input} />
                            <textarea value={tab4Input} onChange={e => setTab4Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" />
                            <button onClick={() => setTab4Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-24 px-2 py-1.5 rounded transition">Limpar Teclado</button>

                            <div className="border-t border-gray-700 pt-3 space-y-3">
                                <button onClick={handleNormalizeFreqs} className="w-full bg-purple-800 hover:bg-purple-700 text-[10px] py-1 rounded">Normalizar para Freqs de Entrada</button>
                                <div><label className="text-xs text-gray-300">Min Hz: {targetMinHz}</label><input type="range" min="20" max="2000" value={targetMinHz} onChange={e => setTargetMinHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                                <div><label className="text-xs text-gray-300">Max Hz: {targetMaxHz}</label><input type="range" min="20" max="10000" value={targetMaxHz} onChange={e => setTargetMaxHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                            </div>
                            <UniversalOutput hzArray={tab4ResultHz} title="Espectro Projetado" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold text-gray-400 uppercase">Projeção Microtonal</h2>
                            </div>
                            <BachRollVisualizer notes={tab4MidiEquivalents} isSequence={true} isMicrotonal={true} onKeyClick={m => setTab4Input(prev => prev ? prev + ", " + m : String(m))} onNoteDelete={(idx) => { let a = parseAdvancedToHz(tab4Input).map(hzToMidi); if (idx < a.length) { a.splice(idx, 1); setTab4Input(a.join(', ')); } }} />
                        </div>
                    </div>
                )}

                {/* ABA 5: MATRIZ DODECAFÔNICA */}
                {activeTab === 5 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-red-400">Matriz Dodecafônica</h3>
                            <HelpBox title="Como Usar">Gera a matriz P, I, R e RI. Puxe notas das abas ou digite C4, 60, etc.</HelpBox>
                            <PullButtons onPull={setTab5Input} />
                            <textarea value={tab5Input} onChange={e => setTab5Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" />
                            <button onClick={() => setTab5Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-24 px-2 py-1.5 rounded transition">Limpar Matriz</button>
                            <label className="text-xs text-orange-300"><input type="checkbox" className="mr-2" checked={tab5Gt12} onChange={e => setTab5Gt12(e.target.checked)} /> Permitir mais de 12 notas (Tonal/Livre)</label>

                            <div className="border-t border-gray-700 pt-4">
                                <h4 className="text-xs font-bold text-gray-300 mb-2">Exibição da Matriz:</h4>
                                <select className="w-full bg-gray-800 p-2 text-xs rounded border border-gray-600 outline-none" value={tab5View} onChange={e => setTab5View(e.target.value)}>
                                    <option value="set">Set Theory (0-11)</option>
                                    <option value="notes">Notas Musicais (Ex: C4)</option>
                                    <option value="hz">Frequências (Hz)</option>
                                    <option value="midiCents">MIDI + Cents (Ex: 6000)</option>
                                    <option value="quarters">Quartos de Tom (Ex: C+4)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex-1 p-5 bg-gray-950 overflow-auto custom-scrollbar flex items-start justify-start relative">
                            {tab5Matrix.m.length > 0 ? (
                                <table className="border-collapse bg-gray-900 border border-gray-500 shadow-2xl text-center min-w-max m-auto">
                                    <thead><tr><th className="p-2"></th>{tab5Matrix.inv.map((v, i) => <th key={i} className="text-[10px] text-blue-300 border border-gray-700 p-2 min-w-[50px]">I{tab5Gt12 ? i : v}↓</th>)}<th className="p-2"></th></tr></thead>
                                    <tbody>
                                        {tab5Matrix.m.map((row, rIdx) => (
                                            <tr key={rIdx}>
                                                <th className="text-[10px] text-green-300 border border-gray-700 p-2">P{tab5Gt12 ? rIdx : tab5Matrix.row[rIdx]}→</th>
                                                {row.map((val, cIdx) => {
                                                    let displayVal = val;
                                                    if (tab5View === 'set') displayVal = ((Math.round(val) % 12) + 12) % 12;
                                                    else if (tab5View === 'notes') displayVal = formatAllOutput([midiToHz(val)]).notes;
                                                    else if (tab5View === 'hz') displayVal = formatAllOutput([midiToHz(val)]).hz;
                                                    else if (tab5View === 'midiCents') displayVal = formatAllOutput([midiToHz(val)]).midiCents;
                                                    else if (tab5View === 'quarters') displayVal = formatAllOutput([midiToHz(val)]).quarters;

                                                    return <td key={cIdx} className={`border border-gray-700 p-2 font-mono text-[10px] ${val === tab5Matrix.m[0][0] ? 'bg-gray-800 font-bold text-red-300' : 'text-gray-300'}`}>{displayVal}</td>;
                                                })}
                                                <th className="text-[10px] text-yellow-300 border border-gray-700 p-2">←R{tab5Gt12 ? rIdx : tab5Matrix.row[rIdx]}</th>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot><tr><th className="p-2"></th>{tab5Matrix.inv.map((v, i) => <th key={i} className="text-[10px] text-purple-300 border border-gray-700 p-2">↑RI{tab5Gt12 ? i : v}</th>)}<th className="p-2"></th></tr></tfoot>
                                </table>
                            ) : (
                                <p className="text-gray-500 m-auto">Insira pelo menos 1 nota.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ABA 6: RING MODULATION */}
                {activeTab === 6 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-yellow-400">Ring Modulation</h3>
                            <HelpBox title="Como Usar">Gera frequências inarmônicas baseadas na Soma e Diferença. O controle de "Cascata" multiplica os resultados neles mesmos (cuidado com limites).</HelpBox>
                            <PullButtons onPull={setTab6Input} />
                            <textarea value={tab6Input} onChange={e => setTab6Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Ex: 440Hz, 500Hz" />
                            <button onClick={() => setTab6Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-24 px-2 py-1.5 rounded transition">Limpar Teclado</button>

                            <div className="pt-2">
                                <label className="text-xs text-gray-300 block mb-1">Ordem / Cascata (Profundidade): {tab6Order}</label>
                                <input type="range" min="1" max="4" value={tab6Order} onChange={e => setTab6Order(Number(e.target.value))} className="w-full accent-yellow-500 mb-2" />

                                <label className="text-xs text-gray-300 block mb-1">Limitar Resultados a: {tab6Limit} notas</label>
                                <input type="range" min="1" max="200" value={tab6Limit} onChange={e => setTab6Limit(Number(e.target.value))} className="w-full accent-yellow-500" />
                            </div>
                            <UniversalOutput hzArray={tab6ResultHz} title="Espectro RM" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab6ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab6Input(prev => prev ? prev + ", " + m : String(m))} />
                        </div>
                    </div>
                )}

                {/* ABA 7: FM */}
                {activeTab === 7 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-cyan-400">Síntese FM</h3>
                            <HelpBox title="Como Usar">Insira múltiplas Portadoras (C) e uma Moduladora (M). O Índice K gera bandas laterais (C ± kM) preenchendo o espectro.</HelpBox>
                            <PullButtons onPull={setTab7Carrier} />
                            <label className="text-xs">Portadoras (C): <textarea value={tab7Carrier} onChange={e => setTab7Carrier(e.target.value)} className="w-full bg-gray-800 p-2 mt-1 rounded border border-gray-600 font-mono min-h-[60px]" /></label>
                            <button onClick={() => setTab7Carrier("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-24 px-2 py-1.5 rounded transition">Limpar Teclado</button>

                            <label className="text-xs mt-2">Moduladora (M): <input type="text" value={tab7Modulator} onChange={e => setTab7Modulator(e.target.value)} className="w-full bg-gray-800 p-2 mt-1 rounded border border-gray-600 font-mono" /></label>
                            <div><label className="text-xs">Índice (K partials): {tab7K}</label><input type="range" min="1" max="30" value={tab7K} onChange={e => setTab7K(Number(e.target.value))} className="w-full accent-cyan-500" /></div>
                            <UniversalOutput hzArray={tab7ResultHz} title="Bandas Laterais" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab7ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab7Carrier(prev => prev ? prev + ", " + m : String(m))} />
                        </div>
                    </div>
                )}

                {/* ABA 8: SÍNTESE ADITIVA */}
                {activeTab === 8 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-pink-400">Síntese Aditiva Espectral</h3>
                            <HelpBox title="Como Usar">Cria timbres somando harmônicos (F * N) e sub-harmônicos (F / N) das frequências base.</HelpBox>
                            <PullButtons onPull={setTab8Input} />
                            <textarea value={tab8Input} onChange={e => setTab8Input(e.target.value)} className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono min-h-[100px]" placeholder="Insira frequências base..." />
                            <button onClick={() => setTab8Input("")} className="bg-red-900 hover:bg-red-800 text-[10px] w-24 px-2 py-1.5 rounded transition">Limpar Teclado</button>

                            <div><label className="text-xs">Harmônicos Acima (xN): {tab8Harmonics}</label><input type="range" min="1" max="16" value={tab8Harmonics} onChange={e => setTab8Harmonics(Number(e.target.value))} className="w-full accent-pink-500" /></div>
                            <div><label className="text-xs">Sub-harmônicos Abaixo (/N): {tab8Sub}</label><input type="range" min="1" max="8" value={tab8Sub} onChange={e => setTab8Sub(Number(e.target.value))} className="w-full accent-pink-500" /></div>
                            <UniversalOutput hzArray={tab8ResultHz} title="Espectro Aditivo" isSimultaneous={true} showMelody={true} />
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab8ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} onKeyClick={m => setTab8Input(prev => prev ? prev + ", " + m : String(m))} />
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

export default HarmonicNetwork;