import React from 'react';
import { Appointment, ClinicService } from '../types';
import { CLINIC_SERVICES } from '../constants';

interface InfoPanelProps {
  appointments: Appointment[];
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ appointments }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-clinic-blue">
        <h3 className="text-xl font-bold text-clinic-blue mb-4">Servizi & Ticket</h3>
        <div className="space-y-3">
          {CLINIC_SERVICES.map((service, idx) => (
            <div key={idx} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
              <div>
                <p className="font-semibold text-gray-800">{service.name}</p>
                <p className="text-sm text-gray-500">{service.description}</p>
              </div>
              <span className="text-sm font-bold text-clinic-teal bg-teal-50 px-2 py-1 rounded">
                {service.price}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-clinic-teal">
        <h3 className="text-xl font-bold text-clinic-teal mb-4">Appuntamenti Recenti</h3>
        {appointments.length === 0 ? (
          <p className="text-gray-400 italic text-center py-4">Nessun appuntamento prenotato in questa sessione.</p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((apt) => (
              <li key={apt.id} className="bg-slate-50 p-3 rounded-lg flex flex-col animate-pulse-once">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800">{apt.patientName}</span>
                  <span className="text-xs font-mono bg-clinic-blue text-white px-2 py-0.5 rounded">{apt.time}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                    <span>{apt.date}</span>
                    <span className="italic text-clinic-teal">{apt.type}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};