import React, { createContext, useState, useContext, useEffect } from 'react';

const MidiContext = createContext();
export const useMidi = () => useContext(MidiContext);

export const MidiProvider = ({ children }) => {
    const [midiAccess, setMidiAccess] = useState(null);
    const [lastEvent, setLastEvent] = useState(null); // { note, velocity, type: 'on'|'off' }

    useEffect(() => {
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(access => {
                setMidiAccess(access);
                const inputs = access.inputs.values();
                for (let input of inputs) {
                    input.onmidimessage = (message) => {
                        const [status, note, velocity] = message.data;
                        const type = status >= 144 && status <= 159 ? 'on' : status >= 128 && status <= 143 ? 'off' : null;
                        if (type) setLastEvent({ note, velocity, type, timestamp: Date.now() });
                    };
                }
            });
        }
    }, []);

    return (
        <MidiContext.Provider value={{ lastEvent }}>
            {children}
        </MidiContext.Provider>
    );
};