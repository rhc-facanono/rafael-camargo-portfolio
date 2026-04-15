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
            pt: "Mapeamento topológico de estruturas intervalares em eixos multidimensionais. Utilizado para análise de distâncias vetoriais entre classes de notas e modulação por proximidade geométrica em espaços temperados ou microtonais.",
            en: "Topological mapping of interval structures across multidimensional axes. Used for vector distance analysis between pitch classes and modulation via geometric proximity in tempered or microtonal spaces.",
            es: "Mapeo topológico de estructuras interválicas en ejes multidimensionales. Utilizado para el análisis de distancias vectoriales entre clases de notas y modulación por proximidad geométrica en espacios temperados o microtonales."
        },
        comoUsar: {
            pt: "Defina as razões dos eixos X, Y e Z em passos ou cents. Na visualização 3D, utilize Ctrl+Clique nos nós para extrair os valores para a lista de saída. O filtro de raio delimita a renderização da malha.",
            en: "Set the ratios for the X, Y, and Z axes in steps or cents. In the 3D viewport, use Ctrl+Click on nodes to extract values to the output array. The radius filter bounds the mesh rendering.",
            es: "Defina las razones de los ejes X, Y y Z en pasos o cents. En la vista 3D, utilice Ctrl+Clic en los nodos para extraer los valores a la lista de salida. El filtro de radio delimita el renderizado de la malla."
        }
    },
    {
        id: "tool-multiplicacao", type: "tool", toolIndex: 2,
        label: "Multiplicação de Acordes",
        color: VINHO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></g>,
        contexto: {
            pt: "Operação da teoria dos conjuntos onde um vetor estrutural (Multiplicando) é transposto e somado sistematicamente a cada elemento de uma segunda estrutura (Multiplicador), gerando campos harmônicos derivados.",
            en: "Set theory operation where a structural vector (Multiplicand) is systematically transposed and added to each element of a second structure (Multiplier), generating derived harmonic fields.",
            es: "Operación de la teoría de conjuntos donde un vector estructural (Multiplicando) es transpuesto y sumado sistemáticamente a cada elemento de una segunda estructura (Multiplicador), generando campos armónicos derivados."
        },
        comoUsar: {
            pt: "Insira los valores nas entradas A e B. O algoritmo processará a transposição do bloco A sobre as coordenadas de B, retornando a matriz resultante após a eliminação de redundâncias (classes duplicadas).",
            en: "Input the values in arrays A and B. The algorithm will process the transposition of block A over the coordinates of B, returning the resulting matrix after eliminating redundancies (duplicate classes).",
            es: "Ingrese los valores en las entradas A y B. El algoritmo procesará la transposición del bloque A sobre las coordenadas de B, devolviendo la matriz resultante tras eliminar redundancias (clases duplicadas)."
        }
    },
    {
        id: "tool-modulos", type: "tool", toolIndex: 3,
        label: "Módulos Cíclicos",
        color: LILAS,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-3.2 2.85" /></g>,
        contexto: {
            pt: "Processo algorítmico que reitera uma célula intervalar geradora. A projeção contínua ocorre até que a somatória das frequências ou passos resulte em uma equivalência de oitava (1200 cents ou 2/1).",
            en: "Algorithmic process that reiterates a generating interval cell. Continuous projection occurs until the sum of frequencies or steps results in an octave equivalence (1200 cents or 2/1).",
            es: "Proceso algorítmico que reitera una célula interválica generadora. La proyección continua ocurre hasta que la suma de frecuencias o pasos resulte en una equivalencia de octava (1200 cents o 2/1)."
        },
        comoUsar: {
            pt: "Insira uma sequência numérica inicial. O algoritmo calcula o vetor primário e o transpõe recursivamente até alcançar a oitava de fechamento do ciclo geométrico.",
            en: "Enter an initial numerical sequence. The algorithm calculates the primary vector and transposes it recursively until reaching the closing octave of the geometric cycle.",
            es: "Introduzca una secuencia numérica inicial. El algoritmo calcula el vector primario y lo transpone recursivamente hasta alcanzar la octava de cierre del ciclo geométrico."
        }
    },
    {
        id: "tool-projecoes", type: "tool", toolIndex: 4,
        label: "Projeções Proporcionais",
        color: MENTA,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></g>,
        contexto: {
            pt: "Técnica de processamento espectral onde o espectro interno (proporção relativa em cents) de uma coleção de frequências é mantido, enquanto seu escopo de registro é escalonado logaritmicamente (concreção ou expansão).",
            en: "Spectral processing technique where the internal spectrum (relative proportion in cents) of a frequency collection is maintained, while its register scope is scaled logarithmically (concretion or expansion).",
            es: "Técnica de procesamiento espectral donde el espectro interno (proporción relativa en cents) de una colección de frecuencias se mantiene, mientras su rango de registro se escala logarítmicamente (concreción o expansión)."
        },
        comoUsar: {
            pt: "Determine a coleção base. Ajuste os limites mínimo e máximo em Hertz. A função aplicará a interpolação matemática, reajustando os graus internos proporcionalmente dentro do novo espectro.",
            en: "Determine the base collection. Adjust the minimum and maximum boundaries in Hertz. The function will apply mathematical interpolation, readjusting internal degrees proportionally within the new spectrum.",
            es: "Determine la colección base. Ajuste los límites mínimo y máximo en Hercios. La función aplicará la interpolación matemática, reajustando los grados internos proporcionalmente dentro del nuevo espectro."
        }
    },
    {
        id: "tool-matriz", type: "tool", toolIndex: 5,
        label: "Matriz Dodecafônica",
        color: AMARELO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></g>,
        contexto: {
            pt: "Cálculo combinatório que aplica as quatro simetrias básicas (Original, Retrógrado, Inversão, Retrógrado da Inversão) sobre um conjunto de classes de notas de cardinalidade N.",
            en: "Combinatorial calculation applying the four basic symmetries (Prime, Retrograde, Inversion, Retrograde Inversion) over a set of pitch classes of cardinality N.",
            es: "Cálculo combinatorio que aplica las cuatro simetrías básicas (Original, Retrógrado, Inversión, Retrógrado de la Inversión) sobre un conjunto de clases de notas de cardinalidad N."
        },
        comoUsar: {
            pt: "Insira a série base. O sistema calculará as inversões intervalares e gerará o quadro em formato de matriz quadrada. O formato de exibição (Hz, Cents ou Classes) pode ser alterado no menu.",
            en: "Input the base series. The system will compute the interval inversions and generate the grid as a square matrix. The display format (Hz, Cents, or Classes) can be changed via the dropdown.",
            es: "Introduzca la serie base. El sistema calculará las inversiones interválicas y generará el cuadro en formato de matriz cuadrada. El formato de visualización (Hz, Cents o Clases) se puede cambiar en el menú."
        }
    },
    {
        id: "tool-ring", type: "tool", toolIndex: 6,
        label: "Ring Modulation",
        color: SALMAO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="12" r="6" /><circle cx="16" cy="12" r="6" /></g>,
        contexto: {
            pt: "Modulação de amplitude em anel que opera a supressão das frequências portadoras, processando o cálculo espectral das frequências de soma (F1 + F2) e de diferença (|F1 - F2|).",
            en: "Ring amplitude modulation operating on the suppression of carrier frequencies, computing the spectral output of sum (F1 + F2) and difference (|F1 - F2|) frequencies.",
            es: "Modulación de amplitud en anillo que opera la supresión de las frecuencias portadoras, calculando el espectro de las frecuencias de suma (F1 + F2) y diferencia (|F1 - F2|)."
        },
        comoUsar: {
            pt: "Defina as portadoras. O parâmetro 'Cascata' aplica recursividade, reinjetando a saída como entrada. Utilize o 'Limite' para truncar o cálculo da árvore harmônica e prevenir estouramento de pilha.",
            en: "Set the carrier frequencies. The 'Cascade' parameter applies recursion, feeding the output back as input. Use the 'Limit' threshold to truncate the harmonic tree computation and prevent stack overflow.",
            es: "Defina las frecuencias portadoras. El parámetro 'Cascada' aplica recursividad, inyectando la salida nuevamente como entrada. Use el 'Límite' para truncar el árbol armónico y evitar el desbordamiento de pila."
        }
    },
    {
        id: "tool-fm", type: "tool", toolIndex: 7,
        label: "Síntese FM",
        color: CIANO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l2-9 5 18 3-9h6" /></g>,
        contexto: {
            pt: "Equação de modulação de frequência em taxa de áudio. A banda lateral de frequências geradas é governada pela relação Portadora/Moduladora (C:M) e pelo Índice de Modulação (K).",
            en: "Audio-rate frequency modulation equation. The sideband frequencies generated are governed by the Carrier-to-Modulator ratio (C:M) and the Modulation Index (K).",
            es: "Ecuación de modulación de frecuencia en tasa de audio. La banda lateral de frecuencias generadas está gobernada por la relación Portadora/Moduladora (C:M) y el Índice de Modulación (K)."
        },
        comoUsar: {
            pt: "Especifique a frequência Portadora (C) e a Moduladora (M). O botão rotativo (Índice K) controla o desvio de frequência, ampliando o número de bandas laterais no espectro resultante.",
            en: "Specify the Carrier (C) and Modulator (M) frequencies. The rotary knob (Index K) controls the frequency deviation, expanding the number of sidebands in the resulting spectrum.",
            es: "Especifique la frecuencia Portadora (C) y Moduladora (M). La perilla rotativa (Índice K) controla la desviación de frecuencia, ampliando el número de bandas laterales en el espectro resultante."
        }
    },
    {
        id: "tool-add", type: "tool", toolIndex: 8,
        label: "Síntese Aditiva",
        color: CINZA,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></g>,
        contexto: {
            pt: "Algoritmo de geração parcial baseado na decomposição de Fourier. Extrapola fundamentais calculando parciais otonais (multiplicação escalar) e parciais utonais (divisão escalar).",
            en: "Partial generation algorithm based on Fourier decomposition. Extrapolates fundamentals by computing otonal partials (scalar multiplication) and utonal partials (scalar division).",
            es: "Algoritmo de generación parcial basado en la descomposición de Fourier. Extrapola fundamentales calculando parciales otonales (multiplicación escalar) y parciales utonales (división escalar)."
        },
        comoUsar: {
            pt: "Insira a(s) nota(s) geradora(s). Regule os índices de multiplicação harmônica e de divisão sub-harmônica. O algoritmo devolverá o espectro linear correspondente.",
            en: "Input the generating note(s). Adjust the indices for harmonic multiplication and sub-harmonic division. The algorithm will return the corresponding linear spectrum.",
            es: "Ingrese la(s) nota(s) generadora(s). Ajuste los índices de multiplicación armónica y división subarmónica. El algoritmo devolverá el espectro lineal correspondiente."
        }
    },
    {
        id: "tool-costere-calc", type: "tool", toolIndex: 9,
        label: "Calculadora Costère",
        color: OURO,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="2" y1="12" x2="4" y2="12" /></g>,
        contexto: {
            pt: "Análise quantitativa baseada no sistema vetorial de Edmond Costère. A polarização acústica de um espectro é definida pela atração interválica a fatores de densidade de 5ªs perfeitas e 2ªs menores.",
            en: "Quantitative analysis based on Edmond Costère's vectorial system. The acoustic polarization of a spectrum is defined by intervalic attraction to density factors of perfect 5ths and minor 2nds.",
            es: "Análisis cuantitativo basado en el sistema vectorial de Edmond Costère. La polarización acústica de un espectro se define por la atracción interválica a los factores de densidad de 5as perfectas y 2as menores."
        },
        comoUsar: {
            pt: "Forneça as notas do agregado. A tabela exibirá os índices de Densidade Cardinal. A nota com o valor numérico superior representa o centro de gravidade acústica da coleção.",
            en: "Provide the notes of the aggregate. The table will display the Cardinal Density indices. The note with the highest numerical value represents the acoustic center of gravity of the collection.",
            es: "Proporcione las notas del agregado. La tabla mostrará los índices de Densidad Cardinal. La nota con el valor numérico más alto representa el centro de gravedad acústica de la colección."
        }
    },
    {
        id: "tool-costere-interp", type: "tool", toolIndex: 10,
        label: "Interpolação Logarítmica",
        color: CORAL,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></g>,
        contexto: {
            pt: "Cálculo de transição morfológica entre conjuntos de dados. O algoritmo logarítmico mapeia microtons através de deslizamento linear, alterando passo a passo as coordenadas da Coleção A para a Coleção B.",
            en: "Morphological transition calculation between datasets. The logarithmic algorithm maps microtones via linear sliding, altering the coordinates of Collection A to Collection B step by step.",
            es: "Cálculo de transición morfológica entre conjuntos de datos. El algoritmo logarítmico mapea microtonos mediante un deslizamiento lineal, alterando paso a paso las coordenadas de la Colección A a la Colección B."
        },
        comoUsar: {
            pt: "Introduza os conjuntos inicial (A) e alvo (B). O deslizador (Slider) percentual indexa os valores em tempo real, calculando a frequência interpolada na posição de corte indicada.",
            en: "Enter the initial (A) and target (B) sets. The percentage slider indexes the values in real time, calculating the interpolated frequency at the specified cutoff position.",
            es: "Introduzca los conjuntos inicial (A) y objetivo (B). El deslizador porcentual indexa los valores en tiempo real, calculando la frecuencia interpolada en la posición de corte indicada."
        }
    },
    {
        id: "tool-afinacoes", type: "tool", toolIndex: 11,
        label: "Afinações & Scala",
        color: NEON,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></g>,
        contexto: {
            pt: "Módulo central que define a constante de grade do sistema. Determina se as métricas obedecem à divisão igual da oitava (EDO) ou ao Just Intonation puro através de importação (.scl) ou inserção manual de razões.",
            en: "Core module defining the system's grid constant. Determines whether metrics obey equal divisions of the octave (EDO) or pure Just Intonation via (.scl) import or manual ratio input.",
            es: "Módulo central que define la constante de cuadrícula del sistema. Determina si las métricas obedecen a la división igual de la octava (EDO) o al Just Intonation puro mediante importación (.scl) o inserción de razones."
        },
        comoUsar: {
            pt: "Especifique o EDO ou as frações limitantes. Configure o ponto âncora (Frequência Hz atrelada a uma nota MIDI). Ao clicar em 'Aplicar', todos os motores de conversão e playback do sistema utilizarão este arquivo como base.",
            en: "Specify the EDO or limiting fractions. Configure the anchor point (Hz frequency mapped to a MIDI note). By clicking 'Apply', all conversion and playback engines will use this file as the baseline.",
            es: "Especifique el EDO o las fracciones limitantes. Configure el punto ancla (Frecuencia Hz vinculada a una nota MIDI). Al hacer clic en 'Aplicar', los motores de conversión utilizarán este archivo como base."
        }
    },
    {
        id: "tool-teclado", type: "tool", toolIndex: 13,
        label: "Interface MIDI/Áudio",
        color: NEON,
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /><line x1="8" y1="5" x2="8" y2="15" /><line x1="16" y1="5" x2="16" y2="15" /><line x1="12" y1="5" x2="12" y2="15" /></g>,
        contexto: {
            pt: "Módulo de monitoramento em tempo real. Interage com a Web MIDI API para ler eventos de Note On/Off e encaminhá-los ao sintetizador interno com o mapeamento microtonal em vigor.",
            en: "Real-time monitoring module. Interacts with the Web MIDI API to read Note On/Off hardware events and route them to the internal synthesizer using the active microtonal mapping.",
            es: "Módulo de monitorización en tiempo real. Interactúa con la Web MIDI API para leer eventos de Note On/Off y enrutarlos al sintetizador interno con el mapeo microtonal activo."
        },
        comoUsar: {
            pt: "Acione as teclas do teclado na tela ou direcione o seu controlador MIDI físico para a aplicação. O oscilador reproduzirá as razões exatas ativas na Aba 11.",
            en: "Trigger the on-screen keyboard keys or route your physical MIDI controller to the application. The oscillator will reproduce the exact ratios active in Tab 11.",
            es: "Accione las teclas del teclado en pantalla o dirija su controlador MIDI físico a la aplicación. El oscilador reproducirá las razones exactas activas en la Pestaña 11."
        }
    },
    {
        id: "tool-notacao", type: "tool", toolIndex: 14,
        label: "Notação Microtonal",
        color: "#ff99ff",
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></g>,
        contexto: {
            pt: "Algoritmo de conversão Hz-para-SVG baseado no padrão SMuFL. Converte desvios em cents para as tipografias Sagittal Athenian ou HEJI2 (Helmholtz-Ellis), aplicando o símbolo vetorial exato à altura diatônica.",
            en: "Hz-to-SVG conversion algorithm based on the SMuFL standard. Converts cents deviation to Sagittal Athenian or HEJI2 (Helmholtz-Ellis) typography, applying the exact vector symbol to the diatonic pitch.",
            es: "Algoritmo de conversión Hz-a-SVG basado en el estándar SMuFL. Convierte desviaciones en cents a las tipografías Sagittal Athenian o HEJI2, aplicando el símbolo vectorial exacto a la altura diatónica correspondiente."
        },
        comoUsar: {
            pt: "Insira as frequências de entrada. Selecione o padrão de notação desejado. A interface renderiza o pentagrama com os acidentes apropriados e permite a ativação de metadados Pitch Bend para DAW.",
            en: "Input the array of frequencies. Select the desired notation standard. The interface renders the staff with appropriate accidentals and enables Pitch Bend metadata tracking for external DAWs.",
            es: "Introduzca las frecuencias de entrada. Seleccione el estándar de notación deseado. La interfaz renderiza el pentagrama con las alteraciones apropiadas y permite el seguimiento de datos Pitch Bend para exportación."
        }
    },
    {
        id: "tool-sequencer", type: "tool", toolIndex: 15,
        label: "Sequenciador Voice Leading",
        color: "#8b5cf6",
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5v14l11-7z" /></g>,
        contexto: {
            pt: "Motor de sequenciamento polimicrotonal. Permite criar progressões harmônicas onde cada acorde reside no seu próprio universo de afinação. O motor de áudio Web Audio calcula o deslizamento (morphing) contínuo das frequências.",
            en: "Polymicrotonal sequencing engine. Allows creating harmonic progressions where each chord resides in its own tuning universe. The Web Audio engine calculates the continuous glissando (morphing) of frequencies.",
            es: "Motor de secuenciación polimicrotonal. Permite crear progresiones armónicas donde cada acorde reside en su propio universo de afinación. El motor calcula el deslizamiento (morphing) continuo de las frecuencias."
        },
        comoUsar: {
            pt: "Adicione blocos de acordes. Defina as notas e selecione a afinação específica para aquele bloco. Clique em 'Morphing Sequence' para ouvir a transição contínua entre as afinações.",
            en: "Add chord blocks. Define notes and select the specific tuning for that block. Click 'Morphing Sequence' to hear the continuous transition between tunings.",
            es: "Agregue bloques de acordes. Defina notas y seleccione la afinación específica para ese bloque. Haga clic en 'Morphing Sequence' para escuchar la transición continua entre afinaciones."
        }
    },
    {
        id: "tool-comparador", type: "tool", toolIndex: 16,
        label: "Comparador Espectral",
        color: "#f59e0b",
        icon: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></g>,
        contexto: {
            pt: "Mesa de luz analítica para escalas. Mapeia múltiplas divisões da oitava (EDOs ou JI) em trilhas paralelas sobre um eixo de 1200 Cents, permitindo análise visual de proximidade e dissonância.",
            en: "Analytical light table for scales. Maps multiple octave divisions (EDOs or JI) into parallel tracks over a 1200 Cents axis, allowing visual analysis of proximity and dissonance.",
            es: "Mesa de luz analítica para escalas. Mapea múltiples divisiones de la octava (EDOs o JI) en pistas paralelas sobre un eje de 1200 Cents, permitiendo análisis visual de proximidad y disonancia."
        },
        comoUsar: {
            pt: "Adicione escalas personalizadas pelo menu lateral ou importe a escala global. Passe o mouse sobre os nós no gráfico SVG para inspecionar os desvios exatos em Cents.",
            en: "Add custom scales via the sidebar or import the global scale. Hover over the nodes on the SVG graph to inspect exact cent deviations.",
            es: "Agregue escalas personalizadas a través de la barra lateral o importe la escala global. Pase el ratón sobre los nodos en el gráfico SVG para inspeccionar las desviaciones exactas en Cents."
        }
    }
];

