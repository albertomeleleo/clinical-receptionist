export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface Appointment {
  id: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
}

export interface ClinicService {
  name: string;
  price: string;
  description: string;
}

export interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isListening: boolean;
}