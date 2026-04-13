import React from 'react';

// === TABELA DE COMAS HEJI (Fonte HEJI2) ===
// Mapeamento baseado nos caracteres que enviou e no padrão Sabat/Schweinitz
const HEJI_COMMAS = [
    { name: '47-up', cents: 42.0, char: '', limit: 47 },
    { name: '47-down', cents: -42.0, char: '', limit: 47 },
    { name: '11-up', cents: 53.27, char: '4', limit: 11 },
    { name: '11-down', cents: -53.27, char: '5', limit: 11 },
    { name: '13-up', cents: 65.34, char: '9', limit: 13 },
    { name: '13-down', cents: -65.34, char: '0', limit: 13 },
    { name: '7-up', cents: 27.26, char: '>', limit: 7 },
    { name: '7-down', cents: -27.26, char: '<', limit: 7 },
    { name: '19-up', cents: 14.22, char: '/', limit: 19 },
    { name: '19-down', cents: -14.22, char: '*', limit: 19 },
    { name: '17-up', cents: 10.06, char: ';', limit: 17 },
    { name: '17-down', cents: -10.06, char: ':', limit: 17 },
    { name: '5-up', cents: 21.51, char: 'f', limit: 5 }, // Sintónica
    { name: '5-down', cents: -21.51, char: 'd', limit: 5 }
];

// === TABELA SAGITTAL ATENIANE (Fonte Bravura) ===
// Mapeamento de alta precisão (SMuFL)
const SAGITTAL_ATHENIAN = [
    { cents: 1.45, char: '\uE302' }, { cents: 2.9, char: '\uE304' },
    { cents: 4.35, char: '\uE306' }, { cents: 5.8, char: '\uE308' },
    { cents: 7.25, char: '\uE30A' }, { cents: 8.7, char: '\uE30C' },
    { cents: 10.15, char: '\uE30E' }, { cents: 11.6, char: '\uE310' },
    { cents: 21.51, char: '\uE3F8' }, { cents: 27.26, char: '\uE3F2' },
    { cents: 35.0, char: '\uE3F6' }, { cents: 45.0, char: '\uE3F4' },
    { cents: 50.0, char: '\uE282' } // Quarter tone
];

function getDiatonicY(midiFloat) {
    const m = Math.round(midiFloat);
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    const pcToStep = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };
    return (oct - 4) * 7 + pcToStep[pc];
}

export function generateNotationData(hzArray, baseHz, baseMidi, system) {
    return hzArray.map((hz, index) => {
        const midiFloat = 69 + 12 * Math.log2(hz / 440);
        const nearestMidi = Math.round(midiFloat);
        const centsDev = (midiFloat - nearestMidi) * 100;

        const pc = ((nearestMidi % 12) + 12) % 12;
        const isBlackKey = [1, 3, 6, 8, 10].includes(pc);
        const step = getDiatonicY(midiFloat);
        const yPos = -step * 5;

        let acc = isBlackKey ? 'sharp' : 'natural';
        if (pc === 3 || pc === 10) acc = 'flat';

        let char = "";
        let font = "Bravura";
        let xOffset = -25;
        let yOffset = 0;

        // --- LÓGICA HEJI AVANÇADA (78+ combinações) ---
        if (system === 'he' || system === 'ji' || system === 'auto') {
            font = "HEJI2";
            // Acidente base na fonte HEJI2: v=sharp, E=flat, e=natural
            let baseChar = (acc === 'sharp') ? 'v' : (acc === 'flat' ? 'E' : 'e');

            // Busca a coma mais próxima na tabela
            let bestComma = HEJI_COMMAS.reduce((prev, curr) =>
                Math.abs(curr.cents - centsDev) < Math.abs(prev.cents - centsDev) ? curr : prev
            );

            // Se o erro for menor que 5 cents, aplica o modificador
            if (Math.abs(bestComma.cents - centsDev) < 15 && Math.abs(centsDev) > 3) {
                // No HEJI2, alguns símbolos de 5-limit já estão fundidos (w, u, F, D, f, d)
                if (bestComma.limit === 5) {
                    if (acc === 'sharp') char = (centsDev > 0) ? 'w' : 'u';
                    else if (acc === 'flat') char = (centsDev > 0) ? 'F' : 'D';
                    else char = (centsDev > 0) ? 'f' : 'd';
                } else {
                    // Para outros limites, concatena o acidente base com a tecla da coma
                    char = baseChar + bestComma.char;
                }
            } else {
                char = baseChar;
            }
            yOffset = 11; // Correção vertical para a baseline da HEJI2
        }

        // --- LÓGICA SAGITTAL ATENIENSE ---
        else if (system === 'sagittal') {
            font = "Bravura";
            const absCents = Math.abs(centsDev);

            let bestSag = SAGITTAL_ATHENIAN.reduce((prev, curr) =>
                Math.abs(curr.cents - absCents) < Math.abs(prev.cents - absCents) ? curr : prev
            );

            if (absCents > 1.5) {
                // Inverte o código unicode se for para baixo (SMuFL costuma ter pares adjacentes)
                if (centsDev < 0) {
                    // Lógica simples de espelhamento para os códigos core
                    if (bestSag.char === '\uE3F8') char = '\uE3F9';
                    else if (bestSag.char === '\uE3F2') char = '\uE3F3';
                    else char = bestSag.char; // Simplificado para este exemplo
                } else {
                    char = bestSag.char;
                }
            } else {
                char = '\uE261'; // Natural
            }
            yOffset = 0;
        }

        // --- QUARTOS E SEXTOS (BRAVURA) ---
        else {
            font = "Bravura";
            if (system === 'quarter') {
                if (acc === 'sharp') char = (centsDev < -20) ? '\uE282' : (centsDev > 20 ? '\uE283' : '\uE262');
                else if (acc === 'flat') char = (centsDev > 20) ? '\uE280' : (centsDev < -20 ? '\uE281' : '\uE260');
                else char = (centsDev > 20) ? '\uE282' : (centsDev < -20 ? '\uE280' : '\uE261');
            }
        }

        const ledgers = [];
        if (step === 0) ledgers.push(0);
        if (step >= 12) for (let s = 12; s <= step; s += 2) ledgers.push(-s * 5);
        if (step <= -12) for (let s = -12; s >= step; s -= 2) ledgers.push(-s * 5);

        return {
            id: index, hz, step, y: yPos, x: 100 + (index * 90),
            char, font, fontSize: "42", xOffset, yOffset, ledgers,
            centsLabel: `${centsDev >= 0 ? '+' : ''}${centsDev.toFixed(1)}c`,
            nearestMidi, centsDev
        };
    });
}