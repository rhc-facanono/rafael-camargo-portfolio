import React, { createContext, useState, useContext } from 'react';

const TuningContext = createContext();

export function TuningProvider({ children }) {
    const [isMicrotonalMode, setIsMicrotonalMode] = useState(false);

    // activeTuning agora pode ser 'edo', 'scala' ou 'custom' (para JI e outras)
    const [activeTuning, setActiveTuning] = useState({ type: 'edo', divisions: 19, data: null });

    // ----------------------------------------------------
    // NOVAS VARIÁVEIS DO SCALE WORKSHOP
    // ----------------------------------------------------

    // Âncoras de Frequência (Padrão: MIDI 60 = 261.625565 Hz)
    const [baseMidi, setBaseMidi] = useState(60);
    const [baseHz, setBaseHz] = useState(261.625565);

    // Configuração das Cores das Teclas no Piano Roll / Teclado
    const [keyColorMode, setKeyColorMode] = useState('auto'); // 'auto', '12-tet', 'custom'
    // Array padrão de cores caso o usuário queira pintar manualmente (W = White, B = Black)
    const [customKeyPattern, setCustomKeyPattern] = useState(['W', 'B', 'W', 'B', 'W', 'W', 'B', 'W', 'B', 'W', 'B', 'W']);

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
            customKeyPattern, setCustomKeyPattern
        }}>
            {children}
        </TuningContext.Provider>
    );
}

export const useTuning = () => useContext(TuningContext);