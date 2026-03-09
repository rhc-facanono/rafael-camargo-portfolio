import React, { useState, useRef, useMemo, useEffect } from "react";
import * as THREE from 'three';
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNote(midi) {
    const name = noteNames[((Math.round(midi) % 12) + 12) % 12];
    const oct = Math.floor(Math.round(midi) / 12) - 1;
    return name + oct;
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

function parseMidiString(str) {
    return str.replace(/[^0-9\.,\s-]/g, '')
        .split(/[\s,]+/)
        .filter(s => s !== '')
        .map(Number)
        .filter(n => !isNaN(n));
}

// Modos de Messiaen (C=0)
const messiaenModes = {
    1: [0, 2, 4, 6, 8, 10], // Tons inteiros
    2: [0, 1, 3, 4, 6, 7, 9, 10], // Octatônica
    3: [0, 2, 3, 4, 6, 7, 8, 10, 11]
};

function snapToMode(midiArr, modeKey) {
    const mode = messiaenModes[modeKey];
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

// ==========================================
// 3D & COMPONENTES VISUAIS
// ==========================================

function GridLines({ showOnlyHighlight, selectedSet }) {
    const { normal, high } = useMemo(() => {
        const normalPts = [];
        const highPts = [];
        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) {
                    const currentKey = `${x},${y},${z}`;
                    const isCurrentSel = selectedSet.has(currentKey);

                    const addLine = (nx, ny, nz) => {
                        const neighborKey = `${nx},${ny},${nz}`;
                        const isNeighborSel = selectedSet.has(neighborKey);
                        if (isCurrentSel && isNeighborSel) highPts.push(x * 1.5, y * 2, z * 2.5, nx * 1.5, ny * 2, nz * 2.5);
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
    const baseSat = isSel ? 90 : 65;
    const baseLum = isSel ? 90 : 55;
    const color = new THREE.Color(`hsl(${blendedHue},${baseSat}%,${baseLum}%)`);
    return (
        <mesh position={pt.position} onClick={e => { if (e.ctrlKey) { e.stopPropagation(); ignoreNextRef.current = true; toggleSelect(pt.coord); } }}>
            <sphereGeometry args={[0.2, 32, 32]} />
            <meshStandardMaterial color={color} transparent={true} opacity={customOpacity} roughness={0.12} metalness={0.25} emissive={isSel ? '#fff' : color} emissiveIntensity={isSel ? 0.35 : 0.05} />
            <Billboard>
                <Text position={[0, 0, 0]} fontSize={0.23} color="#ffffff" outlineWidth={0.05} outlineColor="#000000" anchorX="center" anchorY="middle" fontWeight="bold" depthOffset={-1} fillOpacity={textOpacity} outlineOpacity={textOpacity}>
                    {pt.note}
                </Text>
            </Billboard>
        </mesh>
    );
}

function BachRollVisualizer({ notes, isSequence = false, isMicrotonal = false, onKeyClick = null, onNoteDrag = null, onNoteDelete = null, originalEntityLength = 0 }) {
    const minMidi = 36, maxMidi = 96, rowHeight = 14, keyWidth = 60;
    const totalHeight = (maxMidi - minMidi + 1) * rowHeight;
    const [draggingIdx, setDraggingIdx] = useState(null);

    const renderKeys = () => {
        const keys = [];
        for (let m = maxMidi; m >= minMidi; m--) {
            const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
            const y = (maxMidi - m) * rowHeight;
            const isC = (m % 12 === 0);
            keys.push(
                <g key={`key-${m}`} onClick={() => onKeyClick && onKeyClick(m)} style={{ cursor: onKeyClick ? 'pointer' : 'default' }}>
                    <rect x={0} y={y} width={keyWidth} height={rowHeight} fill={isBlack ? "#222" : "#eee"} stroke="#999" strokeWidth="1" />
                    {isC && <text x={5} y={y + 10} fontSize="9" fill={isBlack ? "#fff" : "#000"} fontWeight="bold">C{(m / 12) - 1}</text>}
                    {onKeyClick && <rect x={0} y={y} width={keyWidth} height={rowHeight} fill="white" opacity="0" className="hover:opacity-20 transition-opacity" />}
                </g>
            );
        }
        return keys;
    };

    const handlePointerDown = (e, idx) => {
        if (e.ctrlKey) { e.stopPropagation(); if (onNoteDelete) onNoteDelete(idx); return; }
        if (onNoteDrag && (!originalEntityLength || idx < originalEntityLength) && !isMicrotonal) {
            e.stopPropagation(); e.target.setPointerCapture(e.pointerId); setDraggingIdx(idx);
        }
    };

    const handlePointerMove = (e) => {
        if (draggingIdx === null || !onNoteDrag) return;
        const svgRect = e.currentTarget.getBoundingClientRect();
        let newMidi = maxMidi - Math.round((e.clientY - svgRect.top) / rowHeight);
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
                    const y = (maxMidi - midi) * rowHeight;
                    const x = isSequence ? keyWidth + 10 + (idx * 30) : keyWidth + 20;
                    const width = isSequence ? 25 : 80;
                    let color = "#1e90ff";
                    if (isMicrotonal) color = "#ff4757";
                    else if (originalEntityLength > 0 && idx >= originalEntityLength) color = "#9b59b6";
                    const isDraggable = onNoteDrag && (!originalEntityLength || idx < originalEntityLength) && !isMicrotonal;

                    return (
                        <g key={`note-${idx}`}>
                            <rect x={x} y={y} width={width} height={rowHeight - 2} fill={color} rx="3" opacity="0.9" style={{ cursor: isDraggable ? 'ns-resize' : (onNoteDelete ? 'pointer' : 'default') }} onPointerDown={(e) => handlePointerDown(e, idx)} />
                            {isMicrotonal && <text x={x + 2} y={y + 9} fontSize="7" fill="#fff" fontWeight="bold">{midi.toFixed(2)}</text>}
                        </g>
                    );
                })}
                <g className="sticky left-0 drop-shadow-lg">{renderKeys()}</g>
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
    const [intX, setIntX] = useState(7);
    const [intY, setIntY] = useState(12);
    const [intZ, setIntZ] = useState(4);
    const [selectedSet, setSelectedSet] = useState(new Set());
    const [showOnlyHighlight, setShowOnlyHighlight] = useState(false);
    const [filterText, setFilterText] = useState("");
    const [showHelp, setShowHelp] = useState(false);

    // ABA 2
    const [tab2InputA, setTab2InputA] = useState("");
    const [tab2InputB, setTab2InputB] = useState("0, 4, 7");

    // ABA 3
    const [tab3Input, setTab3Input] = useState("");

    // ABA 4
    const [tab4Input, setTab4Input] = useState("");
    const [targetMinHz, setTargetMinHz] = useState(440);
    const [targetMaxHz, setTargetMaxHz] = useState(880);

    // ABA 5 (Messiaen Permutations)
    const [tab5Input, setTab5Input] = useState("");
    const [tab5Perm, setTab5Perm] = useState("2, 3, 4, 1");
    const [tab5ViewMode, setTab5ViewMode] = useState("notes"); // 'notes', 'indices', 'pcs'

    // ABA 6 (12-Tone Matrix)
    const [tab6Input, setTab6Input] = useState("0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11");

    const ignoreNextRef = useRef(false);
    const panControlsRef = useRef();

    // ==========================================
    // MOTORES DE CÁLCULO (MEMOIZED)
    // ==========================================

    const points = useMemo(() => {
        const arr = [];
        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) {
                    const midi = baseNote + x * intX + y * intY + z * intZ;
                    arr.push({ coord: [x, y, z], position: [x * 1.5, y * 2, z * 2.5], note: midiToNote(midi), midi: midi });
                }
            }
        }
        return arr;
    }, [baseNote, intX, intY, intZ]);

    const tab1MidiNotes = useMemo(() => points.filter(pt => selectedSet.has(pt.coord.join(','))).map(pt => pt.midi).sort((a, b) => a - b), [points, selectedSet]);

    const tab2Result = useMemo(() => {
        let arrA = parseMidiString(tab2InputA), arrB = parseMidiString(tab2InputB);
        if (!arrA.length || !arrB.length) return [];
        let result = new Set(), baseB = arrB[0];
        arrB.forEach(b => { let diff = b - baseB; arrA.forEach(a => result.add(a + diff)); });
        return Array.from(result).sort((a, b) => a - b);
    }, [tab2InputA, tab2InputB]);

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const tab3ParsedInput = parseMidiString(tab3Input);
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
        let arr = parseMidiString(tab4Input);
        if (arr.length > 0) {
            let hzArr = arr.map(m => 440 * Math.pow(2, (m - 69) / 12));
            setTargetMinHz(Math.min(...hzArr).toFixed(2));
            setTargetMaxHz(Math.max(...hzArr).toFixed(2));
        }
    };

    const tab4Result = useMemo(() => {
        let arr = parseMidiString(tab4Input);
        if (arr.length < 2) return [];
        let hzArr = arr.map(m => 440 * Math.pow(2, (m - 69) / 12));
        let minHz = Math.min(...hzArr), maxHz = Math.max(...hzArr);
        if (minHz === maxHz) return hzArr;
        return hzArr.map(f => {
            let logNorm = (Math.log(f) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
            return targetMinHz * Math.pow((targetMaxHz / targetMinHz), logNorm);
        });
    }, [tab4Input, targetMinHz, targetMaxHz]);

    const tab4MidiEquivalents = useMemo(() => tab4Result.map(hz => 69 + 12 * Math.log2(hz / 440)), [tab4Result]);

    // ABA 5: Permutações Simétricas
    const tab5Result = useMemo(() => {
        let base = parseMidiString(tab5Input);
        if (base.length < 2) return [base];
        let perm = parseMidiString(tab5Perm); // Índices começando em 1
        if (perm.length !== base.length) return [base]; // Evita erro se o vetor de perm n tiver o msm tamanho

        let results = [base];
        let current = [...base];

        // Loop de limite (Segurança)
        for (let k = 0; k < 100; k++) {
            let next = new Array(base.length);
            for (let i = 0; i < perm.length; i++) {
                let pIdx = perm[i] - 1; // Ajusta para array 0-based
                next[i] = (pIdx >= 0 && pIdx < current.length) ? current[pIdx] : current[i];
            }
            if (next.every((v, i) => v === base[i])) break; // Fechou o ciclo na identidade
            results.push(next);
            current = next;
        }
        return results;
    }, [tab5Input, tab5Perm]);

    const formatTab5Output = (arr) => {
        if (tab5ViewMode === 'pcs') return arr.map(n => ((n % 12) + 12) % 12).join(', ');
        if (tab5ViewMode === 'indices') {
            let base = parseMidiString(tab5Input);
            return arr.map(n => base.indexOf(n) + 1).join(', ');
        }
        return midiArrayToNames(arr);
    };

    // ABA 6: Matriz Dodecafônica
    const tab6Matrix = useMemo(() => {
        let row = parseMidiString(tab6Input).map(n => ((n % 12) + 12) % 12);
        // Remover duplicatas
        row = Array.from(new Set(row));
        if (row.length < 1) return [];

        let p0 = row[0];
        let inv = row.map(val => (p0 - (val - p0) + 24) % 12);
        let matrix = [];
        for (let r = 0; r < row.length; r++) {
            let mRow = [];
            for (let c = 0; c < row.length; c++) {
                mRow.push((row[c] + inv[r] - p0 + 24) % 12);
            }
            matrix.push(mRow);
        }
        return matrix;
    }, [tab6Input]);


    // Interatividade UI
    const handleTab3Drag = (idx, newMidi) => {
        let arr = [...tab3ParsedInput];
        if (idx < arr.length) { arr[idx] = newMidi; setTab3Input(arr.join(', ')); }
    };
    const handleTab3Delete = (idx) => {
        let arr = [...tab3ParsedInput];
        if (idx < arr.length) { arr.splice(idx, 1); setTab3Input(arr.join(', ')); }
    };
    const handleTab4Delete = (idx) => {
        let arr = parseMidiString(tab4Input);
        if (idx < arr.length) { arr.splice(idx, 1); setTab4Input(arr.join(', ')); }
    };

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

            {/* NAVEGAÇÃO SUPERIOR */}
            <div className="flex flex-wrap bg-gray-900 border-b border-gray-700 p-2 gap-2 z-50 shadow-md flex-shrink-0">
                <button onClick={() => setActiveTab(1)} className={`px-3 py-1.5 text-xs rounded transition ${activeTab === 1 ? 'bg-blue-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>1. Redes</button>
                <button onClick={() => setActiveTab(2)} className={`px-3 py-1.5 text-xs rounded transition ${activeTab === 2 ? 'bg-blue-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>2. Multiplicação</button>
                <button onClick={() => setActiveTab(3)} className={`px-3 py-1.5 text-xs rounded transition ${activeTab === 3 ? 'bg-blue-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>3. Módulos</button>
                <button onClick={() => setActiveTab(4)} className={`px-3 py-1.5 text-xs rounded transition ${activeTab === 4 ? 'bg-blue-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>4. Projeções</button>
                <button onClick={() => setActiveTab(5)} className={`px-3 py-1.5 text-xs rounded transition ${activeTab === 5 ? 'bg-purple-600 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>5. Permutações</button>
                <button onClick={() => setActiveTab(6)} className={`px-3 py-1.5 text-xs rounded transition ${activeTab === 6 ? 'bg-red-700 font-bold shadow' : 'bg-gray-800 hover:bg-gray-700'}`}>6. Matriz Dodecafônica</button>
            </div>

            {/* ÁREA DE CONTEÚDO */}
            <div className="flex-1 relative flex overflow-hidden">

                {/* ABA 1: REDES */}
                {activeTab === 1 && (
                    <>
                        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 p-4 rounded-lg z-10 w-80 shadow-xl border border-gray-700 backdrop-blur-sm" style={{ maxHeight: 'calc(100vh - 80px)' }}>
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
                                    <span className="text-xs text-gray-400 block mb-2">Filtrar Coordenadas (ex: 0,1,-1 a 3,1,-1):</span>
                                    <div className="flex space-x-2">
                                        <input type="text" className="flex-1 bg-gray-800 text-xs p-1.5 rounded border border-gray-600" value={filterText} onChange={e => setFilterText(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilter()} />
                                        <button onClick={applyFilter} className="bg-green-600 hover:bg-green-500 text-xs py-1 px-3 rounded">Ok</button>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-gray-600">
                                    <label className="flex items-center text-xs cursor-pointer mb-3">
                                        <input type="checkbox" className="mr-2" checked={showOnlyHighlight} onChange={e => setShowOnlyHighlight(e.target.checked)} />
                                        Esconder não destacadas
                                    </label>
                                    <div className="flex flex-col space-y-2">
                                        <button onClick={() => panControlsRef.current?.resetCamera()} className="w-full bg-blue-900 hover:bg-blue-800 text-xs py-1.5 rounded">Centralizar Câmera</button>
                                        <button onClick={() => { setBaseNote(48); setIntX(7); setIntY(12); setIntZ(4); setSelectedSet(new Set()); setFilterText(""); setShowOnlyHighlight(false); panControlsRef.current?.resetCamera(); }} className="w-full bg-red-900 hover:bg-red-800 text-xs py-1.5 rounded">Resetar Tudo</button>
                                    </div>
                                </div>
                                <div className="bg-gray-950 p-2 rounded border border-gray-700">
                                    <span className="text-[10px] text-green-400 block font-bold">Seleção [MIDI]:</span>
                                    <div className="text-[10px] font-mono break-all text-gray-300 mb-2">[{tab1MidiNotes.join(', ')}]</div>
                                    <span className="text-[10px] text-blue-400 block font-bold border-t border-gray-800 pt-1">Seleção [Notas]:</span>
                                    <div className="text-[10px] font-mono break-all text-gray-300">[{midiArrayToNames(tab1MidiNotes)}]</div>
                                </div>
                            </div>
                        </div>

                        <div className="w-full h-full absolute inset-0">
                            <Canvas camera={{ position: [0, 0, 2.2], fov: 60 }}>
                                <ambientLight />
                                {PanControlsSingleton}
                                <GridLines showOnlyHighlight={showOnlyHighlight} selectedSet={selectedSet} />
                                {points.map((pt, idx) => {
                                    const isSel = selectedSet.has(pt.coord.join(','));
                                    const hueX = ((pt.coord[0] + 7) / 14) * 360;
                                    const hueZ = ((pt.coord[2] + 2) / 4) * 120;
                                    const blendedHue = (hueX * 0.75 + hueZ * 0.25) % 360;
                                    const customOpacity = showOnlyHighlight ? (isSel ? 0.9 : 0.03) : 0.6;
                                    const textOpacity = showOnlyHighlight ? (isSel ? 1 : 0.05) : 1;
                                    return <NotePoint key={idx} pt={pt} selectedSet={selectedSet} toggleSelect={toggleSelect} blendedHue={blendedHue} isSel={isSel} ignoreNextRef={ignoreNextRef} customOpacity={customOpacity} textOpacity={textOpacity} />;
                                })}
                            </Canvas>
                        </div>
                    </>
                )}

                {/* ABA 2: MULTIPLICAÇÃO */}
                {activeTab === 2 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 min-w-[320px] bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 shadow-lg z-10 overflow-y-auto custom-scrollbar">
                            <div>
                                <h3 className="text-sm font-bold text-blue-300 mb-2">Entidade A (Multiplicando)</h3>
                                <button onClick={() => setTab2InputA(tab1MidiNotes.join(', '))} className="mb-2 text-[10px] bg-blue-800 hover:bg-blue-700 px-2 py-1 rounded">Puxar Aba 1</button>
                                <textarea value={tab2InputA} onChange={e => setTab2InputA(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 60, 64, 67" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-blue-300 mb-2">Entidade B (Multiplicador)</h3>
                                <textarea value={tab2InputB} onChange={e => setTab2InputB(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" />
                            </div>
                            <div className="bg-gray-950 p-3 rounded border border-gray-700 mt-auto">
                                <span className="text-[10px] text-green-400 block font-bold">Resultado [MIDI]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 h-16 overflow-y-auto">[{tab2Result.join(', ')}]</div>
                                <span className="text-[10px] text-blue-400 block mt-2 font-bold">Resultado [Notas]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 h-16 overflow-y-auto">[{midiArrayToNames(tab2Result)}]</div>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <h2 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-widest">Visualização em Bloco (Acorde)</h2>
                            <BachRollVisualizer notes={tab2Result} isSequence={false} />
                        </div>
                    </div>
                )}

                {/* ABA 3: MÓDULOS CÍCLICOS */}
                {activeTab === 3 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 min-w-[320px] bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 shadow-lg z-10 overflow-y-auto custom-scrollbar">
                            <div>
                                <h3 className="text-sm font-bold text-blue-300 mb-2">Matriz Base (Melódica)</h3>
                                <div className="flex space-x-2 mb-2">
                                    <button onClick={() => setTab3Input(tab1MidiNotes.join(', '))} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">Aba 1</button>
                                    <button onClick={() => setTab3Input(tab2Result.join(', '))} className="text-[10px] bg-blue-800 hover:bg-blue-700 px-2 py-1 rounded">Aba 2</button>
                                </div>
                                <textarea value={tab3Input} onChange={e => setTab3Input(e.target.value)} rows="3" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Clique no teclado ao lado ou insira..." />
                                <div className="flex space-x-1 mt-2">
                                    <button onClick={() => setTab3Input(snapToMode(tab3ParsedInput, 1).join(', '))} className="text-[9px] bg-gray-700 p-1 rounded hover:bg-gray-600">Aprox. Modo 1</button>
                                    <button onClick={() => setTab3Input(snapToMode(tab3ParsedInput, 2).join(', '))} className="text-[9px] bg-gray-700 p-1 rounded hover:bg-gray-600">Aprox. Modo 2</button>
                                </div>
                            </div>
                            <div className="bg-gray-950 p-3 rounded border border-gray-700 mt-auto flex flex-col">
                                <span className="text-[10px] text-green-400 block font-bold">Módulo Gerado [MIDI] - ({tab3Result.length} notas):</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 overflow-y-auto max-h-24 flex-1 mb-2">[{tab3Result.join(', ')}]</div>
                                <span className="text-[10px] text-blue-400 block border-t border-gray-800 pt-1 font-bold">Módulo Gerado [Notas]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 overflow-y-auto max-h-24 flex-1">[{midiArrayToNames(tab3Result)}]</div>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Sequência Temporal (Clique no teclado para adicionar)</h2>
                                <button onClick={() => setTab3Input("")} className="bg-red-900 hover:bg-red-800 text-white text-[10px] px-2 py-1 rounded">Limpar Teclado</button>
                            </div>
                            <BachRollVisualizer notes={tab3Result} isSequence={true} onKeyClick={(midi) => setTab3Input(prev => prev ? prev + ", " + midi : String(midi))} onNoteDrag={handleTab3Drag} onNoteDelete={handleTab3Delete} originalEntityLength={tab3ParsedInput.length} />
                        </div>
                    </div>
                )}

                {/* ABA 4: PROJEÇÕES PROPORCIONAIS */}
                {activeTab === 4 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-96 flex-shrink-0 min-w-[380px] bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 shadow-lg z-10 overflow-y-auto custom-scrollbar">
                            <div>
                                <h3 className="text-sm font-bold text-blue-300 mb-2">Fluxo Temperado Original</h3>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <button onClick={() => setTab4Input(tab1MidiNotes.join(', '))} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">Aba 1</button>
                                    <button onClick={() => setTab4Input(tab2Result.join(', '))} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">Aba 2</button>
                                    <button onClick={() => setTab4Input(tab3Result.join(', '))} className="text-[10px] bg-blue-800 hover:bg-blue-700 px-2 py-1 rounded">Aba 3</button>
                                </div>
                                <textarea value={tab4Input} onChange={e => setTab4Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Clique no teclado para inserir notas bases..." />
                            </div>

                            <div className="border-t border-gray-700 pt-4 space-y-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-xs font-bold text-purple-300">Escalonamento de Frequência</h4>
                                    <button onClick={handleNormalizeFreqs} className="bg-purple-800 hover:bg-purple-700 text-[10px] px-2 py-1 rounded">Normalizar p/ Entrada</button>
                                </div>
                                <div>
                                    <label className="flex justify-between text-xs text-gray-300 font-bold mb-1">Alvo Mínimo: <span>{targetMinHz} Hz</span></label>
                                    <div className="flex space-x-2 items-center">
                                        <input type="range" min="20" max="2000" step="1" value={targetMinHz} onChange={e => setTargetMinHz(Number(e.target.value))} className="w-full accent-blue-500" />
                                        <input type="number" value={targetMinHz} onChange={e => setTargetMinHz(Number(e.target.value))} className="w-16 bg-gray-800 text-xs p-1 text-center rounded border border-gray-600" />
                                    </div>
                                </div>
                                <div>
                                    <label className="flex justify-between text-xs text-gray-300 font-bold mb-1">Alvo Máximo: <span>{targetMaxHz} Hz</span></label>
                                    <div className="flex space-x-2 items-center">
                                        <input type="range" min="20" max="10000" step="1" value={targetMaxHz} onChange={e => setTargetMaxHz(Number(e.target.value))} className="w-full accent-blue-500" />
                                        <input type="number" value={targetMaxHz} onChange={e => setTargetMaxHz(Number(e.target.value))} className="w-16 bg-gray-800 text-xs p-1 text-center rounded border border-gray-600" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-950 p-3 rounded border border-gray-700 mt-auto flex flex-col h-1/3">
                                <span className="text-[10px] text-green-400 block font-bold">Espectro Projetado [Hertz]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 overflow-y-auto custom-scrollbar flex-1 mb-2">[{tab4Result.map(n => n.toFixed(2)).join(', ')}]</div>
                                <span className="text-[10px] text-blue-400 block font-bold border-t border-gray-800 pt-1">Aprox. [Quartos de Tom]:</span>
                                <div className="text-[10px] font-mono break-all text-gray-300 overflow-y-auto custom-scrollbar flex-1">[{midiArrayToQuarterTones(tab4MidiEquivalents)}]</div>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 p-4 bg-gray-950 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Projeção de Espectro (Microtonal)</h2>
                                <button onClick={() => setTab4Input("")} className="bg-red-900 hover:bg-red-800 text-white text-[10px] px-2 py-1 rounded">Limpar Teclado</button>
                            </div>
                            <BachRollVisualizer notes={tab4MidiEquivalents} isSequence={true} isMicrotonal={true} onKeyClick={(midi) => setTab4Input(prev => prev ? prev + ", " + midi : String(midi))} onNoteDelete={handleTab4Delete} />
                        </div>
                    </div>
                )}

                {/* ABA 5: PERMUTAÇÕES SIMÉTRICAS (MESSIAEN) */}
                {activeTab === 5 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 min-w-[320px] bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 shadow-lg z-10 overflow-y-auto custom-scrollbar">
                            <div>
                                <h3 className="text-sm font-bold text-purple-300 mb-2">Entidade Harmônica</h3>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <button onClick={() => setTab5Input(tab1MidiNotes.join(', '))} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">Aba 1</button>
                                    <button onClick={() => setTab5Input(tab2Result.join(', '))} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">Aba 2</button>
                                    <button onClick={() => setTab5Input(tab3Result.join(', '))} className="text-[10px] bg-blue-800 hover:bg-blue-700 px-2 py-1 rounded">Aba 3</button>
                                </div>
                                <textarea value={tab5Input} onChange={e => setTab5Input(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 60, 64, 67, 72" />
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-purple-300 mb-2">Vetor de Permutação (Índices)</h3>
                                <textarea value={tab5Perm} onChange={e => setTab5Perm(e.target.value)} rows="2" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Ex: 2, 3, 4, 1" />
                            </div>

                            <div className="border-t border-gray-700 pt-4">
                                <h4 className="text-xs font-bold text-gray-300 mb-2">Modo de Exibição</h4>
                                <div className="flex flex-col space-y-2">
                                    <label className="text-xs flex items-center"><input type="radio" name="viewMode" className="mr-2" checked={tab5ViewMode === 'notes'} onChange={() => setTab5ViewMode('notes')} /> Notas (ex: C3)</label>
                                    <label className="text-xs flex items-center"><input type="radio" name="viewMode" className="mr-2" checked={tab5ViewMode === 'indices'} onChange={() => setTab5ViewMode('indices')} /> Índices Formais (ex: 1, 2, 3)</label>
                                    <label className="text-xs flex items-center"><input type="radio" name="viewMode" className="mr-2" checked={tab5ViewMode === 'pcs'} onChange={() => setTab5ViewMode('pcs')} /> Pitch Class (0 a 11)</label>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 p-5 bg-gray-950 flex flex-col overflow-y-auto custom-scrollbar">
                            <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-widest border-b border-gray-800 pb-2">Ciclo Completo da Permutação</h2>
                            <div className="space-y-2">
                                {tab5Result.map((iter, idx) => (
                                    <div key={idx} className="bg-gray-900 p-3 rounded border border-gray-800 flex">
                                        <span className="w-12 text-purple-400 font-bold text-xs">P{idx}:</span>
                                        <span className="text-xs font-mono text-gray-300">[{formatTab5Output(iter)}]</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ABA 6: MATRIZ DODECAFÔNICA */}
                {activeTab === 6 && (
                    <div className="flex w-full h-full bg-gray-800">
                        <div className="w-80 flex-shrink-0 min-w-[320px] bg-gray-900 p-5 border-r border-gray-700 flex flex-col space-y-4 shadow-lg z-10 overflow-y-auto custom-scrollbar">
                            <div>
                                <h3 className="text-sm font-bold text-red-400 mb-2">Série Original (P0)</h3>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <button onClick={() => setTab6Input(tab1MidiNotes.join(', '))} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">Aba 1</button>
                                    <button onClick={() => setTab6Input(tab3Result.join(', '))} className="text-[10px] bg-blue-800 hover:bg-blue-700 px-2 py-1 rounded">Aba 3</button>
                                </div>
                                <textarea value={tab6Input} onChange={e => setTab6Input(e.target.value)} rows="3" className="w-full bg-gray-800 text-xs p-2 rounded border border-gray-600 font-mono" placeholder="Insira 12 notas (ex: 0, 1, 2...)" />
                                <p className="text-[10px] text-gray-400 mt-2">Dica: A matriz removerá notas repetidas automaticamente. Se a entrada tiver menos de 12 notas, ela calculará uma matriz menor.</p>
                            </div>
                        </div>
                        <div className="flex-1 p-5 bg-gray-950 flex flex-col overflow-y-auto custom-scrollbar items-center">
                            <h2 className="text-sm font-bold text-gray-400 mb-6 uppercase tracking-widest">Matriz 12x12</h2>
                            {tab6Matrix.length > 0 ? (
                                <table className="border-collapse bg-gray-900 border border-gray-600 shadow-2xl">
                                    <tbody>
                                        {tab6Matrix.map((row, rIdx) => (
                                            <tr key={`r-${rIdx}`}>
                                                {row.map((val, cIdx) => {
                                                    // Destaque para a diagonal principal (opcional, estética)
                                                    const isDiag = val === tab6Matrix[0][0];
                                                    return (
                                                        <td key={`c-${cIdx}`} className={`border border-gray-700 w-10 h-10 text-center font-mono text-xs ${isDiag ? 'bg-gray-800 text-red-300 font-bold' : 'text-gray-300'}`}>
                                                            {val}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-gray-500 text-sm">Insira pelo menos 1 nota para gerar a matriz.</p>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

export default HarmonicNetwork;