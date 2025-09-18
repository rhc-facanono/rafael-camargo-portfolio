import React, { useEffect, useState } from "react";

const videoData = [
    {
        url: "https://youtu.be/YC8eJ43UKVM?si=a5DueeoLw40qOnn1",
        color: "#fff",
        resumo: {
            pt: "Peça que apresenta dois temas e variações, deixando em aberto as possibilidades de desenvolvimento timbrístico, harmônico e rítmico. Primeira parte de uma série aberta.",
            en: "Piece presenting two themes and variations, leaving open the possibilities for timbral, harmonic, and rhythmic development. First part of an open series.",
            es: "Obra que presenta dos temas y variaciones, dejando abiertas las posibilidades de desarrollo tímbrico, armónico y rítmico. Primera parte de una serie abierta."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=a1mB92e6jCM",
        color: "#fff",
        resumo: {
            pt: "Peça dodecafônica rápida baseada na série do Concerto para Violino de Berg, dedicada a Pedro Lopes. Explora mimese dos afetos.",
            en: "Fast dodecaphonic piece based on the series from Berg's Violin Concerto, dedicated to Pedro Lopes. Explores mimesis of affects.",
            es: "Obra dodecafónica rápida baseada en la serie del Concierto para Violín de Berg, dedicada a Pedro Lopes. Explora la mímesis de los afectos."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=S2L27sPpZnU",
        color: "#5f5f5fff",
        resumo: {
            pt: "Reflexão sobre a loucura e a mimese da realidade. Mistura referências históricas, mitológicas e filosóficas em uma música de contrastes e metáforas.",
            en: "Reflection on madness and the mimesis of reality. Mixes historical, mythological, and philosophical references in a music of contrasts and metaphors.",
            es: "Reflexión sobre la locura y la mímesis de la realidad. Mezcla referencias históricas, mitológicas y filosóficas en una música de contrastes e metáforas."
        }
    },
    {
        url: "https://youtu.be/j558qSBRE3Q?si=qeg0HhyhbtuLKjbk",
        color: "#5f5f5fff",
        resumo: {
            pt: "Peça eletroacústica para quadrifonia, explora espacialização e saturação como elemento musical. Reflexo da experiência paulistana do compositor.",
            en: "Electroacoustic piece for quadraphony, explores spatialization and saturation as musical elements. A reflection of the composer's São Paulo experience.",
            es: "Obra electroacústica para cuadrafonía, explora la espacialización y la saturación como elementos musicales. Reflejo de la experiência paulista do compositor."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=-QDrZ6IVk2s",
        color: "#fff",
        resumo: {
            pt: "Cenas Dispersas: quatro movimentos independentes, executados em diferentes momentos do concerto, com instrumentistas espalhados pelo palco.",
            en: "Cenas Dispersas: four independent movements, performed at different moments of the concert, with musicians spread across the stage.",
            es: "Cenas Dispersas: cuatro movimientos independientes, ejecutados en diferentes momentos del concierto, con instrumentistas repartidos por el escenario."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=I8wN5srxeBc",
        color: "#fff",
        resumo: {
            pt: "Peça para ensemble baseada nos acordes de Messiaen, explora diferentes métodos composicionais, da intuição à criação de regras.",
            en: "Piece for ensemble based on Messiaen's chords, explores different compositional methods, from intuition to rule creation.",
            es: "Obra para ensemble basada en los acordes de Messiaen, explora diferentes métodos compositivos, de la intuición a la creación de reglas."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=RHcqIkTdKP4",
        color: "#fff",
        resumo: {
            pt: "Exploração dos elementos que podem modificar ou destruir a unidade atômica da composição, questionando sua utilidade.",
            en: "Exploration of elements that can modify or destroy the atomic unity of the composition, questioning its usefulness.",
            es: "Exploración de los elementos que pueden modificar o destruir la unidad atómica de la composición, cuestionando su utilidad."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=8ln1JxmPses",
        color: "#fff",
        resumo: {
            pt: "Estudo para violão solo, explora e reorganiza objetos sonoros do instrumento em forma de recitação.",
            en: "Study for solo guitar, explores and reorganizes the instrument's sound objects in the form of recitation.",
            es: "Estudio para guitarra solista, explora y reorganiza los objetos sonoros del instrumento en forma de recitación."
        }
    },
    {
        url: "https://www.youtube.com/watch?v=TsU9Ua1w-rs",
        color: "#fff",
        resumo: {
            pt: "Himenópteros: peça para 10 instrumentistas, um resumo ansioso de uma escala octatônica.",
            en: "Himenópteros: piece for 10 musicians, an anxious summary of an octatonic scale.",
            es: "Himenópteros: obra para 10 instrumentistas, un resumen ansioso de una escala octatónica."
        }
    }
];

function getYoutubeId(url) {
    const regExp = /(?:youtube[.]com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu[.]be\/)([\w-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
}

function fetchYoutubeMeta(id) {
    return fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
        .then(res => res.json())
        .catch(() => null);
}

export default function VideoList({ language = 'pt' }) {
    const [videos, setVideos] = useState([]);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        Promise.all(
            videoData.map(async (v) => {
                const id = getYoutubeId(v.url);
                const meta = id ? await fetchYoutubeMeta(id) : null;
                return {
                    ...v,
                    id,
                    title: meta?.title || "",
                    author: meta?.author_name || "",
                    thumbnail: meta?.thumbnail_url || `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
                    description: meta?.title || "",
                    duration: "", // Duração não disponível via oEmbed
                };
            })
        ).then((allVideos) => {
            setVideos(allVideos);
            setSelected(allVideos[0]);
        });
    }, []);

    // Cores de contraste para dark/light
    const getCardStyles = (color, isActive) => {
        // Se for destaque, mantém cor original, mas ajusta texto
        let bg = color;
        let text = "#464646ff";
        // Se cor for escura, texto branco
        if (color !== "#fff" && color !== "#ffffff") text = "#fff";
        // Se for card ativo, borda mais grossa
        let border = isActive ? "4px solid #e04e8a" : "2px solid #222";
        // Se for fundo branco, texto escuro
        if (color === "#fff" || color === "#ffffff") {
            bg = "#fff";
            text = "#3b3b3bff";
            border = isActive ? "4px solid #e04e8a" : "2px solid #bbb";
        }
        return { background: bg, color: text, border };
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {/* Player do vídeo selecionado */}
            {selected && (
                <div style={{
                    background: "#181818",
                    borderRadius: 20,
                    boxShadow: "0 4px 24px 0 rgba(0,0,0,0.13)",
                    padding: 32,
                    marginBottom: 24,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center"
                }}>
                    <div style={{ fontWeight: 700, fontSize: 26, color: "#fff", marginBottom: 18, textAlign: "center", textShadow: "0 2px 8px #0007" }}>{selected.title}</div>
                    <iframe
                        width="560"
                        height="315"
                        src={`https://www.youtube.com/embed/${selected.id}?autoplay=1`}
                        title={selected.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        style={{ borderRadius: 18, boxShadow: "0 4px 24px 0 rgba(0,0,0,0.13)" }}
                    ></iframe>
                    <div style={{ color: "#fff", marginTop: 16, fontSize: 16, textAlign: "center", maxWidth: 600 }}>{selected.resumo[language]}</div>
                </div>
            )}
            {/* Lista de vídeos (cards) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
                {videos.map((video, idx) => {
                    const isActive = selected && selected.id === video.id;
                    const cardStyles = getCardStyles(video.color, isActive);
                    return (
                        <div
                            key={video.id}
                            style={{
                                ...cardStyles,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                borderRadius: 16,
                                boxShadow: "0 4px 24px 0 rgba(0, 0, 0, 0.07)",
                                padding: 18,
                                minWidth: 220,
                                maxWidth: 260,
                                cursor: isActive ? "default" : "pointer",
                                opacity: isActive ? 0.7 : 1,
                                transition: "all 0.2s"
                            }}
                            onClick={() => !isActive && setSelected(video)}
                            title={video.title}
                        >
                            <img
                                src={video.thumbnail}
                                alt={video.title}
                                style={{ width: 180, height: 110, objectFit: "cover", borderRadius: 12, boxShadow: "0 2px 8px #0002", marginBottom: 12 }}
                            />
                            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, color: cardStyles.color, textAlign: "center", textShadow: cardStyles.color === "#fff" ? "0 2px 8px #0007" : "none" }}>{video.title}</div>
                            <div style={{ color: cardStyles.color, fontSize: 14, textAlign: "center", opacity: 0.85 }}>{video.resumo[language]}</div>
                        </div>
                    );
                })}
            </div>
            <button
                style={{
                    fontSize: 22,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-btn)', // ou var(--color-primary)
                    fontWeight: 'bold'
                }}
            >
                {'‹'}
            </button>
            <div style={{
                color: 'var(--color-primary)', // ou var(--color-text-main)
                fontWeight: 'bold'
            }}>
                {selected ? selected.resumo[language] : ''}
            </div>
        </div>
    );
}