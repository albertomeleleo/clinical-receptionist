import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { ConnectionState, Appointment } from './types';
import { SYSTEM_INSTRUCTION } from './constants';
import { createBlob, decode, decodeAudioData } from './services/audioUtils';
import { AudioVisualizer } from './components/AudioVisualizer';
import { InfoPanel } from './components/InfoPanel';

// Icon components
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 013 3v1.5a3 3 0 01-6 0v-1.5a3 3 0 013-3z" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);

const bookAppointmentTool: FunctionDeclaration = {
  name: 'bookAppointment',
  parameters: {
    type: Type.OBJECT,
    description: 'Prenota un appuntamento medico.',
    properties: {
      patientName: { type: Type.STRING, description: 'Il nome e cognome del paziente.' },
      date: { type: Type.STRING, description: 'La data dell\'appuntamento (es. Lunedì prossimo, 12 Ottobre).' },
      time: { type: Type.STRING, description: 'L\'orario dell\'appuntamento.' },
      type: { type: Type.STRING, description: 'Il tipo di visita (Generale, Cardiologia, Ortopedia, etc.).' },
    },
    required: ['patientName', 'date', 'time'],
  },
};

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);

  // Audio Context Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop output sources
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) { /* ignore */ }
    });
    sourcesRef.current.clear();

    // Close contexts
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    setAudioAnalyser(null);
    setConnectionState(ConnectionState.DISCONNECTED);
    sessionPromiseRef.current = null;
  }, []);

  const handleBookAppointment = (args: any) => {
    const newApt: Appointment = {
      id: Math.random().toString(36).substring(7),
      patientName: args.patientName,
      date: args.date,
      time: args.time,
      type: args.type || 'Generale'
    };
    setAppointments(prev => [newApt, ...prev]);
    return { result: 'success', message: `Appuntamento confermato per ${newApt.patientName} il ${newApt.date} alle ${newApt.time}.` };
  };

  const startSession = async () => {
    setErrorMsg(null);
    setConnectionState(ConnectionState.CONNECTING);

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key mancante");

      const ai = new GoogleGenAI({ apiKey });
      
      // Initialize Audio Contexts
      // Use 16kHz for input (standard for speech) and 24kHz for output (Gemini standard)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      // Setup Visualizer Analyser for Input (Microphone)
      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      setAudioAnalyser(inputAnalyser);

      // Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = inputCtx.createMediaStreamSource(stream);
      source.connect(inputAnalyser);
      
      // Create ScriptProcessor for raw PCM access
      // Reduced buffer size from 4096 to 2048 to improve latency (response time)
      const scriptProcessor = inputCtx.createScriptProcessor(2048, 1, 1);
      
      // Prevent audio feedback loop: Connect scriptProcessor to a mute gain node before destination.
      // ScriptProcessor needs to be connected to destination to fire 'onaudioprocess' in some browsers.
      const silence = inputCtx.createGain();
      silence.gain.value = 0; // Mute
      
      inputAnalyser.connect(scriptProcessor);
      scriptProcessor.connect(silence);
      silence.connect(inputCtx.destination);

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        systemInstruction: SYSTEM_INSTRUCTION,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }, // Deep male voice
          },
          tools: [{ functionDeclarations: [bookAppointmentTool] }],
        },
      };

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            
            // Start processing audio input
            // The system instruction is set to greet the user immediately.
            // Sending the audio stream (even if silence) helps trigger the model.
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session: any) => {
                  session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Tool Calls
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'bookAppointment') {
                        const result = handleBookAppointment(fc.args);
                         sessionPromise.then((session: any) => {
                            session.sendToolResponse({
                                functionResponses: {
                                    id: fc.id,
                                    name: fc.name,
                                    response: result
                                }
                            });
                        });
                    }
                }
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
                const ctx = outputAudioContextRef.current;
                const buffer = await decodeAudioData(
                    decode(base64Audio),
                    ctx,
                    24000,
                    1
                );
                
                // Play logic
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                
                source.connect(ctx.destination);
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                
                sourcesRef.current.add(source);
                source.onended = () => sourcesRef.current.delete(source);
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err: any) => {
            console.error(err);
            setErrorMsg("Errore di connessione. Riprova.");
            setConnectionState(ConnectionState.ERROR);
            cleanup();
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Errore sconosciuto");
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const handleToggle = () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      cleanup();
    } else {
      startSession();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4 font-sans">
      {/* Header */}
      <header className="mb-8 text-center">
        <div className="inline-block p-3 rounded-full bg-clinic-light/30 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-clinic-blue">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight">Clinica San Nicola</h1>
        <p className="text-slate-500 mt-2">Assistente Reception Virtuale (Bari)</p>
      </header>

      {/* Main Control Card */}
      <main className="w-full max-w-4xl bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        
        {/* Status Bar */}
        <div className={`w-full py-2 px-6 text-center text-sm font-semibold tracking-wide uppercase transition-colors duration-500 
          ${connectionState === ConnectionState.CONNECTED ? 'bg-clinic-teal text-white' : 
            connectionState === ConnectionState.ERROR ? 'bg-clinic-alert text-white' : 'bg-slate-200 text-slate-500'}`}>
          {connectionState === ConnectionState.CONNECTED && "In Ascolto - Giovanni è online"}
          {connectionState === ConnectionState.CONNECTING && "Connessione al server..."}
          {connectionState === ConnectionState.DISCONNECTED && "Disconnesso"}
          {connectionState === ConnectionState.ERROR && "Errore"}
        </div>

        <div className="p-8 md:p-12 flex flex-col items-center">
          
          {/* Visualizer Area */}
          <div className="w-full max-w-md mb-10 relative">
             <AudioVisualizer 
                analyser={audioAnalyser} 
                isListening={connectionState === ConnectionState.CONNECTED} 
             />
             {connectionState === ConnectionState.DISCONNECTED && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                    Microfono Spento
                </div>
             )}
          </div>

          {/* Action Button */}
          <button
            onClick={handleToggle}
            className={`group relative flex items-center justify-center w-24 h-24 rounded-full shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2
              ${connectionState === ConnectionState.CONNECTED 
                ? 'bg-clinic-alert hover:bg-red-700 focus:ring-red-400' 
                : 'bg-clinic-blue hover:bg-cyan-800 focus:ring-cyan-400'
              }`}
            aria-label={connectionState === ConnectionState.CONNECTED ? "Termina Chiamata" : "Chiama Reception"}
          >
             {connectionState === ConnectionState.CONNECTING ? (
                 <span className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></span>
             ) : (
                 connectionState === ConnectionState.CONNECTED ? <StopIcon /> : <MicIcon />
             )}
             
             {/* Pulse Effect */}
             {connectionState === ConnectionState.CONNECTED && (
                <span className="absolute -inset-1 rounded-full bg-red-500 opacity-30 animate-ping"></span>
             )}
          </button>
          
          <p className="mt-6 text-slate-500 text-lg font-medium">
             {connectionState === ConnectionState.DISCONNECTED 
                ? "Tocca il microfono per parlare con Giovanni" 
                : "Parla pure, ti ascolto..."}
          </p>
          
          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                {errorMsg}
            </div>
          )}

          {/* Info & Data Panel */}
          <div className="w-full mt-8 border-t border-slate-100 pt-8">
             <InfoPanel appointments={appointments} />
          </div>

        </div>
      </main>

      <footer className="mt-12 text-center text-slate-400 text-sm">
        <p>Accessibilità EAA Compliant • Powered by Gemini Live API</p>
      </footer>
    </div>
  );
}