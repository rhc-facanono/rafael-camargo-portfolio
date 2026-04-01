import React from 'react';
import { useTuning } from '../../context/TuningContext';

export default function StaffToolbar() {
    const { accidentalModifier, setAccidentalModifier, isMicrotonalMode } = useTuning();

    // Modificadores baseados em frações de semitom (1 = 100 cents, 0.5 = 50 cents)
    const accidentals = [
        { label: '♭♭', value: -2, micro: false },
        { label: '♭', value: -1, micro: false },
        { label: 'd (-50c)', value: -0.5, micro: true }, // Meio-bemol
        { label: '♮', value: 0, micro: false },
        { label: '‡ (+50c)', value: 0.5, micro: true },  // Meio-sustenido
        { label: '♯', value: 1, micro: false },
        { label: '♯♯', value: 2, micro: false },
    ];

    return (
        <div className="flex gap-1 bg-gray-900 p-1 rounded border border-gray-700 w-fit mb-2 shadow-sm">
            {accidentals.map(acc => {
                // Se for um acidente microtonal e o modo global estiver desligado, oculta o botão
                if (acc.micro && !isMicrotonalMode) return null;

                const isActive = accidentalModifier === acc.value;
                return (
                    <button
                        key={acc.label}
                        onClick={() => setAccidentalModifier(acc.value)}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${isActive ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-gray-700'
                            }`}
                        title={`Modificador: ${acc.value} semitons`}
                    >
                        {acc.label}
                    </button>
                );
            })}
        </div>
    );
}