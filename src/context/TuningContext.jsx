import React, { createContext, useState, useContext } from 'react';

// Cria o contexto
const TuningContext = createContext();

// Hook customizado para facilitar o uso do contexto em qualquer arquivo
export const useTuning = () => useContext(TuningContext);

// Provedor que vai abraçar a nossa aplicação
export const TuningProvider = ({ children }) => {
    // 1. O Master Toggle: Liga/Desliga a Xenharmonia
    const [isMicrotonalMode, setIsMicrotonalMode] = useState(false);

    // 2. A Afinação Ativa: Por padrão é 12-TET (12-EDO)
    const [activeTuning, setActiveTuning] = useState({ type: 'edo', divisions: 12 });

    // 3. Modificador de Acidentes da Partitura: 
    // 0 = natural, 1 = sustenido, -1 = bemol, 0.5 = quarto-de-tom sustenido, etc.
    const [accidentalModifier, setAccidentalModifier] = useState(0);

    const toggleMicrotonalMode = () => {
        setIsMicrotonalMode(prev => !prev);
    };

    return (
        <TuningContext.Provider value={{
            isMicrotonalMode,
            toggleMicrotonalMode,
            activeTuning,
            setActiveTuning,
            accidentalModifier,
            setAccidentalModifier
        }}>
            {children}
        </TuningContext.Provider>
    );
};