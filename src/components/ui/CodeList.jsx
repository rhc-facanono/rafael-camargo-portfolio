import React, { useState } from "react";
import HarmonicNetwork from "./HarmonicNetwork";

// ==========================================
// PALETA DE CORES PADRÃO
// ==========================================
const MARINHO = "#9fb1db";
const VINHO = "#e4a8bc";
const LILAS = "#c0a8e4";
const MENTA = "#a8e4bc";
const AMARELO = "#e4d9a8";
const SALMAO = "#db9f9f";
const CIANO = "#9fdbcf";
const CINZA = "#b0b0b0";
const OURO = "#ffdd57";
const CORAL = "#ff6b6b";
const NEON = "#00ffcc";

const codeData = [
    {
        id: "tool-redes", type: "tool", toolIndex: 1,
        label: "Redes Harmônicas 3D",
        color: MARINHO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></g>,
        contexto: {
            pt: "Desenvolvimento baseado na 'Tonnetz' de Leonhard Euler e expandido espacialmente por Henri Pousseur. O objetivo histórico desta técnica é mapear a harmonia em eixos multidimensionais, permitindo transições calculadas entre polos tonais e material atonal/serial através da proximidade geométrica."
        },
        comoUsar: {
            pt: "Defina os intervalos dos eixos X, Y e Z (em steps ou cents). Na visualização 3D, segure a tecla Ctrl e clique nos nós (esferas) para incluí-los na entidade gerada. Use o filtro para delimitar a área de visualização."
        }
    },
    {
        id: "tool-multiplicacao", type: "tool", toolIndex: 2,
        label: "Multiplicação de Acordes",
        color: VINHO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></g>,
        contexto: {
            pt: "Técnica associada ao serialismo integral, notavelmente utilizada por Pierre Boulez. Consiste em uma operação de teoria de conjuntos onde uma estrutura intervalar matriz prolifera ao ser transposta sistematicamente sobre os pontos de uma segunda estrutura."
        },
        comoUsar: {
            pt: "Insira as notas nas caixas A (Multiplicando) e B (Multiplicador). O sistema calcula a transposição do bloco A sobre cada nota do bloco B, retornando a fusão das notas sem duplicatas."
        }
    },
    {
        id: "tool-modulos", type: "tool", toolIndex: 3,
        label: "Módulos Cíclicos",
        color: LILAS,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-3.2 2.85" /></g>,
        contexto: {
            pt: "Formalizado como iteração de campos pelo compositor Flo Menezes. A técnica baseia-se na repetição de uma célula intervalar contínua até que o somatório dos intervalos feche um ciclo de oitava exata."
        },
        comoUsar: {
            pt: "Forneça uma sequência de 2 ou mais notas. O módulo calcula a distância da primeira à última nota e projeta este intervalo recursivamente até que a estrutura retorne à tônica (oitava acima)."
        }
    },
    {
        id: "tool-projecoes", type: "tool", toolIndex: 4,
        label: "Projeções Proporcionais",
        color: MENTA,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></g>,
        contexto: {
            pt: "Técnica desenvolvida pelo compositor Flo Menezes, alinhada aos conceitos do Espectralismo. Trata-se de um escalonamento logarítmico onde a 'gestalt' (proporção interna) de um acorde é mantida enquanto seu registro total é comprimido (concreção) ou expandido no espectro de frequências."
        },
        comoUsar: {
            pt: "Insira o acorde original. Mova os controles deslizantes 'Min' e 'Max' para definir o limite inferior e superior (em Hertz). O algoritmo interpolará as notas originais matematicamente dentro do novo espaço."
        }
    },
    {
        id: "tool-matriz", type: "tool", toolIndex: 5,
        label: "Matriz Dodecafônica",
        color: AMARELO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></g>,
        contexto: {
            pt: "Base mecânica da Segunda Escola de Viena (Schoenberg, Webern). Opera a permutação completa de uma série através das formas Original, Retrógrado, Inversão e Retrógrado da Inversão. A expansão livre quebra a restrição histórica de 12 notas."
        },
        comoUsar: {
            pt: "Digite uma série de notas na entrada principal. A matriz cruzará os intervalos calculando todas as formas. Altere o menu de 'Visualização' para traduzir a tabela em classes de notas, Hz ou texto."
        }
    },
    {
        id: "tool-ring", type: "tool", toolIndex: 6,
        label: "Ring Modulation",
        color: SALMAO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="12" r="6" /><circle cx="16" cy="12" r="6" /></g>,
        contexto: {
            pt: "Processo de estúdio fundamental nos primórdios da música eletrônica (Karlheinz Stockhausen). Consiste na modulação de amplitude bipolar (multiplicação de sinais) que expele as frequências originais, restando apenas as frequências de soma (A+B) e diferença (|A-B|)."
        },
        comoUsar: {
            pt: "Insira as portadoras. O parâmetro 'Cascata' define o nível de recursividade (aplicar o efeito sobre o resultado do efeito). Use 'Limite' para evitar travamento por excesso de cálculo de matrizes de frequências."
        }
    },
    {
        id: "tool-fm", type: "tool", toolIndex: 7,
        label: "Síntese FM",
        color: CIANO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l2-9 5 18 3-9h6" /></g>,
        contexto: {
            pt: "Descoberta por John Chowning. A Frequência Modulada altera o pitch de um oscilador portador através de um modulador em taxas de áudio. Fórmulas com razões não-inteiras produzem espectros inarmônicos ricos e densos, semelhantes a sinos."
        },
        comoUsar: {
            pt: "Defina os valores das caixas Portadora (C) e Moduladora (M). Aumente o botão giratório (Índice K) para expandir a amplitude da modulação, o que resulta matematicamente em mais harmônicos laterais (Sidebands)."
        }
    },
    {
        id: "tool-add", type: "tool", toolIndex: 8,
        label: "Síntese Aditiva",
        color: CINZA,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></g>,
        contexto: {
            pt: "Derivada do Teorema de Fourier, atesta que espectros complexos são somatórias de senoides simples. Musicalmente, explora-se a projeção otonal (série harmônica via multiplicação inteira) e utonal (sub-harmônicos via divisão inteira)."
        },
        comoUsar: {
            pt: "Forneça as notas fundamentais na caixa de texto. Ajuste os botões giratórios para determinar o limite de cálculo da série harmônica para cima (xN) e sub-harmônica para baixo (/N)."
        }
    },
    {
        id: "tool-costere-calc", type: "tool", toolIndex: 9,
        label: "Calculadora Costère",
        color: OURO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="2" y1="12" x2="4" y2="12" /></g>,
        contexto: {
            pt: "Baseada na teoria de polarização acústica de Edmond Costère. Mede a atração gravitacional de um som em relação aos seus vizinhos no ciclo de quintas e semitons adjacentes, identificando os centros formânticos de um agregado."
        },
        comoUsar: {
            pt: "Insira as notas da coleção sob análise. A tabela 'Densidades Cardinais' avaliará o vetor. Valores altos indicam polaridade forte (para onde as notas da coleção tendem a resolver acusticamente)."
        }
    },
    {
        id: "tool-costere-interp", type: "tool", toolIndex: 10,
        label: "Interpolação & Morphing",
        color: CORAL,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></g>,
        contexto: {
            pt: "Algoritmos para transição de estados morfológicos. A via logarítmica executa um deslizamento matemático direto (glissando puro). A via de Costère executa saltos intervalares conduzidos pelas densidades de gravidade do alvo."
        },
        comoUsar: {
            pt: "Forneça as coleções de origem (A) e destino (B). Escolha a lógica do algoritmo (Acorde/Melodia e Log/Costère). Arraste o controle deslizante de Morphing para iterar sobre a progressão temporal calculada."
        }
    },
    {
        id: "tool-afinacoes", type: "tool", toolIndex: 11,
        label: "Afinações & Scala",
        color: NEON,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></g>,
        contexto: {
            pt: "O módulo nuclear xenharmônico. Permite a reestruturação da física matemática de todos os cálculos do sistema (Hertz para Steps), viabilizando o uso de Divisões Iguais da Oitava (EDO) ou importação de arquivos Scala (.scl)."
        },
        comoUsar: {
            pt: "Selecione EDO, escreva rácios textuais (Custom) ou importe um arquivo .scl. Clique em 'Aplicar' para alterar o paradigma acústico do sistema. O painel abaixo lista as centésimas de semitom e as frações calculadas da escala."
        }
    },
    {
        id: "tool-teclado", type: "tool", toolIndex: 13,
        label: "Teclado Interativo",
        color: NEON,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /><line x1="8" y1="5" x2="8" y2="15" /><line x1="16" y1="5" x2="16" y2="15" /><line x1="12" y1="5" x2="12" y2="15" /></g>,
        contexto: {
            pt: "Interface de performance e monitoramento acústico. Provê feedback instantâneo da matriz temperada/não-temperada em andamento, processando entradas de dispositivos de hardware MIDI conectados ao navegador."
        },
        comoUsar: {
            pt: "Ligue o seu teclado MIDI USB ou clique nas teclas do ecrã. O sintetizador interno reproduzirá a frequência microtonal exata processada de acordo com as regras ativas da Aba 11."
        }
    },
    {
        id: "tool-notacao", type: "tool", toolIndex: 14,
        label: "Notação Microtonal",
        color: "#ff99ff", // Um rosa choque/magenta para destacar
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></g>,
        contexto: {
            pt: "Sistemas de notação microtonal estendida. Helmholtz-Ellis (Sabat/Schweinitz) utiliza proporções de Just Intonation baseadas em comas (limites 5, 7, 11). O Sagittal é um sistema universal em rede focado tanto em razões puras quanto em divisões iguais (EDO)."
        },
        comoUsar: {
            pt: "Insira as frequências ou graus na caixa de texto. Escolha o sistema de acidentes. O algoritmo deduzirá a altura diatônica (linha do pentagrama) e anexará o símbolo vetorial (SVG) correspondente ao desvio em cents."
        }
    }
];

