// src/utils/interpolationEngines.js
import { calculateCardinalDensity } from './costere';

// Interpolação Logarítmica (Matemática/Espacial Reta)
// Faz uma transição linear simples entre a Coleção A e a Coleção B
export function interpolateLogarithmic(collectionA, collectionB, steps = 10) {
    const frames = [];
    const maxLen = Math.max(collectionA.length, collectionB.length);

    // Preenche com a última nota se tamanhos forem diferentes
    const a = [...collectionA, ...Array(maxLen - collectionA.length).fill(collectionA[collectionA.length - 1] || 0)];
    const b = [...collectionB, ...Array(maxLen - collectionB.length).fill(collectionB[collectionB.length - 1] || 0)];

    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const currentFrame = a.map((noteA, index) => {
            const noteB = b[index];
            // Interpolação linear simples (arredondada para o passo mais próximo)
            return Math.round(noteA + (noteB - noteA) * t);
        });
        frames.push([...new Set(currentFrame)]); // Remove duplicatas
    }
    return frames;
}

// Interpolação de Costère (Gravitacional) adaptada para EDOs
// As notas são "puxadas" em direção aos pontos de maior densidade do alvo
export function interpolateCostere(collectionA, collectionB, steps = 10, edoDivisions = 12) {
    const targetDensities = calculateCardinalDensity(collectionB, edoDivisions);
    const frames = [];

    let currentCollection = [...collectionA];
    frames.push([...currentCollection]);

    for (let step = 1; step <= steps; step++) {
        const nextCollection = currentCollection.map(note => {
            if (collectionB.includes(note)) return note; // Já chegou no alvo

            // Procura vizinhos no sistema de afinação (acima ou abaixo)
            const up = ((note + 1) % edoDivisions + edoDivisions) % edoDivisions;
            const down = ((note - 1) % edoDivisions + edoDivisions) % edoDivisions;

            if (targetDensities[up] > targetDensities[down]) {
                return note + 1; // Puxado para cima
            } else if (targetDensities[down] > targetDensities[up]) {
                return note - 1; // Puxado para baixo
            } else {
                // Desempate: move na direção geométrica do alvo mais próximo
                const targetAvg = collectionB.reduce((a, b) => a + b, 0) / collectionB.length;
                return note < targetAvg ? note + 1 : note - 1;
            }
        });

        currentCollection = nextCollection;
        frames.push([...new Set(currentCollection)]);
    }
    return frames;
}