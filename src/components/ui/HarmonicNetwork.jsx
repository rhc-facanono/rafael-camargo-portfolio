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

function hzToNoteAndCents(hz) {
    if (!hz || hz <= 0) return "";
    const midiFloat = 69 + 12 * Math.log2(hz / 440);
    const midiInt = Math.round(midiFloat);
    let cents = Math.round((midiFloat - midiInt) * 100);
    const name = noteNames[((midiInt % 12) + 12) % 12];
    const oct = Math.floor(midiInt / 12) - 1;
    const sign = cents >= 0 ? '+' : '';
    return `${name}${oct} ${cents !== 0 ? sign + cents + 'c' : ''}`;
}

function midiToQuarterTone(midi) {
    const m = Math.round(midi * 2) / 2;
    const isQuarter = m % 1 !== 0;
    const baseMidi = Math.floor(m);
    const name = noteNames[((baseMidi % 12) + 12) % 12];
    const oct = Math.floor(baseMidi / 12) - 1;
    return isQuarter ? `${name}+${oct}` : `${name}${oct}`;
}

function midiArrayToNames(arr) {
    return arr.map(midiToNote).join(', ');
}

function midiArrayToQuarterTones(arr) {
    return arr.map(midiToQuarterTone).join(', ');
}

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
            return 440 * Math.pow(2, (midi - 69) / 12);
        }
        const m = parseFloat(mainPart);
        if (!isNaN(m)) return 440 * Math.pow(2, (m - 69) / 12);
        return null;
    }).filter(n => n !== null);
}

function hzToMidi(hz) { return 69 + 12 * Math.log2(hz / 440); }
function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

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
        let closest = mode[0];
        let minDiff = 12;
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

const playAudio = (hzArray, isSimultaneous = false) => {
    if (!hzArray || hzArray.length === 0) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    hzArray.forEach((hz, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = hz;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = t + (isSimultaneous ? 0 : i * 0.35);
        const dur = isSimultaneous ? 2.5 : 0.4;
        osc.start(start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.stop(start + dur);
    });
};

// ==========================================
// 3D & COMPONENTES VISUAIS
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
            <lineSegments key={`norm-${normal.length}`}>
                <bufferGeometry><bufferAttribute attach="attributes-position" count={normal.length / 3} array={normal} itemSize={3} /></bufferGeometry>
                <lineBasicMaterial color="#ffffff" transparent opacity={showOnlyHighlight ? 0.01 : 0.15} />
            </lineSegments>
            {high.length > 0 && (
                <lineSegments key={`high-${high.length}`}>
                    <bufferGeometry><bufferAttribute attach="attributes-position" count={high.length / 3} array={high} itemSize={3} /></bufferGeometry>
                    <lineBasicMaterial color="#00ffcc" transparent opacity={0.9} linewidth={2} />
                </lineSegments>
            )}
        </group>
    );
}

function NotePoint({ pt, selectedSet, toggleSelect, blendedHue, isSel, ignoreNextRef, customOpacity, textOpacity }) {
    const color = new THREE.Color(`hsl(${blendedHue},${isSel ? 90 : 65}%,${isSel ? 90 : 55}%)`);
    return (
        <mesh position={pt.position} onClick={e => { if (e.ctrlKey) { e.stopPropagation(); ignoreNextRef.current = true; toggleSelect(pt.coord); } }}>
            <sphereGeometry args={[0.2, 32, 32]} />
            <meshStandardMaterial color={color} transparent opacity={customOpacity} roughness={0.12} metalness={0.25} emissive={isSel ? '#fff' : color} emissiveIntensity={isSel ? 0.35 : 0.05} />
            <Billboard>
                <Text position={[0, 0, 0]} fontSize={0.23} color="#ffffff" outlineWidth={0.05} outlineColor="#000000" anchorX="center" anchorY="middle" fontWeight="bold" depthOffset={-1} fillOpacity={textOpacity} outlineOpacity={textOpacity}>{pt.note}</Text>
            </Billboard>
        </mesh>
    );
}

