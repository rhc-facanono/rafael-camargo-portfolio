import React from 'react';

// === TABELA DE COMAS HEJI (Fonte HEJI2) COMPLETA ===
const HEJI_COMMAS = [
    { name: '47-up', cents: 42.0, char: '', limit: 47 },
    { name: '47-down', cents: -42.0, char: '', limit: 47 },
    { name: '43-up', cents: 39.0, char: 'è', limit: 43 },
    { name: '43-down', cents: -39.0, char: 'é', limit: 43 },
    { name: '41-up', cents: 37.0, char: '-', limit: 41 },
    { name: '41-down', cents: -37.0, char: '+', limit: 41 },
    { name: '37-up', cents: 33.0, char: 'à', limit: 37 },
    { name: '37-down', cents: -33.0, char: 'á', limit: 37 },
    { name: '31-up', cents: 45.0, char: '1', limit: 31 },
    { name: '31-down', cents: -45.0, char: '8', limit: 31 },
    { name: '29-up', cents: 48.0, char: '7', limit: 29 },
    { name: '29-down', cents: -48.0, char: '2', limit: 29 },
    { name: '23-up', cents: 50.0, char: '6', limit: 23 },
    { name: '23-down', cents: -50.0, char: '3', limit: 23 },
    { name: '19-up', cents: 14.22, char: '/', limit: 19 },
    { name: '19-down', cents: -14.22, char: '*', limit: 19 },
    { name: '17-up', cents: 10.06, char: ';', limit: 17 },
    { name: '17-down', cents: -10.06, char: ':', limit: 17 },
    { name: '13-up', cents: 65.34, char: '9', limit: 13 },
    { name: '13-down', cents: -65.34, char: '0', limit: 13 },
    { name: '11-up', cents: 53.27, char: '4', limit: 11 },
    { name: '11-down', cents: -53.27, char: '5', limit: 11 },
    { name: '7-up', cents: 27.26, char: '>', limit: 7 },
    { name: '7-down', cents: -27.26, char: '<', limit: 7 },
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
            let baseChar = (acc === 'sharp') ? 'v' : (acc === 'flat' ? 'E' : 'e');

            let bestComma = HEJI_COMMAS.reduce((prev, curr) =>
                Math.abs(curr.cents - centsDev) < Math.abs(prev.cents - centsDev) ? curr : prev
            );

            if (Math.abs(bestComma.cents - centsDev) < 15 && Math.abs(centsDev) > 3) {
                if (bestComma.limit === 5) {
                    if (acc === 'sharp') char = (centsDev > 0) ? 'w' : 'u';
                    else if (acc === 'flat') char = (centsDev > 0) ? 'F' : 'D';
                    else char = (centsDev > 0) ? 'f' : 'd';
                } else {
                    char = baseChar + bestComma.char;
                }
            } else {
                char = baseChar;
            }
            yOffset = 11;
        }
        // --- LÓGICA SAGITTAL ATENIENSE ---
        else if (system === 'sagittal') {
            font = "Bravura";
            const absCents = Math.abs(centsDev);

            let bestSag = SAGITTAL_ATHENIAN.reduce((prev, curr) =>
                Math.abs(curr.cents - absCents) < Math.abs(prev.cents - absCents) ? curr : prev
            );

            if (absCents > 1.5) {
                if (centsDev < 0) {
                    if (bestSag.char === '\uE3F8') char = '\uE3F9';
                    else if (bestSag.char === '\uE3F2') char = '\uE3F3';
                    else if (bestSag.char === '\uE3F6') char = '\uE3F7';
                    else if (bestSag.char === '\uE3F4') char = '\uE3F5';
                    else char = bestSag.char;
                } else {
                    char = bestSag.char;
                }
            } else {
                char = '\uE261';
            }
            yOffset = 0;
        }
        // --- NOTAÇÃO EXATA EM CENTS ---
        else if (system === 'cents') {
            font = "Bravura";
            if (acc === 'sharp') char = '\uE262';
            else if (acc === 'flat') char = '\uE260';
            else char = '\uE261';
        }
        // --- QUARTOS DE TOM (24-EDO) ---
        else if (system === 'quarter') {
            font = "Bravura";
            xOffset = -25;
            if (acc === 'sharp') {
                if (centsDev < -20) char = '\uE282';
                else if (centsDev > 20) char = '\uE283';
                else char = '\uE262';
            } else if (acc === 'flat') {
                if (centsDev > 20) char = '\uE280';
                else if (centsDev < -20) char = '\uE281';
                else char = '\uE260';
            } else {
                if (centsDev > 20) char = '\uE282';
                else if (centsDev < -20) char = '\uE280';
                else char = '\uE261';
            }
        }
        // --- SEXTOS DE TOM (36-EDO / Setas de Gould) ---
        else if (system === 'sixth') {
            font = "Bravura";
            xOffset = -22;
            if (acc === 'sharp') {
                if (centsDev > 16) char = '\uE275';
                else if (centsDev < -16) char = '\uE274';
                else char = '\uE262';
            } else if (acc === 'flat') {
                if (centsDev > 16) char = '\uE271';
                else if (centsDev < -16) char = '\uE270';
                else char = '\uE260';
            } else {
                if (centsDev > 16) char = '\uE273';
                else if (centsDev < -16) char = '\uE272';
                else char = '\uE261';
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
