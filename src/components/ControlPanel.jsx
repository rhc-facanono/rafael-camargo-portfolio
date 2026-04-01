// src/components/ControlPanel.jsx
import React, { useState } from 'react';
import { calculateCardinalDensity, getIntervalVector } from '../utils/costereMath';
import { interpolateLogarithmic, interpolateCostere } from '../utils/interpolationEngines';

export default function ControlPanel({ onUpdateNotes }) {
    const [activeTab, setActiveTab] = useState('calculadora');
    const [mode, setMode] = useState('acorde'); // 'acorde' ou 'melodia'

    const [sourceInput, setSourceInput] = useState('0,4,7'); // Ex: Dó Maior
    const [targetInput, setTargetInput] = useState('5,9,0'); // Ex: Fá Maior

    const [analysisResult, setAnalysisResult] = useState(null);

    const parseInput = (str) => str.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));

    const handleCalculate = () => {
        const source = parseInput(sourceInput);
        const target = parseInput(targetInput);

        if (activeTab === 'calculadora') {
            const densities = calculateCardinalDensity(source);
            const vector = getIntervalVector(source);
            setAnalysisResult({ densities, vector });
            onUpdateNotes(source); // Atualiza o visualizador com a fonte
        }
        else if (activeTab === 'logaritmica') {
            const frames = interpolateLogarithmic(source, target, 10);
            playFrames(frames);
        }
        else if (activeTab === 'costere') {
            const frames = interpolateCostere(source, target, 10);
            playFrames(frames);
        }
    };

    // Função simples para tocar a animação frame a frame
    const playFrames = (frames) => {
        let currentFrame = 0;
        const interval = setInterval(() => {
            // Se for melodia, mostra uma nota por vez do frame. Se for acorde, mostra todas.
            if (mode === 'melodia') {
                onUpdateNotes([frames[currentFrame][0]]); // Simplificado para o exemplo
            } else {
                onUpdateNotes(frames[currentFrame]);
            }

            currentFrame++;
            if (currentFrame >= frames.length) clearInterval(interval);
        }, 300); // 300ms por passo
    };

    // Estilos inline básicos para garantir que funciona em qualquer projeto
    const tabStyle = (tabName) => ({
        padding: '10px 20px',
        cursor: 'pointer',
        backgroundColor: activeTab === tabName ? '#4CAF50' : '#ddd',
        color: activeTab === tabName ? 'white' : 'black',
        border: 'none',
        outline: 'none'
    });

    return (
        <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px', marginBottom: '20px' }}>
            {/* Abas */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                <button style={tabStyle('calculadora')} onClick={() => setActiveTab('calculadora')}>Calc. Costère</button>
                <button style={tabStyle('logaritmica')} onClick={() => setActiveTab('logaritmica')}>Interp. Logarítmica</button>
                <button style={tabStyle('costere')} onClick={() => setActiveTab('costere')}>Interp. Costère</button>
            </div>

            {/* Seletor Acorde/Melodia */}
            {activeTab !== 'calculadora' && (
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ marginRight: '15px' }}>
                        <input type="radio" checked={mode === 'acorde'} onChange={() => setMode('acorde')} /> Acordes Simultâneos
                    </label>
                    <label>
                        <input type="radio" checked={mode === 'melodia'} onChange={() => setMode('melodia')} /> Melodias (Set-Theory)
                    </label>
                </div>
            )}

            {/* Inputs */}
            <div style={{ marginBottom: '15px' }}>
                <div>
                    <label>Coleção Fonte (notas separadas por vírgula): </label>
                    <input value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} placeholder="0,4,7" />
                </div>
                {activeTab !== 'calculadora' && (
                    <div style={{ marginTop: '10px' }}>
                        <label>Coleção Alvo (notas separadas por vírgula): </label>
                        <input value={targetInput} onChange={(e) => setTargetInput(e.target.value)} placeholder="5,9,0" />
                    </div>
                )}
            </div>

            <button onClick={handleCalculate} style={{ padding: '10px 20px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {activeTab === 'calculadora' ? 'Analisar' : 'Iniciar Interpolação'}
            </button>

            {/* Resultado da Calculadora */}
            {activeTab === 'calculadora' && analysisResult && (
                <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#fff', border: '1px solid #ddd' }}>
                    <h4>Resultados Analíticos:</h4>
                    <p><strong>Vetor Intervalar:</strong> [{analysisResult.vector.join(', ')}]</p>
                    <p><strong>Densidades Cardinais (Dó a Si):</strong> {analysisResult.densities.join(', ')}</p>
                </div>
            )}
        </div>
    );
}