import React, { useState } from "react";
import HarmonicNetwork from "./HarmonicNetwork";

// Paleta de Cores Padrão
const VINHO = "#e4a8bc";
const MARINHO = "#9fb1db";

const codeData = [
    {
        id: "tool-redes", type: "tool", toolIndex: 1,
        label: "Redes Harmônicas",
        color: MARINHO,
        icon: <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 4" />,
        contexto: {
            pt: "Desenvolvida a partir da teoria de Henri Pousseur, esta ferramenta espacializa a harmonia num labirinto 3D infinito. Os eixos (X, Y, Z) representam distâncias intervalares estruturais (como 5ªs, 8vas e 3ªs), permitindo navegar por campos harmônicos de forma puramente simétrica.",
            en: "Based on Henri Pousseur's theory, this tool spatializes harmony in an infinite 3D maze. The axes (X, Y, Z) represent structural interval distances, allowing navigation through harmonic fields symmetrically.",
            es: "Basada en la teoría de Henri Pousseur, esta herramienta espacializa la armonía en un laberinto 3D infinito. Los ejes representan distancias interválicas estructurales."
        },
        comoUsar: {
            pt: "Configure o intervalo de cada eixo à esquerda. Na janela 3D, faça Cmd+Clique (Mac) ou Ctrl+Clique (Win) nas esferas para selecionar as notas e formar o seu acorde base. Use Alt+Arraste para mover a câmara.",
            en: "Configure the interval for each axis. In the 3D window, Cmd+Click (Mac) or Ctrl+Click (Win) on the spheres to select notes. Alt+Drag to pan the camera.",
            es: "Configure el intervalo para cada eje. En la ventana 3D, presione Cmd+Clic (Mac) o Ctrl+Clic (Win) en las esferas para seleccionar notas. Alt+Arrastrar para mover la cámara."
        }
    },
    {
        id: "tool-boulez", type: "tool", toolIndex: 2,
        label: "Multiplicação de Acordes",
        color: VINHO,
        icon: <path d="M4 4h6v6H4zm10 10h6v6h-6zM10 10l4 4" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Técnica serial do compositor Pierre Boulez. O Acorde B atua como um 'filtro estrutural' ou espelho: o algoritmo transpõe o Acorde A inteiro a partir de cada uma das notas do Acorde B, fundindo os resultados num único bloco denso de alta densidade espectral.",
            en: "Serial technique by Pierre Boulez. Chord B acts as a structural filter, transposing Chord A onto every note of Chord B, creating a dense spectral block.",
            es: "Técnica serial de Pierre Boulez. El Acorde B actúa como un filtro estructural que transpone el Acorde A a partir de cada nota del Acorde B."
        },
        comoUsar: {
            pt: "Insira notas na Entidade A e B separadas por vírgula (ex: 60, 64, 67). Para operar na vanguarda acústica, marque 'Valores Não Temperados' e digite notas com microtons, como C+4 (quarto de tom) ou diretamente em Hertz (ex: 440Hz).",
            en: "Insert notes in Entity A and B. Check 'Non-Tempered' to use microtones like C+4 (quarter tone) or raw Hertz (440Hz).",
            es: "Inserte notas en Entidad A y B. Marque 'Valores No Temperados' para usar microtonos como C+4 o Hertz puros (440Hz)."
        }
    },
    {
        id: "tool-modulos", type: "tool", toolIndex: 3,
        label: "Módulos Cíclicos",
        color: MARINHO,
        icon: <path d="M12 4a8 8 0 1 1-8 8" stroke="white" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />,
        contexto: {
            pt: "Metodologia de Flo Menezes conhecida como 'defloramento horizontal'. A harmonia base sofre uma expansão temporal: o motivo é transposto sucessivamente pelo seu próprio intervalo-limite até retornar à oitava da nota de partida, criando uma melodia inerente à própria harmonia.",
            en: "Flo Menezes' cyclic modules. The base harmony undergoes a temporal expansion: the motif is successively transposed by its limit-interval until returning to the octave.",
            es: "Módulos cíclicos de Flo Menezes. La armonía base sufre una expansión temporal transponiendo el motivo por su intervalo-límite."
        },
        comoUsar: {
            pt: "Use Ctrl+Clique / Cmd+Clique diretamente nas linhas e espaços da Partitura para escrever o seu motivo melódico base. O algoritmo desdobrará o módulo de forma cíclica automaticamente à direita.",
            en: "Ctrl+Click / Cmd+Click directly on the musical staff to write your base motif. The cyclic module will unfold automatically.",
            es: "Ctrl+Clic / Cmd+Clic directamente en el pentagrama para escribir su motivo base. El módulo se desarrollará automáticamente."
        }
    },
    {
        id: "tool-projecoes", type: "tool", toolIndex: 4,
        label: "Projeções Proporcionais",
        color: VINHO,
        icon: <path d="M4 20L20 4M4 12l8-8M12 20l8-8" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Uma técnica espectral que estica ou comprime as proporções de um acorde dentro de novos limites físicos. Rompe as grades do sistema temperado ocidental ao calcular as proporções logaritmicamente puras no domínio da frequência (Hz).",
            en: "A spectral technique that stretches or compresses chord proportions within new limits, breaking the tempered system by calculating pure logarithmic Hertz ratios.",
            es: "Técnica espectral que comprime proporciones de un acorde dentro de nuevos límites, calculando proporciones logarítmicas puras en Hertz."
        },
        comoUsar: {
            pt: "Insira as notas de origem na caixa de texto. Deslize as barras de Alvo Mínimo e Alvo Máximo. A ferramenta comprimirá ou esticará os intervalos originais de forma proporcional, gerando um espectro microtonal absoluto.",
            en: "Input the source notes. Adjust the Min and Max Target sliders to compress or stretch the original intervals proportionally into a microtonal spectrum.",
            es: "Inserte las notas de origen. Ajuste los controles de Objetivo Mínimo y Máximo para comprimir o estirar los intervalos proporcionalmente."
        }
    },
    {
        id: "tool-matriz", type: "tool", toolIndex: 5,
        label: "Matriz Dodecafônica",
        color: MARINHO,
        icon: <rect x="4" y="4" width="16" height="16" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 4" />,
        contexto: {
            pt: "A base de todo o Serialismo da Segunda Escola de Viena (Schoenberg e Webern). Esta ferramenta calcula instantaneamente o quadrado mágico de permutações: Prime (P), Inversion (I), Retrograde (R) e Retrograde Inversion (RI).",
            en: "The foundation of the Second Viennese School Serialism. Calculates the magic square of permutations: Prime, Inversion, Retrograde, and Retrograde Inversion.",
            es: "La base del Serialismo. Calcula el cuadrado mágico de permutaciones: Prime, Inversión, Retrógrado y Retrogradación Invertida."
        },
        comoUsar: {
            pt: "Escreva as 12 notas de sua série. Marque a opção 'Permitir mais de 12 notas' se quiser criar matrizes tonais ou modais de expansão livre. Altere o menu para visualizar em Notas, Pitch Classes (0-11) ou Frequências.",
            en: "Enter your 12-tone row. Check 'Allow > 12 notes' for free/tonal matrices. Switch views to see Notes, Pitch Classes, or Frequencies.",
            es: "Ingrese su serie. Marque 'Permitir > 12 notas' para matrices libres. Cambie la vista para ver Notas, Pitch Classes o Frecuencias."
        }
    },
    {
        id: "tool-ringmod", type: "tool", toolIndex: 6,
        label: "Modulação em Anel",
        color: VINHO,
        icon: <g><circle cx="9" cy="12" r="5" stroke="white" strokeWidth="2" fill="none" /><circle cx="15" cy="12" r="5" stroke="white" strokeWidth="2" fill="none" /></g>,
        contexto: {
            pt: "A Modulação em Anel (Ring Modulation) é um pilar da música eletroacústica. Ao multiplicar dois sinais no domínio do tempo, as frequências originais desaparecem, dando lugar ao surgimento de bandas puramente inarmônicas geradas pela Soma (A+B) e Diferença (|A-B|).",
            en: "Ring Modulation is an electroacoustic pillar. Multiplying two signals makes original frequencies disappear, creating inharmonic bands of Sum and Difference.",
            es: "Modulación en Anillo. Multiplicar dos señales crea bandas inarmónicas generadas por la Suma y Diferencia de las frecuencias."
        },
        comoUsar: {
            pt: "Insira duas ou mais portadoras. Gire o botão (Knob) de 'Ordem/Cascata' para retroalimentar o efeito, simulando pedais analógicos que modulam as próprias modulações, gerando densidades extremas.",
            en: "Insert two or more carriers. Twist the 'Order/Cascade' knob to feedback the effect, simulating analog pedals for extreme densities.",
            es: "Inserte dos o más portadoras. Gire el Knob de 'Orden/Cascada' para retroalimentar el efecto, generando densidades extremas."
        }
    },
    {
        id: "tool-fm", type: "tool", toolIndex: 7,
        label: "Síntese FM",
        color: MARINHO,
        icon: <path d="M2 12 Q6 2, 10 12 T18 12 T26 12" stroke="white" strokeWidth="2" fill="none" />,
        contexto: {
            pt: "Inventada por John Chowning, a Modulação de Frequência deforma a onda Portadora (C) na velocidade da Moduladora (M). O resultado é o preenchimento do espectro baseado em Funções Complexas de Bessel, criando os famosos timbres metálicos ou de sinos.",
            en: "Invented by John Chowning, FM synthesis deforms a Carrier by a Modulator, filling the spectrum based on Bessel Functions for metallic/bell timbres.",
            es: "Inventada por John Chowning, deforma una Portadora mediante una Moduladora, llenando el espectro para timbres metálicos o de campana."
        },
        comoUsar: {
            pt: "Digite ou puxe um acorde para servir de Portadoras (C). Defina uma única Moduladora (M). Ajuste o botão giratório (Knob) do Índice (K) para alargar ou fechar a árvore de bandas espectrais geradas.",
            en: "Set Carriers (C) and a Modulator (M). Twist the Index (K) knob to widen or close the tree of generated spectral sidebands.",
            es: "Defina las Portadoras (C) y la Moduladora (M). Gire el Knob de Índice (K) para ensanchar o cerrar las bandas espectrales."
        }
    },
    {
        id: "tool-additive", type: "tool", toolIndex: 8,
        label: "Síntese Aditiva",
        color: VINHO,
        icon: <g><rect x="6" y="14" width="3" height="6" fill="white" /><rect x="11" y="10" width="3" height="10" fill="white" /><rect x="16" y="6" width="3" height="14" fill="white" /></g>,
        contexto: {
            pt: "A fundação teórica da música Espectral de Gérard Grisey e Tristan Murail. Em vez de subtrair som de um ruído, esculpe-se um timbre fundindo múltiplos osciladores sinusoidais baseados na expansão dos harmônicos naturais.",
            en: "The theoretical foundation of Spectral music. Sculpts timbres by fusing multiple sine oscillators based on natural harmonic expansion.",
            es: "La base teórica de la música Espectral. Esculpe timbres fusionando múltiples osciladores sinusoidales basados en la expansión armónica."
        },
        comoUsar: {
            pt: "Insira a frequência base. Gire os botões de Harmônicos para multiplicar a frequência (gerando o espectro superior) e Sub-harmônicos para dividi-la (espectro inferior). Clique em 'Ouvir' para escutar a síntese final.",
            en: "Input the base frequency. Turn the Harmonics knob to multiply and Sub-harmonics to divide. Click 'Hear' to listen to the final synthesis.",
            es: "Ingrese la frecuencia base. Gire los Knobs de Armónicos para multiplicar y Sub-armónicos para dividir. Haga clic en 'Escuchar'."
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