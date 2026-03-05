import React, { useState } from "react";
import HarmonicNetwork from "./HarmonicNetwork";

// dataset for code projects; type 'network' renders the HarmonicNetwork component
const codeData = [
    {
        id: "harmonic-network",
        type: "network",
        label: "Rede Harmônica",
        resumo: {
            pt: "Visualização interativa de rede harmônica de Pousseur.",
            en: "Interactive visualization of Pousseur harmonic network.",
            es: "Visualización interactiva de la red armónica de Pousseur."
        },
        color: "#00ffcc"
    },
    // futuramente adicione outros projetos de código aqui
];

function getCardStyles(color, isActive) {
    let bg = color;
    let text = "#464646ff";
    if (color !== "#fff" && color !== "#ffffff") text = "#fff";
    let border = isActive ? "4px solid #e04e8a" : "2px solid #222";
    if (color === "#fff" || color === "#ffffff") {
        bg = "#fff";
        text = "#3b3b3bff";
        border = isActive ? "4px solid #e04e8a" : "2px solid #bbb";
    }
    return { background: bg, color: text, border };
}

export default function CodeList({ language = "pt" }) {
    const [selected, setSelected] = useState(codeData[0]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {/* área de visualização */}
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
                    <div style={{ fontWeight: 700, fontSize: 26, color: "#fff", marginBottom: 18, textAlign: "center", textShadow: "0 2px 8px #0007" }}>{selected.label}</div>
                    {selected.type === "network" ? (
                        <div style={{ width: "100%", height: 500 }}>
                            <HarmonicNetwork />
                        </div>
                    ) : selected.url ? (
                        <iframe
                            width="560"
                            height="315"
                            src={selected.url}
                            title={selected.label}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            style={{ borderRadius: 18, boxShadow: "0 4px 24px 0 rgba(0,0,0,0.13)" }}
                        ></iframe>
                    ) : null}
                    <div style={{ color: "#fff", marginTop: 16, fontSize: 16, textAlign: "center", maxWidth: 600 }}>{selected.resumo[language]}</div>
                </div>
            )}
            {/* lista de projetos */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
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
                                borderRadius: 16,
                                boxShadow: "0 4px 24px 0 rgba(0, 0, 0, 0.07)",
                                padding: 18,
                                minWidth: 220,
                                maxWidth: 260,
                                cursor: isActive ? "default" : "pointer",
                                opacity: isActive ? 0.7 : 1,
                                transition: "all 0.2s"
                            }}
                            onClick={() => !isActive && setSelected(item)}
                            title={item.label}
                        >
                            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, color: cardStyles.color, textAlign: "center", textShadow: cardStyles.color === "#fff" ? "0 2px 8px #0007" : "none" }}>{item.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
