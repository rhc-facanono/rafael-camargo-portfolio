import React, { useState, useRef } from "react";
import * as THREE from 'three';
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNote(midi) {
    const name = noteNames[((midi % 12) + 12) % 12];
    const oct = Math.floor(midi / 12) - 1;
    return name + oct;
}

function NotePoint({ pt, selectedSet, toggleSelect, blendedHue, saturation, luminance, isSel, ignoreNextRef, customOpacity, textOpacity }) {
    const baseSat = isSel ? 90 : 65;
    const baseLum = isSel ? 90 : 55;
    const color = new THREE.Color(`hsl(${blendedHue},${baseSat}%,${baseLum}%)`);
    return (
        <mesh
            position={pt.position}
            onClick={e => {
                if (e.ctrlKey) {
                    e.stopPropagation();
                    ignoreNextRef.current = true;
                    toggleSelect(pt.coord);
                }
            }}
        >
            <sphereGeometry args={[0.2, 32, 32]} />
            <meshStandardMaterial
                color={color}
                transparent={true}
                opacity={customOpacity}
                roughness={0.12}
                metalness={0.25}
                emissive={isSel ? '#fff' : color}
                emissiveIntensity={isSel ? 0.35 : 0.05}
            />

            <Billboard>
                <Text
                    position={[0, 0, 0]}
                    fontSize={0.23}
                    color="#ffffff" // PADRÃO: Letra sempre branca
                    outlineWidth={0.05} // PADRÃO: Borda preta sempre grossa e visível
                    outlineColor="#000000"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="bold"
                    depthOffset={-1}
                    fillOpacity={textOpacity}
                    outlineOpacity={textOpacity}
                >
                    {pt.note}
                </Text>
            </Billboard>
        </mesh>
    );
}

