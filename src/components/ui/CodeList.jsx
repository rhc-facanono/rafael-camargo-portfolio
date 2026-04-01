import React, { useState } from "react";
import HarmonicNetwork from "./HarmonicNetwork";

// Paleta de Cores Padrão
const VINHO = "#e4a8bc";
const MARINHO = "#9fb1db";

const codeData = [
    {
        id: "tool-redes", type: "tool", toolIndex: 1,
        label: "Redes Harmônicas 3D",
        color: "#9fb1db",
        icon: <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 4" />,
        contexto: {
            pt: "Baseada na 'Tonnetz' de Euler e nas teorias de Henri Pousseur, esta ferramenta espacializa a harmonia num labirinto 3D infinito. Os eixos X, Y e Z representam distâncias intervalares, permitindo navegar por campos harmônicos de forma geometricamente simétrica.",
            en: "Based on Euler's 'Tonnetz' and Henri Pousseur's theories, this tool spatializes harmony in an infinite 3D maze. The X, Y, and Z axes represent interval distances, allowing navigation through symmetric harmonic fields.",
            es: "Basada en la 'Tonnetz' de Euler y las teorías de Henri Pousseur, esta herramienta espacializa la armonía en un laberinto 3D infinito. Los ejes representan distancias interválicas estructurales."
        },
        comoUsar: {
            pt: "Configure o intervalo de cada eixo à esquerda (em semitons ou cents, se o Modo Xenharmônico estiver ativo). Na janela 3D, segure Ctrl (ou Cmd) e clique nas esferas para selecionar notas. Exporte o resultado como MIDI ou áudio.",
            en: "Set the interval for each axis on the left (in semitones or cents). In the 3D window, hold Ctrl/Cmd and click the spheres to select notes. Export the result as MIDI or audio.",
            es: "Configure el intervalo de cada eje a la izquierda. En la ventana 3D, mantenga presionado Ctrl/Cmd y haga clic en las esferas para seleccionar notas. Exporte el resultado como MIDI."
        }
    },
    {
        id: "tool-multiplicacao", type: "tool", toolIndex: 2,
        label: "Multiplicação de Acordes",
        color: "#e4a8bc",
        icon: <rect x="4" y="4" width="16" height="16" stroke="white" strokeWidth="2" fill="none" transform="rotate(45 12 12)" />,
        contexto: {
            pt: "Técnica fundamental do serialismo integral (usada por Pierre Boulez). A Multiplicação de Acordes transpõe uma Entidade A (multiplicando) para cada nota de uma Entidade B (multiplicador), gerando complexos harmônicos densos e coerentes.",
            en: "A fundamental technique of integral serialism (used by Pierre Boulez). Chord Multiplication transposes Entity A onto every note of Entity B, generating dense, coherent harmonic complexes.",
            es: "Técnica fundamental del serialismo integral (Boulez). Transpone la Entidad A sobre cada nota de la Entidad B, generando complejos armónicos densos."
        },
        comoUsar: {
            pt: "Insira as notas da Entidade A e B usando as caixas de texto ou a partitura. Marque 'Valores Não Temperados' para multiplicar as proporções exatas em Hertz (just intonation) em vez de saltos MIDI temperados.",
            en: "Input notes for Entity A and B via text or the staff. Check 'Non-Tempered Values' to multiply exact Hertz ratios (just intonation) instead of tempered MIDI steps.",
            es: "Ingrese las notas de la Entidad A y B. Marque 'Valores No Temperados' para multiplicar proporciones exactas en Hertz en lugar de pasos MIDI."
        }
    },
    {
        id: "tool-modulos", type: "tool", toolIndex: 3,
        label: "Módulos Cíclicos",
        color: "#c0a8e4",
        icon: <path d="M12 2v20m-10-10h20" stroke="white" strokeWidth="2" strokeLinecap="round" />,
        contexto: {
            pt: "Inspirado nas escalas de transposição limitada de Olivier Messiaen e na harmonia pós-tonal. Gera padrões simétricos infinitos repetindo um intervalo gerador até fechar o ciclo da oitava ou do temperamento atual.",
            en: "Inspired by Olivier Messiaen's modes of limited transposition. Generates infinite symmetrical patterns by repeating a generating interval until the octave cycle closes.",
            es: "Inspirado en los modos de transposición limitada de Messiaen. Genera patrones simétricos infinitos repitiendo un intervalo generador."
        },
        comoUsar: {
            pt: "Insira uma pequena célula melódica (ex: C, Db, E). O sistema calculará o intervalo total da célula e a repetirá simetricamente. Use os botões 'Aproximar a Modo de Messiaen' para forçar as notas a caírem em escalas históricas.",
            en: "Input a short melodic cell. The system will repeat it symmetrically. Use the 'Snap to Messiaen Mode' buttons to force notes into historical scales.",
            es: "Ingrese una pequeña célula melódica. El sistema la repetirá simétricamente. Use los botones para ajustar las notas a los Modos de Messiaen."
        }
    },
    {
        id: "tool-projecoes", type: "tool", toolIndex: 4,
        label: "Projeções Proporcionais",
        color: "#a8e4bc",
        icon: <polygon points="12,2 22,20 2,20" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Conceito do Espectralismo. Permite expandir ou comprimir o espaço acústico de um acorde, mantendo a proporção logarítmica entre as notas. Transforma clusters densos em texturas abertas (e vice-versa) preservando a 'impressão digital' intervalar.",
            en: "A Spectralism concept. Expands or compresses the acoustic space of a chord, maintaining the logarithmic proportion between notes. Transforms dense clusters into open textures.",
            es: "Concepto del Espectralismo. Expande o comprime el espacio acústico de un acorde, manteniendo la proporción logarítmica entre las notas."
        },
        comoUsar: {
            pt: "Insira um acorde base. Use os sliders 'Min' e 'Max' para definir o novo teto e chão de frequências em Hertz. O acorde será espremido ou esticado para caber nesse novo espaço.",
            en: "Enter a base chord. Use the 'Min' and 'Max' sliders to set the new frequency boundaries in Hertz. The chord will be stretched to fit the new space.",
            es: "Ingrese un acorde base. Use los controles 'Min' y 'Max' para establecer los nuevos límites de frecuencia en Hertz."
        }
    },
    {
        id: "tool-matriz", type: "tool", toolIndex: 5,
        label: "Matriz Dodecafônica",
        color: "#e4d9a8",
        icon: <rect x="3" y="3" width="18" height="18" stroke="white" strokeWidth="2" fill="none" strokeDasharray="6 6" />,
        contexto: {
            pt: "A base do Dodecafonismo de Schoenberg. Calcula todas as permutações (Original, Retrógrado, Inversão e Retrógrado da Inversão) de uma série. O 'Modo Livre' permite expandir a matriz para microtonalismo (NxN).",
            en: "The foundation of Schoenberg's Twelve-Tone technique. Calculates all permutations of a series. The 'Free Mode' allows expanding the matrix for microtonality (NxN).",
            es: "La base del Dodecafonismo de Schoenberg. Calcula todas las permutaciones de una serie. El 'Modo Libre' permite expandir la matriz."
        },
        comoUsar: {
            pt: "Insira uma série de notas. A tabela gerará a matriz completa. Altere a visualização no menu dropdown para ver os resultados em Classes de Notas (0-11), Notas Musicais, Hertz ou Quartos de Tom.",
            en: "Enter a tone row. The table will generate the full matrix. Change the view in the dropdown to see results in Pitch Classes, Notes, Hertz, or Quarter Tones.",
            es: "Ingrese una serie de notas. Cambie la vista en el menú desplegable para ver resultados en Clases de Notas, Notas, Hertz o Cuartos de Tono."
        }
    },
    {
        id: "tool-ring", type: "tool", toolIndex: 6,
        label: "Ring Modulation",
        color: "#db9f9f",
        icon: <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Processo acústico onde duas (ou mais) frequências são multiplicadas, gerando frequências de Soma (A+B) e Diferença (|A-B|). Muito usado na música eletrônica primitiva (Stockhausen) para criar espectros inarmônicos e sons de sinos.",
            en: "Acoustic process where frequencies are multiplied, generating Sum (A+B) and Difference (|A-B|) frequencies. Widely used in early electronic music to create inharmonic, bell-like spectra.",
            es: "Proceso donde las frecuencias se multiplican, generando frecuencias de Suma y Diferencia. Muy usado para crear espectros inarmónicos."
        },
        comoUsar: {
            pt: "Insira as frequências Portadoras. Ajuste o controle 'Cascata' para definir quantas vezes o som vai se auto-modular (gerando espectros gigantescos) e use o 'Limite' para evitar travamentos do navegador.",
            en: "Enter Carrier frequencies. Adjust 'Cascade' to define how many times the sound modulates itself, and use 'Limit' to cap the results.",
            es: "Ingrese las frecuencias Portadoras. Ajuste 'Cascada' para definir la auto-modulación y use 'Límite' para controlar la cantidad de notas."
        }
    },
    {
        id: "tool-fm", type: "tool", toolIndex: 7,
        label: "Síntese FM",
        color: "#9fdbcf",
        icon: <path d="M2 12 Q 7 2, 12 12 T 22 12" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Síntese por Modulação em Frequência (John Chowning). Uma onda Moduladora altera a frequência de uma Portadora em alta velocidade, gerando bandas laterais matemáticas complexas (Sidebands = C ± kM).",
            en: "Frequency Modulation Synthesis (John Chowning). A Modulator wave alters a Carrier's frequency at high speeds, generating complex sidebands (C ± kM).",
            es: "Síntesis por Modulación de Frecuencia. Una onda Moduladora altera una Portadora, generando bandas laterales complejas."
        },
        comoUsar: {
            pt: "Defina a Portadora (C) na caixa principal e a Moduladora (M) na caixa menor. Gire o botão 'Índice (K)' para aumentar a energia da modulação, gerando mais harmônicos laterais no resultado.",
            en: "Set Carrier (C) and Modulator (M). Turn the 'Index (K)' knob to increase modulation energy, generating more sidebands.",
            es: "Defina la Portadora (C) y la Moduladora (M). Gire el botón 'Índice (K)' para generar más armónicos laterales."
        }
    },
    {
        id: "tool-add", type: "tool", toolIndex: 8,
        label: "Síntese Aditiva",
        color: "#b0b0b0",
        icon: <path d="M4 12h16M12 4v16" stroke="white" strokeWidth="2" strokeLinecap="round" />,
        contexto: {
            pt: "Baseada no Teorema de Fourier. A ferramenta projeta a Série Harmônica (projeção otonal / multiplicação) e a Série Sub-Harmônica (projeção utonal / divisão) a partir das frequências fundamentais inseridas.",
            en: "Based on Fourier's Theorem. Projects the Harmonic Series (otonal / multiplication) and Sub-Harmonic Series (utonal / division) from the fundamental frequencies.",
            es: "Basada en el Teorema de Fourier. Proyecta la Serie Armónica (otonal) y Sub-Armónica (utonal) desde las frecuencias fundamentales."
        },
        comoUsar: {
            pt: "Insira uma ou mais frequências fundamentais. Use os Knobs para decidir até qual harmônico (para cima) e sub-harmônico (para baixo) o espectro deve ser gerado.",
            en: "Enter fundamental frequencies. Use the Knobs to decide how many upper harmonics and lower subharmonics should be generated.",
            es: "Ingrese frecuencias fundamentales. Use los botones para decidir la cantidad de armónicos y sub-armónicos a generar."
        }
    },
    {
        id: "tool-costere-calc", type: "tool", toolIndex: 9,
        label: "Calculadora Costère",
        color: "#ffdd57",
        icon: <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" fill="none" strokeDasharray="2 4" />,
        contexto: {
            pt: "Física Acústica e Gravidade. Baseado nas leis matemáticas de Edmond Costère, este algoritmo mede as 'Densidades Cardinais' de um acorde. Ele revela para onde um conjunto de notas 'quer' resolver acusticamente, criando um mapa vetorial de tensão.",
            en: "Acoustic Physics and Gravity. Based on Edmond Costère's mathematical laws, this algorithm measures 'Cardinal Densities' of a chord, revealing where it acoustically 'wants' to resolve.",
            es: "Basado en las leyes de Edmond Costère, mide las 'Densidades Cardinales' de un acorde, revelando hacia dónde 'quiere' resolver acústicamente."
        },
        comoUsar: {
            pt: "Insira qualquer acorde. O painel inferior mostrará o Vetor Intervalar clássico e as Densidades Cardinais. As notas com maiores números (em verde) são os 'centros gravitacionais' para onde aquele acorde aponta.",
            en: "Enter a chord. The panel shows the Interval Vector and Cardinal Densities. Notes with higher numbers (in green) are the 'gravitational centers' of the chord.",
            es: "Ingrese un acorde. El panel muestra el Vector Interválico y las Densidades Cardinales. Los números verdes altos son los centros de gravedad."
        }
    },
    {
        id: "tool-costere-interp", type: "tool", toolIndex: 10,
        label: "Interpolação & Morphing",
        color: "#ff6b6b",
        icon: <path d="M4 12c4-8 12-8 16 0" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Algoritmos de transição morfológica de materiais sonoros. A Interpolação Logarítmica viaja em linha reta pelo espaço. A Interpolação de Costère viaja puxada pela gravidade acústica, movendo as notas para os pontos de atração do acorde final antes de chegarem ao destino.",
            en: "Morphological transition algorithms. Logarithmic travels in a straight line. Costère's Interpolation is pulled by acoustic gravity, moving notes towards the final chord's attraction points first.",
            es: "Algoritmos de transición. Logarítmica viaja en línea recta. Costère viaja tirada por la gravedad acústica hacia el acorde final."
        },
        comoUsar: {
            pt: "Defina a Entidade A (Início) e a Entidade B (Destino). Escolha Acorde ou Melodia, e o algoritmo. Mova o Slider (0% a 100%) para ver, ouvir e exportar cada passo dessa transformação no tempo.",
            en: "Set A (Start) and B (Destination). Choose Chord or Melody, and the algorithm. Move the Slider to see, hear, and export each step of the morphing.",
            es: "Defina A (Inicio) y B (Destino). Elija Acorde o Melodía y el algoritmo. Mueva el Slider para ver y escuchar cada paso."
        }
    },
    {
        id: "tool-afinacoes", type: "tool", toolIndex: 11,
        label: "Afinações & Scala",
        color: "#00ffcc",
        icon: <polygon points="12,2 22,20 2,20" stroke="white" strokeWidth="2" fill="none" strokeLinejoin="round" />,
        contexto: {
            pt: "O coração da Xenharmonia. O formato Scala (.scl) é o padrão ouro na pesquisa microtonal, permitindo a importação de milhares de afinações históricas, escalas exóticas ou temperamentos matemáticos contínuos.",
            en: "The heart of Xenharmony. The Scala format (.scl) is the gold standard in microtonal research, allowing thousands of historical or exotic tunings to be imported.",
            es: "El corazón de la Xenharmonía. El formato Scala (.scl) es el estándar de oro, permitiendo afinar la aplicación con escalas históricas o exóticas."
        },
        comoUsar: {
            pt: "Selecione um sistema de Divisão Igual (EDO) como 19, 24 ou 31, ou importe um arquivo .scl do seu PC. Ao clicar em 'Aplicar', o Toggle 'Modo Xenharmônico' será ativado, e todo o áudio e matemática do site passarão a obedecer a essa nova afinação.",
            en: "Select an EDO or import a .scl file. Click 'Apply' to activate Xenharmonic Mode. All audio and math in the app will now obey this new tuning.",
            es: "Seleccione un EDO o importe un archivo .scl. Haga clic en 'Aplicar' para activar el Modo Xenharmónico en toda la aplicación."
        }
    }
];

