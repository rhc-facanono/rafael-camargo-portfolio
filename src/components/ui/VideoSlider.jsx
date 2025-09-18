import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

// Vídeos para o slider da home
const videos = {
    pt: [
        {
            src: "https://www.youtube.com/embed/HzZW1iWsiIY",
            title: "Demoreel - Resound de trailers de jogos",
            desc: "Um rápido demoreel de alguns sound designs para trailers de jogos. Todo som dos vídeos originais foi retirado e produzido novamente do zero por mim, desde as músicas até os SFX."
        },
        {
            src: "https://www.youtube.com/embed/I8wN5srxeBc",
            title: "2 flautas, 2 clarinetes e percussão - Música instrumental sobre timbre",
            desc: "Exploração instrumental sobre timbre e texturas, inspirada nos acordes de Messiaen."
        },
        {
            src: "https://www.youtube.com/embed/S2L27sPpZnU",
            title: "Sobre a loucura e a mimese da realidade",
            desc: "Reflexão musical sobre loucura, história e mitologia, misturando contrastes e metáforas."
        },
        {
            src: "https://www.youtube.com/embed/j558qSBRE3Q?start=4",
            title: "Música acusmática - para pensar nos 'maus' sons",
            desc: "Peça eletroacústica experimental sobre saturação, espacialização e a musicalidade dos ruídos."
        }
    ],
    en: [
        {
            src: "https://www.youtube.com/embed/HzZW1iWsiIY",
            title: "Demoreel - Resound of game trailers",
            desc: "A quick demoreel of some sound designs for game trailers. All original audio was removed and recreated from scratch by me, from music to SFX."
        },
        {
            src: "https://www.youtube.com/embed/I8wN5srxeBc",
            title: "2 flutes 2 clarinets and percussion - Instrumental music about timbre",
            desc: "Instrumental exploration of timbre and textures, inspired by Messiaen's chords."
        },
        {
            src: "https://www.youtube.com/embed/S2L27sPpZnU",
            title: "On madness and the mimesis of reality",
            desc: "Musical reflection on madness, history, and mythology, mixing contrasts and metaphors."
        },
        {
            src: "https://www.youtube.com/embed/j558qSBRE3Q?start=4",
            title: "Acousmatic music - thinking about 'bad' sounds",
            desc: "Experimental electroacoustic piece about saturation, spatialization, and the musicality of noise."
        }
    ],
    es: [
        {
            src: "https://www.youtube.com/embed/HzZW1iWsiIY",
            title: "Demoreel - Resound de trailers de juegos",
            desc: "Un rápido demoreel de algunos sound designs para trailers de juegos. Todo el sonido de los videos originales fue retirado y producido nuevamente desde cero por mí, desde la música hasta los SFX."
        },
        {
            src: "https://www.youtube.com/embed/I8wN5srxeBc",
            title: "2 flautas, 2 clarinetes y percusión - Música instrumental sobre timbre",
            desc: "Exploración instrumental sobre timbre y texturas, inspirada en los acordes de Messiaen."
        },
        {
            src: "https://www.youtube.com/embed/S2L27sPpZnU",
            title: "Sobre la locura y la mímesis de la realidad",
            desc: "Reflexión musical sobre la locura, la historia y la mitología, mezclando contrastes y metáforas."
        },
        {
            src: "https://www.youtube.com/embed/j558qSBRE3Q?start=4",
            title: "Música acusmática - para pensar en los 'malos' sonidos",
            desc: "Obra electroacústica experimental sobre saturação, espacialização e a musicalidade dos ruídos."
        }
    ]
};

export default function VideoSlider({ language = 'pt' }) {
    return (
        <div className="video-slider-container" style={{ width: "100%", maxWidth: 800, margin: "0 auto" }}>
            <Swiper
                modules={[Navigation, Pagination]}
                navigation
                pagination={{ clickable: true }}
                spaceBetween={30}
                slidesPerView={1}
                style={{ borderRadius: 12 }}
            >
                {videos[language].map((video, idx) => (
                    <SwiperSlide key={idx}>
                        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 12, background: "#000" }}>
                            <iframe
                                src={video.src}
                                title={video.title}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, borderRadius: 12 }}
                            />
                        </div>
                        <div style={{ textAlign: "center", marginTop: 8, color: "var(--brutalist-black)", fontWeight: 600 }}>
                            {video.title}
                        </div>
                        <div style={{ textAlign: "center", color: "#444", fontSize: 15, marginTop: 4, marginBottom: 8, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
                            {video.desc}
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
}
