// src/utils/costere.js

// 1. Calcula os 5 atratores de Costère (Módulo 12)
export function getCardinalAttractors(note) {
    const pc = ((Math.round(note) % 12) + 12) % 12;
    return [
        pc,                  // Própria nota
        (pc + 7) % 12,       // 5ª Justa Asc
        (pc + 5) % 12,       // 5ª Justa Desc
        (pc + 1) % 12,       // 2ª Menor Asc
        (pc + 11) % 12       // 2ª Menor Desc
    ];
}

// 2. Tabela de Densidades (Analisa uma coleção)
export function calculateCardinalDensity(collection) {
    const pcs = collection.map(n => ((Math.round(n) % 12) + 12) % 12);
    const densities = new Array(12).fill(0);

    for (let i = 0; i < 12; i++) {
        const attractors = getCardinalAttractors(i);
        let score = 0;
        attractors.forEach(attractor => {
            if (pcs.includes(attractor)) score++;
        });
        densities[i] = score;
    }
    return densities;
}

// 3. Vetor Intervalar (Teoria dos Conjuntos)
export function getIntervalVector(collection) {
    const pcs = [...new Set(collection.map(n => ((Math.round(n) % 12) + 12) % 12))];
    const vector = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < pcs.length; i++) {
        for (let j = i + 1; j < pcs.length; j++) {
            let diff = Math.abs(pcs[i] - pcs[j]) % 12;
            if (diff > 6) diff = 12 - diff;
            if (diff > 0) vector[diff - 1]++;
        }
    }
    return vector;
}

// 4. Interpolação Logarítmica (Geométrica Reta)
export function interpolateLogarithmic(colA, colB, steps = 10) {
    const frames = [];
    const maxLen = Math.max(colA.length, colB.length);
    const a = [...colA, ...Array(maxLen - colA.length).fill(colA[colA.length - 1] || 60)];
    const b = [...colB, ...Array(maxLen - colB.length).fill(colB[colB.length - 1] || 60)];

    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const currentFrame = a.map((noteA, idx) => Math.round(noteA + (b[idx] - noteA) * t));
        frames.push([...new Set(currentFrame)]);
    }
    return frames;
}

// 5. Interpolação de Costère (Gravitacional)
export function interpolateCostere(colA, colB, steps = 10) {
    const targetDensities = calculateCardinalDensity(colB);
    const targetPCs = colB.map(n => ((Math.round(n) % 12) + 12) % 12);
    const frames = [];

    let currentCollection = [...colA];
    frames.push([...currentCollection]);

    for (let step = 1; step <= steps; step++) {
        const nextCollection = currentCollection.map(note => {
            const pc = ((Math.round(note) % 12) + 12) % 12;
            if (targetPCs.includes(pc)) return note; // Já está numa nota alvo

            const upPC = (pc + 1) % 12;
            const downPC = (pc + 11) % 12;

            if (targetDensities[upPC] > targetDensities[downPC]) return note + 1;
            else if (targetDensities[downPC] > targetDensities[upPC]) return note - 1;
            else return note + (Math.random() > 0.5 ? 1 : -1); // Desempate
        });
        currentCollection = nextCollection;
        frames.push([...new Set(currentCollection)]);
    }
    return frames;
}