function getCardStyles(color, isActive) {
    let bg = isActive ? color : "#2A2A2A";
    let border = isActive ? `2px solid ${color}` : "2px solid #444";
    let textColor = isActive ? "#fff" : color;
    return { background: bg, color: textColor, border };
}

export default function CodeList({ language = "pt" }) {
    const [selected, setSelected] = useState(codeData[0]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {/* ÁREA DA FERRAMENTA SELECIONADA */}
            {selected && (
                <div style={{
                    background: "#181818",
                    borderRadius: 16,
                    boxShadow: "0 8px 32px 0 rgba(0,0,0,0.4)",
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center"
                }}>
                    <div style={{ fontWeight: 800, fontSize: 24, color: selected.color, marginBottom: 16, textTransform: "uppercase", letterSpacing: "1px" }}>
                        {selected.label}
                    </div>

                    {selected.type === "tool" && (
                        <div style={{ width: "100%", height: "75vh", minHeight: 550, borderRadius: 12, overflow: "hidden", border: `1px solid ${selected.color}44` }}>
                            <HarmonicNetwork activeTool={selected.toolIndex} themeColor={selected.color} />
                        </div>
                    )}

                    {/* EXPLICAÇÕES DESLOCADAS PARA BAIXO */}
                    <div style={{ width: "100%", background: "#222", borderRadius: 12, padding: 24, marginTop: 20, borderLeft: `4px solid ${selected.color}` }}>
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{ color: selected.color, fontSize: 14, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Motivação & Teoria</h3>
                            <p style={{ color: "#ccc", fontSize: 14, lineHeight: "1.6" }}>{selected.contexto[language]}</p>
                        </div>
                        <div>
                            <h3 style={{ color: "#00ffcc", fontSize: 14, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Como Usar</h3>
                            <p style={{ color: "#ccc", fontSize: 14, lineHeight: "1.6" }}>{selected.comoUsar[language]}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* LISTA DE FERRAMENTAS (MINIATURAS) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                {codeData.map((item) => {
                    const isActive = selected && selected.id === item.id;
                    const cardStyles = getCardStyles(item.color, isActive);
                    return (
                        <div
                            key={item.id}
                            style={{
                                ...cardStyles,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 12,
                                padding: "20px 10px",
                                cursor: isActive ? "default" : "pointer",
                                opacity: isActive ? 1 : 0.8,
                                transform: isActive ? "translateY(-4px)" : "none",
                                transition: "all 0.2s ease"
                            }}
                            onClick={() => !isActive && setSelected(item)}
                        >
                            <svg width="32" height="32" viewBox="0 0 24 24" style={{ marginBottom: 12, stroke: isActive ? "#fff" : item.color }}>
                                {item.icon}
                            </svg>
                            <div style={{ fontWeight: 700, fontSize: 14, textAlign: "center" }}>
                                {item.label}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}