// src/utils/scalaParser.js

export function parseScalaFile(fileContent) {
    const lines = fileContent.split('\n');
    const scale = [];
    let description = "";
    let numNotes = 0;
    let readNotes = 0;

    for (let line of lines) {
        // Remove espaços extras e ignora comentários (linhas que começam com !)
        line = line.trim();
        if (!line || line.startsWith('!')) continue;

        if (!description) {
            description = line;
            continue;
        }
        if (!numNotes) {
            numNotes = parseInt(line, 10);
            continue;
        }

        if (readNotes < numNotes) {
            // Se tem ponto, é um valor em CENTS
            if (line.includes('.')) {
                const cents = parseFloat(line);
                const ratio = Math.pow(2, cents / 1200);
                scale.push({ type: 'cents', value: cents, cents: cents, ratio: ratio });
            }
            // Se tem barra, é uma FRAÇÃO PURA (Just Intonation)
            else if (line.includes('/')) {
                const [num, den] = line.split('/').map(n => parseInt(n, 10));
                const ratio = num / den;
                const cents = 1200 * Math.log2(ratio);
                scale.push({ type: 'ratio', value: ratio, ratioStr: line, cents: cents, ratio: ratio });
            }
            // Se for apenas um número inteiro, é tratado como um harmônico
            else {
                const ratio = parseInt(line, 10);
                const cents = 1200 * Math.log2(ratio);
                scale.push({ type: 'ratio', value: ratio, ratioStr: line, cents: cents, ratio: ratio });
            }
            readNotes++;
        }
    }
    return { description, numNotes, scale };
}

// Gera rapidamente os passos de um temperamento igual (EDO)
export function generateEdoScale(divisions) {
    const scale = [];
    const stepSize = 1200 / divisions;
    // Pula a tônica (grau 0) pois ela já é subentendida no Scala
    for (let i = 1; i <= divisions; i++) {
        const cents = i * stepSize;
        const ratio = Math.pow(2, cents / 1200);
        scale.push({ type: 'edo', cents: cents, ratio: ratio });
    }
    return scale;
}
// ==========================================
// PARSER PARA CAIXA DE TEXTO LIVRE (JI, Cents, N\M)
// ==========================================
export function parseCustomTuning(text) {
    // Permite separar os valores por quebra de linha, vírgula ou ponto e vírgula
    const lines = text.split(/[\n,;]+/);
    const scale = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.includes('\\')) {
            // Notação EDO / Step (ex: 7\19) -> 7 passos de 19-EDO
            const parts = line.split('\\');
            const n = parseFloat(parts[0]);
            const m = parseFloat(parts[1]);
            if (m) {
                const cents = (n / m) * 1200;
                const ratio = Math.pow(2, cents / 1200);
                scale.push({ type: 'edo-step', cents: cents, ratio: ratio, original: line });
            }
        } else if (line.includes('.')) {
            // Notação Cents (ex: 701.955)
            const cents = parseFloat(line);
            const ratio = Math.pow(2, cents / 1200);
            scale.push({ type: 'cents', cents: cents, ratio: ratio, original: line });
        } else if (line.includes('/')) {
            // Notação Fração / Just Intonation (ex: 3/2)
            const parts = line.split('/');
            const num = parseFloat(parts[0]);
            const den = parseFloat(parts[1]);
            if (den) {
                const ratio = num / den;
                const cents = 1200 * Math.log2(ratio);
                scale.push({ type: 'ratio', cents: cents, ratio: ratio, original: line });
            }
        } else {
            // Se for apenas um número inteiro (ex: 3), trata como harmônico puro (3/1)
            const num = parseInt(line, 10);
            if (!isNaN(num)) {
                const cents = 1200 * Math.log2(num);
                scale.push({ type: 'harmonic', cents: cents, ratio: num, original: line });
            }
        }
    }

    return {
        description: "Afinação Customizada (JI/Mista)",
        numNotes: scale.length,
        scale: scale
    };
}