function getCardStyles(color, isActive) {
    let bg = isActive ? color : "#2A2A2A";
    let border = isActive ? `2px solid ${color}` : "2px solid #444";
    let textColor = isActive ? "#fff" : color;
    return { background: bg, color: textColor, border };
}

// O COMPONENTE MODAL COM O MANUAL TÉCNICO DE OPERAÇÃO
function ManualModal({ onClose }) {
    return (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" }}>
            <div style={{ background: "#111", width: "100%", maxWidth: "900px", height: "90%", borderRadius: "12px", border: "1px solid #444", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}>
                <div style={{ padding: "20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1a1a1a" }}>
                    <h2 style={{ margin: 0, color: "#00ffcc", fontSize: "1.2rem", textTransform: "uppercase", letterSpacing: "2px" }}>Manual de Operação do Sistema</h2>
                    <button onClick={onClose} style={{ background: "#ff4757", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Fechar Manual</button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "40px", color: "#ddd", lineHeight: "1.8", fontSize: "14px" }} className="custom-scrollbar">

                    <h3 style={{ color: "#fff", fontSize: "1.5rem", borderBottom: "1px solid #444", paddingBottom: "10px" }}>I. Controles Globais (Barra Superior)</h3>
                    <ul style={{ background: "#222", padding: "20px 40px", borderRadius: "8px", marginTop: "15px", listStyleType: "circle" }}>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#00ffcc" }}>Toggle Xenharmônico / 12-TET:</strong> Alterna o motor matemático de todo o software. Em 12-TET, o sistema limita-se às afinações de piano padrão. Em modo Xenharmônico, os cálculos respondem à afinação ativa estipulada na Aba 11.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#a8e4bc" }}>Quantizar (Snap Global):</strong> Um interruptor essencial para módulos que geram frequências quebradas (como Ring Modulation ou FM). Quando ativado (azul), o algoritmo fará uma varredura sobre as frequências geradas e irá forçá-las (snap) a assumir o degrau mais próximo da sua afinação atual.</li>
                    </ul>

                    <h3 style={{ color: "#fff", fontSize: "1.5rem", borderBottom: "1px solid #444", paddingBottom: "10px", marginTop: "40px" }}>II. Interação e Atalhos</h3>
                    <ul style={{ background: "#222", padding: "20px 40px", borderRadius: "8px", marginTop: "15px", listStyleType: "circle" }}>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Inserção no Pentagrama:</strong> Para inserir notas visualmente nas pautas (SVG), você deve posicionar o mouse, <strong>segurar a tecla Ctrl (ou Cmd) e clicar</strong>. Isto evita inserções acidentais durante o scroll da página.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Uso de Acidentes Microtonais:</strong> Na barra do pentagrama, clique num acidente (ex: <code>d -50c</code>). Ele ficará sublinhado. Em seguida, use o `Ctrl + Clique` numa linha da pauta. A nota inserida carregará o desvio exato em Cents.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Atalho de Transposição (Alt + Setas):</strong> Clique numa caixa de texto de entrada para dar foco. Pressione <code>Alt + Seta Cima</code> ou <code>Alt + Seta Baixo</code> para transpor a última nota da lista matematicamente em 1 passo/semitom por clique.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Botões "Puxar de":</strong> Presentes no topo da maioria das abas, inserem a string de saída gerada noutra ferramenta diretamente na entrada da aba atual.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Knobs (Botões Giratórios):</strong> Posicione o ponteiro do mouse sobre o botão, clique e mantenha pressionado enquanto arrasta o mouse para cima ou para baixo para alterar os valores.</li>
                    </ul>

                    <h3 style={{ color: "#fff", fontSize: "1.5rem", borderBottom: "1px solid #444", paddingBottom: "10px", marginTop: "40px" }}>III. Lógica Operacional por Seção</h3>
                    <div style={{ background: "#222", padding: "20px", borderRadius: "8px", marginTop: "15px" }}>
                        <p><strong style={{ color: "#9fb1db" }}>Aba 1 (Redes):</strong> O dropdown centraliza o mapa (Padrão: C3). Os inputs (X, Y, Z) aceitam passos (se em 12-TET) ou Cents puros (se no modo microtonal). O botão "Cent. Câm" reseta o visualizador 3D.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#e4a8bc" }}>Aba 2 (Multiplicação):</strong> Calcula a transposição da Entidade A sobre cada nota da Entidade B. Em modo Xenharmônico, a transposição respeita a grade de afinação global.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#c0a8e4" }}>Aba 3 (Módulos):</strong> Repete a Entidade Base ciclicamente. Se o intervalo não fechar em 1200 cents imediatamente, a espiral continua até encontrar uma oitava harmônica perfeita.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#a8e4bc" }}>Aba 4 (Projeções):</strong> Redimensiona o acorde para caber entre as frequências Min e Max. Use a Quantização (Snap) para forçar o resultado quebrado para a escala musical.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#e4d9a8" }}>Aba 5 (Matriz):</strong> Gera a matriz dodecafônica (ou N-dimensional). Altere a visualização para analisar a série em Hz, Cents ou Classes de Notas.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#db9f9f" }}>Aba 6 (Ring Mod):</strong> Multiplica as portadoras. O Knob "Cascata" reinjeta o resultado no próprio modulador para espectros complexos. Use "Limite" para não travar o navegador.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#9fdbcf" }}>Aba 7 (Síntese FM):</strong> Portadora (C) é modulada por (M). Aumente o Índice K para gerar mais energia nas bandas laterais e enriquecer a inarmonicidade.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#b0b0b0" }}>Aba 8 (Aditiva):</strong> Projeta a série harmônica (para cima) e sub-harmônica (para baixo). Gire os botões para definir a quantidade de parciais desejada.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#ffdd57" }}>Aba 9 (Costère):</strong> Analisa a "Densidade Cardinal". Os números verdes no painel mostram os "polos de atração" para onde as notas inseridas querem resolver acusticamente.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#ff6b6b" }}>Aba 10 (Interpolação):</strong> O Slider inferior representa a passagem do tempo. No extremo esquerdo (0%), ouve-se a Entidade A. Ao deslizar para a direita, a matemática recalcula progressivamente as notas em direção à Entidade B.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#00ffcc" }}>Aba 11 (Afinações):</strong> O bloco "Tuning (Âncoras)" é a bússola do sistema. Ele indica qual tecla MIDI (ex: 60) representará uma frequência física estática (ex: 261.62Hz). Todas as notas geradas usarão essa âncora como marco zero para calcular o resto do teclado.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#00ffcc" }}>Aba 13 (Teclado):</strong> Um piano responsivo. Use o mouse ou o seu teclado controlador MIDI para ouvir o resultado exato das afinações microtonais processadas pelo motor do sistema.</p>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default function CodeList({ language = "pt" }) {
    const [selected, setSelected] = useState(codeData[0]);
    const [isManualOpen, setIsManualOpen] = useState(false);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {isManualOpen && <ManualModal onClose={() => setIsManualOpen(false)} />}

            {/* TOPO: BOTÃO GLOBAL DO MANUAL */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                    onClick={() => setIsManualOpen(true)}
                    style={{
                        backgroundColor: "#00ffcc", color: "#000", border: "none", padding: "10px 20px",
                        borderRadius: "8px", fontWeight: "bold", fontSize: "12px", textTransform: "uppercase",
                        letterSpacing: "1px", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,255,204,0.3)",
                        display: "flex", alignItems: "center", gap: "8px"
                    }}
                >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                    Abrir Manual de Operação
                </button>
            </div>

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
                            <h3 style={{ color: selected.color, fontSize: 14, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Motivação & Teoria Estrutural</h3>
                            <p style={{ color: "#ccc", fontSize: 14, lineHeight: "1.6" }}>{selected.contexto[language]}</p>
                        </div>
                        <div>
                            <h3 style={{ color: "#00ffcc", fontSize: 14, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Aplicação Técnica</h3>
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