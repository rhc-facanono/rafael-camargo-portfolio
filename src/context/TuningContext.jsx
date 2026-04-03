// src/context/TuningContext.jsx
import React, { createContext, useState, useContext } from 'react';

const TuningContext = createContext();

export function TuningProvider({ children }) {
    const [isMicrotonalMode, setIsMicrotonalMode] = useState(false);
    const [activeTuning, setActiveTuning] = useState({ type: 'edo', divisions: 19, data: null });
    const [baseMidi, setBaseMidi] = useState(60);
    const [baseHz, setBaseHz] = useState(261.625565);
    const [keyColorMode, setKeyColorMode] = useState('auto');
    const [customKeyPattern, setCustomKeyPattern] = useState(['W', 'B', 'W', 'B', 'W', 'W', 'B', 'W', 'B', 'W', 'B', 'W']);

    // As duas variáveis vitais que faltavam para os botões funcionarem:
    const [accidentalModifier, setAccidentalModifier] = useState(0);
    const [globalSnap, setGlobalSnap] = useState(false);

    const toggleMicrotonalMode = () => {
        setIsMicrotonalMode(prev => !prev);
    };

    return (
        <TuningContext.Provider value={{
            isMicrotonalMode, toggleMicrotonalMode,
            activeTuning, setActiveTuning,
            baseMidi, setBaseMidi,
            baseHz, setBaseHz,
            keyColorMode, setKeyColorMode,
            customKeyPattern, setCustomKeyPattern,
            accidentalModifier, setAccidentalModifier,
            globalSnap, setGlobalSnap
        }}>
            {children}
        </TuningContext.Provider>
    );
}

export const useTuning = () => useContext(TuningContext);