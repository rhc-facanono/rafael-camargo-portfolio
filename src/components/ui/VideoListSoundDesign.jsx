import React, { useEffect, useState } from "react";

const videoData = [
    {
        url: "https://www.youtube.com/embed/HzZW1iWsiIY",
        color: "#fff",
        resumo: {
            pt: "Um rápido demoreel de alguns sound designs para trailers de jogos. Todo som dos vídeos originais foi retirado e produzido novamente do zero por mim, desde as músicas até os SFX.",
            en: "A quick demoreel of some sound designs for game trailers. All original audio was removed and recreated from scratch by me, from music to SFX.",
            es: "Un rápido demoreel de algunos sound designs para trailers de juegos. Todo el sonido de los videos originales fue retirado e produzido nuevamente desde cero por mí, desde la música hasta los SFX."
        }
    },
    {
        url: "https://youtu.be/lwutzDeEonM",
        color: "#fff",
        resumo: {
            pt: "Este é um protótipo de um Patch em Max MSP onde tento usar alguns fundamentos básicos e elementares da síntese de Água para vários controles diferentes. Ainda faltam alguns detalhes como reverberação de espaço e mais clareza nos sons (e claro a UI), mas acho que isso tem algum potencial.",
            en: "This is a prototype of a Patch in Max MSP where I try to use some basics and elementals fudaments of Water synthesis for various different controls. Still missing some details like space reverberation and more clarity in the sounds (and of course the UI), But i think that this has some kind of potential in something.",
            es: "Este es un prototipo de un Patch en Max MSP donde intento usar algunos fundamentos básicos y elementales de la síntesis de Agua para varios controles diferentes. Todavía faltan algunos detalles como reverberación de espacio y más claridad en los sonidos (y por supuesto la UI), pero creo que esto tiene algún tipo de potencial."
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

export default function VideoListSoundDesign({ language = 'pt' }) {
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