function HarmonicNetwork() {
    const [baseNote, setBaseNote] = useState(48); // C3
    const [intX, setIntX] = useState(7);
    const [intY, setIntY] = useState(12);
    const [intZ, setIntZ] = useState(4);
    const [selectedSet, setSelectedSet] = useState(new Set());
    const [showOnlyHighlight, setShowOnlyHighlight] = useState(false);
    const [filterText, setFilterText] = useState("");

    const [showHelp, setShowHelp] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(true);

    const ignoreNextRef = useRef(false);
    const panControlsRef = useRef();

    const points = React.useMemo(() => {
        const arr = [];
        for (let x = -7; x <= 7; x++) {
            for (let y = -2; y <= 2; y++) {
                for (let z = -2; z <= 2; z++) {
                    const midi = baseNote + x * intX + y * intY + z * intZ;
                    arr.push({
                        coord: [x, y, z],
                        position: [x * 1.5, y * 2, z * 2.5],
                        note: midiToNote(midi),
                    });
                }
            }
        }
        return arr;
    }, [baseNote, intX, intY, intZ]);

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
        setBaseNote(48);
        setIntX(7);
        setIntY(12);
        setIntZ(4);
        setSelectedSet(new Set());
        setFilterText("");
        setShowOnlyHighlight(false);
        panControlsRef.current?.resetCamera();
    };

    const applyFilter = () => {
        if (!filterText.trim()) return;

        const input = filterText.toLowerCase().replace(/[()[\]{}]/g, '');
        const parts = input.split(/\s+a\s+|\s+à\s+|:/);

        try {
            if (parts.length === 1) {
                const coords = parts[0].split(',').map(s => parseInt(s.trim(), 10));
                if (coords.length === 3 && !coords.some(isNaN)) {
                    setSelectedSet(prev => new Set(prev).add(coords.join(',')));
                } else {
                    alert("Formato inválido. Tente: x, y, z (ex: 0, 1, -1)");
                }
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
                                if (x >= -7 && x <= 7 && y >= -2 && y <= 2 && z >= -2 && z <= 2) {
                                    newSet.add(`${x},${y},${z}`);
                                }
                            }
                        }
                    }
                    setSelectedSet(newSet);
                } else {
                    alert("Intervalo inválido. Tente: x1,y1,z1 a x2,y2,z2");
                }
            }
        } catch (e) {
            alert("Erro ao ler o filtro. Verifique a formatação.");
        }
    };

    const PanControls = React.forwardRef(({ ignoreNextRef }, ref) => {
        const { camera } = useThree();
        const controlsRef = useRef();
        const [isPanning, setIsPanning] = useState(false);
        const [panStart, setPanStart] = useState([0, 0]);

        React.useImperativeHandle(ref, () => ({
            resetCamera: () => {
                camera.position.set(0, 0, 2.2);
                if (controlsRef.current) {
                    controlsRef.current.target.set(0, 0, 0);
                    controlsRef.current.update();
                }
            }
        }));

        const handleMouseDown = (e) => {
            if (ignoreNextRef.current) {
                ignoreNextRef.current = false;
                return;
            }
            if (e.altKey && e.button === 0) {
                e.preventDefault();
                setIsPanning(true);
                setPanStart([e.clientX, e.clientY]);
            }
        };

        const handleMouseMove = (e) => {
            if (!isPanning) return;
            const dx = e.clientX - panStart[0];
            const dy = e.clientY - panStart[1];
            const factor = 0.01;
            const target = controlsRef.current?.target || new THREE.Vector3();
            target.x -= dx * factor;
            target.y += dy * factor;
            if (controlsRef.current) controlsRef.current.target = target;
            setPanStart([e.clientX, e.clientY]);
        };

        const handleMouseUp = () => setIsPanning(false);

        React.useEffect(() => {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }, [isPanning, panStart]);

        return <OrbitControls
            ref={controlsRef}
            maxDistance={50}
            minDistance={0.5}
            enableDamping={false}
            onPointerDown={handleMouseDown}
        />;
    });

    const PanControlsSingleton = React.useMemo(() => <PanControls ignoreNextRef={ignoreNextRef} ref={panControlsRef} />, []);

    return (
        <div className="w-full h-full relative overflow-hidden bg-gray-950">

            {isMenuOpen ? (
                <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-95 p-5 rounded-lg z-50 w-72 shadow-2xl border border-gray-700 max-h-[90vh] overflow-y-auto backdrop-blur-md text-white transition-all">

                    <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
                        <h2 className="text-base font-bold text-blue-300">Rede Harmônica</h2>
                        <button
                            onClick={() => setIsMenuOpen(false)}
                            className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full w-6 h-6 flex items-center justify-center transition"
                            title="Minimizar Menu"
                        >
                            ✕
                        </button>
                    </div>

                    <button
                        onClick={() => setShowHelp(!showHelp)}
                        className="w-full mb-4 bg-blue-700 hover:bg-blue-600 transition-colors text-xs font-semibold py-2 px-3 rounded"
                    >
                        {showHelp ? "Esconder Instruções" : "Ajuda / Como usar?"}
                    </button>

                    {showHelp && (
                        <div className="bg-gray-800 p-3 rounded mb-4 text-xs text-gray-300 space-y-3 leading-relaxed border border-gray-700">
                            <p><strong>Câmera:</strong><br />
                                • Rotação: Clique esquerdo e arraste.<br />
                                • Pan: <code>Alt</code> + Arraste.<br />
                                • Zoom: Scroll do mouse.</p>

                            <p><strong>Seleção:</strong><br />
                                • <code>Ctrl</code> + Clique na esfera.</p>

                            <p><strong>Intervalos:</strong><br />
                                • Distância em <strong>semitons</strong> por eixo.</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="flex justify-between items-center text-sm font-medium">
                            Central (0,0,0):
                            <select className="bg-gray-800 text-white text-sm p-1 rounded border border-gray-600 outline-none" value={baseNote} onChange={e => setBaseNote(Number(e.target.value))}>
                                {noteNames.map((n, i) => (
                                    <option key={i} value={48 + i}>{n}3</option>
                                ))}
                            </select>
                        </label>

                        <div className="grid grid-cols-3 gap-2">
                            <label className="flex flex-col text-xs text-gray-300">
                                X (5as):
                                <input className="mt-1 bg-gray-800 text-center p-1 rounded border border-gray-600" type="number" value={intX} onChange={e => setIntX(Number(e.target.value))} />
                            </label>
                            <label className="flex flex-col text-xs text-gray-300">
                                Y (8as):
                                <input className="mt-1 bg-gray-800 text-center p-1 rounded border border-gray-600" type="number" value={intY} onChange={e => setIntY(Number(e.target.value))} />
                            </label>
                            <label className="flex flex-col text-xs text-gray-300">
                                Z (3as):
                                <input className="mt-1 bg-gray-800 text-center p-1 rounded border border-gray-600" type="number" value={intZ} onChange={e => setIntZ(Number(e.target.value))} />
                            </label>
                        </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-gray-600 space-y-3">
                        <label className="flex items-center text-sm text-gray-200 cursor-pointer bg-gray-800 p-2 rounded border border-gray-700 hover:bg-gray-700 transition">
                            <input type="checkbox" className="mr-3 w-4 h-4 accent-blue-500" checked={showOnlyHighlight} onChange={e => setShowOnlyHighlight(e.target.checked)} />
                            Esconder não destacadas
                        </label>

                        <div className="flex flex-col space-y-2">
                            <span className="text-xs text-gray-400">Filtrar (ex: <code>0,1,-1</code> ou <code>-7,0,0 a 7,0,0</code>):</span>
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    className="flex-1 bg-gray-800 text-white text-xs p-1.5 rounded border border-gray-600 outline-none"
                                    placeholder="-7,0,-2 a 7,0,2"
                                    value={filterText}
                                    onChange={e => setFilterText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyFilter()}
                                />
                                <button onClick={applyFilter} className="bg-green-600 hover:bg-green-500 text-white text-xs py-1 px-2 rounded">Ok</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col space-y-2 mt-5 pt-4 border-t border-gray-600">
                        <button onClick={() => panControlsRef.current?.resetCamera()} className="w-full bg-blue-800 hover:bg-blue-700 text-blue-100 text-xs py-2 rounded">Centralizar Câmera</button>
                        <button onClick={() => setSelectedSet(new Set())} className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs py-2 rounded">Limpar Destaques</button>
                        <button onClick={resetDefaults} className="w-full bg-red-900 hover:bg-red-800 text-red-100 text-xs py-2 rounded">Resetar Tudo</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setIsMenuOpen(true)}
                    className="absolute top-4 left-4 bg-gray-800 hover:bg-gray-700 bg-opacity-90 text-white p-3 rounded-lg z-50 border border-gray-600 shadow-lg text-sm font-semibold flex items-center space-x-2 transition-all"
                >
                    <span>⚙️ Controles da Rede</span>
                </button>
            )}

            <Canvas camera={{ position: [0, 0, 2.2], fov: 60 }}>
                <ambientLight />
                {PanControlsSingleton}
                {points.map((pt, idx) => {
                    const key = pt.coord.join(',');
                    const isSel = selectedSet.has(key);

                    const hueX = ((pt.coord[0] + 7) / 14) * 360;
                    const hueZ = ((pt.coord[2] + 2) / 4) * 120;
                    const blendedHue = (hueX * 0.75 + hueZ * 0.25) % 360;

                    const saturation = isSel ? '80%' : '55%';
                    const luminance = isSel ? '80%' : '45%';

                    const customOpacity = showOnlyHighlight ? (isSel ? 0.5 : 0.03) : 0.6;
                    const textOpacity = showOnlyHighlight ? (isSel ? 1 : 0.05) : 1;

                    return (
                        <NotePoint
                            key={idx}
                            pt={pt}
                            selectedSet={selectedSet}
                            toggleSelect={toggleSelect}
                            blendedHue={blendedHue}
                            saturation={saturation}
                            luminance={luminance}
                            isSel={isSel}
                            ignoreNextRef={ignoreNextRef}
                            customOpacity={customOpacity}
                            textOpacity={textOpacity}
                        />
                    );
                })}
            </Canvas>
        </div>
    );
}

export default HarmonicNetwork;