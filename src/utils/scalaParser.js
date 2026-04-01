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