// Geometria da pauta: Dó Central (C4) = 0.
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

        // Configurações Padrão para a Bravura SMuFL
        let char = "";
        let font = "Bravura, Times New Roman, serif";
        let fontSize = "44";
        let xOffset = -22;
        let yOffset = 0;

        // ROTEADOR DE UNICODES (SMuFL Oficial)
        if (system === 'cents') {
            if (acc === 'sharp') char = '\uE262'; // ♯
            else if (acc === 'flat') char = '\uE260'; // ♭
            else char = '\uE261'; // ♮
        }
        else if (system === 'quarter') {
            // Quartos de Tom Oficiais (Stein-Zimmermann)
            xOffset = -24; // Mais espaço para símbolos duplos
            if (acc === 'sharp') {
                if (centsDev < -25) char = '\uE282'; // Meio Sustenido (1 haste)
                else if (centsDev > 25) char = '\uE283'; // Sustenido e meio (3 hastes)
                else char = '\uE262';
            } else if (acc === 'flat') {
                if (centsDev > 25) char = '\uE280'; // Meio bemol (d invertido)
                else if (centsDev < -25) char = '\uE281'; // Bemol e meio (db)
                else char = '\uE260';
            } else {
                if (centsDev > 25) char = '\uE282';
                else if (centsDev < -25) char = '\uE280';
                else char = '\uE261';
            }
        }
        else if (system === 'sixth') {
            // Sextos de Tom Oficiais (Gould Arrows)
            if (acc === 'sharp') {
                if (centsDev > 16) char = '\uE27B'; // ♯ seta cima
                else if (centsDev < -16) char = '\uE27C'; // ♯ seta baixo
                else char = '\uE262';
            } else if (acc === 'flat') {
                if (centsDev > 16) char = '\uE276'; // ♭ seta cima
                else if (centsDev < -16) char = '\uE277'; // ♭ seta baixo
                else char = '\uE260';
            } else {
                if (centsDev > 16) char = '\uE278'; // ♮ seta cima
                else if (centsDev < -16) char = '\uE279'; // ♮ seta baixo
                else char = '\uE261';
            }
        }
        else if (system === 'sagittal') {
            // Sagittal Oficial (A Coma-5 em arco bonito)
            xOffset = -20;
            if (centsDev > 10) char = '\uE3F8'; // Coma 5 Up (arco)
            else if (centsDev < -10) char = '\uE3F9'; // Coma 5 Down (arco)
            else char = '\uE261'; // Bequadro clássico
        }
        else if (system === 'he' || system === 'auto' || system === 'ji') {
            // Helmholtz-Ellis usando a HEJI2 nativa
            font = "HEJI2, Times New Roman, serif";
            fontSize = "34";
            yOffset = 10;
            xOffset = -22;

            if (centsDev > 10) {
                if (acc === 'sharp') char = "w";
                else if (acc === 'flat') char = "F";
                else char = "f";
            } else if (centsDev < -10) {
                if (acc === 'sharp') char = "u";
                else if (acc === 'flat') char = "D";
                else char = "d";
            } else {
                if (acc === 'sharp') char = "v";
                else if (acc === 'flat') char = "E";
                else char = "e";
            }
        }

        // Linhas suplementares (Ledger lines)
        const ledgers = [];
        if (step === 0) ledgers.push(0);
        if (step >= 12) for (let s = 12; s <= step; s += 2) ledgers.push(-s * 5);
        if (step <= -12) for (let s = -12; s >= step; s -= 2) ledgers.push(-s * 5);

        return {
            id: index,
            hz: hz,
            step: step,
            y: yPos,
            x: 100 + (index * 85),
            char: char,
            font: font,
            fontSize: fontSize,
            xOffset: xOffset,
            yOffset: yOffset,
            ledgers: ledgers,
            centsLabel: `${centsDev >= 0 ? '+' : ''}${centsDev.toFixed(1)}c`,
            nearestMidi: nearestMidi,
            centsDev: centsDev
        };
    });
}