function BachRollVisualizer({ notes, isSequence = false, isMicrotonal = false, onKeyClick = null, onNoteDrag = null, onNoteDelete = null, originalEntityLength = 0 }) {
    const minMidi = 36, maxMidi = 96, rowHeight = 14, keyWidth = 60, totalHeight = (maxMidi - minMidi + 1) * rowHeight;
    const [draggingIdx, setDraggingIdx] = useState(null);

    const handlePointerDown = (e, idx) => {
        if (e.ctrlKey) { e.stopPropagation(); if (onNoteDelete) onNoteDelete(idx); return; }
        if (onNoteDrag && (!originalEntityLength || idx < originalEntityLength) && !isMicrotonal) {
            e.stopPropagation(); e.target.setPointerCapture(e.pointerId); setDraggingIdx(idx);
        }
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
    const [tab2InputA, setTab2InputA] = useState(""), [tab2InputB, setTab2InputB] = useState("0, 4, 7");
    const [tab2NonTemp, setTab2NonTemp] = useState(false);

    // ABA 3
    const [tab3Input, setTab3Input] = useState("");

    // ABA 4
    const [tab4Input, setTab4Input] = useState("");
    const [targetMinHz, setTargetMinHz] = useState(440), [targetMaxHz, setTargetMaxHz] = useState(880);

    // ABA 5 (Messiaen Permutations)
    const [tab5Input, setTab5Input] = useState(""), [tab5Perm, setTab5Perm] = useState("2, 3, 4, 1");
    const [tab5ViewMode, setTab5ViewMode] = useState("notes");

    // ABA 6 (12-Tone Matrix)
    const [tab6Input, setTab6Input] = useState("0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11");
    const [tab6Gt12, setTab6Gt12] = useState(false);
    const [tab6View, setTab6View] = useState("pc");

    // ABA 7 (Ring Mod)
    const [tab7Input, setTab7Input] = useState("");
    const [tab7Limit, setTab7Limit] = useState(20);

    // ABA 8 (FM)
    const [tab8Carrier, setTab8Carrier] = useState("440Hz"), [tab8Modulator, setTab8Modulator] = useState("100Hz");
    const [tab8K, setTab8K] = useState(5);

    // ABA 9 (Additive)
    const [tab9Input, setTab9Input] = useState("");
    const [tab9Harmonics, setTab9Harmonics] = useState(4), [tab9Sub, setTab9Sub] = useState(1);

    const ignoreNextRef = useRef(false);
    const panControlsRef = useRef();

    // ==========================================
    // LÓGICAS E MOTORES (MEMOIZED)
    // ==========================================

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

    const tab1MidiNotes = useMemo(() => points.filter(pt => selectedSet.has(pt.coord.join(','))).map(pt => pt.midi).sort((a, b) => a - b), [points, selectedSet]);

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
    const tab3Result = useMemo(() => {
        let arr = [...tab3ParsedInput];
        if (arr.length < 2) return arr;
        let interval = Math.abs(arr[arr.length - 1] - arr[0]);
        let R = interval % 12 === 0 ? 1 : 12 / gcd(12, interval % 12);
        let total = [...arr], currentSublist = [...arr];
        for (let i = 1; i < R; i++) {
            let dist = total[total.length - 1] - currentSublist[0];
            let transposed = currentSublist.map(n => n + dist);
            total = total.concat(transposed.slice(1));
            currentSublist = [...arr];
        }
        return total;
    }, [tab3ParsedInput]);

    const handleNormalizeFreqs = () => {
        let arr = parseAdvancedToHz(tab4Input);
        if (arr.length > 0) {
            let hzArr = arr.map(m => 440 * Math.pow(2, (hzToMidi(m) - 69) / 12));
            setTargetMinHz(Math.min(...hzArr).toFixed(2));
            setTargetMaxHz(Math.max(...hzArr).toFixed(2));
        }
    };

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

    const tab4MidiEquivalents = useMemo(() => tab4ResultHz.map(hz => 69 + 12 * Math.log2(hz / 440)), [tab4ResultHz]);

    const tab5Result = useMemo(() => {
        let base = parseAdvancedToHz(tab5Input).map(hzToMidi);
        if (base.length < 2) return [base];
        let perm = parseAdvancedToHz(tab5Perm).map(hzToMidi);
        if (perm.length !== base.length) return [base];

        let results = [base], current = [...base];
        for (let k = 0; k < 100; k++) {
            let next = new Array(base.length);
            for (let i = 0; i < perm.length; i++) {
                let pIdx = perm[i] - 1;
                next[i] = (pIdx >= 0 && pIdx < current.length) ? current[pIdx] : current[i];
            }
            results.push(next);
            if (next.every((v, i) => v === base[i])) break;
            current = next;
        }
        return results;
    }, [tab5Input, tab5Perm]);

    const formatTab5Output = (arr) => {
        if (tab5ViewMode === 'pcs') return arr.map(n => ((Math.round(n) % 12) + 12) % 12).join(', ');
        if (tab5ViewMode === 'indices') {
            let base = parseAdvancedToHz(tab5Input).map(hzToMidi);
            return arr.map(n => base.indexOf(n) + 1).join(', ');
        }
        return midiArrayToNames(arr);
    };

    const tab6Matrix = useMemo(() => {
        let row = parseAdvancedToHz(tab6Input).map(hzToMidi);
        if (!tab6Gt12) row = Array.from(new Set(row.map(n => ((Math.round(n) % 12) + 12) % 12)));
        if (row.length < 1) return { m: [], row: [], inv: [] };

        let p0 = row[0];
        let inv = row.map(val => tab6Gt12 ? p0 - (val - p0) : (p0 - (val - p0) + 24) % 12);
        let matrix = [];
        for (let r = 0; r < row.length; r++) {
            let mRow = [];
            for (let c = 0; c < row.length; c++) {
                mRow.push(tab6Gt12 ? (row[c] + inv[r] - p0) : (row[c] + inv[r] - p0 + 24) % 12);
            }
            matrix.push(mRow);
        }
        return { m: matrix, row, inv };
    }, [tab6Input, tab6Gt12]);

    const tab7ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab7Input);
        let res = new Set();
        for (let i = 0; i < hzArr.length; i++) {
            for (let j = i + 1; j < hzArr.length; j++) {
                res.add(hzArr[i] + hzArr[j]);
                res.add(Math.abs(hzArr[i] - hzArr[j]));
            }
        }
        return Array.from(res).sort((a, b) => a - b).slice(0, tab7Limit);
    }, [tab7Input, tab7Limit]);

    const tab8ResultHz = useMemo(() => {
        let C = parseAdvancedToHz(tab8Carrier)[0] || 440;
        let M = parseAdvancedToHz(tab8Modulator)[0] || 100;
        let res = new Set([C]);
        for (let i = 1; i <= tab8K; i++) {
            res.add(C + i * M);
            if (C - i * M > 0) res.add(C - i * M);
            else res.add(Math.abs(C - i * M));
        }
        return Array.from(res).sort((a, b) => a - b);
    }, [tab8Carrier, tab8Modulator, tab8K]);

    const tab9ResultHz = useMemo(() => {
        let hzArr = parseAdvancedToHz(tab9Input);
        let res = new Set();
        hzArr.forEach(f => {
            for (let i = 1; i <= tab9Harmonics; i++) res.add(f * i);
            for (let i = 1; i <= tab9Sub; i++) res.add(f / i);
        });
        return Array.from(res).sort((a, b) => a - b);
    }, [tab9Input, tab9Harmonics, tab9Sub]);


    // ==========================================
    // UI HANDLERS & CAMERAS
    // ==========================================
    const arrToStr = arr => arr.map(hzToMidi).join(', ');

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
        setSelectedSet(prev => {
            const copy = new Set(prev);
            if (copy.has(key)) copy.delete(key);
            else copy.add(key);
            return copy;
        });
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

    const PanControls = React.forwardRef(({ ignoreNextRef }, ref) => {
        const { camera } = useThree();
        const controlsRef = useRef();
        const [isPanning, setIsPanning] = useState(false);
        const [panStart, setPanStart] = useState([0, 0]);

        React.useImperativeHandle(ref, () => ({
            resetCamera: () => { camera.position.set(0, 0, 2.2); if (controlsRef.current) { controlsRef.current.target.set(0, 0, 0); controlsRef.current.update(); } }
        }));

        const handleMouseDown = (e) => { if (ignoreNextRef.current) { ignoreNextRef.current = false; return; } if (e.altKey && e.button === 0) { e.preventDefault(); setIsPanning(true); setPanStart([e.clientX, e.clientY]); } };
        const handleMouseMove = (e) => { if (!isPanning) return; const dx = e.clientX - panStart[0]; const dy = e.clientY - panStart[1]; const target = controlsRef.current?.target || new THREE.Vector3(); target.x -= dx * 0.01; target.y += dy * 0.01; if (controlsRef.current) controlsRef.current.target = target; setPanStart([e.clientX, e.clientY]); };
        useEffect(() => { const up = () => setIsPanning(false); window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', up); }; }, [isPanning, panStart]);
        return <OrbitControls ref={controlsRef} maxDistance={50} minDistance={0.5} enableDamping={false} onPointerDown={handleMouseDown} />;
    });

    const PanControlsSingleton = useMemo(() => <PanControls ignoreNextRef={ignoreNextRef} ref={panControlsRef} />, []);

    return (
        <div className="w-full h-full relative flex flex-col bg-gray-950 font-sans text-white">

            <div className="flex flex-wrap bg-gray-900 border-b border-gray-700 p-2 gap-2 z-50 shadow-md flex-shrink-0">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-2 py-1 text-[11px] rounded transition ${activeTab === t ? 'bg-blue-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>
                        {["Redes", "Mult.", "Módulos", "Projeções", "Permutação", "Matriz", "Ring Mod", "FM", "Aditiva"][t - 1]}
                    </button>
                ))}
            </div>

            <div className="flex-1 relative flex overflow-hidden">

                {activeTab === 1 && (
                    <>
                        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 p-4 rounded-lg z-10 w-80 shadow-xl border border-gray-700 backdrop-blur-sm flex flex-col max-h-[90%] pointer-events-auto">
                            <div className="overflow-y-auto custom-scrollbar pr-2 h-full flex flex-col space-y-4">
                                <h3 className="text-sm font-bold text-blue-300 border-b border-gray-600 pb-2">Controles da Rede</h3>
                                <button onClick={() => setShowHelp(!showHelp)} className="w-full bg-blue-700 hover:bg-blue-600 transition-colors text-xs font-semibold py-2 px-3 rounded">
                                    {showHelp ? "Ocultar Instruções" : "Ajuda / Como usar?"}
                                </button>
                                {showHelp && (
                                    <div className="bg-gray-800 p-3 rounded text-xs text-gray-300 space-y-3 border border-gray-700">
                                        <p><strong>Câmera:</strong><br />• Pan: <code>Alt</code> + Arraste.<br />• Zoom: Scroll.</p>
                                        <p><strong>Seleção:</strong><br />• <code>Ctrl</code> + Clique na esfera.</p>
                                    </div>
                                )}
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
                                <div className="pt-4 border-t border-gray-600">
                                    <span className="text-xs text-gray-400 block mb-2">Filtrar (ex: 0,1,-1 a 3,1,-1):</span>
                                    <div className="flex space-x-2">
                                        <input type="text" className="flex-1 bg-gray-800 text-xs p-1.5 rounded border border-gray-600" value={filterText} onChange={e => setFilterText(e.target.value)} />
                                        <button onClick={applyFilter} className="bg-green-600 hover:bg-green-500 text-xs py-1 px-3 rounded">Ok</button>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-gray-600">
                                    <label className="flex items-center text-xs cursor-pointer mb-3">
                                        <input type="checkbox" className="mr-2" checked={showOnlyHighlight} onChange={e => setShowOnlyHighlight(e.target.checked)} /> Esconder inativas
                                    </label>
                                    <div className="flex flex-col space-y-2">
                                        <button onClick={() => panControlsRef.current?.resetCamera()} className="bg-blue-900 text-xs py-1.5 rounded">Centralizar Câmera</button>
                                        <button onClick={resetDefaults} className="bg-red-900 text-xs py-1.5 rounded">Limpar Tudo</button>
                                    </div>
                                </div>
                                <div className="bg-gray-950 p-2 rounded border border-gray-700">
                                    <span className="text-[10px] text-green-400 block font-bold">Seleção [MIDI]:</span>
                                    <div className="text-[10px] font-mono break-all text-gray-300 mb-2">[{tab1MidiNotes.join(', ')}]</div>
                                    <span className="text-[10px] text-blue-400 block font-bold">Seleção [Notas]:</span>
                                    <div className="text-[10px] font-mono break-all text-gray-300 mb-2">[{midiArrayToNames(tab1MidiNotes)}]</div>
                                    <button onClick={() => playAudio(tab1MidiNotes.map(midiToHz), true)} className="w-full bg-green-800 hover:bg-green-700 text-xs py-1 rounded">🎵 Ouvir (Acorde)</button>
                                </div>
                            </div>
                        </div>
                        <div className="w-full h-full absolute inset-0 z-0">
                            <Canvas camera={{ position: [0, 0, 2.2], fov: 60 }}>
                                <ambientLight />
                                {PanControlsSingleton}
                                <GridLines showOnlyHighlight={showOnlyHighlight} selectedSet={selectedSet} />
                                {points.map((pt, idx) => {
                                    const isSel = selectedSet.has(pt.coord.join(','));
                                    const cOp = showOnlyHighlight ? (isSel ? 0.9 : 0.03) : 0.6;
                                    const tOp = showOnlyHighlight ? (isSel ? 1 : 0.05) : 1;
                                    return <NotePoint key={idx} pt={pt} selectedSet={selectedSet} toggleSelect={toggleSelect} blendedHue={(pt.coord[0] + 7) / 14 * 360 * 0.75 + (pt.coord[2] + 2) / 4 * 120 * 0.25} isSel={isSel} ignoreNextRef={ignoreNextRef} customOpacity={cOp} textOpacity={tOp} />;
                                })}
                            </Canvas>
                        </div>
                    </>
                )}

                {activeTab === 2 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-blue-300">Entidade A (Multiplicando)</h3>
                            <button onClick={() => setTab2InputA(tab1MidiNotes.join(', '))} className="text-[10px] bg-blue-800 p-1 rounded">Puxar Aba 1</button>
                            <textarea value={tab2InputA} onChange={e => setTab2InputA(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 60, C+4, 440Hz" />

                            <h3 className="text-sm font-bold text-blue-300">Entidade B (Multiplicador)</h3>
                            <textarea value={tab2InputB} onChange={e => setTab2InputB(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" />

                            <label className="flex items-center text-xs text-orange-300"><input type="checkbox" className="mr-2" checked={tab2NonTemp} onChange={e => setTab2NonTemp(e.target.checked)} /> Valores Não Temperados</label>

                            <div className="bg-gray-950 p-3 rounded border border-gray-700 mt-auto flex flex-col gap-2">
                                <span className="text-[10px] text-green-400 font-bold">Resultado [{tab2NonTemp ? "Frequência/Cents" : "MIDI/Notas"}]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 h-24 overflow-y-auto custom-scrollbar">
                                    [{tab2ResultHz.map(hz => tab2NonTemp ? hzToNoteAndCents(hz) : Math.round(hzToMidi(hz))).join(', ')}]
                                </div>
                                <button onClick={() => playAudio(tab2ResultHz, true)} className="w-full bg-green-800 text-xs py-1 rounded">🎵 Ouvir (Acorde)</button>
                            </div>
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab2ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={tab2NonTemp} />
                        </div>
                    </div>
                )}

                {activeTab === 3 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-blue-300">Matriz Base (Melódica)</h3>
                            <button onClick={() => setTab3Input(arrToStr(tab2ResultHz))} className="text-[10px] bg-blue-800 p-1 rounded">Puxar Aba 2</button>
                            <textarea value={tab3Input} onChange={e => setTab3Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" />

                            <div className="pt-2 border-t border-gray-700">
                                <h4 className="text-xs font-bold text-gray-400 mb-2">Aproximar a Modo de Messiaen:</h4>
                                <div className="grid grid-cols-1 gap-1">
                                    {Object.entries(messiaenModes).map(([k, v]) => (
                                        <button key={k} onClick={() => setTab3Input(snapToMode(tab3ParsedInput, k).join(', '))} className="text-[9px] bg-gray-700 p-1 rounded text-left hover:bg-gray-600">{v.name}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gray-950 p-3 rounded border border-gray-700 mt-auto">
                                <span className="text-[10px] text-green-400 font-bold">Módulo [{tab3Result.length} notas]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 h-20 overflow-y-auto">[{midiArrayToNames(tab3Result)}]</div>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => playAudio(tab3Result.map(midiToHz), false)} className="flex-1 bg-green-800 text-[10px] py-1 rounded">🎵 Melodia</button>
                                    <button onClick={() => playAudio(tab3Result.map(midiToHz), true)} className="flex-1 bg-green-700 text-[10px] py-1 rounded">🎵 Acorde</button>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab3Result} isSequence={true} onKeyClick={m => setTab3Input(prev => prev ? prev + ", " + m : String(m))} onNoteDrag={handleTab3Drag} onNoteDelete={handleTab3Delete} originalEntityLength={tab3ParsedInput.length} />
                        </div>
                    </div>
                )}

                {activeTab === 4 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-blue-300">Fluxo Temperado (Input)</h3>
                            <button onClick={() => setTab4Input(tab3Result.join(', '))} className="text-[10px] bg-blue-800 p-1 rounded">Puxar Aba 3</button>
                            <textarea value={tab4Input} onChange={e => setTab4Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" />

                            <div className="border-t border-gray-700 pt-4 space-y-4">
                                <button onClick={handleNormalizeFreqs} className="w-full bg-purple-800 hover:bg-purple-700 text-[10px] py-1 rounded">Normalizar para Freqs de Entrada</button>
                                <div><label className="text-xs text-gray-300">Alvo Min: {targetMinHz} Hz</label><input type="range" min="20" max="2000" value={targetMinHz} onChange={e => setTargetMinHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                                <div><label className="text-xs text-gray-300">Alvo Max: {targetMaxHz} Hz</label><input type="range" min="20" max="10000" value={targetMaxHz} onChange={e => setTargetMaxHz(Number(e.target.value))} className="w-full accent-blue-500" /></div>
                            </div>

                            <div className="bg-gray-950 p-3 rounded border border-gray-700 mt-auto flex flex-col h-1/3">
                                <span className="text-[10px] text-green-400 font-bold">Espectro Projetado:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 overflow-y-auto flex-1 mb-2">[{tab4ResultHz.map(hzToNoteAndCents).join(', ')}]</div>
                                <button onClick={() => playAudio(tab4ResultHz, true)} className="w-full bg-green-800 text-xs py-1 rounded mt-2">🎵 Ouvir Espectro</button>
                            </div>
                        </div>
                        <div className="flex-1 p-4 bg-gray-950 flex flex-col">
                            <BachRollVisualizer notes={tab4MidiEquivalents} isSequence={true} isMicrotonal={true} onKeyClick={m => setTab4Input(prev => prev ? prev + ", " + m : String(m))} onNoteDelete={handleTab4Delete} />
                        </div>
                    </div>
                )}

                {activeTab === 5 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-purple-300">Entidade (Notas)</h3>
                            <textarea value={tab5Input} onChange={e => setTab5Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 60, 64, 67, 72" />
                            <h3 className="text-sm font-bold text-purple-300">Vetor de Permutação</h3>
                            <textarea value={tab5Perm} onChange={e => setTab5Perm(e.target.value)} rows="1" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 2, 3, 4, 1" />
                            <div className="border-t border-gray-700 pt-4">
                                <h4 className="text-xs font-bold text-gray-300 mb-2">Exibição</h4>
                                {['notes', 'indices', 'pcs'].map(mode => (
                                    <label key={mode} className="text-xs flex items-center mb-1"><input type="radio" name="vm" checked={tab5ViewMode === mode} onChange={() => setTab5ViewMode(mode)} className="mr-2" /> {mode === 'notes' ? 'Notas/MIDI' : mode === 'indices' ? 'Índices Formais' : 'Pitch Class (0-11)'}</label>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 p-5 bg-gray-950 flex flex-col overflow-y-auto custom-scrollbar">
                            <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase">Ciclos Gerados Iterativamente</h2>
                            <div className="space-y-2">
                                {tab5Result.map((iter, idx) => (
                                    <div key={idx} className="bg-gray-900 p-2 rounded border border-gray-800 flex items-center justify-between">
                                        <div className="flex items-center">
                                            <span className="w-8 text-purple-400 font-bold text-xs">P{idx}:</span>
                                            <span className="text-xs font-mono text-gray-300">[{formatTab5Output(iter)}]</span>
                                        </div>
                                        <button onClick={() => playAudio(iter.map(midiToHz), false)} className="bg-green-800 hover:bg-green-700 text-[10px] px-2 py-1 rounded">🎵 Ouvir</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 6 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4">
                            <h3 className="text-sm font-bold text-red-400">Série Original (P0)</h3>
                            <textarea value={tab6Input} onChange={e => setTab6Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" />
                            <label className="text-xs text-orange-300"><input type="checkbox" className="mr-2" checked={tab6Gt12} onChange={e => setTab6Gt12(e.target.checked)} /> Liberar mais de 12 notas</label>
                            <label className="text-xs text-gray-300"><input type="checkbox" className="mr-2" checked={tab6View === "note"} onChange={e => setTab6View(e.target.checked ? "note" : "pc")} /> Mostrar Notas Musicais</label>
                            <button onClick={() => playAudio(tab6Matrix.row.map(midiToHz), false)} className="bg-green-800 text-xs py-2 rounded">🎵 Ouvir Série P0</button>
                        </div>
                        <div className="flex-1 p-5 bg-gray-950 overflow-auto custom-scrollbar items-center justify-center flex">
                            {tab6Matrix.m.length > 0 && (
                                <table className="border-collapse bg-gray-900 border border-gray-500 shadow-2xl text-center">
                                    <thead>
                                        <tr><th className="p-1"></th>{tab6Matrix.inv.map((v, i) => <th key={i} className="text-[10px] text-blue-300 border border-gray-700 p-1">I{tab6Gt12 ? i : v}↓</th>)}<th className="p-1"></th></tr>
                                    </thead>
                                    <tbody>
                                        {tab6Matrix.m.map((row, rIdx) => (
                                            <tr key={rIdx}>
                                                <th className="text-[10px] text-green-300 border border-gray-700 p-1">P{tab6Gt12 ? rIdx : tab6Matrix.row[rIdx]}→</th>
                                                {row.map((val, cIdx) => <td key={cIdx} className={`border border-gray-700 w-10 h-10 font-mono text-xs ${val === tab6Matrix.m[0][0] ? 'bg-gray-800 font-bold' : ''}`}>{tab6View === "note" ? midiToNote(val) : val}</td>)}
                                                <th className="text-[10px] text-yellow-300 border border-gray-700 p-1">←R{tab6Gt12 ? rIdx : tab6Matrix.row[rIdx]}</th>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr><th className="p-1"></th>{tab6Matrix.inv.map((v, i) => <th key={i} className="text-[10px] text-purple-300 border border-gray-700 p-1">↑RI{tab6Gt12 ? i : v}</th>)}<th className="p-1"></th></tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 7 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4">
                            <h3 className="text-sm font-bold text-yellow-400">Entradas (Portadoras)</h3>
                            <textarea value={tab7Input} onChange={e => setTab7Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 440Hz, 500Hz" />
                            <div><label className="text-xs text-gray-300">Máx Resultados: {tab7Limit}</label><input type="range" min="1" max="100" value={tab7Limit} onChange={e => setTab7Limit(Number(e.target.value))} className="w-full accent-yellow-500" /></div>
                            <div className="bg-gray-950 p-3 rounded mt-auto h-1/2 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                                <span className="text-[10px] text-yellow-400 font-bold">Frequências (Soma/Diferença):</span>
                                <div className="text-[10px] font-mono break-all text-gray-300">[{tab7ResultHz.map(hzToNoteAndCents).join(', ')}]</div>
                                <button onClick={() => playAudio(tab7ResultHz, true)} className="w-full bg-green-800 text-xs py-1 rounded">🎵 Ouvir Espectro</button>
                            </div>
                        </div>
                        <div className="flex-1 p-4 bg-gray-950"><BachRollVisualizer notes={tab7ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} /></div>
                    </div>
                )}

                {activeTab === 8 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4">
                            <h3 className="text-sm font-bold text-cyan-400">Síntese FM</h3>
                            <label className="text-xs">Portadora (C): <input type="text" value={tab8Carrier} onChange={e => setTab8Carrier(e.target.value)} className="w-full bg-gray-800 p-1 rounded font-mono" /></label>
                            <label className="text-xs">Moduladora (M): <input type="text" value={tab8Modulator} onChange={e => setTab8Modulator(e.target.value)} className="w-full bg-gray-800 p-1 rounded font-mono" /></label>
                            <div><label className="text-xs">Índice (K partials): {tab8K}</label><input type="range" min="1" max="30" value={tab8K} onChange={e => setTab8K(Number(e.target.value))} className="w-full accent-cyan-500" /></div>
                            <div className="bg-gray-950 p-3 rounded mt-auto h-1/2 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                                <span className="text-[10px] text-cyan-400 font-bold">Bandas Laterais (C ± kM):</span>
                                <div className="text-[10px] font-mono break-all text-gray-300">[{tab8ResultHz.map(hzToNoteAndCents).join(', ')}]</div>
                                <button onClick={() => playAudio(tab8ResultHz, true)} className="w-full bg-green-800 text-xs py-1 rounded">🎵 Ouvir Timbre FM</button>
                            </div>
                        </div>
                        <div className="flex-1 p-4 bg-gray-950"><BachRollVisualizer notes={tab8ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} /></div>
                    </div>
                )}

                {activeTab === 9 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4">
                            <h3 className="text-sm font-bold text-pink-400">Síntese Aditiva Espectral</h3>
                            <textarea value={tab9Input} onChange={e => setTab9Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Insira as Frequências ou Notas base" />
                            <div><label className="text-xs">Harmônicos (xN): {tab9Harmonics}</label><input type="range" min="1" max="16" value={tab9Harmonics} onChange={e => setTab9Harmonics(Number(e.target.value))} className="w-full accent-pink-500" /></div>
                            <div><label className="text-xs">Sub-harmônicos (/N): {tab9Sub}</label><input type="range" min="1" max="8" value={tab9Sub} onChange={e => setTab9Sub(Number(e.target.value))} className="w-full accent-pink-500" /></div>
                            <div className="bg-gray-950 p-3 rounded mt-auto h-1/2 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                                <span className="text-[10px] text-pink-400 font-bold">Espectro Gerado:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300">[{tab9ResultHz.map(hzToNoteAndCents).join(', ')}]</div>
                                <button onClick={() => playAudio(tab9ResultHz, true)} className="w-full bg-green-800 text-xs py-1 rounded">🎵 Ouvir Complexo</button>
                            </div>
                        </div>
                        <div className="flex-1 p-4 bg-gray-950"><BachRollVisualizer notes={tab9ResultHz.map(hzToMidi)} isSequence={false} isMicrotonal={true} /></div>
                    </div>
                )}

            </div>
        </div>
    );
}

export default HarmonicNetwork;