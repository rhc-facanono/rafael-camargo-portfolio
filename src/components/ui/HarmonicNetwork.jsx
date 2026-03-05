import React, { useState, useRef } from "react";
import * as THREE from 'three';
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNote(midi) {
    const name = noteNames[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    return name + oct;
}

// Component to render individual note point with texture
function NotePoint({ pt, selectedSet, toggleSelect, blendedHue, saturation, luminance, isSel, ignoreNextRef }) {
    // Cores levemente mais claras e brilhantes
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
                opacity={0.55}
                roughness={0.12}
                metalness={0.25}
                emissive={isSel ? '#fff' : color}
                emissiveIntensity={isSel ? 0.25 : 0.08}
            />
            <Text
                position={[0, 0, 0]}
                fontSize={0.23}
                color={'#fff'}
                anchorX="center"
                anchorY="middle"
                fontWeight={"bold"}
                occlude
                maxWidth={0.28}
                depthOffset={-0.01}
            >
                {pt.note}
            </Text>
        </mesh>
    );
}

function HarmonicNetwork() {
    const [baseNote, setBaseNote] = useState(48); // C3
    const [intX, setIntX] = useState(7);
    const [intY, setIntY] = useState(12);
    const [intZ, setIntZ] = useState(4);
    const [selectedSet, setSelectedSet] = useState(new Set());
    const ignoreNextRef = useRef(false); // flag to prevent camera move after Ctrl+click
    // Memoize points so array is only recalculated when relevant state changes
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

    // Pan control with Alt+drag
    const PanControls = ({ ignoreNextRef }) => {
        const { camera } = useThree();
        const controlsRef = useRef();
        const [isPanning, setIsPanning] = useState(false);
        const [panStart, setPanStart] = useState([0, 0]);

        const handleMouseDown = (e) => {
            // Ignore if last action was a Ctrl+click on a sphere
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

        const handleMouseUp = () => {
            setIsPanning(false);
        };

        React.useEffect(() => {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }, [isPanning, panStart]);

        return (
            <OrbitControls
                ref={controlsRef}
                maxDistance={50}
                minDistance={5}
                enableDamping={false}
                onPointerDown={handleMouseDown}
            />
        );
    };

    // PanControls only mounted once, never re-created
    const panControlsRef = useRef();
    const PanControlsSingleton = React.useMemo(() => <PanControls ignoreNextRef={ignoreNextRef} ref={panControlsRef} />, []);
    return (
        <div className="w-full h-full relative overflow-hidden">
            <div className="absolute top-4 left-4 bg-black bg-opacity-70 p-4 rounded z-50">
                <div className="flex justify-between items-center space-x-4">
                    <label className="text-white text-sm">
                        Nota Central:
                        <select className="ml-2 bg-gray-800 text-white text-sm p-1 rounded" value={baseNote} onChange={e => setBaseNote(Number(e.target.value))}>
                            <option value="48">C3</option>
                            <option value="49">C#3</option>
                            <option value="50">D3</option>
                            <option value="51">D#3</option>
                            <option value="52">E3</option>
                            <option value="53">F3</option>
                            <option value="54">F#3</option>
                            <option value="55">G3</option>
                            <option value="56">G#3</option>
                            <option value="57">A3</option>
                            <option value="58">A#3</option>
                            <option value="59">B3</option>
                        </select>
                    </label>
                </div>
                <div className="flex space-x-4 mt-2">
                    <label className="text-white text-sm">
                        5as:
                        <input className="ml-1 w-12 bg-gray-800 text-white text-sm p-1 rounded" type="number" value={intX} onChange={e => setIntX(Number(e.target.value))} />
                    </label>
                    <label className="text-white text-sm">
                        8as:
                        <input className="ml-1 w-12 bg-gray-800 text-white text-sm p-1 rounded" type="number" value={intY} onChange={e => setIntY(Number(e.target.value))} />
                    </label>
                    <label className="text-white text-sm">
                        3as:
                        <input className="ml-1 w-12 bg-gray-800 text-white text-sm p-1 rounded" type="number" value={intZ} onChange={e => setIntZ(Number(e.target.value))} />
                    </label>
                </div>
            </div>
            <Canvas camera={{ position: [10, 10, 20], fov: 75 }}>
                <ambientLight />
                {PanControlsSingleton}
                {points.map((pt, idx) => {
                    const key = pt.coord.join(',');
                    const isSel = selectedSet.has(key);

                    // Color based on X (quintas) and Z (terças)
                    const hueX = ((pt.coord[0] + 7) / 14) * 360;
                    const hueZ = ((pt.coord[2] + 2) / 4) * 120;
                    const blendedHue = (hueX * 0.75 + hueZ * 0.25) % 360;

                    const saturation = isSel ? '80%' : '55%';
                    const luminance = isSel ? '80%' : '45%';

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
                        />
                    );
                })}
                n            </Canvas>
        </div>
    );
}

export default HarmonicNetwork;