function getCardStyles(color, isActive) {
    let bg = isActive ? color : "#2A2A2A";
    let border = isActive ? `2px solid ${color}` : "2px solid #444";
    let textColor = isActive ? "#fff" : color;
    return { background: bg, color: textColor, border };
}

function ManualModal({ onClose }) {
    return (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" }}>
            <div style={{ background: "#111", width: "100%", maxWidth: "900px", height: "90%", borderRadius: "12px", border: "1px solid #444", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}>
                <div style={{ padding: "20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1a1a1a" }}>
                    <h2 style={{ margin: 0, color: "#00ffcc", fontSize: "1.2rem", textTransform: "uppercase", letterSpacing: "2px" }}>Manual Técnico de Operação</h2>
                    <button onClick={onClose} style={{ background: "#ff4757", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Fechar Manual</button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "40px", color: "#ddd", lineHeight: "1.8", fontSize: "14px" }} className="custom-scrollbar">

                    <h3 style={{ color: "#fff", fontSize: "1.2rem", borderBottom: "1px solid #444", paddingBottom: "10px" }}>I. Diretrizes Globais de Processamento</h3>
                    <ul style={{ background: "#222", padding: "20px 40px", borderRadius: "8px", marginTop: "15px", listStyleType: "circle" }}>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#00ffcc" }}>Toggle Xenharmônico / 12-TET:</strong> Alterna a base de cálculo. Em 12-TET, o sistema opera na afinação temperada padrão. Em modo Xenharmônico, as variáveis dependem dos dados configurados no núcleo de Tuning (Aba 11).</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#a8e4bc" }}>Quantizar (Snap Global):</strong> Sub-rotina analítica. Força as frequências geradas (em operações não-lineares como FM ou Interpolação) a efetuarem o arredondamento (snap) para o valor de tabela mais próximo na matriz de afinação ativa.</li>
                    </ul>

                    <h3 style={{ color: "#fff", fontSize: "1.2rem", borderBottom: "1px solid #444", paddingBottom: "10px", marginTop: "40px" }}>II. Operação e Entradas de Dados</h3>
                    <ul style={{ background: "#222", padding: "20px 40px", borderRadius: "8px", marginTop: "15px", listStyleType: "circle" }}>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Atalho de Transposição:</strong> Ao selecionar uma caixa de entrada numérica, os atalhos de teclado <code>Alt + Seta Superior/Inferior</code> processam a transposição algorítmica da última entrada com base na escala em vigor.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Inserção Gráfica de Nodos (SVGs):</strong> Em módulos com interface de pentagrama vetorial, mantenha pressionado <code>Ctrl (Windows) ou Cmd (Mac)</code> + Clique esquerdo para inserir uma nota. Ações em acidentes flutuantes anexarão os desvios pré-selecionados.</li>
                        <li style={{ marginBottom: "10px" }}><strong style={{ color: "#ffdd57" }}>Botões I/O ("Puxar de"):</strong> Transferem arrays de dados gerados na memória da sessão atual diretamente para o array de processamento do módulo ativo.</li>
                    </ul>

                    <h3 style={{ color: "#fff", fontSize: "1.2rem", borderBottom: "1px solid #444", paddingBottom: "10px", marginTop: "40px" }}>III. Referência Analítica de Módulos</h3>
                    <div style={{ background: "#222", padding: "20px", borderRadius: "8px", marginTop: "15px" }}>
                        <p><strong style={{ color: "#9fb1db" }}>Aba 1 (Redes 3D):</strong> Centralização vetorial (Z, Y, X). Entradas numéricas representam graus ou Cents. "Cent. Câm" executa o reset nas matrizes de rotação WebGL.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#e4a8bc" }}>Aba 2 (Multiplicação):</strong> Calcula o produto vetorial sem duplicatas entre os graus das matrizes A e B.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#c0a8e4" }}>Aba 3 (Módulos):</strong> Reiteração algorítmica de vetores intervalares limitados pela condição de equivalência da razão 2/1 (oitava).</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#a8e4bc" }}>Aba 4 (Projeções):</strong> Calcula a compressão ou expansão escalar de um agregado interválico dentro dos valores definidos nos limites paramétricos.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#e4d9a8" }}>Aba 5 (Matriz):</strong> Processamento cruzado para elaboração dos espelhos P (Prime), R (Retrograde), I (Inversion) e RI. Saída flexível: classes, Hertz ou Cents absolutos.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#db9f9f" }}>Aba 6 (Ring Mod):</strong> Multiplicação de espectros. Gera produtos paralelos resultantes das somatórias (f1+f2) e modulações absolutas (|f1-f2|).</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#9fdbcf" }}>Aba 7 (FM):</strong> Desvio da portadora pela taxa moduladora. O Índice K dita a amplitude das modulações das frequências laterais (Sidebands).</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#b0b0b0" }}>Aba 8 (Aditiva):</strong> Geração de série linear através da multiplicação inteira (Otonal) ou divisão (Utonal) da constante principal.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#ffdd57" }}>Aba 9 (Costère):</strong> Rotina de cálculo de polarização e análise de gravidade através das quintas/semitons adjacentes (Densidade Cardinal).</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#ff6b6b" }}>Aba 10 (Interpolação):</strong> Algoritmo de morfologia sonora intermédia. O deslocador processa frações da distância entre as matrizes A e B no momento T.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#00ffcc" }}>Aba 11 (Afinações):</strong> Core lógico. Substitui a fundação logarítmica para modelos customizados (.scl) ou limites primos, mapeando graus para offsets MIDI.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#00ffcc" }}>Aba 13 (Teclado/MIDI):</strong> Motor Web Audio interligado a buffers de reprodução baseados na configuração da Aba 11.</p>
                        <p style={{ marginTop: "10px" }}><strong style={{ color: "#ff99ff" }}>Aba 14 (Notação):</strong> Parse visual em SMuFL. Avalia o desvio espectral em cents de um array de frequências e o plota tipograficamente com os componentes HEJI ou Sagittal.</p>
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

                    {/* EXPLICAÇÕES TÉCNICAS */}
                    <div style={{ width: "100%", background: "#222", borderRadius: 12, padding: 24, marginTop: 20, borderLeft: `4px solid ${selected.color}` }}>
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{ color: selected.color, fontSize: 14, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Motivação Acústica e Estrutural</h3>
                            <p style={{ color: "#ccc", fontSize: 14, lineHeight: "1.6" }}>{selected.contexto[language]}</p>
                        </div>
                        <div>
                            <h3 style={{ color: "#00ffcc", fontSize: 14, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Aplicação Lógica (I/O)</h3>
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