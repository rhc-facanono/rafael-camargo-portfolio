// src/utils/costere.js

// Função auxiliar para encontrar o número de passos de um intervalo em cents
export function getStepFromCents(cents, edoDivisions) {
    return Math.round((cents / 1200) * edoDivisions);
}

// 1. Calcula os 5 atratores de Costère dinamicamente para qualquer EDO
export function getCardinalAttractors(note, edoDivisions = 12) {
    // Garante que o número fique positivo e dentro do limite do EDO
    const pc = ((Math.round(note) % edoDivisions) + edoDivisions) % edoDivisions;

    // O atrator principal é a quinta (aprox 702 cents da Entonação Justa)
    const fifthStep = getStepFromCents(702, edoDivisions);

    return [
        pc,                                                // Própria nota
        (pc + fifthStep) % edoDivisions,                   // Quinta Ascendente
        (pc - fifthStep + edoDivisions) % edoDivisions,    // Quinta Descendente
        (pc + 1) % edoDivisions,                           // Vizinho Ascendente (+1 passo)
        (pc - 1 + edoDivisions) % edoDivisions             // Vizinho Descendente (-1 passo)
    ];
}

// 2. Tabela de Densidades (Analisa uma coleção em N-EDO)
export function calculateCardinalDensity(collection, edoDivisions = 12) {
    const pcs = collection.map(n => ((Math.round(n) % edoDivisions) + edoDivisions) % edoDivisions);
    // Cria um array vazio com o tamanho do sistema de afinação atual
    const densities = new Array(edoDivisions).fill(0);

    for (let i = 0; i < edoDivisions; i++) {
        const attractors = getCardinalAttractors(i, edoDivisions);
        let score = 0;
        attractors.forEach(attractor => {
            if (pcs.includes(attractor)) score++;
        });
        densities[i] = score;
    }
    return densities;
}

// 3. Vetor Intervalar (Teoria dos Conjuntos Expandida)
export function getIntervalVector(collection, edoDivisions = 12) {
    const pcs = [...new Set(collection.map(n => ((Math.round(n) % edoDivisions) + edoDivisions) % edoDivisions))];

    // Em 12-TET o vetor tem 6 posições (12/2). Em N-EDO, será N/2 (arredondado para baixo)
    const maxInterval = Math.floor(edoDivisions / 2);
    const vector = new Array(maxInterval).fill(0);

    for (let i = 0; i < pcs.length; i++) {
        for (let j = i + 1; j < pcs.length; j++) {
            let diff = Math.abs(pcs[i] - pcs[j]) % edoDivisions;
            if (diff > maxInterval) diff = edoDivisions - diff;
            if (diff > 0) vector[diff - 1]++;
        }
    }
    return vector;
}